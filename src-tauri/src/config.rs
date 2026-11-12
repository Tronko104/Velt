use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub model: String,
    pub effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Keybindings {
    pub toggle_agent: String,
    pub toggle_agent_alt: String,
    pub select_all: String,
    pub model_switcher: String,
    pub cycle_effort: String,
    pub insert_command: String,
    pub new_tab: String,
    pub close_tab: String,
    pub split_vertical: String,
    pub split_horizontal: String,
    pub close_pane: String,
    pub new_agent_session: String,
    pub open_settings: String,
}

impl Default for Keybindings {
    fn default() -> Self {
        Self {
            toggle_agent: "Ctrl+Shift+G".into(),
            toggle_agent_alt: "Ctrl+/".into(),
            select_all: "Ctrl+Shift+A".into(),
            model_switcher: "Ctrl+Shift+M".into(),
            cycle_effort: "Ctrl+Shift+E".into(),
            insert_command: "Ctrl+Shift+Enter".into(),
            new_tab: "Ctrl+Shift+T".into(),
            close_tab: "Ctrl+Shift+W".into(),
            split_vertical: "Ctrl+Shift+D".into(),
            split_horizontal: "Ctrl+Shift+B".into(),
            close_pane: "Ctrl+Shift+X".into(),
            new_agent_session: "Ctrl+Shift+N".into(),
            open_settings: "Ctrl+,".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct VeltConfig {
    pub language: String,
    pub default_model: String,
    pub default_effort: String,
    pub presets: Vec<Preset>,
    pub auto_context: bool,
    pub redact_secrets: bool,
    pub context_lines: usize,
    pub show_thinking: bool,
    pub agent_exit_mode: String,
    pub agent_cmd_style: String,
    pub agent_live_think_bar: bool,
    pub show_tool_output_in_agent: bool,
    pub auto_approve: bool,
    pub show_hidden_models: bool,
    pub show_model_in_shell: bool,
    pub opencode_bin: String,
    pub shell: String,
    pub font_family: String,
    pub font_size: u16,
    pub line_height: f32,
    pub scrollback: usize,
    pub cursor_style: String,
    pub cursor_blink: bool,
    pub webgl_renderer: bool,
    pub theme: String,
    pub accent_override: String,
    pub ui_backdrop_style: String,
    pub agent_aura: String,
    pub ui_radius: u16,
    pub terminal_padding: u16,
    pub show_status_bar: bool,
    pub compact_chrome: bool,
    pub copy_on_select: bool,
    pub middle_click_paste: bool,
    pub focus_follows_mouse: bool,
    pub opacity: f32,
    pub blur: bool,
    pub blur_radius: u16,
    pub animations: bool,
    pub keybindings: Keybindings,
}

impl Default for VeltConfig {
    fn default() -> Self {
        Self {
            language: "auto".into(),
            default_model: "opencode/flint-40b-free".into(),
            default_effort: "medium".into(),
            presets: vec![
                Preset {
                    id: "fast".into(),
                    name: "Fast".into(),
                    model: "opencode/flint-40b-free".into(),
                    effort: "low".into(),
                },
                Preset {
                    id: "coding".into(),
                    name: "Coding".into(),
                    model: "opencode/deepseek-v4.1-flash-free".into(),
                    effort: "high".into(),
                },
                Preset {
                    id: "deep".into(),
                    name: "Deep Think".into(),
                    model: "opencode/glm-5.3-flash-free".into(),
                    effort: "high".into(),
                },
            ],
            auto_context: true,
            redact_secrets: true,
            context_lines: 60,
            show_thinking: false,
            agent_exit_mode: "commands_only".into(),
            agent_cmd_style: "shell".into(),
            agent_live_think_bar: true,
            show_tool_output_in_agent: true,
            auto_approve: true,
            show_hidden_models: false,
            show_model_in_shell: false,
            opencode_bin: String::new(),
            shell: String::new(),
            font_family: "'JetBrains Mono', 'Fira Code', 'CaskaydiaCove Nerd Font', 'Cascadia Code', monospace".into(),
            font_size: 14,
            line_height: 1.32,
            scrollback: 10000,
            cursor_style: "block".into(),
            cursor_blink: true,
            webgl_renderer: true,
            theme: "velt-obsidian".into(),
            accent_override: String::new(),
            ui_backdrop_style: "aurora".into(),
            agent_aura: "vivid".into(),
            ui_radius: 10,
            terminal_padding: 10,
            show_status_bar: true,
            compact_chrome: false,
            copy_on_select: false,
            middle_click_paste: true,
            focus_follows_mouse: false,
            opacity: 0.92,
            blur: true,
            blur_radius: 16,
            animations: true,
            keybindings: Keybindings::default(),
        }
    }
}

pub fn config_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("velt").join("config.toml")
}

pub fn load_config() -> VeltConfig {
    let path = config_path();
    if let Ok(contents) = fs::read_to_string(&path) {
        if let Ok(mut cfg) = toml::from_str::<VeltConfig>(&contents) {
            // Migrate legacy Ctrl+Shift+A agent shortcut so Ctrl+Shift+A performs Select All.
            if cfg.keybindings.toggle_agent.eq_ignore_ascii_case("Ctrl+Shift+A") {
                cfg.keybindings.toggle_agent = "Ctrl+Shift+G".into();
                cfg.keybindings.select_all = "Ctrl+Shift+A".into();
                let _ = save_config(&cfg);
            }
            return cfg;
        }
    }
    let cfg = VeltConfig::default();
    let _ = save_config(&cfg);
    cfg
}

pub fn save_config(cfg: &VeltConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    let body = toml::to_string_pretty(cfg).map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, body).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_roundtrip_toml() {
        let cfg = VeltConfig::default();
        let encoded = toml::to_string_pretty(&cfg).expect("serialize default config");
        let decoded: VeltConfig = toml::from_str(&encoded).expect("deserialize default config");
        assert_eq!(decoded.language, "auto");
        assert_eq!(decoded.default_model, cfg.default_model);
        assert_eq!(decoded.default_effort, cfg.default_effort);
        assert_eq!(decoded.presets.len(), cfg.presets.len());
        assert!(decoded.redact_secrets);
        assert!(decoded.webgl_renderer);
        assert_eq!(decoded.keybindings.toggle_agent, "Ctrl+Shift+G");
        assert_eq!(decoded.keybindings.select_all, "Ctrl+Shift+A");
        assert_eq!(decoded.theme, "velt-obsidian");
        assert!(decoded.blur);
        assert_eq!(decoded.blur_radius, 16);
        assert!(!decoded.show_model_in_shell);
        assert_eq!(decoded.agent_exit_mode, "commands_only");
        assert_eq!(decoded.agent_cmd_style, "shell");
        assert!(decoded.agent_live_think_bar);
        assert!(decoded.show_tool_output_in_agent);
        assert_eq!(decoded.ui_backdrop_style, "aurora");
        assert_eq!(decoded.agent_aura, "vivid");
        assert_eq!(decoded.ui_radius, 10);
        assert_eq!(decoded.terminal_padding, 10);
        assert!(decoded.cursor_blink);
        assert!(decoded.show_status_bar);
        assert!(!decoded.compact_chrome);
        assert!(!decoded.copy_on_select);
        assert!(decoded.middle_click_paste);
        assert!(!decoded.focus_follows_mouse);
        assert_eq!(decoded.keybindings.split_vertical, "Ctrl+Shift+D");
        assert_eq!(decoded.keybindings.split_horizontal, "Ctrl+Shift+B");
        assert_eq!(decoded.keybindings.close_pane, "Ctrl+Shift+X");
    }
}
