use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyDataEvent {
    pub tab_id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitEvent {
    pub tab_id: String,
    pub code: Option<u32>,
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>,
    fallback_cwd: String,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn spawn(
        &self,
        app: AppHandle,
        tab_id: String,
        cwd: Option<String>,
        shell_override: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.max(4),
                cols: cols.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let shell_path = shell_override
            .filter(|s| !s.trim().is_empty())
            .or_else(|| std::env::var("SHELL").ok().filter(|s| !s.trim().is_empty()))
            .unwrap_or_else(|| "/bin/bash".to_string());

        let start_dir = cwd
            .filter(|p| PathBuf::from(p).is_dir())
            .or_else(|| dirs::home_dir().map(|p| p.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "/".to_string());

        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.cwd(&start_dir);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "Velt");
        cmd.env("TERM_PROGRAM_VERSION", "0.1.0");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell '{shell_path}': {e}"))?;
        let pid = child.process_id();

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

        {
            let mut guard = self.sessions.lock().map_err(|e| e.to_string())?;
            guard.insert(
                tab_id.clone(),
                PtySession {
                    master: pair.master,
                    writer,
                    child,
                    pid,
                    fallback_cwd: start_dir.clone(),
                },
            );
        }

        let sessions_ref = Arc::clone(&self.sessions);
        let tab_for_thread = tab_id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut pending: Vec<u8> = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        pending.extend_from_slice(&buf[..n]);
                        // Flush valid UTF-8 prefix and keep incomplete trailing codepoint bytes.
                        let valid_len = match std::str::from_utf8(&pending) {
                            Ok(_) => pending.len(),
                            Err(e) => {
                                if e.error_len().is_none() {
                                    e.valid_up_to()
                                } else {
                                    // Replace malformed byte sequence safely.
                                    let lossy = String::from_utf8_lossy(&pending).into_owned();
                                    pending.clear();
                                    let _ = app.emit(
                                        "pty:data",
                                        PtyDataEvent {
                                            tab_id: tab_for_thread.clone(),
                                            data: lossy,
                                        },
                                    );
                                    continue;
                                }
                            }
                        };
                        if valid_len > 0 {
                            let text = String::from_utf8_lossy(&pending[..valid_len]).into_owned();
                            pending.drain(..valid_len);
                            let _ = app.emit(
                                "pty:data",
                                PtyDataEvent {
                                    tab_id: tab_for_thread.clone(),
                                    data: text,
                                },
                            );
                        }
                    }
                    Err(_) => break,
                }
            }

            if !pending.is_empty() {
                let text = String::from_utf8_lossy(&pending).into_owned();
                let _ = app.emit(
                    "pty:data",
                    PtyDataEvent {
                        tab_id: tab_for_thread.clone(),
                        data: text,
                    },
                );
            }

            let exit_code = {
                if let Ok(mut guard) = sessions_ref.lock() {
                    if let Some(mut session) = guard.remove(&tab_for_thread) {
                        session.child.wait().ok().map(|s| s.exit_code())
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            let _ = app.emit(
                "pty:exit",
                PtyExitEvent {
                    tab_id: tab_for_thread,
                    code: exit_code,
                },
            );
        });

        Ok(start_dir)
    }

    pub fn write(&self, tab_id: &str, data: &str) -> Result<(), String> {
        let mut guard = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = guard.get_mut(tab_id) {
            session
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("PTY write error: {e}"))?;
            session
                .writer
                .flush()
                .map_err(|e| format!("PTY flush error: {e}"))?;
            Ok(())
        } else {
            Err(format!("PTY session '{tab_id}' not found"))
        }
    }

    pub fn resize(&self, tab_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let guard = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = guard.get(tab_id) {
            session
                .master
                .resize(PtySize {
                    rows: rows.max(4),
                    cols: cols.max(10),
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("PTY resize error: {e}"))?;
        }
        Ok(())
    }

    pub fn kill(&self, tab_id: &str) -> Result<(), String> {
        let mut guard = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut session) = guard.remove(tab_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }

    pub fn current_cwd(&self, tab_id: &str) -> Option<String> {
        let guard = self.sessions.lock().ok()?;
        let session = guard.get(tab_id)?;
        if let Some(pid) = session.pid {
            // Try foreground process group leader first, then shell PID itself.
            if let Some(fg_pid) = foreground_pid(pid) {
                if let Ok(path) = fs::read_link(format!("/proc/{fg_pid}/cwd")) {
                    return Some(path.to_string_lossy().into_owned());
                }
            }
            if let Ok(path) = fs::read_link(format!("/proc/{pid}/cwd")) {
                return Some(path.to_string_lossy().into_owned());
            }
        }
        Some(session.fallback_cwd.clone())
    }
}

fn foreground_pid(shell_pid: u32) -> Option<u32> {
    let stat = fs::read_to_string(format!("/proc/{shell_pid}/stat")).ok()?;
    let rparen = stat.rfind(')')?;
    let rest = stat.get(rparen + 2..)?;
    let fields: Vec<&str> = rest.split_whitespace().collect();
    // fields[0]=state, [1]=ppid, [2]=pgrp, [3]=session, [4]=tty_nr, [5]=tpgid
    let tpgid: i32 = fields.get(5)?.parse().ok()?;
    if tpgid > 0 {
        Some(tpgid as u32)
    } else {
        None
    }
}
