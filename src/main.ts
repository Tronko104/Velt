import "@xterm/xterm/css/xterm.css";
import "./styles.css";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

import {
  CYAN,
  MUTED,
  RED,
  RESET,
  StreamingMarkdownAnsi,
  captureTerminalSnapshot,
  extractRecentContext,
  formatAgentCommandIoForShell,
  formatAgentFooter,
  formatAgentPromptHeader,
  formatTerminalSnapshotBody,
  formatToolDone,
  formatToolOutputPreview,
  formatToolStart,
  isShellCommandTool,
  setAnsiTheme,
  type AgentCommandRecord,
  type TerminalSnapshot,
} from "./ansi";
import { matchesShortcut } from "./keybindings";
import {
  collectPaneIds,
  countPanes,
  findDirectionalNeighbor,
  removeLeafNode,
  shellQuotePath,
  splitLeafNode,
  type SplitDirection,
  type SplitNode,
} from "./split";
import {
  computeSoftAccent,
  getThemeById,
  hexToRgbTriplet,
  isValidHexColor,
  toXtermTheme,
} from "./themes";
import type {
  AgentStreamEvent,
  ModelInfo,
  OpenCodeStatus,
  VeltConfig,
} from "./types";
import {
  iconAgent,
  iconArrowDown,
  iconArrowUp,
  iconClear,
  iconClose,
  iconCommandInsert,
  iconContext,
  iconCopy,
  iconCpu,
  iconGear,
  iconPalette,
  iconPaneClose,
  iconPaste,
  iconPlus,
  iconSearch,
  iconSelectAll,
  iconSend,
  iconSplitHorizontal,
  iconSplitVertical,
  iconStop,
  iconTerminal,
  iconThink,
  iconWave,
  iconWinClose,
  iconWinMaximize,
  iconWinMinimize,
  iconWinRestore,
  veltLogoSvg,
} from "./ui/icons";
import { SettingsModal, type SettingsSection } from "./ui/settings";
import {
  ModelSwitcherModal,
  effectiveEfforts,
  shortModelName,
} from "./ui/switcher";

type ResizeDir =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

interface PtyDataPayload {
  tabId: string;
  data: string;
}

interface PtyExitPayload {
  tabId: string;
  code: number | null;
}

interface PaneState {
  id: string;
  tabId: string;
  title: string;
  cwd: string;
  mode: "shell" | "agent";
  leafEl: HTMLDivElement;
  paneTitleEl: HTMLSpanElement;
  paneBadgeEl: HTMLSpanElement;
  termWrapEl: HTMLDivElement;
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  model: string;
  effort: string;
  sessionId: string | null;
  isStreaming: boolean;
  streamStartedAt: number | null;
  streamWriter: StreamingMarkdownAnsi | null;
  terminalSnapshot: TerminalSnapshot | null;
  agentVisitCommands: AgentCommandRecord[];
  announcedToolIds: Set<string>;
  pendingPtyChunks: string[];
  wroteAgentInVisit: boolean;
  lastSuggestedCommand: string | null;
  lastTokensOut: number | null;
  promptHistory: string[];
  historyCursor: number;
  includeContext: boolean;
  needsPtyResizeSync: boolean;
  isThinking: boolean;
  liveThinkText: string;
  thinkStartedAt: number | null;
}

interface TabState {
  id: string;
  containerEl: HTMLDivElement;
  rootNode: SplitNode;
  activePaneId: string;
}

class VeltApp {
  private root: HTMLElement;
  private shellEl!: HTMLDivElement;
  private topbarEl!: HTMLElement;
  private winMaxBtn!: HTMLButtonElement;
  private brandLogoEl!: HTMLSpanElement;
  private tabsEl!: HTMLDivElement;
  private mainEl!: HTMLDivElement;
  private stageEl!: HTMLDivElement;
  private dropOverlayEl!: HTMLDivElement;
  private agentDockEl!: HTMLDivElement;
  private agentInputEl!: HTMLTextAreaElement;
  private agentSendBtn!: HTMLButtonElement;
  private agentStopBtn!: HTMLButtonElement;
  private streamHudEl!: HTMLDivElement;
  private streamLabelEl!: HTMLSpanElement;
  private streamTimerEl!: HTMLSpanElement;
  private thinkLiveEl!: HTMLDivElement;
  private thinkTickerEl!: HTMLSpanElement;
  private thinkMetaEl!: HTMLSpanElement;
  private ctxToggleBtn!: HTMLButtonElement;
  private modeBtn!: HTMLButtonElement;
  private cwdEl!: HTMLSpanElement;
  private modelPillEl!: HTMLButtonElement;
  private ocDotEl!: HTMLSpanElement;
  private cmdPillEl!: HTMLButtonElement;
  private findBarEl!: HTMLDivElement;
  private findInputEl!: HTMLInputElement;
  private toastStackEl!: HTMLDivElement;
  private contextMenuEl: HTMLDivElement | null = null;

  private switcher!: ModelSwitcherModal;
  private settingsModal!: SettingsModal;

  private config!: VeltConfig;
  private configPath = "";
  private models: ModelInfo[] = [];
  private ocStatus: OpenCodeStatus = { available: false };
  private tabs = new Map<string, TabState>();
  private panes = new Map<string, PaneState>();
  private tabOrder: string[] = [];
  private activeTabId: string | null = null;
  private tabCounter = 0;
  private paneCounter = 0;
  private isDraggingSplitter = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  public async init(): Promise<void> {
    this.renderLayout();
    this.switcher = new ModelSwitcherModal(this.root);
    this.settingsModal = new SettingsModal(this.root);

    this.config = await invoke<VeltConfig>("get_config");
    this.configPath = await invoke<string>("get_config_path");
    this.applyAppearanceConfig();

    await this.setupListeners();
    await this.createTab();
    void this.refreshOpenCodeMetadata();

    setInterval(() => {
      void this.syncActiveCwd();
    }, 1500);

    setInterval(() => {
      this.updateStreamTimer();
    }, 200);
  }

