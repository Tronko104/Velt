mod blur;
mod config;
mod opencode;
mod pty;

use config::{config_path, load_config, save_config as write_config_file, VeltConfig};
use opencode::{ModelInfo, OpenCodeManager, OpenCodeStatus};
use pty::PtyManager;
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewWindow};

pub struct AppState {
    pub pty: PtyManager,
    pub opencode: OpenCodeManager,
    pub config: Mutex<VeltConfig>,
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> VeltConfig {
    state.config.lock().map(|g| g.clone()).unwrap_or_default()
}

#[tauri::command]
fn get_default_config() -> VeltConfig {
    VeltConfig::default()
}

#[tauri::command]
fn get_system_locale() -> String {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(val) = std::env::var(key) {
            let trimmed = val.trim();
            if !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("C")
                && !trimmed.eq_ignore_ascii_case("POSIX")
            {
                return trimmed.to_string();
            }
        }
    }
    "en".to_string()
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("mailto:"))
    {
        return Err("Unsupported URL scheme".into());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
        return Ok(());
    }
}

fn expand_tilde(raw: &str) -> PathBuf {
    if raw == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    } else if let Some(rest) = raw.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(raw)
}

fn resolve_candidate_path(cwd: &str, raw_path: &str) -> Option<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let expanded = expand_tilde(trimmed);
    let candidate = if expanded.is_absolute() {
        expanded
    } else {
        let base = if cwd.trim().is_empty() || cwd.trim() == "~" {
            dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
        } else {
            expand_tilde(cwd.trim())
        };
        base.join(expanded)
    };
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | ".next"
            | ".cache"
            | "__pycache__"
            | ".venv"
            | "venv"
            | ".turbo"
    )
}

fn collect_workspace_files(root: &Path, query: &str, limit: usize) -> Vec<String> {
    if !root.is_dir() {
        return Vec::new();
    }
    let q = query.trim().to_lowercase();
    let mut results: Vec<(u8, usize, String)> = Vec::new();
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::new();
    queue.push_back((root.to_path_buf(), 0));

    let mut visited = 0usize;
    const MAX_VISITED: usize = 2500;
    const MAX_DEPTH: usize = 5;

    while let Some((dir, depth)) = queue.pop_front() {
        if visited >= MAX_VISITED {
            break;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited >= MAX_VISITED {
                break;
            }
            let path = entry.path();
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if path.is_dir() {
                if depth < MAX_DEPTH && !should_skip_dir(&name_str) {
                    queue.push_back((path, depth + 1));
                }
                continue;
            }
            if !path.is_file() {
                continue;
            }
            let Ok(rel) = path.strip_prefix(root) else {
                continue;
            };
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            if q.is_empty() {
                results.push((0, rel_str.len(), rel_str));
            } else {
                let rel_lower = rel_str.to_lowercase();
                let base_lower = name_str.to_lowercase();
                if base_lower.starts_with(&q) {
                    results.push((0, rel_str.len(), rel_str));
                } else if base_lower.contains(&q) {
                    results.push((1, rel_str.len(), rel_str));
                } else if rel_lower.contains(&q) {
                    results.push((2, rel_str.len(), rel_str));
                }
            }
        }
    }

    results.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    results.into_iter().take(limit).map(|item| item.2).collect()
}

fn read_text_file_bounded(path: &Path, max_bytes: usize, max_lines: usize) -> Result<String, String> {
    if !path.is_file() {
        return Err("Not a regular file".into());
    }
    let meta = fs::metadata(path).map_err(|e| format!("Failed to inspect file: {e}"))?;
    if meta.len() > 256 * 1024 {
        return Err("File too large to attach (>256 KB)".into());
    }
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let probe_len = bytes.len().min(4096);
    if bytes[..probe_len].contains(&0) {
        return Err("Binary file skipped".into());
    }
    let slice = if bytes.len() > max_bytes {
        &bytes[..max_bytes]
    } else {
        &bytes[..]
    };
    let text = String::from_utf8_lossy(slice);
    let mut out = String::new();
    let mut count = 0usize;
    let mut truncated = bytes.len() > max_bytes;
    for line in text.lines() {
        if count >= max_lines {
            truncated = true;
            break;
        }
        if count > 0 {
            out.push('\n');
        }
        out.push_str(line);
        count += 1;
    }
    if truncated {
        out.push_str("\n... [truncated]");
    }
    Ok(out)
}

