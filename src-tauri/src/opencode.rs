use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub variants: Vec<String>,
    pub context_limit: Option<u64>,
    pub output_limit: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeStatus {
    pub available: bool,
    pub binary_path: Option<String>,
    pub version: Option<String>,
    pub service_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStreamEvent {
    pub tab_id: String,
    pub session_id: String,
    pub kind: String, // session | reasoning_delta | text_delta | tool_start | tool_done | usage | done | error
    pub text: Option<String>,
    pub tool_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_output: Option<String>,
    pub tool_ok: Option<bool>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Clone)]
struct ServiceInfo {
    base_url: String,
    auth_header: Option<String>,
}

struct ActiveTurn {
    tab_id: String,
    show_thinking: bool,
    streamed_via_sse: bool,
    finished: bool,
    canceled: bool,
    active_tools: HashMap<String, String>,
    active_tool_inputs: HashMap<String, String>,
    child_pid: Option<u32>,
}

#[derive(Default)]
pub struct OpenCodeManager {
    turns_by_session: Arc<Mutex<HashMap<String, ActiveTurn>>>,
    tab_to_session: Arc<Mutex<HashMap<String, String>>>,
    sse_started: Arc<Mutex<bool>>,
    client: reqwest::Client,
}

impl OpenCodeManager {
    pub fn new() -> Self {
        Self {
            turns_by_session: Arc::new(Mutex::new(HashMap::new())),
            tab_to_session: Arc::new(Mutex::new(HashMap::new())),
            sse_started: Arc::new(Mutex::new(false)),
            client: reqwest::Client::new(),
        }
    }

    pub async fn status(&self, override_bin: &str) -> OpenCodeStatus {
        let bin = resolve_opencode_bin(override_bin).await;
        let Some(bin_path) = bin else {
            return OpenCodeStatus {
                available: false,
                binary_path: None,
                version: None,
                service_url: None,
                error: Some("opencode-cli binary not found".into()),
            };
        };
        let version = command_stdout(&bin_path, &["--version"])
            .await
            .ok()
            .map(|s| s.trim().to_string());
        let service_url = discover_service(&bin_path).await.map(|s| s.base_url);
        OpenCodeStatus {
            available: true,
            binary_path: Some(bin_path),
            version,
            service_url,
            error: None,
        }
    }

