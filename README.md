# Velt

A frameless Linux terminal emulator built with **Tauri v2**, **xterm.js**, and **OpenCode** featuring an on-demand **Agent Mode** inside a unified scrollback buffer.

## Key Features

- **Unified Shell & Agent Scrollback**: No detached sidebars. Toggling Agent Mode switches the frame and cursor accent and renders OpenCode responses directly inside the terminal scrollback alongside your shell history. On exit, configurable exit modes (`commands_only`, `clean`, or `keep_all`) isolate executed shell commands or restore the pre-agent buffer cleanly.
- **Split Panes & Tabs**: Recursive vertical and horizontal splits (`Ctrl+Shift+D`, `Ctrl+Shift+B`), directional pane navigation (`Ctrl+Shift+Arrows`), drag-to-resize splitters coalesced with `requestAnimationFrame`, and independent PTY and OpenCode sessions per pane.
- **Model & Reasoning Effort Quick Switcher**:
  - `Ctrl+Shift+M`: Search available OpenCode models, switch supported reasoning effort levels (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `thinking`), or pick presets.
  - `Ctrl+Shift+E`: Cycle reasoning effort on the active pane.
- **Live Thinking Ticker & Agent Controls**: Real-time thinking ticker in the Agent Dock, optional scrollback reasoning display, and safe command insertion (`Ctrl+Shift+Enter`) that pastes suggested commands into your shell prompt **without auto-executing**.
- **Automatic Secret Redaction**: Optional context sharing (`@context`) sends the current working directory and recent terminal lines to OpenCode. Enabled by default (`redact_secrets = true`), a built-in client-side filter masks common API keys, tokens (`sk-`, `ghp_`, `github_pat_`, `AKIA`, `AIza`, `xox*`, `Bearer`/`Basic`), PEM private keys, embedded URL credentials, and sensitive `KEY=VALUE` pairs before any context leaves the terminal.
- **Themes, Transparency & Native Linux Blur**:
  - 10 built-in themes (`Velt Obsidian`, `Tokyo Night`, `Catppuccin Mocha`, `Nord Arctic`, `Gruvbox Amber`, `Rosé Pine`, `Dracula Violet`, `Kanagawa Wave`, `Monokai Pro`, `Solarized Deep`) with live preview.
  - Configurable window opacity (`35%`-`100%`), backdrop styles (`aurora`, `subtle`, `flat`), and compositor blur (`ext_background_effect_v1` / legacy `org_kde_kwin_blur` on Wayland, `_KDE_NET_WM_BLUR_BEHIND_REGION` on X11) plus a live toggle for the xterm.js WebGL renderer (`webgl_renderer`) for WebKitGTK/Wayland compatibility.
- **Bilingual In-App UI**: Automatic system locale detection (`LC_ALL`/`LC_MESSAGES`/`LANG` + browser locale) with live switching between **English** and **Italian** (`auto`, `en`, `it`).
- **Terminal Ergonomics**: Bracketed paste, optional copy-on-select, Linux primary-selection middle-click paste (`wl-paste`/`xclip`/`xsel` with clipboard fallback), optional `focus_follows_mouse`, IME composition guards, drag-and-drop shell-quoted file paths, clickable URLs (`xdg-open`), and context-menu selection actions for OpenCode.

## Architecture & OpenCode Integration

Velt splits responsibilities cleanly between a native Rust/Tauri backend (`src-tauri/src/`) and a TypeScript/Vite frontend (`src/`):

- **PTY Management (`src-tauri/src/pty.rs`)**: Uses `portable-pty` keyed per `pane.id`, allowing every tab and split pane to run its own shell session with live `cwd` tracking, resize synchronization, and isolated scrollback.
- **OpenCode Hybrid Integration (`src-tauri/src/opencode.rs`)**:
  - Discovers or starts the local `opencode` HTTP service (`ensure_service`) and maintains a shared Server-Sent Events (SSE) listener on `/api/event` for token-level streaming (`reasoning_delta`, `text_delta`, `tool_start`, `tool_done`, and `usage`).
  - Pre-creates sessions via `POST /api/session` so SSE correlation starts from byte 0, and executes each prompt through `opencode-cli run --format json --thinking` with an automatic stdout JSON fallback if SSE is inactive.
  - Aborts active turns cleanly via `POST /api/session/{id}/abort` followed by `SIGTERM` on the child process when pressing `Esc` or clicking Stop.