#[tauri::command]
fn list_workspace_files(cwd: String, query: String) -> Vec<String> {
    let root = if cwd.trim().is_empty() || cwd.trim() == "~" {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        expand_tilde(cwd.trim())
    };
    collect_workspace_files(&root, &query, 12)
}

#[tauri::command]
fn read_context_file(cwd: String, rel_path: String) -> Result<String, String> {
    let resolved = resolve_candidate_path(&cwd, &rel_path)
        .ok_or_else(|| format!("File not found: {rel_path}"))?;
    read_text_file_bounded(&resolved, 16 * 1024, 300)
}

#[tauri::command]
fn filter_existing_paths(cwd: String, paths: Vec<String>) -> Vec<bool> {
    paths
        .into_iter()
        .map(|p| resolve_candidate_path(&cwd, &p).is_some())
        .collect()
}

#[tauri::command]
fn open_file_path(
    cwd: String,
    path: String,
    line: Option<u32>,
    col: Option<u32>,
) -> Result<(), String> {
    let resolved = resolve_candidate_path(&cwd, &path)
        .ok_or_else(|| format!("File not found: {path}"))?;
    let abs = fs::canonicalize(&resolved).unwrap_or(resolved);
    let abs_str = abs.to_string_lossy().into_owned();

    #[cfg(target_os = "linux")]
    {
        let editor_raw = std::env::var("VISUAL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| std::env::var("EDITOR").ok().filter(|s| !s.trim().is_empty()));

        if let Some(editor_cmd) = editor_raw {
            let mut parts = editor_cmd.split_whitespace();
            if let Some(bin) = parts.next() {
                let extra_args: Vec<&str> = parts.collect();
                let bin_name = Path::new(bin)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(bin);
                let is_gui = matches!(
                    bin_name,
                    "code"
                        | "codium"
                        | "cursor"
                        | "zed"
                        | "zeditor"
                        | "kate"
                        | "kwrite"
                        | "subl"
                        | "gedit"
                        | "gnome-text-editor"
                        | "mousepad"
                        | "geany"
                );
                if is_gui {
                    let mut cmd = std::process::Command::new(bin);
                    cmd.args(&extra_args);
                    match bin_name {
                        "code" | "codium" | "cursor" => {
                            if let Some(l) = line {
                                let target = if let Some(c) = col {
                                    format!("{abs_str}:{l}:{c}")
                                } else {
                                    format!("{abs_str}:{l}")
                                };
                                cmd.arg("--goto").arg(target);
                            } else {
                                cmd.arg(&abs_str);
                            }
                        }
                        "kate" | "kwrite" => {
                            if let Some(l) = line {
                                cmd.arg("-l").arg(l.to_string());
                                if let Some(c) = col {
                                    cmd.arg("-c").arg(c.to_string());
                                }
                            }
                            cmd.arg(&abs_str);
                        }
                        "zed" | "zeditor" | "subl" => {
                            if let Some(l) = line {
                                let target = if let Some(c) = col {
                                    format!("{abs_str}:{l}:{c}")
                                } else {
                                    format!("{abs_str}:{l}")
                                };
                                cmd.arg(target);
                            } else {
                                cmd.arg(&abs_str);
                            }
                        }
                        _ => {
                            cmd.arg(&abs_str);
                        }
                    }
                    if cmd
                        .stdin(std::process::Stdio::null())
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .spawn()
                        .is_ok()
                    {
                        return Ok(());
                    }
                }
            }
        }

        std::process::Command::new("xdg-open")
            .arg(&abs_str)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to open file: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&abs_str)
            .spawn()
            .map_err(|e| format!("Failed to open file: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &abs_str])
            .spawn()
            .map_err(|e| format!("Failed to open file: {e}"))?;
        return Ok(());
    }
}

#[tauri::command]
async fn read_primary_selection() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        use std::time::Duration;
        use tokio::process::Command;

        let candidates: &[(&str, &[&str])] = &[
            ("wl-paste", &["--primary", "--no-newline"]),
            ("xclip", &["-o", "-selection", "primary"]),
            ("xsel", &["-op"]),
        ];

        for (bin, args) in candidates {
            let fut = Command::new(bin)
                .args(*args)
                .stdin(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .output();
            if let Ok(Ok(out)) = tokio::time::timeout(Duration::from_millis(180), fut).await {
                if out.status.success() && !out.stdout.is_empty() {
                    return Some(String::from_utf8_lossy(&out.stdout).into_owned());
                }
            }
        }
    }
    None
}

#[tauri::command]
fn save_config(state: State<'_, AppState>, config: VeltConfig) -> Result<(), String> {
    write_config_file(&config)?;
    if let Ok(mut guard) = state.config.lock() {
        *guard = config;
    }
    Ok(())
}

#[tauri::command]
fn get_config_path() -> String {
    config_path().to_string_lossy().into_owned()
}

#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    cwd: Option<String>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    state.pty.spawn(app, tab_id, cwd, shell, cols, rows)
}