  private renderLayout(): void {
    const resizeDirs: Array<{ cls: string; dir: ResizeDir }> = [
      { cls: "n", dir: "North" },
      { cls: "s", dir: "South" },
      { cls: "e", dir: "East" },
      { cls: "w", dir: "West" },
      { cls: "nw", dir: "NorthWest" },
      { cls: "ne", dir: "NorthEast" },
      { cls: "sw", dir: "SouthWest" },
      { cls: "se", dir: "SouthEast" },
    ];
    const resizeHandlesHtml = resizeDirs
      .map((r) => `<div class="velt-resize-handle ${r.cls}" data-resize="${r.dir}"></div>`)
      .join("");

    this.root.innerHTML = `
      <div class="velt-shell" data-role="shell">
        ${resizeHandlesHtml}
        <header class="velt-topbar" data-role="topbar">
          <div class="velt-brand" data-tauri-drag-region>
            <span data-role="brand-logo">${veltLogoSvg(20)}</span>
            <span class="velt-brand-name">VELT</span>
          </div>
          <div class="velt-tabs" data-role="tabs" data-tauri-drag-region></div>
          <div class="velt-top-actions">
            <button type="button" class="velt-icon-btn" data-action="split-v" title="Dividi a destra (${this.config?.keybindings?.split_vertical || "Ctrl+Shift+D"})">${iconSplitVertical(14)}</button>
            <button type="button" class="velt-icon-btn" data-action="split-h" title="Dividi in basso (${this.config?.keybindings?.split_horizontal || "Ctrl+Shift+B"})">${iconSplitHorizontal(14)}</button>
            <button type="button" class="velt-icon-btn" data-action="new-tab" title="Nuovo Tab (Ctrl+T)">${iconPlus(14)}</button>
            <button type="button" class="velt-icon-btn" data-action="find" title="Cerca (Ctrl+Shift+F)">${iconSearch(14)}</button>
            <button type="button" class="velt-icon-btn" data-action="settings" title="Impostazioni (Ctrl+,)">${iconGear(14)}</button>
            <span class="velt-top-sep"></span>
            <div class="velt-win-controls">
              <button type="button" class="velt-win-btn" data-action="win-min" title="Minimizza">${iconWinMinimize(12)}</button>
              <button type="button" class="velt-win-btn" data-action="win-max" title="Ingrandisci">${iconWinMaximize(11)}</button>
              <button type="button" class="velt-win-btn close" data-action="win-close" title="Chiudi">${iconWinClose(12)}</button>
            </div>
          </div>
        </header>

        <div class="velt-find-bar hidden" data-role="find-bar">
          <input type="text" class="velt-input" data-role="find-input" placeholder="Cerca nello scrollback..." />
          <button type="button" class="velt-btn velt-btn-ghost" data-action="find-prev" title="Precedente">${iconArrowUp(13)}</button>
          <button type="button" class="velt-btn velt-btn-ghost" data-action="find-next" title="Successivo">${iconArrowDown(13)}</button>
          <button type="button" class="velt-icon-btn" data-action="find-close" title="Chiudi">${iconClose(13)}</button>
        </div>

        <main class="velt-main" data-role="main">
          <div class="velt-term-stage" data-role="stage"></div>

          <div class="velt-agent-dock hidden" data-role="agent-dock">
            <div class="velt-think-live hidden" data-role="think-live">
              <span class="velt-think-badge">${iconThink(13)} <span>Ragiono</span></span>
              <span class="velt-think-ticker" data-role="think-ticker">Analizzo il contesto...</span>
              <span class="velt-think-meta" data-role="think-meta">0.0s</span>
            </div>
            <div class="velt-agent-dock-top">
              <div class="velt-agent-dock-left">
                <span class="velt-agent-pill">${iconAgent(12)} <span>AGENT MODE</span></span>
                <button type="button" class="velt-ctx-toggle" data-role="ctx-toggle" title="Includi contesto recente del terminale">
                  ${iconContext(12)} <span>contesto</span>
                </button>
                <div class="velt-stream-hud hidden" data-role="stream-hud">
                  ${iconWave(13)}
                  <span data-role="stream-label">OpenCode</span>
                  <span data-role="stream-timer">0.0s</span>
                </div>
              </div>
              <div class="velt-agent-dock-right">
                <span class="velt-agent-hints">
                  <span class="velt-kbd-cap">Invio</span> invia
                  <span class="velt-kbd-cap">Shift+Invio</span> a capo
                  <span class="velt-kbd-cap">/new</span> reset
                  <span class="velt-kbd-cap">Esc</span> shell
                </span>
              </div>
            </div>
            <div class="velt-agent-input-row">
              <textarea
                rows="1"
                class="velt-agent-textarea"
                data-role="agent-input"
                placeholder="Parla con OpenCode (spiega un errore, genera un comando, modifica file)..."
              ></textarea>
              <div class="velt-agent-actions">
                <button type="button" class="velt-btn velt-btn-danger hidden" data-action="agent-stop">${iconStop(12)} <span>Stop</span></button>
                <button type="button" class="velt-btn velt-btn-primary" data-action="agent-send">${iconSend(12)} <span>Invia</span></button>
              </div>
            </div>
          </div>
        </main>

        <footer class="velt-statusbar">
          <div class="velt-status-left">
            <button type="button" class="velt-mode-btn" data-role="mode-btn">${iconTerminal(12)} <span>SHELL</span></button>
            <span class="velt-cwd" data-role="cwd">~</span>
          </div>
          <div class="velt-status-right">
            <button type="button" class="velt-cmd-pill hidden" data-role="cmd-pill" title="Incolla ultimo comando suggerito nella shell">
              ${iconCommandInsert(12)} <span>Incolla comando</span>
            </button>
            <span class="velt-oc-dot" data-role="oc-dot" title="Stato OpenCode CLI"></span>
            <button type="button" class="velt-model-pill" data-role="model-pill" title="Cambia modello & reasoning effort">
              ${iconCpu(12)}
              <span class="model-name">...</span>
              <span class="effort">...</span>
            </button>
          </div>
        </footer>

        <div class="velt-drop-overlay hidden" data-role="drop-overlay">
          <div class="velt-drop-card">Rilascia file o cartelle per inserire i percorsi</div>
        </div>

        <div class="velt-toast-stack" data-role="toasts"></div>
      </div>
    `;

    this.shellEl = this.root.querySelector('[data-role="shell"]')!;
    this.topbarEl = this.root.querySelector('[data-role="topbar"]')!;
    this.winMaxBtn = this.root.querySelector('[data-action="win-max"]')!;
    this.brandLogoEl = this.root.querySelector('[data-role="brand-logo"]')!;
    this.tabsEl = this.root.querySelector('[data-role="tabs"]')!;
    this.mainEl = this.root.querySelector('[data-role="main"]')!;
    this.stageEl = this.root.querySelector('[data-role="stage"]')!;
    this.dropOverlayEl = this.root.querySelector('[data-role="drop-overlay"]')!;
    this.agentDockEl = this.root.querySelector('[data-role="agent-dock"]')!;
    this.agentInputEl = this.root.querySelector('[data-role="agent-input"]')!;
    this.agentSendBtn = this.root.querySelector('[data-action="agent-send"]')!;
    this.agentStopBtn = this.root.querySelector('[data-action="agent-stop"]')!;
    this.streamHudEl = this.root.querySelector('[data-role="stream-hud"]')!;
    this.streamLabelEl = this.root.querySelector('[data-role="stream-label"]')!;
    this.streamTimerEl = this.root.querySelector('[data-role="stream-timer"]')!;
    this.thinkLiveEl = this.root.querySelector('[data-role="think-live"]')!;
    this.thinkTickerEl = this.root.querySelector('[data-role="think-ticker"]')!;
    this.thinkMetaEl = this.root.querySelector('[data-role="think-meta"]')!;
    this.ctxToggleBtn = this.root.querySelector('[data-role="ctx-toggle"]')!;
    this.modeBtn = this.root.querySelector('[data-role="mode-btn"]')!;
    this.cwdEl = this.root.querySelector('[data-role="cwd"]')!;
    this.modelPillEl = this.root.querySelector('[data-role="model-pill"]')!;
    this.ocDotEl = this.root.querySelector('[data-role="oc-dot"]')!;
    this.cmdPillEl = this.root.querySelector('[data-role="cmd-pill"]')!;
    this.findBarEl = this.root.querySelector('[data-role="find-bar"]')!;
    this.findInputEl = this.root.querySelector('[data-role="find-input"]')!;
    this.toastStackEl = this.root.querySelector('[data-role="toasts"]')!;

    const appWin = getCurrentWindow();

    this.shellEl.querySelectorAll<HTMLElement>(".velt-resize-handle").forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        if (e.button !== 0 || this.shellEl.classList.contains("maximized")) return;
        const dir = handle.dataset.resize as ResizeDir | undefined;
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        void appWin.startResizeDragging(dir);
      });
    });

    this.root.querySelector('[data-action="split-v"]')?.addEventListener("click", () => {
      void this.splitActivePane("vertical");
    });
    this.root.querySelector('[data-action="split-h"]')?.addEventListener("click", () => {
      void this.splitActivePane("horizontal");
    });
    this.root.querySelector('[data-action="new-tab"]')?.addEventListener("click", () => {
      void this.createTab();
    });
    this.root.querySelector('[data-action="settings"]')?.addEventListener("click", () => {
      this.openSettings();
    });
    this.root.querySelector('[data-action="find"]')?.addEventListener("click", () => {
      this.toggleFindBar(true);
    });

    this.root.querySelector('[data-action="win-min"]')?.addEventListener("click", () => {
      void appWin.minimize();
    });
    this.winMaxBtn.addEventListener("click", () => {
      void appWin.toggleMaximize();
    });
    this.root.querySelector('[data-action="win-close"]')?.addEventListener("click", () => {
      void appWin.close();
    });

    this.topbarEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, .velt-tab, input")) return;
      if (e.detail === 2) {
        void appWin.toggleMaximize();
      } else {
        void appWin.startDragging();
      }
    });

    const syncMaxState = async () => {
      try {
        const isMax = await appWin.isMaximized();
        this.shellEl.classList.toggle("maximized", isMax);
        this.winMaxBtn.innerHTML = isMax ? iconWinRestore(11) : iconWinMaximize(11);
        this.winMaxBtn.title = isMax ? "Ripristina" : "Ingrandisci";
      } catch {
        // ignore
      }
    };
    void syncMaxState();
    void appWin.onResized(() => {
      void syncMaxState();
    });

    this.root.querySelector('[data-action="find-close"]')?.addEventListener("click", () => {
      this.toggleFindBar(false);
    });
    this.root.querySelector('[data-action="find-next"]')?.addEventListener("click", () => {
      this.activePane()?.searchAddon.findNext(this.findInputEl.value);
    });
    this.root.querySelector('[data-action="find-prev"]')?.addEventListener("click", () => {
      this.activePane()?.searchAddon.findPrevious(this.findInputEl.value);
    });

    this.findInputEl.addEventListener("input", () => {
      if (this.findInputEl.value) {
        this.activePane()?.searchAddon.findNext(this.findInputEl.value);
      }
    });
    this.findInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const pane = this.activePane();
        if (!pane) return;
        if (e.shiftKey) pane.searchAddon.findPrevious(this.findInputEl.value);
        else pane.searchAddon.findNext(this.findInputEl.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.toggleFindBar(false);
      }
    });

    this.modeBtn.addEventListener("click", () => this.toggleAgentMode());
    this.modelPillEl.addEventListener("click", () => this.openModelSwitcher());
    this.cmdPillEl.addEventListener("click", () => void this.insertLastSuggestedCommand());

    this.ctxToggleBtn.addEventListener("click", () => {
      const pane = this.activePane();
      if (!pane) return;
      pane.includeContext = !pane.includeContext;
      this.updateStatusBar();
      this.showToast(
        pane.includeContext ? "Contesto terminale attivo" : "Contesto terminale disattivato"
      );
      this.agentInputEl.focus();
    });

    this.agentSendBtn.addEventListener("click", () => void this.submitAgentPrompt());
    this.agentStopBtn.addEventListener("click", () => void this.cancelActiveTurn());

    this.agentInputEl.addEventListener("input", () => this.autoSizeTextarea());
    this.agentInputEl.addEventListener("keydown", (e) => {
      const pane = this.activePane();
      if (!pane) return;

      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        void this.submitAgentPrompt();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (pane.isStreaming) {
          void this.cancelActiveTurn();
        } else {
          this.setPaneMode(pane, "shell");
        }
        return;
      }

      if (e.key === "c" && e.ctrlKey && !e.shiftKey && pane.isStreaming) {
        const sel = window.getSelection()?.toString() || "";
        if (!sel && this.agentInputEl.selectionStart === this.agentInputEl.selectionEnd) {
          e.preventDefault();
          void this.cancelActiveTurn();
          return;
        }
      }

      if (e.key === "PageUp") {
        e.preventDefault();
        pane.term.scrollPages(-1);
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        pane.term.scrollPages(1);
        return;
      }

      if (e.key === "ArrowUp" && !this.agentInputEl.value.includes("\n")) {
        if (pane.promptHistory.length > 0 && pane.historyCursor > 0) {
          e.preventDefault();
          pane.historyCursor--;
          this.agentInputEl.value = pane.promptHistory[pane.historyCursor] ?? "";
          this.autoSizeTextarea();
        }
      } else if (e.key === "ArrowDown" && !this.agentInputEl.value.includes("\n")) {
        if (pane.historyCursor < pane.promptHistory.length) {
          e.preventDefault();
          pane.historyCursor++;
          this.agentInputEl.value =
            pane.historyCursor >= pane.promptHistory.length
              ? ""
              : pane.promptHistory[pane.historyCursor];
          this.autoSizeTextarea();
        }
      }
    });

    this.stageEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openTerminalContextMenu(e.clientX, e.clientY);
    });

    window.addEventListener("mousedown", (e) => {
      if (this.contextMenuEl && !this.contextMenuEl.contains(e.target as Node)) {
        this.closeContextMenu();
      }
    });

    window.addEventListener("resize", () => {
      this.closeContextMenu();
      const tab = this.activeTab();
      if (tab) this.fitTabPanes(tab, true);
    });

    window.addEventListener(
      "keydown",
      (e) => {
        if (this.contextMenuEl && e.key === "Escape") {
          e.preventDefault();
          this.closeContextMenu();
          return;
        }
        if (this.switcher.isOpen() || this.settingsModal.isOpen()) return;
        this.handleGlobalShortcut(e);
      },
      { capture: true }
    );
  }

  private handleGlobalShortcut(e: KeyboardEvent): void {
    const kb = this.config?.keybindings;
    if (!kb) return;

    if (matchesShortcut(e, kb.select_all)) {
      e.preventDefault();
      e.stopPropagation();
      this.selectAllInActivePane();
      return;
    }

    if (matchesShortcut(e, kb.toggle_agent) || matchesShortcut(e, kb.toggle_agent_alt)) {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAgentMode();
      return;
    }

    if (matchesShortcut(e, kb.model_switcher)) {
      e.preventDefault();
      e.stopPropagation();
      this.openModelSwitcher();
      return;
    }

    if (matchesShortcut(e, kb.cycle_effort)) {
      e.preventDefault();
      e.stopPropagation();
      this.cycleCurrentEffort();
      return;
    }

    if (matchesShortcut(e, kb.insert_command)) {
      e.preventDefault();
      e.stopPropagation();
      void this.insertLastSuggestedCommand();
      return;
    }

    if (matchesShortcut(e, kb.split_vertical)) {
      e.preventDefault();
      e.stopPropagation();
      void this.splitActivePane("vertical");
      return;
    }

    if (matchesShortcut(e, kb.split_horizontal)) {
      e.preventDefault();
      e.stopPropagation();
      void this.splitActivePane("horizontal");
      return;
    }

    if (matchesShortcut(e, kb.close_pane)) {
      e.preventDefault();
      e.stopPropagation();
      const pane = this.activePane();
      if (pane) void this.closePane(pane.id);
      return;
    }

    if (
      matchesShortcut(e, kb.new_tab) ||
      (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "t")
    ) {
      e.preventDefault();
      e.stopPropagation();
      void this.createTab();
      return;
    }

    if (matchesShortcut(e, kb.close_tab)) {
      e.preventDefault();
      e.stopPropagation();
      if (this.activeTabId) void this.closeTab(this.activeTabId);
      return;
    }

    if (matchesShortcut(e, kb.new_agent_session)) {
      const pane = this.activePane();
      if (pane && pane.mode === "agent") {
        e.preventDefault();
        e.stopPropagation();
        this.resetAgentSession(pane);
      }
      return;
    }

    if (matchesShortcut(e, kb.open_settings)) {
      e.preventDefault();
      e.stopPropagation();
      this.openSettings();
      return;
    }

    // Focus navigation between split panes: Ctrl+Shift+Arrow
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
      const dirMap: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const arrowDir = dirMap[e.key];
      if (arrowDir) {
        e.preventDefault();
        e.stopPropagation();
        this.movePaneFocus(arrowDir);
        return;
      }
    }

    // Tab cycling: Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+PageUp / Ctrl+PageDown
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        this.stepTab(e.shiftKey ? -1 : 1);
        return;
      }
      if (!e.shiftKey && e.key === "PageDown") {
        e.preventDefault();
        e.stopPropagation();
        this.stepTab(1);
        return;
      }
      if (!e.shiftKey && e.key === "PageUp") {
        e.preventDefault();
        e.stopPropagation();
        this.stepTab(-1);
        return;
      }
    }

    // Ctrl+1..9 and Alt+1..9 direct tab switching (9 = 9th or last tab)
    if (e.ctrlKey !== e.altKey && !e.shiftKey && !e.metaKey) {
      const digit = extractDigitKey(e);
      if (digit !== null) {
        const targetIdx =
          digit === 9 && this.tabOrder.length < 9 ? this.tabOrder.length - 1 : digit - 1;
        const targetId = this.tabOrder[targetIdx];
        e.preventDefault();
        e.stopPropagation();
        if (targetId) this.activateTab(targetId);
        return;
      }
    }

    // Font zoom shortcuts
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        e.stopPropagation();
        this.adjustFontSize(1);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        e.stopPropagation();
        this.adjustFontSize(-1);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        e.stopPropagation();
        this.resetFontSize();
        return;
      }
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFindBar(true);
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      e.stopPropagation();
      this.activePane()?.term.clear();
      this.showToast("Scrollback pulito");
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
      const pane = this.activePane();
      if (pane && pane.term.hasSelection()) {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard.writeText(pane.term.getSelection());
        this.showToast("Testo copiato");
      }
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v") {
      const pane = this.activePane();
      if (pane && pane.mode === "shell") {
        e.preventDefault();
        e.stopPropagation();
        void this.pasteIntoPane(pane, false);
      }
    }
  }

  private isVeltShortcut(e: KeyboardEvent): boolean {
    const kb = this.config?.keybindings;
    if (!kb) return false;
    return (
      matchesShortcut(e, kb.select_all) ||
      matchesShortcut(e, kb.toggle_agent) ||
      matchesShortcut(e, kb.toggle_agent_alt) ||
      matchesShortcut(e, kb.model_switcher) ||
      matchesShortcut(e, kb.cycle_effort) ||
      matchesShortcut(e, kb.insert_command) ||
      matchesShortcut(e, kb.split_vertical) ||
      matchesShortcut(e, kb.split_horizontal) ||
      matchesShortcut(e, kb.close_pane) ||
      matchesShortcut(e, kb.new_tab) ||
      matchesShortcut(e, kb.close_tab) ||
      matchesShortcut(e, kb.open_settings) ||
      (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "t") ||
      (e.ctrlKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) ||
      (e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        (e.key === "Tab" || (!e.shiftKey && (e.key === "PageUp" || e.key === "PageDown")))) ||
      (e.ctrlKey !== e.altKey && !e.shiftKey && !e.metaKey && extractDigitKey(e) !== null) ||
      (e.ctrlKey && !e.altKey && ["=", "+", "-", "0"].includes(e.key)) ||
      (e.ctrlKey && e.shiftKey && ["f", "c", "v", "l"].includes(e.key.toLowerCase()))
    );
  }

  private async pasteIntoPane(pane: PaneState, preferPrimary: boolean): Promise<void> {
    let txt = "";
    if (preferPrimary) {
      const primary = await invoke<string | null>("read_primary_selection").catch(() => null);
      if (primary) txt = primary;
    }
    if (!txt) {
      txt = await navigator.clipboard.readText().catch(() => "");
    }
    if (!txt) return;

    if (pane.mode === "agent") {
      const start = this.agentInputEl.selectionStart;
      const end = this.agentInputEl.selectionEnd;
      this.agentInputEl.setRangeText(txt, start, end, "end");
      this.autoSizeTextarea();
      this.agentInputEl.focus();
    } else {
      void invoke("pty_write", { tabId: pane.id, data: txt });
      pane.term.focus();
    }
  }

  private insertTextInTarget(pane: PaneState, txt: string): void {
    if (!txt) return;
    if (pane.mode === "agent") {
      const start = this.agentInputEl.selectionStart;
      const end = this.agentInputEl.selectionEnd;
      this.agentInputEl.setRangeText(txt, start, end, "end");
      this.autoSizeTextarea();
      this.agentInputEl.focus();
    } else {
      void invoke("pty_write", { tabId: pane.id, data: txt });
      pane.term.focus();
    }
  }

  private stepTab(delta: number): void {
    if (this.tabOrder.length <= 1 || !this.activeTabId) return;
    const idx = this.tabOrder.indexOf(this.activeTabId);
    if (idx === -1) return;
    const nextIdx = (idx + delta + this.tabOrder.length) % this.tabOrder.length;
    this.activateTab(this.tabOrder[nextIdx]);
  }

  private selectAllInActivePane(): void {
    const pane = this.activePane();
    if (!pane) return;
    if (document.activeElement === this.agentInputEl) {
      this.agentInputEl.select();
    } else {
      pane.term.selectAll();
    }
    this.showToast("Tutto il testo selezionato");
  }

  private adjustFontSize(delta: number): void {
    const next = Math.min(28, Math.max(9, this.config.font_size + delta));
    if (next === this.config.font_size) return;
    this.config.font_size = next;
    for (const p of this.panes.values()) {
      p.term.options.fontSize = next;
    }
    const tab = this.activeTab();
    if (tab) this.fitTabPanes(tab, true);
    void invoke("save_config", { config: this.config }).catch(() => undefined);
    this.showToast(`Font: ${next}px`);
  }

  private resetFontSize(): void {
    this.config.font_size = 14;
    for (const p of this.panes.values()) {
      p.term.options.fontSize = 14;
    }
    const tab = this.activeTab();
    if (tab) this.fitTabPanes(tab, true);
    void invoke("save_config", { config: this.config }).catch(() => undefined);
    this.showToast("Font ripristinato: 14px");
  }

  private openTerminalContextMenu(x: number, y: number): void {
    this.closeContextMenu();
    const tab = this.activeTab();
    const pane = this.activePane();
    if (!tab || !pane) return;

    const hasSelection = pane.term.hasSelection();
    const selectedText = hasSelection ? pane.term.getSelection() : "";
    const paneCount = countPanes(tab.rootNode);

    const menu = document.createElement("div");
    menu.className = "velt-context-menu";

    const addItem = (
      iconHtml: string,
      label: string,
      shortcut: string,
      onClick: () => void,
      opts?: { disabled?: boolean; accent?: boolean }
    ) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `velt-ctx-item ${opts?.accent ? "accent" : ""}`;
      btn.disabled = Boolean(opts?.disabled);
      btn.innerHTML = `
        <span class="velt-ctx-item-left">${iconHtml}<span>${label}</span></span>
        ${shortcut ? `<span class="velt-kbd-cap">${shortcut}</span>` : ""}
      `;
      btn.addEventListener("click", () => {
        this.closeContextMenu();
        onClick();
      });
      menu.appendChild(btn);
    };

    const addSep = () => {
      const s = document.createElement("div");
      s.className = "velt-ctx-sep";
      menu.appendChild(s);
    };

    addItem(
      iconCopy(13),
      "Copia",
      "Ctrl+Shift+C",
      () => {
        if (selectedText) {
          void navigator.clipboard.writeText(selectedText);
          this.showToast("Testo copiato");
        }
      },
      { disabled: !hasSelection }
    );

    addItem(iconPaste(13), "Incolla", "Ctrl+Shift+V", () => {
      void this.pasteIntoPane(pane, false);
    });

    addItem(
      iconSelectAll(13),
      "Seleziona tutto",
      this.config.keybindings.select_all,
      () => {
        this.selectAllInActivePane();
      }
    );

    addSep();

    if (hasSelection) {
      addItem(
        iconAgent(13),
        "Chiedi a OpenCode sulla selezione",
        "",
        () => {
          this.setPaneMode(pane, "agent");
          this.agentInputEl.value = `Spiega o risolvi questo output:\n\`\`\`\n${selectedText.slice(0, 2500)}\n\`\`\`\n`;
          this.autoSizeTextarea();
          this.agentInputEl.focus();
        },
        { accent: true }
      );
      addItem(
        iconSend(13),
        "Invia subito selezione a OpenCode",
        "",
        () => {
          this.setPaneMode(pane, "agent");
          this.agentInputEl.value = `Analizza questo output del terminale e dimmi cosa fare:\n\`\`\`\n${selectedText.slice(0, 2500)}\n\`\`\``;
          this.autoSizeTextarea();
          void this.submitAgentPrompt();
        },
        { accent: true }
      );
    } else {
      addItem(
        iconAgent(13),
        pane.mode === "agent" ? "Torna a Shell Mode" : "Attiva Agent Mode",
        this.config.keybindings.toggle_agent,
        () => {
          this.toggleAgentMode();
        },
        { accent: true }
      );
    }

    addSep();

    addItem(
      iconSplitVertical(13),
      "Dividi a destra",
      this.config.keybindings.split_vertical,
      () => {
        void this.splitActivePane("vertical");
      }
    );

    addItem(
      iconSplitHorizontal(13),
      "Dividi in basso",
      this.config.keybindings.split_horizontal,
      () => {
        void this.splitActivePane("horizontal");
      }
    );

    if (paneCount > 1) {
      addItem(
        iconPaneClose(13),
        "Chiudi riquadro",
        this.config.keybindings.close_pane,
        () => {
          void this.closePane(pane.id);
        }
      );
    }

    addSep();

    addItem(iconClear(13), "Pulisci scrollback", "Ctrl+Shift+L", () => {
      pane.term.clear();
      this.showToast("Scrollback pulito");
    });

    addItem(iconPalette(13), "Cambia tema & trasparenza...", "", () => {
      this.openSettings("terminal");
    });

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 10)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 10)}px`;
    this.contextMenuEl = menu;
  }

  private closeContextMenu(): void {
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }

  private showToast(message: string): void {
    const toast = document.createElement("div");
    toast.className = "velt-toast";
    toast.innerHTML = `<span class="velt-toast-dot"></span><span></span>`;
    const span = toast.querySelector("span:last-child")!;
    span.textContent = message;
    this.toastStackEl.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 200);
    }, 1800);
  }

  private updateStreamTimer(): void {
    const pane = this.activePane();
    if (!pane || !pane.isStreaming || !pane.streamStartedAt) return;
    const elapsed = (performance.now() - pane.streamStartedAt) / 1000;
    this.streamTimerEl.textContent = `${elapsed.toFixed(1)}s`;
    if (pane.isThinking && pane.thinkStartedAt) {
      const thinkElapsed = (performance.now() - pane.thinkStartedAt) / 1000;
      this.thinkMetaEl.textContent = `${thinkElapsed.toFixed(1)}s`;
    }
  }

  private syncThinkingDock(): void {
    const pane = this.activePane();
    const liveBarEnabled = this.config?.agent_live_think_bar !== false;
    const show = Boolean(
      liveBarEnabled && pane && pane.mode === "agent" && pane.isStreaming && pane.isThinking
    );
    this.thinkLiveEl.classList.toggle("hidden", !show);
    if (!pane || !pane.isStreaming) {
      this.streamLabelEl.textContent = "OpenCode";
      return;
    }
    this.streamLabelEl.textContent = pane.isThinking ? "Ragiono..." : "Scrivo...";
    if (!show) return;

    const raw = pane.liveThinkText.trim();
    if (!raw) {
      this.thinkTickerEl.textContent = "Analizzo il contesto...";
    } else if (raw.length > 130) {
      this.thinkTickerEl.textContent = `... ${raw.slice(-126)}`;
    } else {
      this.thinkTickerEl.textContent = raw;
    }
    const thinkElapsed = pane.thinkStartedAt
      ? (performance.now() - pane.thinkStartedAt) / 1000
      : 0;
    this.thinkMetaEl.textContent = `${thinkElapsed.toFixed(1)}s`;
  }

  private async setupListeners(): Promise<void> {
    await listen<PtyDataPayload>("pty:data", (event) => {
      const pane = this.panes.get(event.payload.tabId);
      if (!pane) return;
      if (
        pane.mode === "agent" &&
        pane.wroteAgentInVisit &&
        (this.config?.agent_exit_mode ?? "commands_only") !== "keep_all"
      ) {
        pane.pendingPtyChunks.push(event.payload.data);
      } else {
        pane.term.write(event.payload.data);
      }
    });

    await listen<PtyExitPayload>("pty:exit", (event) => {
      const pane = this.panes.get(event.payload.tabId);
      if (!pane) return;
      const tab = this.tabs.get(pane.tabId);
      if (tab && countPanes(tab.rootNode) > 1) {
        void this.closePane(pane.id);
        return;
      }
      pane.term.write(
        `\r\n${MUTED}[Processo terminato${event.payload.code !== null ? ` (exit ${event.payload.code})` : ""}]${RESET}\r\n`
      );
      if (this.tabOrder.length > 1) {
        void this.closeTab(pane.tabId);
      }
    });

    await listen<AgentStreamEvent>("agent:event", (event) => {
      this.handleAgentEvent(event.payload);
    });

    await getCurrentWindow().onDragDropEvent((event) => {
      const kind = event.payload.type;
      if (kind === "over" || kind === "enter") {
        this.dropOverlayEl.classList.remove("hidden");
      } else if (kind === "leave") {
        this.dropOverlayEl.classList.add("hidden");
      } else if (kind === "drop") {
        this.dropOverlayEl.classList.add("hidden");
        const paths = event.payload.paths || [];
        if (paths.length === 0) return;
        const pane = this.activePane();
        if (!pane) return;
        const formatted = paths.map(shellQuotePath).join(" ") + " ";
        this.insertTextInTarget(pane, formatted);
        this.showToast(
          paths.length === 1 ? "Percorso inserito" : `${paths.length} percorsi inseriti`
        );
      }
    });
  }

  private recordToolStart(pane: PaneState, ev: AgentStreamEvent): void {
    if (!isShellCommandTool(ev.toolName)) return;
    const cmd = ev.toolInput?.trim();
    if (!cmd) return;
    if (ev.toolId) {
      const existing = pane.agentVisitCommands.find((r) => r.id === ev.toolId);
      if (existing) {
        existing.command = cmd;
        return;
      }
    }
    pane.agentVisitCommands.push({
      id: ev.toolId ?? undefined,
      toolName: ev.toolName || "shell",
      command: cmd,
      ok: true,
    });
  }

  private recordToolDone(pane: PaneState, ev: AgentStreamEvent): AgentCommandRecord | null {
    if (!isShellCommandTool(ev.toolName)) return null;
    let rec: AgentCommandRecord | undefined;
    if (ev.toolId) {
      rec = pane.agentVisitCommands.find((r) => r.id === ev.toolId);
    }
    if (!rec) {
      rec = [...pane.agentVisitCommands]
        .reverse()
        .find((r) => r.toolName === (ev.toolName || "shell") && r.output === undefined);
    }
    if (!rec) {
      const cmd = ev.toolInput?.trim();
      if (!cmd && !ev.toolOutput) return null;
      rec = {
        id: ev.toolId ?? undefined,
        toolName: ev.toolName || "shell",
        command: cmd || "(comando shell)",
        ok: ev.toolOk ?? true,
      };
      pane.agentVisitCommands.push(rec);
    } else if (ev.toolInput?.trim()) {
      rec.command = ev.toolInput.trim();
    }
    if (ev.toolOutput !== undefined && ev.toolOutput !== null) {
      rec.output = ev.toolOutput;
    }
    rec.ok = ev.toolOk ?? true;
    rec.errorText = ev.text ?? null;
    return rec;
  }

  private handleAgentEvent(ev: AgentStreamEvent): void {
    const pane = this.panes.get(ev.tabId);
    if (!pane) return;

    if (ev.sessionId && !ev.sessionId.startsWith("pending-")) {
      pane.sessionId = ev.sessionId;
    }

    const isFocused = pane.id === this.activePane()?.id;
    const writeAgentUi =
      pane.mode === "agent" || (this.config?.agent_exit_mode ?? "commands_only") === "keep_all";

    switch (ev.kind) {
      case "reasoning_delta":
        if (ev.text) {
          if (!pane.isThinking) {
            pane.isThinking = true;
            if (!pane.thinkStartedAt) pane.thinkStartedAt = performance.now();
          }
          const combined = (pane.liveThinkText + ev.text).replace(/\s+/g, " ");
          pane.liveThinkText = combined.length > 240 ? combined.slice(-240) : combined;
          if (isFocused) this.syncThinkingDock();
          if (writeAgentUi && this.config.show_thinking && pane.streamWriter) {
            pane.streamWriter.pushReasoningDelta(ev.text);
          }
        }
        break;
      case "text_delta":
        if (pane.isThinking) {
          pane.isThinking = false;
          if (isFocused) this.syncThinkingDock();
        }
        if (writeAgentUi && ev.text && pane.streamWriter) {
          pane.streamWriter.pushTextDelta(ev.text);
        }
        break;
      case "tool_start":
        if (pane.isThinking) {
          pane.isThinking = false;
          if (isFocused) this.syncThinkingDock();
        }
        if (ev.toolId) pane.announcedToolIds.add(ev.toolId);
        this.recordToolStart(pane, ev);
        if (writeAgentUi) {
          pane.streamWriter?.endReasoningIfActive();
          pane.term.write(formatToolStart(ev.toolName || "tool", ev.toolInput));
        }
        break;
      case "tool_done": {
        const rec = this.recordToolDone(pane, ev);
        if (writeAgentUi) {
          pane.streamWriter?.endReasoningIfActive();
          if (ev.toolInput && (!ev.toolId || !pane.announcedToolIds.has(ev.toolId))) {
            if (ev.toolId) pane.announcedToolIds.add(ev.toolId);
            pane.term.write(formatToolStart(ev.toolName || "tool", ev.toolInput));
          }
          pane.term.write(formatToolDone(ev.toolName || "tool", ev.toolOk ?? true, ev.text));
          if (this.config.show_tool_output_in_agent !== false && ev.toolOutput) {
            pane.term.write(formatToolOutputPreview(ev.toolOutput));
          }
        } else if (
          pane.mode === "shell" &&
          (this.config?.agent_exit_mode ?? "commands_only") === "commands_only" &&
          rec
        ) {
          pane.term.write(
            formatAgentCommandIoForShell([rec], this.config.agent_cmd_style || "shell")
          );
        }
        break;
      }
      case "usage":
        if (ev.outputTokens) pane.lastTokensOut = ev.outputTokens;
        break;
      case "done": {
        if (writeAgentUi) {
          pane.streamWriter?.finish();
        }
        const cmd = pane.streamWriter?.getLastCommand() ?? null;
        if (cmd) pane.lastSuggestedCommand = cmd;
        if (writeAgentUi) {
          if (ev.text === "canceled") {
            pane.term.write(`\r\n  ${MUTED}:: Generazione interrotta${RESET}\r\n`);
          }
          pane.term.write(
            formatAgentFooter(
              cmd,
              this.config.keybindings.insert_command,
              pane.lastTokensOut
            )
          );
        }
        pane.isStreaming = false;
        pane.isThinking = false;
        pane.liveThinkText = "";
        pane.thinkStartedAt = null;
        pane.streamStartedAt = null;
        pane.streamWriter = null;
        pane.lastTokensOut = null;
        this.updateModeUI();
        this.renderTabs();
        this.updateStatusBar();
        break;
      }
      case "error":
        if (writeAgentUi) {
          pane.streamWriter?.finish();
          pane.term.write(
            `\r\n  ${RED}[err] Errore OpenCode: ${ev.text || "Errore sconosciuto"}${RESET}\r\n`
          );
        }
        pane.isStreaming = false;
        pane.isThinking = false;
        pane.liveThinkText = "";
        pane.thinkStartedAt = null;
        pane.streamStartedAt = null;
        pane.streamWriter = null;
        this.updateModeUI();
        this.renderTabs();
        this.updateStatusBar();
        break;
    }
  }

  private async refreshOpenCodeMetadata(): Promise<void> {
    try {
      this.ocStatus = await invoke<OpenCodeStatus>("opencode_status", {
        overrideBin: this.config.opencode_bin || null,
      });
      if (this.ocStatus.available) {
        this.models = await invoke<ModelInfo[]>("opencode_list_models", {
          overrideBin: this.config.opencode_bin || null,
          showHidden: this.config.show_hidden_models ?? false,
        });
        if (this.models.length > 0 && !this.models.some((m) => m.id === this.config.default_model)) {
          this.config.default_model = this.models[0].id;
          const effs = effectiveEfforts(this.models[0]);
          if (!effs.includes(this.config.default_effort)) {
            this.config.default_effort = effs.includes("medium") ? "medium" : effs[0];
          }
          for (const p of this.panes.values()) {
            p.model = this.config.default_model;
            p.effort = this.config.default_effort;
          }
        }
      }
    } catch {
      this.ocStatus = { available: false, error: "Impossibile interrogare opencode-cli" };
    }
    this.updateStatusBar();
  }

  private buildPaneState(tabId: string, startCwd: string | null): PaneState {
    const id = `pane-${++this.paneCounter}`;

    const leafEl = document.createElement("div");
    leafEl.className = "velt-pane-leaf";

    const paneHeader = document.createElement("div");
    paneHeader.className = "velt-pane-header";

    const paneTitleEl = document.createElement("span");
    paneTitleEl.className = "velt-pane-title";
    paneTitleEl.textContent = startCwd ? shortBaseName(startCwd) : "shell";

    const paneBadgeEl = document.createElement("span");
    paneBadgeEl.className = "velt-pane-badge hidden";
    paneBadgeEl.textContent = "AGENT";

    const paneCloseBtn = document.createElement("button");
    paneCloseBtn.type = "button";
    paneCloseBtn.className = "velt-pane-close";
    paneCloseBtn.title = "Chiudi riquadro";
    paneCloseBtn.innerHTML = iconClose(10);
    paneCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.closePane(id);
    });

    paneHeader.appendChild(paneBadgeEl);
    paneHeader.appendChild(paneTitleEl);
    paneHeader.appendChild(paneCloseBtn);

    const termWrapEl = document.createElement("div");
    termWrapEl.className = "velt-term-wrap";

    leafEl.appendChild(paneHeader);
    leafEl.appendChild(termWrapEl);

    const activeTheme = getThemeById(this.config.theme);
    const term = new Terminal({
      fontFamily: this.config.font_family,
      fontSize: this.config.font_size,
      lineHeight: this.config.line_height,
      scrollback: this.config.scrollback,
      cursorStyle: this.config.cursor_style,
      cursorBlink: this.config.cursor_blink !== false,
      allowTransparency: true,
      theme: toXtermTheme(activeTheme, "shell", this.config.accent_override),
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        void invoke("open_external_url", { url: uri }).catch((err) =>
          this.showToast(String(err))
        );
      })
    );

    term.open(termWrapEl);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // Canvas renderer fallback is automatic.
    }

    const pane: PaneState = {
      id,
      tabId,
      title: startCwd ? shortBaseName(startCwd) : "shell",
      cwd: startCwd || "~",
      mode: "shell",
      leafEl,
      paneTitleEl,
      paneBadgeEl,
      termWrapEl,
      term,
      fitAddon,
      searchAddon,
      model: this.config.default_model,
      effort: this.config.default_effort,
      sessionId: null,
      isStreaming: false,
      streamStartedAt: null,
      streamWriter: null,
      terminalSnapshot: null,
      agentVisitCommands: [],
      announcedToolIds: new Set<string>(),
      pendingPtyChunks: [],
      wroteAgentInVisit: false,
      lastSuggestedCommand: null,
      lastTokensOut: null,
      promptHistory: [],
      historyCursor: 0,
      includeContext: this.config.auto_context,
      needsPtyResizeSync: false,
      isThinking: false,
      liveThinkText: "",
      thinkStartedAt: null,
    };

    leafEl.addEventListener("mousedown", () => {
      if (this.activePane()?.id !== pane.id) {
        this.focusPane(pane.id, false);
      }
    });

    const handleHoverFocus = (e: MouseEvent) => {
      if (!this.config?.focus_follows_mouse) return;
      if (this.activePane()?.id === pane.id) return;
      if (pane.tabId !== this.activeTabId) return;
      if (this.isDraggingSplitter || e.buttons !== 0) return;
      if (
        this.switcher.isOpen() ||
        this.settingsModal.isOpen() ||
        this.contextMenuEl ||
        !this.findBarEl.classList.contains("hidden")
      ) {
        return;
      }
      this.focusPane(pane.id, true);
    };

    leafEl.addEventListener("mouseenter", handleHoverFocus);
    leafEl.addEventListener("mousemove", handleHoverFocus);

    let copyTimer: number | null = null;
    term.onSelectionChange(() => {
      if (!this.config?.copy_on_select) return;
      if (copyTimer) window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        const sel = term.getSelection();
        if (sel) {
          void navigator.clipboard.writeText(sel).catch(() => undefined);
        }
      }, 80);
    });

    termWrapEl.addEventListener("mousedown", (e) => {
      if (e.button === 1 && this.config?.middle_click_paste !== false) {
        e.preventDefault();
      }
    });

    termWrapEl.addEventListener("auxclick", (e) => {
      if (e.button === 1 && this.config?.middle_click_paste !== false) {
        e.preventDefault();
        this.focusPane(pane.id, false);
        void this.pasteIntoPane(pane, true);
      }
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && this.isVeltShortcut(e)) {
        return false;
      }
      return true;
    });

    term.onData((data) => {
      if (pane.mode === "shell") {
        void invoke("pty_write", { tabId: pane.id, data });
      }
    });

    term.onTitleChange((title) => {
      const clean = title.trim();
      if (clean) {
        pane.title = clean;
        pane.paneTitleEl.textContent = clean;
        this.renderTabs();
        if (pane.id === this.activePane()?.id) {
          void getCurrentWindow().setTitle(`Velt — ${clean}`);
        }
      }
    });

    this.panes.set(id, pane);
    return pane;
  }

  private async spawnPanePty(pane: PaneState, startCwd: string | null): Promise<void> {
    try {
      const spawnedCwd = await invoke<string>("pty_spawn", {
        tabId: pane.id,
        cwd: startCwd,
        shell: this.config.shell || null,
        cols: pane.term.cols,
        rows: pane.term.rows,
      });
      pane.cwd = spawnedCwd;
      pane.title = shortBaseName(spawnedCwd);
      pane.paneTitleEl.textContent = pane.title;
      this.renderTabs();
      this.updateStatusBar();
    } catch (err) {
      pane.term.write(`${RED}Impossibile avviare la shell: ${String(err)}${RESET}\r\n`);
    }
  }

  private async createTab(): Promise<void> {
    const tabId = `tab-${++this.tabCounter}`;
    const prevPane = this.activePane();
    const startCwd = prevPane?.cwd || null;

    const containerEl = document.createElement("div");
    containerEl.className = "velt-tab-root single-pane";
    this.stageEl.appendChild(containerEl);

    const pane = this.buildPaneState(tabId, startCwd);
    const tab: TabState = {
      id: tabId,
      containerEl,
      rootNode: { kind: "leaf", paneId: pane.id },
      activePaneId: pane.id,
    };

    this.tabs.set(tabId, tab);
    this.tabOrder.push(tabId);
    this.renderTabTree(tab);
    this.activateTab(tabId);

    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    pane.fitAddon.fit();
    await this.spawnPanePty(pane, startCwd);
  }

  private async splitActivePane(dir: SplitDirection): Promise<void> {
    const tab = this.activeTab();
    const current = this.activePane();
    if (!tab || !current) return;

    await this.syncPaneCwd(current);
    const startCwd = current.cwd || null;
    const newPane = this.buildPaneState(tab.id, startCwd);

    tab.rootNode = splitLeafNode(tab.rootNode, current.id, newPane.id, dir);
    tab.activePaneId = newPane.id;

    this.renderTabTree(tab);
    this.renderTabs();
    this.updateModeUI();
    this.updateStatusBar();

    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    this.fitTabPanes(tab, true);
    await this.spawnPanePty(newPane, startCwd);
    newPane.term.focus();
  }

  private async closePane(paneId: string): Promise<void> {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    const tab = this.tabs.get(pane.tabId);
    if (!tab) return;

    if (countPanes(tab.rootNode) <= 1) {
      await this.closeTab(tab.id);
      return;
    }

    if (pane.isStreaming) {
      await invoke("opencode_cancel_turn", {
        overrideBin: this.config.opencode_bin || null,
        tabId: pane.id,
      }).catch(() => undefined);
    }
    await invoke("pty_kill", { tabId: pane.id }).catch(() => undefined);
    pane.term.dispose();
    pane.leafEl.remove();
    this.panes.delete(pane.id);

    const nextTree = removeLeafNode(tab.rootNode, pane.id);
    if (!nextTree) {
      await this.closeTab(tab.id);
      return;
    }
    tab.rootNode = nextTree;

    if (tab.activePaneId === pane.id) {
      const remaining = collectPaneIds(tab.rootNode);
      tab.activePaneId = remaining[0];
    }

    this.renderTabTree(tab);
    this.renderTabs();
    this.updateModeUI();
    this.updateStatusBar();

    requestAnimationFrame(() => {
      this.fitTabPanes(tab, true);
      const next = this.activePane();
      if (next?.mode === "agent") this.agentInputEl.focus();
      else next?.term.focus();
    });
  }

  private movePaneFocus(direction: "left" | "right" | "up" | "down"): void {
    const tab = this.activeTab();
    if (!tab || countPanes(tab.rootNode) <= 1) return;
    const rects = new Map<string, DOMRect>();
    for (const pid of collectPaneIds(tab.rootNode)) {
      const p = this.panes.get(pid);
      if (p) rects.set(pid, p.leafEl.getBoundingClientRect());
    }
    const targetId = findDirectionalNeighbor(rects, tab.activePaneId, direction);
    if (targetId) {
      this.focusPane(targetId, true);
    }
  }

  private focusPane(paneId: string, focusInput = true): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    const tab = this.tabs.get(pane.tabId);
    if (!tab) return;

    tab.activePaneId = paneId;
    for (const pid of collectPaneIds(tab.rootNode)) {
      this.panes.get(pid)?.leafEl.classList.toggle("focused", pid === paneId);
    }

    this.renderTabs();
    this.updateModeUI();
    this.updateStatusBar();
    void getCurrentWindow().setTitle(`Velt — ${pane.title}`);

    if (focusInput) {
      requestAnimationFrame(() => {
        if (pane.mode === "agent") this.agentInputEl.focus();
        else pane.term.focus();
      });
    }
  }

  private renderTabTree(tab: TabState): void {
    const total = countPanes(tab.rootNode);
    tab.containerEl.classList.toggle("single-pane", total <= 1);
    tab.containerEl.classList.toggle("multi-pane", total > 1);

    const domTree = this.buildSplitDom(tab, tab.rootNode);
    tab.containerEl.replaceChildren(domTree);

    for (const pid of collectPaneIds(tab.rootNode)) {
      const p = this.panes.get(pid);
      if (!p) continue;
      p.leafEl.classList.toggle("focused", pid === tab.activePaneId);
      p.paneBadgeEl.classList.toggle("hidden", p.mode !== "agent");
    }
  }

  private buildSplitDom(tab: TabState, node: SplitNode): HTMLElement {
    if (node.kind === "leaf") {
      const pane = this.panes.get(node.paneId);
      if (!pane) {
        const fallback = document.createElement("div");
        return fallback;
      }
      pane.leafEl.style.flex = "1 1 0%";
      return pane.leafEl;
    }

    const wrap = document.createElement("div");
    wrap.className = `velt-split-box ${node.dir}`;

    const firstSlot = document.createElement("div");
    firstSlot.className = "velt-split-branch";
    firstSlot.style.flex = `${node.ratio} 1 0%`;
    firstSlot.appendChild(this.buildSplitDom(tab, node.first));

    const splitter = document.createElement("div");
    splitter.className = `velt-splitter ${node.dir}`;

    const secondSlot = document.createElement("div");
    secondSlot.className = "velt-split-branch";
    secondSlot.style.flex = `${1 - node.ratio} 1 0%`;
    secondSlot.appendChild(this.buildSplitDom(tab, node.second));

    splitter.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.isDraggingSplitter = true;
      splitter.classList.add("dragging");
      const rect = wrap.getBoundingClientRect();

      const onMove = (mv: MouseEvent) => {
        const raw =
          node.dir === "vertical"
            ? (mv.clientX - rect.left) / Math.max(1, rect.width)
            : (mv.clientY - rect.top) / Math.max(1, rect.height);
        const clamped = Math.min(0.85, Math.max(0.15, raw));
        node.ratio = clamped;
        firstSlot.style.flex = `${clamped} 1 0%`;
        secondSlot.style.flex = `${1 - clamped} 1 0%`;
        this.fitTabPanes(tab, true);
      };

      const onUp = () => {
        this.isDraggingSplitter = false;
        splitter.classList.remove("dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.fitTabPanes(tab, true);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    wrap.appendChild(firstSlot);
    wrap.appendChild(splitter);
    wrap.appendChild(secondSlot);
    return wrap;
  }

  private activateTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.activeTabId = id;

    for (const [tid, t] of this.tabs) {
      t.containerEl.classList.toggle("active", tid === id);
    }

    this.renderTabs();
    this.updateModeUI();
    this.updateStatusBar();

    const pane = this.activePane();
    requestAnimationFrame(() => {
      this.fitTabPanes(tab, true);
      if (pane?.mode === "agent") {
        this.agentInputEl.focus();
      } else {
        pane?.term.focus();
      }
    });
    if (pane) {
      void getCurrentWindow().setTitle(`Velt — ${pane.title}`);
    }
  }

  private async closeTab(id: string): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab) return;

    const paneIds = collectPaneIds(tab.rootNode);
    for (const pid of paneIds) {
      const pane = this.panes.get(pid);
      if (!pane) continue;
      if (pane.isStreaming) {
        await invoke("opencode_cancel_turn", {
          overrideBin: this.config.opencode_bin || null,
          tabId: pane.id,
        }).catch(() => undefined);
      }
      await invoke("pty_kill", { tabId: pane.id }).catch(() => undefined);
      pane.term.dispose();
      pane.leafEl.remove();
      this.panes.delete(pid);
    }

    tab.containerEl.remove();
    this.tabs.delete(id);

    const idx = this.tabOrder.indexOf(id);
    if (idx !== -1) this.tabOrder.splice(idx, 1);

    if (this.tabOrder.length === 0) {
      await this.createTab();
      return;
    }

    if (this.activeTabId === id) {
      const nextId = this.tabOrder[Math.max(0, idx - 1)] || this.tabOrder[0];
      this.activateTab(nextId);
    } else {
      this.renderTabs();
    }
  }

  private activeTab(): TabState | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }

  private activePane(): PaneState | null {
    const tab = this.activeTab();
    if (!tab) return null;
    return this.panes.get(tab.activePaneId) || null;
  }

  private fitPane(pane: PaneState, notifyPty: boolean): void {
    try {
      pane.fitAddon.fit();
      if (notifyPty) {
        pane.needsPtyResizeSync = false;
        void invoke("pty_resize", {
          tabId: pane.id,
          cols: pane.term.cols,
          rows: pane.term.rows,
        });
      } else {
        pane.needsPtyResizeSync = true;
      }
    } catch {
      // Ignore resize when tab/pane is hidden
    }
  }

  private fitTabPanes(tab: TabState, allowPtyResize: boolean): void {
    for (const pid of collectPaneIds(tab.rootNode)) {
      const p = this.panes.get(pid);
      if (p) {
        this.fitPane(p, allowPtyResize && p.mode === "shell");
      }
    }
  }

  private toggleAgentMode(): void {
    const pane = this.activePane();
    if (!pane) return;
    this.setPaneMode(pane, pane.mode === "shell" ? "agent" : "shell");
  }

  private setPaneMode(pane: PaneState, targetMode: "shell" | "agent"): void {
    if (pane.mode === targetMode) return;
    pane.mode = targetMode;
    pane.paneBadgeEl.classList.toggle("hidden", targetMode !== "agent");

    if (targetMode === "agent") {
      pane.wroteAgentInVisit = false;
      pane.terminalSnapshot = null;
      pane.agentVisitCommands = [];
      pane.announcedToolIds.clear();
      pane.pendingPtyChunks = [];
      pane.term.options.theme = toXtermTheme(
        getThemeById(this.config.theme),
        "agent",
        this.config.accent_override
      );
      this.updateModeUI();
      this.renderTabs();
      this.updateStatusBar();
      requestAnimationFrame(() => {
        this.fitPane(pane, false);
        this.agentInputEl.focus();
      });
    } else {
      pane.term.options.theme = toXtermTheme(
        getThemeById(this.config.theme),
        "shell",
        this.config.accent_override
      );
      this.updateModeUI();
      this.renderTabs();
      this.updateStatusBar();

      if (pane.wroteAgentInVisit) {
        pane.wroteAgentInVisit = false;
        const snap = pane.terminalSnapshot;
        pane.terminalSnapshot = null;
        const cmds = pane.agentVisitCommands;
        pane.agentVisitCommands = [];
        const pendingPty = pane.pendingPtyChunks.join("");
        pane.pendingPtyChunks = [];
        pane.announcedToolIds.clear();

        const exitMode = this.config.agent_exit_mode || "commands_only";
        if (exitMode !== "keep_all" && snap && !snap.isAltScreen) {
          let payload = "\x1b[2J\x1b[3J\x1b[H";
          const preBody = formatTerminalSnapshotBody(snap);
          if (preBody.length > 0) {
            payload += preBody + "\r\n";
          }
          if (exitMode === "commands_only" && cmds.length > 0) {
            payload += formatAgentCommandIoForShell(
              cmds,
              this.config.agent_cmd_style || "shell"
            );
          }
          if (pendingPty.length > 0) {
            payload += pendingPty;
            if (!pendingPty.endsWith("\n") && !pendingPty.endsWith("\r")) {
              payload += "\r\n";
            }
          }
          if (snap.ansiLine.length > 0) {
            const moveCol = snap.cursorX > 0 ? `\x1b[${snap.cursorX}C` : "";
            payload += `${snap.ansiLine}\r${moveCol}`;
          }
          pane.term.write(payload, () => {
            pane.term.scrollToBottom();
          });
        } else if (snap && !snap.isAltScreen && snap.ansiLine.length > 0) {
          const moveCol = snap.cursorX > 0 ? `\x1b[${snap.cursorX}C` : "";
          const ptyPrefix = pendingPty ? `\r\n${pendingPty}` : "";
          pane.term.write(`${ptyPrefix}\r\n${snap.ansiLine}\r${moveCol}`);
        } else {
          pane.term.write(`${pendingPty ? `\r\n${pendingPty}` : ""}\r\n`);
        }
      }

      requestAnimationFrame(() => {
        this.fitPane(pane, pane.needsPtyResizeSync);
        pane.term.focus();
      });
    }
  }

  private updateModeUI(): void {
    const pane = this.activePane();
    const isAgent = pane?.mode === "agent";
    const streaming = Boolean(pane?.isStreaming);

    this.mainEl.classList.toggle("agent-mode", Boolean(isAgent));
    this.mainEl.classList.toggle("agent-streaming", Boolean(isAgent && streaming));
    this.agentDockEl.classList.toggle("hidden", !isAgent);
    this.agentDockEl.classList.toggle("streaming", streaming);
    this.brandLogoEl.innerHTML = veltLogoSvg(20, isAgent ? "agent-live" : "");

    this.modeBtn.classList.toggle("agent", Boolean(isAgent));
    this.modeBtn.innerHTML = isAgent
      ? `${iconAgent(12)} <span>AGENT</span>`
      : `${iconTerminal(12)} <span>SHELL</span>`;

    this.agentStopBtn.classList.toggle("hidden", !streaming);
    this.agentSendBtn.classList.toggle("hidden", streaming);
    this.streamHudEl.classList.toggle("hidden", !streaming);
    if (streaming) this.updateStreamTimer();
    this.syncThinkingDock();
  }

  private async submitAgentPrompt(): Promise<void> {
    const pane = this.activePane();
    if (!pane || pane.isStreaming) return;

    const raw = this.agentInputEl.value.trim();
    if (!raw) return;

    if (raw === "/new") {
      this.agentInputEl.value = "";
      this.autoSizeTextarea();
      this.resetAgentSession(pane);
      return;
    }
    if (raw === "/clear") {
      this.agentInputEl.value = "";
      this.autoSizeTextarea();
      pane.term.clear();
      return;
    }
    if (raw === "/help") {
      this.agentInputEl.value = "";
      this.autoSizeTextarea();
      const kb = this.config.keybindings;
      pane.term.write(
        `\r\n${CYAN}[V] Comandi rapidi Velt Agent:${RESET}\r\n` +
          `  ${CYAN}${kb.toggle_agent}${RESET} / ${CYAN}Esc${RESET}  Torna alla shell (mantiene lo scrollback)\r\n` +
          `  ${CYAN}${kb.model_switcher}${RESET}        Cambia modello, reasoning effort o preset\r\n` +
          `  ${CYAN}${kb.cycle_effort}${RESET}        Cicla solo il reasoning effort\r\n` +
          `  ${CYAN}${kb.insert_command}${RESET}    Incolla comando suggerito nella shell\r\n` +
          `  ${CYAN}${kb.select_all}${RESET}        Seleziona tutto il testo\r\n` +
          `  ${CYAN}/new${RESET} · ${CYAN}/clear${RESET}       Nuova sessione OpenCode / pulisci scrollback\r\n\r\n`
      );
      return;
    }

    pane.promptHistory.push(raw);
    pane.historyCursor = pane.promptHistory.length;
    this.agentInputEl.value = "";
    this.autoSizeTextarea();

    await this.syncPaneCwd(pane);

    if (!pane.wroteAgentInVisit) {
      pane.terminalSnapshot = captureTerminalSnapshot(pane.term);
      pane.agentVisitCommands = [];
      pane.announcedToolIds.clear();
      pane.pendingPtyChunks = [];
      pane.wroteAgentInVisit = true;
    }

    const recentCtx = pane.includeContext
      ? extractRecentContext(pane.term, this.config.context_lines)
      : "";

    pane.term.write(
      formatAgentPromptHeader(
        pane.model,
        pane.effort,
        pane.cwd,
        raw,
        recentCtx.length > 0
      )
    );
    pane.term.scrollToBottom();

    const fullPrompt =
      recentCtx.length > 0
        ? `[Terminal Context — cwd: ${pane.cwd}]\n\`\`\`\n${recentCtx}\n\`\`\`\n\nUser request:\n${raw}`
        : raw;

    pane.isStreaming = true;
    pane.isThinking = false;
    pane.liveThinkText = "";
    pane.thinkStartedAt = null;
    pane.streamStartedAt = performance.now();
    pane.lastTokensOut = null;
    pane.streamWriter = new StreamingMarkdownAnsi(pane.term);
    this.updateModeUI();
    this.renderTabs();

    try {
      const sid = await invoke<string>("opencode_send_prompt", {
        overrideBin: this.config.opencode_bin || null,
        tabId: pane.id,
        sessionId: pane.sessionId,
        cwd: pane.cwd,
        model: pane.model,
        effort: pane.effort,
        prompt: fullPrompt,
        showThinking: this.config.show_thinking,
        autoApprove: this.config.auto_approve,
      });
      if (sid) pane.sessionId = sid;
    } catch (err) {
      pane.isStreaming = false;
      pane.streamStartedAt = null;
      pane.streamWriter = null;
      pane.term.write(`\r\n  ${RED}[err] Errore invio a OpenCode: ${String(err)}${RESET}\r\n`);
      this.updateModeUI();
      this.renderTabs();
    }
  }

  private async cancelActiveTurn(): Promise<void> {
    const pane = this.activePane();
    if (!pane || !pane.isStreaming) return;
    await invoke("opencode_cancel_turn", {
      overrideBin: this.config.opencode_bin || null,
      tabId: pane.id,
    }).catch(() => undefined);
  }

  private resetAgentSession(pane: PaneState): void {
    pane.sessionId = null;
    if (!pane.wroteAgentInVisit) {
      pane.terminalSnapshot = captureTerminalSnapshot(pane.term);
      pane.agentVisitCommands = [];
      pane.announcedToolIds.clear();
      pane.pendingPtyChunks = [];
      pane.wroteAgentInVisit = true;
    }
    pane.term.write(`\r\n  ${CYAN}[V] Nuova sessione OpenCode avviata per questo riquadro${RESET}\r\n`);
    this.showToast("Nuova sessione OpenCode");
  }

  private async insertLastSuggestedCommand(): Promise<void> {
    const pane = this.activePane();
    if (!pane || !pane.lastSuggestedCommand) return;
    const cmd = pane.lastSuggestedCommand.replace(/\r?\n/g, " && ");
    if (pane.mode === "agent") {
      this.setPaneMode(pane, "shell");
    }
    setTimeout(() => {
      void invoke("pty_write", { tabId: pane.id, data: cmd });
      pane.term.focus();
      this.showToast("Comando inserito nel prompt");
    }, 30);
  }

  private openModelSwitcher(): void {
    const pane = this.activePane();
    if (!pane) return;
    this.switcher.open(
      this.models,
      this.config,
      pane.model,
      pane.effort,
      async (res) => {
        pane.model = res.model;
        pane.effort = res.effort;
        if (res.saveAsDefault) {
          this.config.default_model = res.model;
          this.config.default_effort = res.effort;
          await invoke("save_config", { config: this.config }).catch(() => undefined);
        }
        this.updateStatusBar();
        this.showToast(`${shortModelName(res.model)} · ${res.effort}`);
        if (pane.mode === "agent") this.agentInputEl.focus();
        else pane.term.focus();
      },
      () => {
        if (pane.mode === "agent") this.agentInputEl.focus();
        else pane.term.focus();
      }
    );
  }

  private cycleCurrentEffort(): void {
    const pane = this.activePane();
    if (!pane) return;
    const modelObj = this.models.find((m) => m.id === pane.model);
    const efforts = effectiveEfforts(modelObj);
    if (efforts.length <= 1) return;
    const idx = efforts.indexOf(pane.effort);
    const next = efforts[(Math.max(0, idx) + 1) % efforts.length];
    pane.effort = next;
    this.updateStatusBar();
    this.showToast(`Reasoning Effort -> ${next}`);
  }

  private openSettings(initialSection: SettingsSection = "ai"): void {
    const pane = this.activePane();
    this.settingsModal.open(
      this.config,
      this.models,
      this.ocStatus,
      this.configPath,
      async (newCfg) => {
        this.config = newCfg;
        await invoke("save_config", { config: newCfg });
        this.applyAppearanceConfig(newCfg);
        for (const p of this.panes.values()) {
          p.includeContext = newCfg.auto_context;
          p.term.options.fontFamily = newCfg.font_family;
          p.term.options.fontSize = newCfg.font_size;
          p.term.options.lineHeight = newCfg.line_height;
          p.term.options.scrollback = newCfg.scrollback;
          p.term.options.cursorStyle = newCfg.cursor_style;
          p.term.options.cursorBlink = newCfg.cursor_blink !== false;
        }
        const tab = this.activeTab();
        if (tab) this.fitTabPanes(tab, true);
        this.syncThinkingDock();
        await this.refreshOpenCodeMetadata();
        this.updateStatusBar();
        this.showToast("Impostazioni salvate");
      },
      () => {
        this.applyAppearanceConfig(this.config);
        if (pane?.mode === "agent") this.agentInputEl.focus();
        else pane?.term.focus();
      },
      async (showHidden) => {
        return invoke<ModelInfo[]>("opencode_list_models", {
          overrideBin: this.config.opencode_bin || null,
          showHidden,
        }).catch(() => this.models);
      },
      (previewCfg) => {
        this.applyAppearanceConfig(previewCfg);
      },
      initialSection
    );
  }

  private applyAppearanceConfig(cfg: VeltConfig = this.config): void {
    const theme = getThemeById(cfg.theme);
    const rootStyle = document.documentElement.style;
    const opacity = Math.min(1, Math.max(0.35, cfg.opacity ?? 0.92));
    const chromeOpacity = Math.min(0.98, opacity + 0.06);
    const blurOn = cfg.blur ?? true;
    const blurRadius = Math.min(40, Math.max(0, cfg.blur_radius ?? 16));
    const effectiveBlur = blurOn ? blurRadius : 0;

    const accent = isValidHexColor(cfg.accent_override)
      ? cfg.accent_override.trim()
      : theme.accent;
    const accentSoft = isValidHexColor(cfg.accent_override)
      ? computeSoftAccent(accent)
      : theme.accentSoft;
    const accentRgb = hexToRgbTriplet(accent);
    const radius = Math.min(18, Math.max(0, cfg.ui_radius ?? 10));
    const termPadding = Math.min(28, Math.max(2, cfg.terminal_padding ?? 10));

    rootStyle.setProperty("--velt-bg", theme.bg);
    rootStyle.setProperty("--velt-bg-rgb", hexToRgbTriplet(theme.bg));
    rootStyle.setProperty("--velt-surface", theme.surface);
    rootStyle.setProperty("--velt-surface-rgb", hexToRgbTriplet(theme.surface));
    rootStyle.setProperty("--velt-surface-2", theme.surface2);
    rootStyle.setProperty("--velt-input-bg", theme.inputBg);
    rootStyle.setProperty("--velt-border", theme.border);
    rootStyle.setProperty("--velt-text", theme.text);
    rootStyle.setProperty("--velt-muted", theme.muted);
    rootStyle.setProperty("--velt-accent", accent);
    rootStyle.setProperty("--velt-accent-soft", accentSoft);
    rootStyle.setProperty("--velt-accent-rgb", accentRgb);
    rootStyle.setProperty("--velt-cyan-dim", `rgba(${accentRgb}, 0.14)`);
    rootStyle.setProperty("--velt-green", theme.green);
    rootStyle.setProperty("--velt-amber", theme.amber);
    rootStyle.setProperty("--velt-red", theme.red);
    rootStyle.setProperty("--velt-opacity", String(opacity));
    rootStyle.setProperty("--velt-chrome-opacity", String(chromeOpacity));
    rootStyle.setProperty("--velt-blur", `${effectiveBlur}px`);
    rootStyle.setProperty("--velt-radius", `${radius}px`);
    rootStyle.setProperty("--velt-term-padding", `${termPadding}px`);
    rootStyle.setProperty("--font-mono", cfg.font_family);

    setAnsiTheme(theme, cfg.accent_override);
    document.body.dataset.backdrop = cfg.ui_backdrop_style || "aurora";
    document.body.dataset.agentAura = cfg.agent_aura || "vivid";
    document.body.classList.toggle("no-animations", cfg.animations === false);
    document.body.classList.toggle("compact-chrome", Boolean(cfg.compact_chrome));
    document.body.classList.toggle("hide-statusbar", cfg.show_status_bar === false);

    for (const p of this.panes.values()) {
      p.term.options.theme = toXtermTheme(theme, p.mode, cfg.accent_override);
      p.term.options.fontFamily = cfg.font_family;
      p.term.options.fontSize = cfg.font_size;
      p.term.options.lineHeight = cfg.line_height;
      p.term.options.cursorStyle = cfg.cursor_style;
      p.term.options.cursorBlink = cfg.cursor_blink !== false;
    }

    requestAnimationFrame(() => {
      const tab = this.activeTab();
      if (tab) this.fitTabPanes(tab, true);
    });

    const osBlurEnabled = blurOn && blurRadius > 0 && opacity < 0.995;
    void invoke("set_window_blur", { enabled: osBlurEnabled }).catch(() => undefined);
  }

  private toggleFindBar(show: boolean): void {
    this.findBarEl.classList.toggle("hidden", !show);
    if (show) {
      this.findInputEl.focus();
      this.findInputEl.select();
    } else {
      const pane = this.activePane();
      if (pane?.mode === "agent") this.agentInputEl.focus();
      else pane?.term.focus();
    }
  }

  private autoSizeTextarea(): void {
    this.agentInputEl.style.height = "auto";
    this.agentInputEl.style.height = `${Math.min(120, Math.max(24, this.agentInputEl.scrollHeight))}px`;
  }

  private async syncActiveCwd(): Promise<void> {
    const pane = this.activePane();
    if (!pane) return;
    await this.syncPaneCwd(pane);
  }

  private async syncPaneCwd(pane: PaneState): Promise<void> {
    try {
      const cwd = await invoke<string | null>("pty_cwd", { tabId: pane.id });
      if (cwd && cwd !== pane.cwd) {
        pane.cwd = cwd;
        pane.title = shortBaseName(cwd);
        pane.paneTitleEl.textContent = pane.title;
        this.renderTabs();
        this.updateStatusBar();
      }
    } catch {
      // Ignore transient proc errors
    }
  }

  private renderTabs(): void {
    this.tabsEl.innerHTML = "";
    const showIndex = this.tabOrder.length > 1;
    this.tabOrder.forEach((id, index) => {
      const tab = this.tabs.get(id);
      if (!tab) return;

      const paneIds = collectPaneIds(tab.rootNode);
      const activePane = this.panes.get(tab.activePaneId) || this.panes.get(paneIds[0]);
      const anyAgent = paneIds.some((pid) => this.panes.get(pid)?.mode === "agent");
      const anyStreaming = paneIds.some((pid) => this.panes.get(pid)?.isStreaming);
      const baseTitle = activePane?.title || "shell";
      const tabTitle = paneIds.length > 1 ? `${baseTitle} (${paneIds.length})` : baseTitle;

      const btn = document.createElement("div");
      btn.className = `velt-tab ${id === this.activeTabId ? "active" : ""} ${anyAgent ? "agent-active" : ""} ${anyStreaming ? "streaming" : ""}`;
      btn.title = index < 9 ? `${tabTitle} (Ctrl+${index + 1})` : tabTitle;
      btn.innerHTML = `
        <span class="velt-tab-dot"></span>
        ${showIndex && index < 9 ? `<span class="velt-tab-num">${index + 1}</span>` : ""}
        <span class="velt-tab-title"></span>
        <button type="button" class="velt-tab-close" title="Chiudi tab">${iconClose(11)}</button>
      `;
      const titleEl = btn.querySelector(".velt-tab-title")!;
      titleEl.textContent = tabTitle;

      btn.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".velt-tab-close")) return;
        this.activateTab(id);
      });
      btn.querySelector(".velt-tab-close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.closeTab(id);
      });

      this.tabsEl.appendChild(btn);
    });
  }

  private updateStatusBar(): void {
    const pane = this.activePane();
    const showModelControls = Boolean(
      pane && (pane.mode === "agent" || this.config?.show_model_in_shell)
    );

    if (pane) {
      this.cwdEl.textContent = pane.cwd.replace(/^\/home\/[^/]+/, "~");
      const nameSpan = this.modelPillEl.querySelector(".model-name");
      const effSpan = this.modelPillEl.querySelector(".effort");
      if (nameSpan) nameSpan.textContent = shortModelName(pane.model);
      if (effSpan) effSpan.textContent = pane.effort || "default";

      this.ctxToggleBtn.classList.toggle("active", pane.includeContext);
      this.cmdPillEl.classList.toggle("hidden", !pane.lastSuggestedCommand);
    }

    this.modelPillEl.classList.toggle("hidden", !showModelControls);
    this.ocDotEl.classList.toggle("hidden", !showModelControls);

    this.ocDotEl.className = `velt-oc-dot ${this.ocStatus.available ? "ok" : "err"} ${showModelControls ? "" : "hidden"}`;
    this.ocDotEl.title = this.ocStatus.available
      ? `OpenCode connesso (${this.ocStatus.version || "cli"})`
      : this.ocStatus.error || "OpenCode non trovato";
  }
}

function extractDigitKey(e: KeyboardEvent): number | null {
  if (/^[1-9]$/.test(e.key)) {
    return Number(e.key);
  }
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return match ? Number(match[1]) : null;
}

function shortBaseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "/";
}

const appRoot = document.getElementById("app");
if (appRoot) {
  const app = new VeltApp(appRoot);
  void app.init();
}