- **Client-Side Redaction & Snapshots (`src/redact.ts`, `src/ansi.ts`)**: Context lines extracted from xterm.js pass through `redactSensitiveText()` prior to IPC dispatch. Entering Agent Mode captures an ANSI buffer snapshot so exiting in `commands_only` or `clean` mode restores your prior shell state seamlessly.
- **Compositor Blur (`src-tauri/src/blur.rs`, `src-tauri/src/blur_linux.c`)**: Interacts directly with `libwayland-client` and `libX11` via `raw-window-handle` to request native behind-window blur on supported Wayland and X11 compositors.

## Default Keybindings

All shortcuts can be customized in **Settings** (`Ctrl+,`) or directly in `~/.config/velt/config.toml`:

- `Ctrl+Shift+G` / `Ctrl+/`: Toggle Agent Mode (`Esc` stops streaming or returns to Shell Mode)
- `Ctrl+Shift+A`: Select all text (terminal buffer or Agent prompt input)
- `Ctrl+Shift+M`: Open Model & Reasoning Effort Quick Switcher
- `Ctrl+Shift+E`: Cycle Reasoning Effort
- `Ctrl+Shift+Enter`: Insert last suggested command into the shell prompt without running it
- `Ctrl+Shift+N` (Agent Mode) / `/new`: Start a fresh OpenCode session for the active pane
- `Ctrl+Shift+D` / `Ctrl+Shift+B`: Split pane vertically / horizontally
- `Ctrl+Shift+X`: Close active pane
- `Ctrl+Shift+Arrow`: Move focus to neighboring split pane
- `Ctrl+T` / `Ctrl+Shift+T`: New tab (`Ctrl+Shift+W` closes current tab)
- `Ctrl+Tab` / `Ctrl+Shift+Tab`: Switch to next / previous tab (`Ctrl+PageDown` / `Ctrl+PageUp`)
- `Ctrl+1..9` / `Alt+1..9`: Jump directly to tab 1..9
- `Ctrl+Shift+L`: Clear scrollback
- `Ctrl+Shift+F`: Search in scrollback
- `Ctrl+=` / `Ctrl+-` / `Ctrl+0`: Zoom font in / out / reset
- `Ctrl+,`: Open Settings

## System Dependencies (Linux)

Building the Tauri v2 desktop binary requires WebKitGTK 4.1, libsoup 3, GTK 3, OpenSSL, Wayland client, and X11 development libraries alongside Node.js (v20+) and Rust (`cargo`).

**Debian / Ubuntu:**
```bash
sudo apt update
sudo apt install -y \
  build-essential curl pkg-config libssl-dev \
  libwebkit2gtk-4.1-dev libsoup-3.0-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libwayland-dev libx11-dev
```

**Arch Linux:**
```bash
sudo pacman -S --needed \
  base-devel pkgconf openssl webkit2gtk-4.1 libsoup3 gtk3 \
  libayatana-appindicator librsvg wayland libx11
```

**Fedora:**
```bash
sudo dnf install -y \
  gcc-c++ pkgconf-pkg-config openssl-devel \
  webkit2gtk4.1-devel libsoup3-devel gtk3-devel \
  libappindicator-gtk3-devel librsvg2-devel \
  wayland-devel libX11-devel
```

Optional runtime tools for middle-click Primary selection paste: `wl-clipboard` (`wl-paste`) on Wayland, or `xclip` / `xsel` on X11.

## Build & Run

Install frontend dependencies and launch the development build:

```bash
npm install
npm run tauri dev
```

Build frontend assets, run TypeScript and Node tests, and compile the release binary:

```bash
npm run build
node --test tests/redact_and_i18n.test.ts
(cd src-tauri && cargo test)
npm run tauri build -- --no-bundle
```

## Configuration

Velt stores user configuration in `~/.config/velt/config.toml` (auto-created with defaults on first launch). All changes made in the Settings modal (`Ctrl+,`) preview live and persist to TOML.

## License

This project is licensed under the [MIT License](LICENSE).