#[tauri::command]
fn pty_write(state: State<'_, AppState>, tab_id: String, data: String) -> Result<(), String> {
    state.pty.write(&tab_id, &data)
}

#[tauri::command]
fn pty_resize(state: State<'_, AppState>, tab_id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.pty.resize(&tab_id, cols, rows)
}

#[tauri::command]
fn pty_kill(state: State<'_, AppState>, tab_id: String) -> Result<(), String> {
    state.pty.kill(&tab_id)
}

#[tauri::command]
fn pty_cwd(state: State<'_, AppState>, tab_id: String) -> Option<String> {
    state.pty.current_cwd(&tab_id)
}

#[tauri::command]
async fn opencode_status(
    state: State<'_, AppState>,
    override_bin: Option<String>,
) -> Result<OpenCodeStatus, String> {
    let bin_cfg = override_bin.unwrap_or_else(|| {
        state
            .config
            .lock()
            .map(|c| c.opencode_bin.clone())
            .unwrap_or_default()
    });
    Ok(state.opencode.status(&bin_cfg).await)
}

#[tauri::command]
async fn opencode_list_models(
    state: State<'_, AppState>,
    override_bin: Option<String>,
    show_hidden: Option<bool>,
) -> Result<Vec<ModelInfo>, String> {
    let (bin_cfg, hidden_cfg) = state
        .config
        .lock()
        .map(|c| (c.opencode_bin.clone(), c.show_hidden_models))
        .unwrap_or_default();
    let bin = override_bin.unwrap_or(bin_cfg);
    let include_hidden = show_hidden.unwrap_or(hidden_cfg);
    state.opencode.list_models(&bin, include_hidden).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn opencode_send_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    override_bin: Option<String>,
    tab_id: String,
    session_id: Option<String>,
    cwd: String,
    model: String,
    effort: String,
    prompt: String,
    show_thinking: bool,
    auto_approve: bool,
) -> Result<String, String> {
    let bin_cfg = override_bin.unwrap_or_else(|| {
        state
            .config
            .lock()
            .map(|c| c.opencode_bin.clone())
            .unwrap_or_default()
    });
    state
        .opencode
        .send_prompt(
            app,
            bin_cfg,
            tab_id,
            session_id,
            cwd,
            model,
            effort,
            prompt,
            show_thinking,
            auto_approve,
        )
        .await
}

#[tauri::command]
async fn opencode_cancel_turn(
    state: State<'_, AppState>,
    override_bin: Option<String>,
    tab_id: String,
) -> Result<(), String> {
    let bin_cfg = override_bin.unwrap_or_else(|| {
        state
            .config
            .lock()
            .map(|c| c.opencode_bin.clone())
            .unwrap_or_default()
    });
    state.opencode.cancel_turn(&bin_cfg, &tab_id).await
}

#[tauri::command]
fn set_window_blur(window: WebviewWindow, enabled: bool) {
    blur::apply_window_blur(&window, enabled);
}