    pub async fn list_models(
        &self,
        override_bin: &str,
        include_hidden: bool,
    ) -> Result<Vec<ModelInfo>, String> {
        let bin = resolve_opencode_bin(override_bin)
            .await
            .ok_or_else(|| "opencode-cli binary not found".to_string())?;

        let visibility = if include_hidden {
            HashMap::new()
        } else {
            load_desktop_model_visibility().await
        };

        if let Some(svc) = ensure_service(&bin).await {
            let mut req = self
                .client
                .get(format!("{}/api/model", svc.base_url));
            if let Some(auth) = &svc.auth_header {
                req = req.header("Authorization", auth);
            }
            if let Ok(resp) = req.send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        if let Some(models) = parse_api_models(&json, &visibility, include_hidden) {
                            if !models.is_empty() {
                                return Ok(models);
                            }
                        }
                    }
                }
            }
        }

        // Fallback via `opencode-cli api GET /api/model`
        if let Ok(raw) = command_stdout(&bin, &["api", "GET", "/api/model"]).await {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(models) = parse_api_models(&json, &visibility, include_hidden) {
                    if !models.is_empty() {
                        return Ok(models);
                    }
                }
            }
        }

        // Fallback via `opencode-cli models`
        let text = command_stdout(&bin, &["models"]).await?;
        let mut out = Vec::new();
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.contains('/') {
                continue;
            }
            if !include_hidden && visibility.get(trimmed).map(|v| v == "hide").unwrap_or(false) {
                continue;
            }
            let (provider, rest) = trimmed.split_once('/').unwrap_or(("opencode", trimmed));
            out.push(ModelInfo {
                id: trimmed.to_string(),
                name: rest.to_string(),
                provider: provider.to_string(),
                variants: Vec::new(),
                context_limit: None,
                output_limit: None,
            });
        }
        Ok(out)
    }

    pub async fn send_prompt(
        &self,
        app: AppHandle,
        override_bin: String,
        tab_id: String,
        session_id: Option<String>,
        cwd: String,
        model: String,
        effort: String,
        prompt: String,
        show_thinking: bool,
        auto_approve: bool,
    ) -> Result<String, String> {
        let bin = resolve_opencode_bin(&override_bin)
            .await
            .ok_or_else(|| "opencode-cli binary not found".to_string())?;

        let svc = ensure_service(&bin).await;
        if let Some(ref s) = svc {
            self.ensure_sse_listener(app.clone(), s.clone()).await;
        }

        // Create session upfront via REST API if possible so SSE correlation is exact from byte 0.
        let resolved_session = match session_id {
            Some(sid) if !sid.is_empty() => sid,
            _ => {
                if let Some(ref s) = svc {
                    create_session_http(&self.client, s, &cwd)
                        .await
                        .unwrap_or_else(|| format!("pending-{}", uuid::Uuid::new_v4()))
                } else {
                    format!("pending-{}", uuid::Uuid::new_v4())
                }
            }
        };

        let is_pending = resolved_session.starts_with("pending-");

        {
            let mut map = self.tab_to_session.lock().await;
            map.insert(tab_id.clone(), resolved_session.clone());
        }

        {
            let mut turns = self.turns_by_session.lock().await;
            turns.insert(
                resolved_session.clone(),
                ActiveTurn {
                    tab_id: tab_id.clone(),
                    show_thinking,
                    streamed_via_sse: false,
                    finished: false,
                    canceled: false,
                    active_tools: HashMap::new(),
                    active_tool_inputs: HashMap::new(),
                    child_pid: None,
                },
            );
        }

        if !is_pending {
            let _ = app.emit(
                "agent:event",
                AgentStreamEvent {
                    tab_id: tab_id.clone(),
                    session_id: resolved_session.clone(),
                    kind: "session".into(),
                    text: None,
                    tool_id: None,
                    tool_name: None,
                    tool_input: None,
                    tool_output: None,
                    tool_ok: None,
                    input_tokens: None,
                    output_tokens: None,
                },
            );
        }

        let model_spec = build_model_spec(&model, &effort);
        let turns_ref = Arc::clone(&self.turns_by_session);
        let tab_map_ref = Arc::clone(&self.tab_to_session);
        let session_key = resolved_session.clone();
        let return_session = if is_pending {
            String::new()
        } else {
            resolved_session.clone()
        };

        tokio::spawn(async move {
            let mut args = vec![
                "run".to_string(),
                "--format".to_string(),
                "json".to_string(),
                "--thinking".to_string(),
            ];
            if auto_approve {
                args.push("--auto".to_string());
            }
            if !is_pending {
                args.push("-s".to_string());
                args.push(session_key.clone());
            }
            if !model_spec.is_empty() {
                args.push("-m".to_string());
                args.push(model_spec);
            }
            args.push(prompt);

            let valid_cwd = if PathBuf::from(&cwd).is_dir() {
                cwd.clone()
            } else {
                dirs::home_dir()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "/".to_string())
            };

            let child_res = Command::new(&bin)
                .args(&args)
                .current_dir(&valid_cwd)
                .env("PWD", &valid_cwd)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true)
                .spawn();

            let mut child = match child_res {
                Ok(c) => c,
                Err(e) => {
                    emit_turn_error(&app, &turns_ref, &session_key, &tab_id, format!("Failed to start opencode-cli: {e}")).await;
                    return;
                }
            };

            {
                let mut turns = turns_ref.lock().await;
                if let Some(t) = turns.get_mut(&session_key) {
                    t.child_pid = child.id();
                }
            }

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let stderr_task = tokio::spawn(async move {
                let mut err_buf = String::new();
                if let Some(s) = stderr {
                    let mut reader = BufReader::new(s).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        if !err_buf.is_empty() {
                            err_buf.push('\n');
                        }
                        err_buf.push_str(&line);
                    }
                }
                err_buf
            });

            let mut actual_session_id = session_key.clone();

            if let Some(out) = stdout {
                let mut reader = BufReader::new(out).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let Ok(ev) = serde_json::from_str::<serde_json::Value>(trimmed) else {
                        continue;
                    };

                    if let Some(sid) = ev.get("sessionID").and_then(|v| v.as_str()) {
                        if actual_session_id != sid {
                            // Re-key pending turn to the real sessionID
                            let mut turns = turns_ref.lock().await;
                            if let Some(turn) = turns.remove(&actual_session_id) {
                                turns.insert(sid.to_string(), turn);
                            }
                            let mut map = tab_map_ref.lock().await;
                            map.insert(tab_id.clone(), sid.to_string());
                            actual_session_id = sid.to_string();
                            let _ = app.emit(
                                "agent:event",
                                AgentStreamEvent {
                                    tab_id: tab_id.clone(),
                                    session_id: actual_session_id.clone(),
                                    kind: "session".into(),
                                    text: None,
                                    tool_id: None,
                                    tool_name: None,
                                    tool_input: None,
                                    tool_output: None,
                                    tool_ok: None,
                                    input_tokens: None,
                                    output_tokens: None,
                                },
                            );
                        }
                    }

                    let ev_type = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let streamed_sse = {
                        let turns = turns_ref.lock().await;
                        turns
                            .get(&actual_session_id)
                            .map(|t| t.streamed_via_sse)
                            .unwrap_or(false)
                    };

                    if !streamed_sse {
                        match ev_type {
                            "reasoning" => {
                                let _ = show_thinking;
                                if let Some(txt) = ev.pointer("/part/text").and_then(|v| v.as_str()) {
                                    let _ = app.emit(
                                        "agent:event",
                                        AgentStreamEvent {
                                            tab_id: tab_id.clone(),
                                            session_id: actual_session_id.clone(),
                                            kind: "reasoning_delta".into(),
                                            text: Some(txt.to_string()),
                                            tool_id: None,
                                            tool_name: None,
                                            tool_input: None,
                                            tool_output: None,
                                            tool_ok: None,
                                            input_tokens: None,
                                            output_tokens: None,
                                        },
                                    );
                                }
                            }
                            "text" => {
                                if let Some(txt) = ev.pointer("/part/text").and_then(|v| v.as_str()) {
                                    let _ = app.emit(
                                        "agent:event",
                                        AgentStreamEvent {
                                            tab_id: tab_id.clone(),
                                            session_id: actual_session_id.clone(),
                                            kind: "text_delta".into(),
                                            text: Some(txt.to_string()),
                                            tool_id: None,
                                            tool_name: None,
                                            tool_input: None,
                                            tool_output: None,
                                            tool_ok: None,
                                            input_tokens: None,
                                            output_tokens: None,
                                        },
                                    );
                                }
                            }
                            "tool_use" => {
                                let part = ev.get("part");
                                let tool_name = part
                                    .and_then(|p| p.get("tool"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("tool")
                                    .to_string();
                                let tool_id = part
                                    .and_then(|p| p.get("id"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                let input = part
                                    .and_then(|p| p.pointer("/state/input"))
                                    .map(|v| extract_tool_input_detail(&tool_name, v));
                                let output = part.and_then(extract_tool_output_from_part);
                                let status = part
                                    .and_then(|p| p.pointer("/state/status"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("completed");
                                let exit_code = part
                                    .and_then(|p| {
                                        p.pointer("/state/metadata/metadata/exit")
                                            .or_else(|| p.pointer("/state/metadata/exit"))
                                            .or_else(|| p.pointer("/state/exit"))
                                    })
                                    .and_then(|v| v.as_i64());
                                let ok = status == "completed" && exit_code.unwrap_or(0) == 0;
                                let err_text = if !ok {
                                    part.and_then(|p| p.pointer("/state/error"))
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                        .or_else(|| exit_code.map(|c| format!("exit {c}")))
                                } else {
                                    None
                                };
                                let _ = app.emit(
                                    "agent:event",
                                    AgentStreamEvent {
                                        tab_id: tab_id.clone(),
                                        session_id: actual_session_id.clone(),
                                        kind: "tool_done".into(),
                                        text: err_text,
                                        tool_id,
                                        tool_name: Some(tool_name),
                                        tool_input: input,
                                        tool_output: output,
                                        tool_ok: Some(ok),
                                        input_tokens: None,
                                        output_tokens: None,
                                    },
                                );
                            }
                            "step_finish" => {
                                let inp = ev.pointer("/part/tokens/input").and_then(|v| v.as_u64());
                                let outp = ev.pointer("/part/tokens/output").and_then(|v| v.as_u64());
                                let _ = app.emit(
                                    "agent:event",
                                    AgentStreamEvent {
                                        tab_id: tab_id.clone(),
                                        session_id: actual_session_id.clone(),
                                        kind: "usage".into(),
                                        text: None,
                                        tool_id: None,
                                        tool_name: None,
                                        tool_input: None,
                                        tool_output: None,
                                        tool_ok: None,
                                        input_tokens: inp,
                                        output_tokens: outp,
                                    },
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }

            let status = child.wait().await;
            let stderr_text = stderr_task.await.unwrap_or_default();

            let (already_finished, was_canceled) = {
                let mut turns = turns_ref.lock().await;
                if let Some(t) = turns.get_mut(&actual_session_id) {
                    let prev_fin = t.finished;
                    let canc = t.canceled;
                    t.finished = true;
                    t.child_pid = None;
                    (prev_fin, canc)
                } else {
                    (false, false)
                }
            };

            if !already_finished {
                if was_canceled {
                    let _ = app.emit(
                        "agent:event",
                        AgentStreamEvent {
                            tab_id: tab_id.clone(),
                            session_id: actual_session_id.clone(),
                            kind: "done".into(),
                            text: Some("canceled".into()),
                            tool_id: None,
                            tool_name: None,
                            tool_input: None,
                            tool_output: None,
                            tool_ok: None,
                            input_tokens: None,
                            output_tokens: None,
                        },
                    );
                } else if let Ok(st) = status {
                    if !st.success() {
                        let msg = if stderr_text.trim().is_empty() {
                            format!("opencode-cli exited with status {st}")
                        } else {
                            stderr_text.trim().to_string()
                        };
                        let _ = app.emit(
                            "agent:event",
                            AgentStreamEvent {
                                tab_id: tab_id.clone(),
                                session_id: actual_session_id.clone(),
                                kind: "error".into(),
                                text: Some(msg),
                                tool_id: None,
                                tool_name: None,
                                tool_input: None,
                                tool_output: None,
                                tool_ok: None,
                                input_tokens: None,
                                output_tokens: None,
                            },
                        );
                    } else {
                        let _ = app.emit(
                            "agent:event",
                            AgentStreamEvent {
                                tab_id: tab_id.clone(),
                                session_id: actual_session_id.clone(),
                                kind: "done".into(),
                                text: None,
                                tool_id: None,
                                tool_name: None,
                                tool_input: None,
                                tool_output: None,
                                tool_ok: None,
                                input_tokens: None,
                                output_tokens: None,
                            },
                        );
                    }
                }
            }
        });

        Ok(return_session)
    }

    pub async fn cancel_turn(&self, override_bin: &str, tab_id: &str) -> Result<(), String> {
        let session_id = {
            let map = self.tab_to_session.lock().await;
            map.get(tab_id).cloned()
        };

        let Some(sid) = session_id else {
            return Ok(());
        };

        let pid = {
            let mut turns = self.turns_by_session.lock().await;
            if let Some(t) = turns.get_mut(&sid) {
                t.canceled = true;
                t.child_pid
            } else {
                None
            }
        };

        if let Some(p) = pid {
            let _ = Command::new("kill")
                .args(["-TERM", &p.to_string()])
                .output()
                .await;
        }

        if let Some(bin) = resolve_opencode_bin(override_bin).await {
            if let Some(svc) = discover_service(&bin).await {
                let mut req = self
                    .client
                    .post(format!("{}/api/session/{}/abort", svc.base_url, sid));
                if let Some(auth) = svc.auth_header {
                    req = req.header("Authorization", auth);
                }
                let _ = req.send().await;
            }
        }

        Ok(())
    }

    async fn ensure_sse_listener(&self, app: AppHandle, svc: ServiceInfo) {
        {
            let mut started = self.sse_started.lock().await;
            if *started {
                return;
            }
            *started = true;
        }

        let client = self.client.clone();
        let turns_ref = Arc::clone(&self.turns_by_session);
        let sse_flag = Arc::clone(&self.sse_started);

        tokio::spawn(async move {
            let mut req = client
                .get(format!("{}/api/event", svc.base_url))
                .header("Accept", "text/event-stream");
            if let Some(ref auth) = svc.auth_header {
                req = req.header("Authorization", auth);
            }

            let Ok(resp) = req.send().await else {
                let mut flag = sse_flag.lock().await;
                *flag = false;
                return;
            };
            if !resp.status().is_success() {
                let mut flag = sse_flag.lock().await;
                *flag = false;
                return;
            }

            let mut stream = resp.bytes_stream();
            let mut buf = String::new();

            while let Some(item) = stream.next().await {
                let Ok(bytes) = item else {
                    break;
                };
                buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(nl) = buf.find('\n') {
                    let line = buf[..nl].trim_end_matches('\r').to_string();
                    buf.drain(..=nl);
                    let Some(payload) = line.strip_prefix("data:") else {
                        continue;
                    };
                    let Ok(ev) = serde_json::from_str::<serde_json::Value>(payload.trim()) else {
                        continue;
                    };
                    let ev_type = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let Some(data) = ev.get("data") else {
                        continue;
                    };
                    let Some(sid) = data.get("sessionID").and_then(|v| v.as_str()) else {
                        continue;
                    };

                    let mut emit_ev: Option<AgentStreamEvent> = None;

                    {
                        let mut turns = turns_ref.lock().await;
                        if let Some(turn) = turns.get_mut(sid) {
                            if turn.finished {
                                continue;
                            }
                            let tab_id = turn.tab_id.clone();
                            match ev_type {
                                "session.reasoning.delta" => {
                                    turn.streamed_via_sse = true;
                                    let _ = turn.show_thinking;
                                    if let Some(delta) = data.get("delta").and_then(|v| v.as_str()) {
                                        emit_ev = Some(AgentStreamEvent {
                                            tab_id,
                                            session_id: sid.to_string(),
                                            kind: "reasoning_delta".into(),
                                            text: Some(delta.to_string()),
                                            tool_id: None,
                                            tool_name: None,
                                            tool_input: None,
                                            tool_output: None,
                                            tool_ok: None,
                                            input_tokens: None,
                                            output_tokens: None,
                                        });
                                    }
                                }
                                "session.text.delta" => {
                                    turn.streamed_via_sse = true;
                                    if let Some(delta) = data.get("delta").and_then(|v| v.as_str()) {
                                        emit_ev = Some(AgentStreamEvent {
                                            tab_id,
                                            session_id: sid.to_string(),
                                            kind: "text_delta".into(),
                                            text: Some(delta.to_string()),
                                            tool_id: None,
                                            tool_name: None,
                                            tool_input: None,
                                            tool_output: None,
                                            tool_ok: None,
                                            input_tokens: None,
                                            output_tokens: None,
                                        });
                                    }
                                }
                                "session.tool.input.started" => {
                                    turn.streamed_via_sse = true;
                                    if let (Some(id), Some(name)) = (
                                        data.get("id").and_then(|v| v.as_str()),
                                        data.get("name").and_then(|v| v.as_str()),
                                    ) {
                                        turn.active_tools.insert(id.to_string(), name.to_string());
                                    }
                                }
                                "session.tool.called" => {
                                    turn.streamed_via_sse = true;
                                    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let name = data
                                        .get("name")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                        .or_else(|| turn.active_tools.get(&id).cloned())
                                        .unwrap_or_else(|| "tool".into());
                                    turn.active_tools.insert(id.clone(), name.clone());
                                    let input_summary = data
                                        .get("input")
                                        .or_else(|| data.get("arguments"))
                                        .or_else(|| data.get("args"))
                                        .map(|v| extract_tool_input_detail(&name, v));
                                    if let Some(ref detail) = input_summary {
                                        if !id.is_empty() {
                                            turn.active_tool_inputs.insert(id.clone(), detail.clone());
                                        }
                                    }
                                    emit_ev = Some(AgentStreamEvent {
                                        tab_id,
                                        session_id: sid.to_string(),
                                        kind: "tool_start".into(),
                                        text: None,
                                        tool_id: Some(id),
                                        tool_name: Some(name),
                                        tool_input: input_summary,
                                        tool_output: None,
                                        tool_ok: None,
                                        input_tokens: None,
                                        output_tokens: None,
                                    });
                                }
                                "session.tool.success" => {
                                    turn.streamed_via_sse = true;
                                    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let name = turn
                                        .active_tools
                                        .remove(&id)
                                        .unwrap_or_else(|| "tool".into());
                                    let input_detail = turn.active_tool_inputs.remove(&id);
                                    let output_detail = extract_tool_output_from_sse(&data);
                                    let exit_code = data
                                        .pointer("/metadata/exit")
                                        .or_else(|| data.pointer("/metadata/metadata/exit"))
                                        .and_then(|v| v.as_i64());
                                    let exit_ok = exit_code.unwrap_or(0) == 0;
                                    let err_text = if !exit_ok {
                                        exit_code.map(|c| format!("exit {c}"))
                                    } else {
                                        None
                                    };
                                    emit_ev = Some(AgentStreamEvent {
                                        tab_id,
                                        session_id: sid.to_string(),
                                        kind: "tool_done".into(),
                                        text: err_text,
                                        tool_id: Some(id),
                                        tool_name: Some(name),
                                        tool_input: input_detail,
                                        tool_output: output_detail,
                                        tool_ok: Some(exit_ok),
                                        input_tokens: None,
                                        output_tokens: None,
                                    });
                                }
                                "session.tool.error" | "session.tool.failed" => {
                                    turn.streamed_via_sse = true;
                                    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let name = turn
                                        .active_tools
                                        .remove(&id)
                                        .unwrap_or_else(|| "tool".into());
                                    let input_detail = turn.active_tool_inputs.remove(&id);
                                    let output_detail = extract_tool_output_from_sse(&data);
                                    let err = data
                                        .get("error")
                                        .and_then(|v| v.as_str())
                                        .or_else(|| data.get("message").and_then(|v| v.as_str()))
                                        .map(|s| s.to_string());
                                    emit_ev = Some(AgentStreamEvent {
                                        tab_id,
                                        session_id: sid.to_string(),
                                        kind: "tool_done".into(),
                                        text: err,
                                        tool_id: Some(id),
                                        tool_name: Some(name),
                                        tool_input: input_detail,
                                        tool_output: output_detail,
                                        tool_ok: Some(false),
                                        input_tokens: None,
                                        output_tokens: None,
                                    });
                                }
                                "session.usage.updated" => {
                                    let inp = data.pointer("/tokens/input").and_then(|v| v.as_u64());
                                    let outp = data.pointer("/tokens/output").and_then(|v| v.as_u64());
                                    emit_ev = Some(AgentStreamEvent {
                                        tab_id,
                                        session_id: sid.to_string(),
                                        kind: "usage".into(),
                                        text: None,
                                        tool_id: None,
                                        tool_name: None,
                                        tool_input: None,
                                        tool_output: None,
                                        tool_ok: None,
                                        input_tokens: inp,
                                        output_tokens: outp,
                                    });
                                }
                                "session.execution.succeeded" => {
                                    turn.finished = true;
                                    emit_ev = Some(AgentStreamEvent {
                                        tab_id,
                                        session_id: sid.to_string(),
                                        kind: "done".into(),
                                        text: None,
                                        tool_id: None,
                                        tool_name: None,
                                        tool_input: None,
                                        tool_output: None,
                                        tool_ok: None,
                                        input_tokens: None,
                                        output_tokens: None,
                                    });
                                }
                                "session.execution.failed" | "session.error" => {
                                    turn.finished = true;
                                    let err_msg = data
                                        .pointer("/error/message")
                                        .and_then(|v| v.as_str())
                                        .or_else(|| data.get("error").and_then(|v| v.as_str()))
                                        .or_else(|| data.get("message").and_then(|v| v.as_str()))
                                        .unwrap_or("OpenCode execution failed")
                                        .to_string();
                                    emit_ev = Some(AgentStreamEvent {
                                        tab_id,
                                        session_id: sid.to_string(),
                                        kind: "error".into(),
                                        text: Some(err_msg),
                                        tool_id: None,
                                        tool_name: None,
                                        tool_input: None,
                                        tool_output: None,
                                        tool_ok: None,
                                        input_tokens: None,
                                        output_tokens: None,
                                    });
                                }
                                _ => {}
                            }
                        }
                    }

                    if let Some(e) = emit_ev {
                        let _ = app.emit("agent:event", e);
                    }
                }
            }

            let mut flag = sse_flag.lock().await;
            *flag = false;
        });
    }
}

async fn emit_turn_error(
    app: &AppHandle,
    turns_ref: &Arc<Mutex<HashMap<String, ActiveTurn>>>,
    session_key: &str,
    tab_id: &str,
    msg: String,
) {
    {
        let mut turns = turns_ref.lock().await;
        if let Some(t) = turns.get_mut(session_key) {
            t.finished = true;
        }
    }
    let _ = app.emit(
        "agent:event",
        AgentStreamEvent {
            tab_id: tab_id.to_string(),
            session_id: session_key.to_string(),
            kind: "error".into(),
            text: Some(msg),
            tool_id: None,
            tool_name: None,
            tool_input: None,
            tool_output: None,
            tool_ok: None,
            input_tokens: None,
            output_tokens: None,
        },
    );
}

fn build_model_spec(model: &str, effort: &str) -> String {
    let m = model.trim();
    if m.is_empty() {
        return String::new();
    }
    let e = effort.trim();
    if e.is_empty() || e == "default" {
        m.to_string()
    } else {
        format!("{m}#{e}")
    }
}

fn is_shell_tool_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "bash" | "shell" | "sh" | "exec" | "terminal" | "run_command"
    )
}

fn extract_tool_input_detail(tool_name: &str, v: &serde_json::Value) -> String {
    if is_shell_tool_name(tool_name) {
        if let Some(cmd) = v
            .get("command")
            .or_else(|| v.get("cmd"))
            .and_then(|x| x.as_str())
        {
            let trimmed = cmd.trim();
            if trimmed.chars().count() <= 4000 {
                return trimmed.to_string();
            }
            let mut out: String = trimmed.chars().take(3999).collect();
            out.push('…');
            return out;
        }
    }
    summarize_tool_input(v)
}

fn extract_tool_output_from_part(part: &serde_json::Value) -> Option<String> {
    let raw = part
        .pointer("/state/output")
        .or_else(|| part.pointer("/state/metadata/output"))
        .or_else(|| part.pointer("/state/metadata/stdout"))
        .or_else(|| part.pointer("/state/result"))
        .and_then(|v| v.as_str())?;
    cap_output(raw)
}

fn extract_tool_output_from_sse(data: &serde_json::Value) -> Option<String> {
    let raw = data
        .get("output")
        .or_else(|| data.pointer("/metadata/output"))
        .or_else(|| data.pointer("/metadata/stdout"))
        .or_else(|| data.get("result"))
        .or_else(|| data.pointer("/state/output"))
        .and_then(|v| v.as_str())?;
    cap_output(raw)
}

fn cap_output(raw: &str) -> Option<String> {
    let trimmed = raw.trim_matches(|c| c == '\r' || c == '\n');
    if trimmed.is_empty() {
        return None;
    }
    const MAX_CHARS: usize = 32768;
    if raw.chars().count() <= MAX_CHARS {
        Some(raw.to_string())
    } else {
        let mut s: String = raw.chars().take(MAX_CHARS).collect();
        s.push_str("\n… [output troncato]");
        Some(s)
    }
}

fn summarize_tool_input(v: &serde_json::Value) -> String {
    if let Some(cmd) = v.get("command").and_then(|x| x.as_str()) {
        return truncate_str(cmd, 80);
    }
    if let Some(path) = v
        .get("filePath")
        .or_else(|| v.get("path"))
        .and_then(|x| x.as_str())
    {
        return truncate_str(path, 80);
    }
    if let Some(pattern) = v.get("pattern").and_then(|x| x.as_str()) {
        return truncate_str(pattern, 80);
    }
    if let Some(query) = v.get("query").and_then(|x| x.as_str()) {
        return truncate_str(query, 80);
    }
    truncate_str(&v.to_string(), 80)
}

fn truncate_str(s: &str, max_chars: usize) -> String {
    let clean: String = s.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
    if clean.chars().count() <= max_chars {
        clean
    } else {
        let mut out: String = clean.chars().take(max_chars.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}

pub async fn resolve_opencode_bin(override_path: &str) -> Option<String> {
    let trimmed = override_path.trim();
    if !trimmed.is_empty() {
        return Some(trimmed.to_string());
    }

    let mut candidates = vec![
        "/usr/lib/opencode-desktop/opencode-cli".to_string(),
        "/usr/local/bin/opencode-cli".to_string(),
        "/usr/bin/opencode-cli".to_string(),
        "opencode-cli".to_string(),
        "opencode".to_string(),
    ];
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".local/bin/opencode").to_string_lossy().into_owned());
        candidates.push(home.join(".npm-global/bin/opencode").to_string_lossy().into_owned());
    }

    for cand in candidates {
        if cand.starts_with('/') && !PathBuf::from(&cand).exists() {
            continue;
        }
        if let Ok(ver) = command_stdout(&cand, &["--version"]).await {
            if ver.contains("v2.") || cand.ends_with("opencode-cli") {
                return Some(cand);
            }
        }
    }

    // Secondary fallback to any runnable `opencode`
    for cand in ["opencode-cli", "opencode"] {
        if command_stdout(cand, &["--version"]).await.is_ok() {
            return Some(cand.to_string());
        }
    }

    None
}

async fn command_stdout(bin: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(bin)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run {bin}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).into_owned();
        Err(if err.trim().is_empty() {
            format!("{bin} exited with {}", out.status)
        } else {
            err
        })
    }
}

async fn discover_service(bin: &str) -> Option<ServiceInfo> {
    let status = command_stdout(bin, &["service", "status"]).await.ok()?;
    let url = status
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with("http://") || l.starts_with("https://"))?
        .trim_end_matches('/')
        .to_string();

    let auth_header = read_service_auth();
    Some(ServiceInfo {
        base_url: url,
        auth_header,
    })
}

