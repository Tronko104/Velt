mod blur;
mod config;
mod opencode;
mod pty;

use config::{config_path, load_config, save_config as write_config_file, VeltConfig};
use opencode::{ModelInfo, OpenCodeManager, OpenCodeStatus};
use pty::PtyManager;
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