#[cfg(target_os = "linux")]
fn ensure_linux_desktop_icon() {
    let Some(data_dir) = dirs::data_dir() else {
        return;
    };
    let apps_dir = data_dir.join("applications");
    let _ = std::fs::create_dir_all(&apps_dir);

    let icon_sizes: &[(&str, &[u8])] = &[
        ("32x32", include_bytes!("../icons/32x32.png")),
        ("128x128", include_bytes!("../icons/128x128.png")),
        ("256x256", include_bytes!("../icons/128x128@2x.png")),
        ("512x512", include_bytes!("../icons/icon.png")),
    ];

    for (size, bytes) in icon_sizes {
        let dir = data_dir.join("icons").join("hicolor").join(size).join("apps");
        if std::fs::create_dir_all(&dir).is_ok() {
            let p = dir.join("dev.velt.terminal.png");
            if !p.exists() {
                let _ = std::fs::write(p, bytes);
            }
        }
    }

    let exec_path = std::env::current_exe()
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "velt".to_string());

    let desktop_path = apps_dir.join("dev.velt.terminal.desktop");
    let desktop_body = format!(
        "[Desktop Entry]\nType=Application\nName=Velt\nComment=Terminal emulator with on-demand OpenCode Agent Mode\nExec=\"{exec_path}\"\nIcon=dev.velt.terminal\nTerminal=false\nCategories=System;TerminalEmulator;\nStartupNotify=true\nStartupWMClass=dev.velt.terminal\n"
    );
    let _ = std::fs::write(desktop_path, desktop_body);
}

#[cfg(not(target_os = "linux"))]
fn ensure_linux_desktop_icon() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_linux_desktop_icon();
    let initial_cfg = load_config();
    let initial_blur = initial_cfg.blur && initial_cfg.blur_radius > 0 && initial_cfg.opacity < 0.995;
    tauri::Builder::default()
        .manage(AppState {
            pty: PtyManager::default(),
            opencode: OpenCodeManager::new(),
            config: Mutex::new(initial_cfg),
        })
        .setup(move |app| {
            if let Some(win) = app.get_webview_window("main") {
                blur::apply_window_blur(&win, initial_blur);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_default_config,
            get_system_locale,
            save_config,
            get_config_path,
            set_window_blur,
            open_external_url,
            list_workspace_files,
            read_context_file,
            filter_existing_paths,
            open_file_path,
            read_primary_selection,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_cwd,
            opencode_status,
            opencode_list_models,
            opencode_send_prompt,
            opencode_cancel_turn,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Velt");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_file_collection_skips_ignored_dirs_and_ranks_matches() {
        let base = std::env::temp_dir().join(format!("velt_test_{}", uuid::Uuid::new_v4()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("src")).expect("create src");
        fs::create_dir_all(base.join("node_modules/pkg")).expect("create node_modules");
        fs::create_dir_all(base.join(".git")).expect("create .git");

        fs::write(base.join("src/main.ts"), "console.log('hi');\n").expect("write main.ts");
        fs::write(base.join("src/ansi.ts"), "export {};\n").expect("write ansi.ts");
        fs::write(base.join("node_modules/pkg/index.js"), "ignored").expect("write ignored");
        fs::write(base.join(".git/HEAD"), "ref: refs/heads/main").expect("write git head");

        let all = collect_workspace_files(&base, "", 10);
        assert_eq!(all.len(), 2);
        assert!(all.contains(&"src/main.ts".to_string()));
        assert!(all.contains(&"src/ansi.ts".to_string()));

        let filtered = collect_workspace_files(&base, "main", 10);
        assert_eq!(filtered, vec!["src/main.ts".to_string()]);

        assert!(resolve_candidate_path(&base.to_string_lossy(), "src/main.ts").is_some());
        assert!(resolve_candidate_path(&base.to_string_lossy(), "src/missing.ts").is_none());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn read_text_file_bounded_rejects_binary_and_truncates_lines() {
        let base = std::env::temp_dir().join(format!("velt_read_test_{}", uuid::Uuid::new_v4()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("create temp dir");

        let bin_path = base.join("bin.dat");
        fs::write(&bin_path, [0u8, 159, 146, 150]).expect("write binary");
        assert!(read_text_file_bounded(&bin_path, 4096, 100).is_err());

        let txt_path = base.join("long.txt");
        let body = (1..=10)
            .map(|i| format!("line {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&txt_path, body).expect("write txt");
        let bounded = read_text_file_bounded(&txt_path, 4096, 3).expect("read bounded");
        assert!(bounded.contains("line 1"));
        assert!(bounded.contains("line 3"));
        assert!(!bounded.contains("line 4"));
        assert!(bounded.contains("[truncated]"));

        let _ = fs::remove_dir_all(&base);
    }
}
