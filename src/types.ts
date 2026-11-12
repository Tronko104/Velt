export interface Preset {
  id: string;
  name: string;
  model: string;
  effort: string;
}

export interface Keybindings {
  toggle_agent: string;
  toggle_agent_alt: string;
  select_all: string;
  model_switcher: string;
  cycle_effort: string;
  insert_command: string;
  new_tab: string;
  close_tab: string;
  split_vertical: string;
  split_horizontal: string;
  close_pane: string;
  new_agent_session: string;
  open_settings: string;
}

export interface VeltConfig {
  language: "auto" | "it" | "en";
  default_model: string;
  default_effort: string;
  presets: Preset[];
  auto_context: boolean;
  redact_secrets: boolean;
  context_lines: number;
  show_thinking: boolean;
  agent_exit_mode: "commands_only" | "clean" | "keep_all";
  agent_cmd_style: "shell" | "tagged" | "minimal";
  agent_live_think_bar: boolean;
  show_tool_output_in_agent: boolean;
  auto_approve: boolean;
  show_hidden_models: boolean;
  show_model_in_shell: boolean;
  opencode_bin: string;
  shell: string;
  font_family: string;
  font_size: number;
  line_height: number;
  scrollback: number;
  cursor_style: "block" | "bar" | "underline";
  cursor_blink: boolean;
  webgl_renderer: boolean;
  theme: string;
  accent_override: string;
  ui_backdrop_style: "aurora" | "subtle" | "flat";
  agent_aura: "vivid" | "minimal" | "off";
  ui_radius: number;
  terminal_padding: number;
  show_status_bar: boolean;
  compact_chrome: boolean;
  copy_on_select: boolean;
  middle_click_paste: boolean;
  focus_follows_mouse: boolean;
  opacity: number;
  blur: boolean;
  blur_radius: number;
  animations: boolean;
  keybindings: Keybindings;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  variants: string[];
  contextLimit?: number | null;
  outputLimit?: number | null;
}

export interface OpenCodeStatus {
  available: boolean;
  binaryPath?: string | null;
  version?: string | null;
  serviceUrl?: string | null;
  error?: string | null;
}

export interface AgentStreamEvent {
  tabId: string;
  sessionId: string;
  kind:
    | "session"
    | "reasoning_delta"
    | "text_delta"
    | "tool_start"
    | "tool_done"
    | "usage"
    | "done"
    | "error";
  text?: string | null;
  toolId?: string | null;
  toolName?: string | null;
  toolInput?: string | null;
  toolOutput?: string | null;
  toolOk?: boolean | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}