async fn ensure_service(bin: &str) -> Option<ServiceInfo> {
    if let Some(svc) = discover_service(bin).await {
        return Some(svc);
    }
    let _ = command_stdout(bin, &["service", "start"]).await;
    discover_service(bin).await
}

fn read_service_auth() -> Option<String> {
    let cfg_dir = dirs::config_dir()?;
    let path = cfg_dir.join("opencode").join("service.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let pw = json.get("password").and_then(|v| v.as_str())?;
    let token = base64::engine::general_purpose::STANDARD.encode(format!("opencode:{pw}"));
    Some(format!("Basic {token}"))
}

async fn create_session_http(
    client: &reqwest::Client,
    svc: &ServiceInfo,
    cwd: &str,
) -> Option<String> {
    let valid_cwd = if PathBuf::from(cwd).is_dir() {
        cwd
    } else {
        "."
    };
    let mut req = client
        .post(format!("{}/api/session", svc.base_url))
        .query(&[("directory", valid_cwd)])
        .header("x-opencode-directory", valid_cwd)
        .json(&serde_json::json!({}));
    if let Some(ref auth) = svc.auth_header {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: serde_json::Value = resp.json().await.ok()?;
    json.pointer("/data/id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

async fn load_desktop_model_visibility() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some(cfg_dir) = dirs::config_dir() else {
        return map;
    };
    let db_path = cfg_dir.join("ai.opencode.desktop").join("drafts.sqlite");
    if !db_path.exists() {
        return map;
    }
    let out = Command::new("sqlite3")
        .arg("-readonly")
        .arg(&db_path)
        .arg("SELECT value FROM state WHERE name='opencode.global.dat' AND key='model';")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await;

    let Ok(output) = out else {
        return map;
    };
    if !output.status.success() {
        return map;
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    let Ok(json) = serde_json::from_str::<serde_json::Value>(raw.trim()) else {
        return map;
    };
    if let Some(arr) = json.get("user").and_then(|v| v.as_array()) {
        for item in arr {
            if let (Some(prov), Some(mid), Some(vis)) = (
                item.get("providerID").and_then(|v| v.as_str()),
                item.get("modelID").and_then(|v| v.as_str()),
                item.get("visibility").and_then(|v| v.as_str()),
            ) {
                map.insert(format!("{prov}/{mid}"), vis.to_string());
            }
        }
    }
    map
}

fn parse_api_models(
    json: &serde_json::Value,
    visibility: &HashMap<String, String>,
    include_hidden: bool,
) -> Option<Vec<ModelInfo>> {
    let arr = json.get("data").and_then(|v| v.as_array())?;
    let mut models = Vec::new();
    for item in arr {
        let enabled = item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
        if !enabled {
            continue;
        }
        let provider = item
            .get("providerID")
            .and_then(|v| v.as_str())
            .unwrap_or("opencode")
            .to_string();
        let model_id = item
            .get("modelID")
            .or_else(|| item.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if model_id.is_empty() {
            continue;
        }
        let full_id = format!("{provider}/{model_id}");
        if !include_hidden {
            let vis = visibility.get(&full_id).map(|s| s.as_str());
            if vis == Some("hide") {
                continue;
            }
            let supports_tools = item
                .pointer("/capabilities/tools")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            if !supports_tools && vis != Some("show") {
                continue;
            }
        }
        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&model_id)
            .to_string();
        let variants = item
            .get("variants")
            .and_then(|v| v.as_array())
            .map(|vs| {
                vs.iter()
                    .filter_map(|v| v.get("id").and_then(|id| id.as_str()).map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let context_limit = item.pointer("/limit/context").and_then(|v| v.as_u64());
        let output_limit = item.pointer("/limit/output").and_then(|v| v.as_u64());

        models.push(ModelInfo {
            id: full_id,
            name,
            provider,
            variants,
            context_limit,
            output_limit,
        });
    }
    models.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.name.cmp(&b.name)));
    Some(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_spec_appends_variant_when_non_default() {
        assert_eq!(
            build_model_spec("opencode/flint-40b-free", "high"),
            "opencode/flint-40b-free#high"
        );
        assert_eq!(
            build_model_spec("opencode/flint-40b-free", "default"),
            "opencode/flint-40b-free"
        );
        assert_eq!(
            build_model_spec("opencode/flint-40b-free", ""),
            "opencode/flint-40b-free"
        );
    }

    #[test]
    fn parse_api_models_extracts_variants_and_filters_hidden_and_disabled() {
        let payload = serde_json::json!({
            "data": [
                {
                    "id": "flint-40b-free",
                    "modelID": "flint-40b-free",
                    "providerID": "opencode",
                    "name": "Flint 40B Free",
                    "enabled": true,
                    "capabilities": {"tools": true},
                    "variants": [{"id": "low"}, {"id": "high"}, {"id": "max"}],
                    "limit": {"context": 128000, "output": 16384}
                },
                {
                    "id": "hidden-model",
                    "modelID": "hidden-model",
                    "providerID": "nvidia",
                    "enabled": true,
                    "capabilities": {"tools": true}
                },
                {
                    "id": "safety-model",
                    "modelID": "safety-model",
                    "providerID": "nvidia",
                    "enabled": true,
                    "capabilities": {"tools": false}
                },
                {
                    "id": "disabled-model",
                    "modelID": "disabled-model",
                    "providerID": "opencode",
                    "enabled": false
                }
            ]
        });
        let mut vis = HashMap::new();
        vis.insert("nvidia/hidden-model".to_string(), "hide".to_string());

        let parsed = parse_api_models(&payload, &vis, false).expect("parsed models");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "opencode/flint-40b-free");
        assert_eq!(parsed[0].variants, vec!["low", "high", "max"]);
        assert_eq!(parsed[0].context_limit, Some(128000));

        let parsed_all = parse_api_models(&payload, &vis, true).expect("parsed all");
        assert_eq!(parsed_all.len(), 3);
    }

    #[test]
    fn extract_shell_command_and_output_preserves_full_command() {
        let long_cmd = "mkdir -p /home/tronko104/Downloads/macro && ls -la /home/tronko104/Downloads/macro && echo done-testing-long-command";
        let input = serde_json::json!({ "command": long_cmd });
        let detail = extract_tool_input_detail("shell", &input);
        assert_eq!(detail, long_cmd);

        let part = serde_json::json!({
            "tool": "bash",
            "state": {
                "status": "completed",
                "output": "file1.txt\nfile2.txt\n"
            }
        });
        assert_eq!(
            extract_tool_output_from_part(&part).as_deref(),
            Some("file1.txt\nfile2.txt\n")
        );
    }
}
