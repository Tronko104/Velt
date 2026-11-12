import { invoke } from "@tauri-apps/api/core";
import { STRINGS, resolveLocale, type AppLocale } from "../i18n";
import { formatRecordedShortcut } from "../keybindings";
import {
  VELT_THEMES,
  getThemeById,
  getThemeTagline,
  isValidHexColor,
} from "../themes";
import type {
  Keybindings,
  ModelInfo,
  OpenCodeStatus,
  Preset,
  VeltConfig,
} from "../types";
import {
  iconCheck,
  iconClose,
  iconCpu,
  iconKeyboard,
  iconPlus,
  iconReset,
  iconSliders,
  veltLogoSvg,
} from "./icons";
import { effectiveEfforts } from "./switcher";

export type SettingsSection = "ai" | "terminal" | "keys";

interface DropdownOption {
  value: string;
  label: string;
  sub?: string;
}

export class SettingsModal {
  private overlay: HTMLDivElement;
  private modalEl: HTMLDivElement;
  private modalTitleEl: HTMLSpanElement;
  private closeIconBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private bodyEl: HTMLDivElement;
  private navButtons: NodeListOf<HTMLButtonElement>;
  private activeSection: SettingsSection = "ai";
  private openMenuEl: HTMLDivElement | null = null;
  private openTriggerEl: HTMLButtonElement | null = null;

  private systemLocale = "en";
  private draft!: VeltConfig;
  private models: ModelInfo[] = [];
  private ocStatus: OpenCodeStatus = { available: false };
  private configPath = "";
  private recordingField: keyof Keybindings | null = null;

  private onSave?: (cfg: VeltConfig) => Promise<void>;
  private onClose?: () => void;
  private onRefreshModels?: (showHidden: boolean) => Promise<ModelInfo[]>;
  private onPreviewAppearance?: (cfg: VeltConfig) => void;

  constructor(root: HTMLElement) {
    this.overlay = document.createElement("div");
    this.overlay.className = "velt-modal-backdrop hidden";
    const s = STRINGS.en.settings;
    this.overlay.innerHTML = `
      <div class="velt-modal velt-settings" role="dialog" aria-label="${escapeAttr(s.ariaLabel)}">
        <div class="velt-modal-header">
          <div class="velt-modal-title">
            ${veltLogoSvg(20)}
            <span data-role="modal-title">${escapeHtml(s.title)}</span>
          </div>
          <button type="button" class="velt-icon-btn" data-action="close" data-role="close-icon" aria-label="${escapeAttr(s.closeAria)}">${iconClose(14)}</button>
        </div>

        <div class="velt-settings-layout">
          <nav class="velt-settings-nav">
            <button type="button" class="velt-nav-item active" data-sec="ai">${iconCpu(14)} <span>${escapeHtml(s.navAi)}</span></button>
            <button type="button" class="velt-nav-item" data-sec="terminal">${iconSliders(14)} <span>${escapeHtml(s.navTerminal)}</span></button>
            <button type="button" class="velt-nav-item" data-sec="keys">${iconKeyboard(14)} <span>${escapeHtml(s.navKeys)}</span></button>
          </nav>

          <div class="velt-settings-body" data-role="body"></div>
        </div>

        <div class="velt-modal-footer">
          <span class="velt-config-path" data-role="cfg-path"></span>
          <div class="velt-footer-actions">
            <button type="button" class="velt-btn velt-btn-ghost" data-action="close" data-role="cancel-btn">${escapeHtml(s.cancel)}</button>
            <button type="button" class="velt-btn velt-btn-primary" data-action="save">${escapeHtml(s.save)}</button>
          </div>
        </div>
      </div>
    `;

    root.appendChild(this.overlay);
    this.modalEl = this.overlay.querySelector(".velt-settings")!;
    this.modalTitleEl = this.overlay.querySelector('[data-role="modal-title"]')!;
    this.closeIconBtn = this.overlay.querySelector('[data-role="close-icon"]')!;
    this.cancelBtn = this.overlay.querySelector('[data-role="cancel-btn"]')!;
    this.saveBtn = this.overlay.querySelector('[data-action="save"]')!;
    this.bodyEl = this.overlay.querySelector('[data-role="body"]')!;
    this.navButtons = this.overlay.querySelectorAll(".velt-nav-item");

    this.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closeDropdownMenu();
        this.recordingField = null;
        this.activeSection = btn.dataset.sec as SettingsSection;
        this.navButtons.forEach((b) => b.classList.toggle("active", b === btn));
        this.renderSection();
      });
    });

    this.overlay.addEventListener("mousedown", (e) => {
      const target = e.target as Node;
      if (
        this.openMenuEl &&
        !this.openMenuEl.contains(target) &&
        !this.openTriggerEl?.contains(target)
      ) {
        this.closeDropdownMenu();
      }
      if (e.target === this.overlay) this.close();
    });

    this.bodyEl.addEventListener("scroll", () => this.closeDropdownMenu());

    this.overlay.querySelectorAll('[data-action="close"]').forEach((btn) => {
      btn.addEventListener("click", () => this.close());
    });

    this.saveBtn.addEventListener("click", async () => {
      this.closeDropdownMenu();
      await this.onSave?.(structuredClone(this.draft));
      this.close();
    });

    this.overlay.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;

      if (this.recordingField) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          this.recordingField = null;
          this.renderSection();
          return;
        }
        const combo = formatRecordedShortcut(e);
        if (combo) {
          this.draft.keybindings[this.recordingField] = combo;
          this.recordingField = null;
          this.renderSection();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (this.openMenuEl) {
          this.closeDropdownMenu();
          return;
        }
        this.close();
      }
    });
  }

  public isOpen(): boolean {
    return !this.overlay.classList.contains("hidden");
  }

  private getLocale(): AppLocale {
    return resolveLocale(this.draft?.language, this.systemLocale);
  }

  private updateModalChrome(): void {
    const s = STRINGS[this.getLocale()].settings;
    this.modalEl.setAttribute("aria-label", s.ariaLabel);
    this.modalTitleEl.textContent = s.title;
    this.closeIconBtn.setAttribute("aria-label", s.closeAria);
    this.cancelBtn.textContent = s.cancel;
    this.saveBtn.textContent = s.save;

    this.navButtons.forEach((btn) => {
      const labelEl = btn.querySelector("span");
      if (!labelEl) return;
      if (btn.dataset.sec === "ai") labelEl.textContent = s.navAi;
      else if (btn.dataset.sec === "terminal") labelEl.textContent = s.navTerminal;
      else if (btn.dataset.sec === "keys") labelEl.textContent = s.navKeys;
    });
  }

  public open(
    config: VeltConfig,
    models: ModelInfo[],
    status: OpenCodeStatus,
    configPath: string,
    onSave: (cfg: VeltConfig) => Promise<void>,
    onClose: () => void,
    onRefreshModels?: (showHidden: boolean) => Promise<ModelInfo[]>,
    onPreviewAppearance?: (cfg: VeltConfig) => void,
    initialSection: SettingsSection = "ai",
    systemLocale = "en"
  ): void {
    this.systemLocale = systemLocale;
    this.draft = structuredClone(config);
    this.models = models;
    this.ocStatus = status;
    this.configPath = configPath;
    this.recordingField = null;
    this.onSave = onSave;
    this.onClose = onClose;
    this.onRefreshModels = onRefreshModels;
    this.onPreviewAppearance = onPreviewAppearance;
    this.activeSection = initialSection;

    this.navButtons.forEach((b) =>
      b.classList.toggle("active", b.dataset.sec === initialSection)
    );

    const pathEl = this.overlay.querySelector('[data-role="cfg-path"]');
    if (pathEl) pathEl.textContent = this.configPath;

    this.updateModalChrome();
    this.renderSection();
    this.overlay.classList.remove("hidden");
  }

  public close(): void {
    if (!this.isOpen()) return;
    this.closeDropdownMenu();
    this.recordingField = null;
    this.overlay.classList.add("hidden");
    this.onClose?.();
  }

  private closeDropdownMenu(): void {
    if (this.openMenuEl) {
      this.openMenuEl.remove();
      this.openMenuEl = null;
    }
    if (this.openTriggerEl) {
      this.openTriggerEl.classList.remove("open");
      this.openTriggerEl = null;
    }
  }

  private createDarkDropdown(
    options: DropdownOption[],
    selectedValue: string,
    searchable: boolean,
    onChange: (value: string) => void
  ): HTMLButtonElement {
    const s = STRINGS[this.getLocale()].settings;
    const current = options.find((o) => o.value === selectedValue) || options[0];
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "velt-dropdown-trigger";
    trigger.innerHTML = `
      <span class="velt-dropdown-label">${escapeHtml(current ? current.label : selectedValue || s.selectPlaceholder)}</span>
      <span class="velt-dropdown-caret">▾</span>
    `;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasSame = this.openTriggerEl === trigger;
      this.closeDropdownMenu();
      if (wasSame) return;

      const curStrings = STRINGS[this.getLocale()].settings;
      const rect = trigger.getBoundingClientRect();
      const menu = document.createElement("div");
      menu.className = "velt-dropdown-menu";
      const minW = Math.max(rect.width, 220);
      menu.style.minWidth = `${minW}px`;
      menu.style.maxWidth = `${Math.min(480, window.innerWidth - 24)}px`;
      menu.style.left = `${Math.min(rect.left, window.innerWidth - minW - 12)}px`;

      const spaceBelow = window.innerHeight - rect.bottom - 12;
      if (spaceBelow >= 180 || spaceBelow >= rect.top) {
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.maxHeight = `${Math.min(280, Math.max(140, spaceBelow))}px`;
      } else {
        menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        menu.style.maxHeight = `${Math.min(280, Math.max(140, rect.top - 12))}px`;
      }

      let searchInput: HTMLInputElement | null = null;
      if (searchable && options.length > 6) {
        const searchWrap = document.createElement("div");
        searchWrap.className = "velt-dropdown-search";
        searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "velt-input";
        searchInput.placeholder = curStrings.filterPlaceholder;
        searchWrap.appendChild(searchInput);
        menu.appendChild(searchWrap);
      }

      const list = document.createElement("div");
      list.className = "velt-dropdown-list";
      menu.appendChild(list);

      const renderOptions = (q: string) => {
        list.innerHTML = "";
        const needle = q.trim().toLowerCase();
        const filtered = options.filter(
          (o) =>
            !needle ||
            o.label.toLowerCase().includes(needle) ||
            o.value.toLowerCase().includes(needle) ||
            (o.sub && o.sub.toLowerCase().includes(needle))
        );
        if (filtered.length === 0) {
          list.innerHTML = `<div class="velt-empty-state" style="padding:12px;">${escapeHtml(curStrings.emptyFilter)}</div>`;
          return;
        }
        for (const opt of filtered) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = `velt-dropdown-option ${opt.value === selectedValue ? "selected" : ""}`;
          item.innerHTML = `
            <span>${escapeHtml(opt.label)}</span>
            ${opt.sub ? `<span class="velt-dropdown-sub">${escapeHtml(opt.sub)}</span>` : ""}
          `;
          item.addEventListener("click", () => {
            this.closeDropdownMenu();
            onChange(opt.value);
          });
          list.appendChild(item);
        }
      };

      renderOptions("");
      searchInput?.addEventListener("input", () => renderOptions(searchInput!.value));

      this.overlay.appendChild(menu);
      trigger.classList.add("open");
      this.openMenuEl = menu;
      this.openTriggerEl = trigger;

      requestAnimationFrame(() => {
        if (searchInput) searchInput.focus();
        const selEl = list.querySelector(".selected") as HTMLElement | null;
        selEl?.scrollIntoView({ block: "nearest" });
      });
    });

    return trigger;
  }

  private renderSection(): void {
    this.closeDropdownMenu();
    if (this.activeSection === "ai") this.renderAiSection();
    else if (this.activeSection === "terminal") this.renderTerminalSection();
    else this.renderKeysSection();
  }

  private buildModelOptions(extraId?: string): DropdownOption[] {
    const opts: DropdownOption[] = this.models.map((m) => ({
      value: m.id,
      label: m.name,
      sub: m.provider,
    }));
    if (extraId && !opts.some((o) => o.value === extraId)) {
      opts.unshift({ value: extraId, label: extraId, sub: "config" });
    }
    return opts;
  }

  private renderAiSection(): void {
    const ai = STRINGS[this.getLocale()].settings.ai;
    const selectedModelObj = this.models.find((m) => m.id === this.draft.default_model);
    const efforts = effectiveEfforts(selectedModelObj);
    if (!efforts.includes(this.draft.default_effort)) {
      this.draft.default_effort = efforts[0] ?? "default";
    }

    const statusBadge = this.ocStatus.available
      ? `<span class="velt-status-ok">${escapeHtml(ai.connected(this.ocStatus.version || "opencode-cli"))}</span>`
      : `<span class="velt-status-err">${escapeHtml(ai.notFound(this.ocStatus.error || ai.verifyPath))}</span>`;

    this.bodyEl.innerHTML = `
      <div class="velt-section-block">
        <h3>${escapeHtml(ai.defaultTitle)}</h3>
        <p class="velt-help">${escapeHtml(ai.defaultHelp)}</p>
        <div class="velt-grid-2">
          <div class="velt-field">
            <span>${escapeHtml(ai.defaultModel)}</span>
            <div data-slot="default-model"></div>
          </div>
          <div class="velt-field">
            <span>${escapeHtml(ai.defaultEffort)}</span>
            <div data-slot="default-effort"></div>
          </div>
        </div>
      </div>

      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>${escapeHtml(ai.presetsTitle)}</h3>
            <p class="velt-help">${escapeHtml(ai.presetsHelp)}</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="add-preset">${iconPlus(12)} <span>${escapeHtml(ai.addPreset)}</span></button>
        </div>
        <div class="velt-presets-editor" data-role="presets-list"></div>
      </div>

      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>${escapeHtml(ai.exitTitle)}</h3>
            <p class="velt-help">${escapeHtml(ai.exitHelp)}</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="reset-ai">${iconReset(12)} <span>${escapeHtml(ai.resetAi)}</span></button>
        </div>
        <div class="velt-grid-2">
          <div class="velt-field">
            <span>${escapeHtml(ai.exitModeLabel)}</span>
            <div data-slot="agent-exit-mode"></div>
          </div>
          <div class="velt-field">
            <span>${escapeHtml(ai.cmdStyleLabel)}</span>
            <div data-slot="agent-cmd-style"></div>
          </div>
        </div>
        <div class="velt-toggles" style="margin-top: 10px;">
          ${switchHtml("agent_live_think_bar", ai.liveThinkBar, this.draft.agent_live_think_bar ?? true)}
          ${switchHtml("show_tool_output_in_agent", ai.toolOutputInAgent, this.draft.show_tool_output_in_agent ?? true)}
          ${switchHtml("show_thinking", ai.showThinking, this.draft.show_thinking)}
        </div>
      </div>

      <div class="velt-section-block">
        <h3>${escapeHtml(ai.cliTitle)}</h3>
        <div class="velt-status-row">
          <span>${escapeHtml(ai.statusLabel)} ${statusBadge}</span>
          ${this.ocStatus.binaryPath ? `<span class="velt-muted">${escapeHtml(this.ocStatus.binaryPath)}</span>` : ""}
        </div>
        <div class="velt-toggles">
          ${switchHtml("auto_context", ai.autoContext, this.draft.auto_context)}
          ${switchHtml("redact_secrets", ai.redactSecrets, this.draft.redact_secrets ?? true)}
          ${switchHtml("auto_approve", ai.autoApprove, this.draft.auto_approve)}
          ${switchHtml("show_hidden_models", ai.showHiddenModels, this.draft.show_hidden_models)}
          ${switchHtml("show_model_in_shell", ai.showModelInShell, Boolean(this.draft.show_model_in_shell))}
        </div>
        <div class="velt-grid-2">
          <label class="velt-field">
            <span>${escapeHtml(ai.contextLines)}</span>
            <input type="number" min="10" max="300" class="velt-input" data-bind="context_lines" value="${this.draft.context_lines}" />
          </label>
          <label class="velt-field">
            <span>${escapeHtml(ai.opencodeBin)}</span>
            <input type="text" class="velt-input" data-bind="opencode_bin" value="${escapeAttr(this.draft.opencode_bin)}" placeholder="${escapeAttr(ai.autoDetected)}" />
          </label>
        </div>
      </div>
    `;

    const modelSlot = this.bodyEl.querySelector('[data-slot="default-model"]')!;
    modelSlot.appendChild(
      this.createDarkDropdown(
        this.buildModelOptions(this.draft.default_model),
        this.draft.default_model,
        true,
        (val) => {
          this.draft.default_model = val;
          this.renderAiSection();
        }
      )
    );

    const effortSlot = this.bodyEl.querySelector('[data-slot="default-effort"]')!;
    effortSlot.appendChild(
      this.createDarkDropdown(
        efforts.map((e) => ({ value: e, label: e })),
        this.draft.default_effort,
        false,
        (val) => {
          this.draft.default_effort = val;
          this.renderAiSection();
        }
      )
    );

    const exitModeSlot = this.bodyEl.querySelector('[data-slot="agent-exit-mode"]')!;
    exitModeSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "commands_only", label: ai.exitModeCommands, sub: ai.exitModeCommandsSub },
          { value: "clean", label: ai.exitModeClean, sub: ai.exitModeCleanSub },
          { value: "keep_all", label: ai.exitModeKeep, sub: ai.exitModeKeepSub },
        ],
        this.draft.agent_exit_mode || "commands_only",
        false,
        (val) => {
          this.draft.agent_exit_mode = val as VeltConfig["agent_exit_mode"];
          this.renderAiSection();
        }
      )
    );

    const cmdStyleSlot = this.bodyEl.querySelector('[data-slot="agent-cmd-style"]')!;
    cmdStyleSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "shell", label: ai.cmdStyleShell, sub: ai.cmdStyleShellSub },
          { value: "tagged", label: ai.cmdStyleTagged, sub: ai.cmdStyleTaggedSub },
          { value: "minimal", label: ai.cmdStyleMinimal, sub: ai.cmdStyleMinimalSub },
        ],
        this.draft.agent_cmd_style || "shell",
        false,
        (val) => {
          this.draft.agent_cmd_style = val as VeltConfig["agent_cmd_style"];
          this.renderAiSection();
        }
      )
    );

    this.bodyEl.querySelector('[data-bind="agent_live_think_bar"]')?.addEventListener("change", (e) => {
      this.draft.agent_live_think_bar = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="show_tool_output_in_agent"]')?.addEventListener("change", (e) => {
      this.draft.show_tool_output_in_agent = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="auto_context"]')?.addEventListener("change", (e) => {
      this.draft.auto_context = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="redact_secrets"]')?.addEventListener("change", (e) => {
      this.draft.redact_secrets = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="show_thinking"]')?.addEventListener("change", (e) => {
      this.draft.show_thinking = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="auto_approve"]')?.addEventListener("change", (e) => {
      this.draft.auto_approve = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="show_hidden_models"]')?.addEventListener("change", async (e) => {
      this.draft.show_hidden_models = (e.target as HTMLInputElement).checked;
      if (this.onRefreshModels) {
        this.models = await this.onRefreshModels(this.draft.show_hidden_models);
        this.renderAiSection();
      }
    });
    this.bodyEl.querySelector('[data-bind="show_model_in_shell"]')?.addEventListener("change", (e) => {
      this.draft.show_model_in_shell = (e.target as HTMLInputElement).checked;
    });
    this.bodyEl.querySelector('[data-bind="context_lines"]')?.addEventListener("input", (e) => {
      this.draft.context_lines = Math.max(10, Number((e.target as HTMLInputElement).value) || 60);
    });
    this.bodyEl.querySelector('[data-bind="opencode_bin"]')?.addEventListener("input", (e) => {
      this.draft.opencode_bin = (e.target as HTMLInputElement).value;
    });

    this.bodyEl.querySelector('[data-action="reset-ai"]')?.addEventListener("click", async () => {
      const def = await invoke<VeltConfig>("get_default_config");
      this.draft.auto_context = def.auto_context;
      this.draft.redact_secrets = def.redact_secrets;
      this.draft.context_lines = def.context_lines;
      this.draft.show_thinking = def.show_thinking;
      this.draft.agent_exit_mode = def.agent_exit_mode;
      this.draft.agent_cmd_style = def.agent_cmd_style;
      this.draft.agent_live_think_bar = def.agent_live_think_bar;
      this.draft.show_tool_output_in_agent = def.show_tool_output_in_agent;
      this.draft.auto_approve = def.auto_approve;
      this.draft.show_model_in_shell = def.show_model_in_shell;
      this.renderAiSection();
    });

    this.bodyEl.querySelector('[data-action="add-preset"]')?.addEventListener("click", () => {
      const id = `preset-${Date.now()}`;
      this.draft.presets.push({
        id,
        name: ai.newPresetDefaultName,
        model: this.draft.default_model,
        effort: this.draft.default_effort,
      });
      this.renderAiSection();
    });

    this.renderPresetsEditor();
  }

  private renderPresetsEditor(): void {
    const container = this.bodyEl.querySelector('[data-role="presets-list"]');
    if (!container) return;
    container.innerHTML = "";

    const ai = STRINGS[this.getLocale()].settings.ai;

    this.draft.presets.forEach((p: Preset, idx: number) => {
      const row = document.createElement("div");
      row.className = "velt-preset-row";

      const mObj = this.models.find((m) => m.id === p.model);
      const effs = effectiveEfforts(mObj);
      if (!effs.includes(p.effort)) p.effort = effs[0] ?? "default";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "velt-input velt-preset-name";
      nameInput.value = p.name;
      nameInput.placeholder = ai.presetNamePlaceholder;
      nameInput.addEventListener("input", () => {
        p.name = nameInput.value;
      });

      const modelDd = this.createDarkDropdown(
        this.buildModelOptions(p.model),
        p.model,
        true,
        (val) => {
          p.model = val;
          this.renderPresetsEditor();
        }
      );

      const effortDd = this.createDarkDropdown(
        effs.map((e) => ({ value: e, label: e })),
        p.effort,
        false,
        (val) => {
          p.effort = val;
          this.renderPresetsEditor();
        }
      );

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "velt-icon-btn velt-danger-btn";
      delBtn.title = ai.removePreset;
      delBtn.innerHTML = iconClose(12);
      delBtn.addEventListener("click", () => {
        this.draft.presets.splice(idx, 1);
        this.renderPresetsEditor();
      });

      row.appendChild(nameInput);
      row.appendChild(modelDd);
      row.appendChild(effortDd);
      row.appendChild(delBtn);

      container.appendChild(row);
    });
  }

  private renderTerminalSection(): void {
    const locale = this.getLocale();
    const termStrings = STRINGS[locale].settings.terminal;
    const activeTheme = this.draft.theme || "velt-obsidian";
    const themeObj = getThemeById(activeTheme);
    const customAccent = isValidHexColor(this.draft.accent_override)
      ? this.draft.accent_override
      : "";
    const pickerColor = customAccent || themeObj.accent;
    const blurEnabled = this.draft.blur ?? true;
    const blurRadius = this.draft.blur_radius ?? 16;
    const opacityPct = Math.round(this.draft.opacity * 100);
    const uiRadius = this.draft.ui_radius ?? 10;
    const termPadding = this.draft.terminal_padding ?? 10;

    const accentPresets = [
      { label: termStrings.accentPresets.cyan, hex: "#26c6ff" },
      { label: termStrings.accentPresets.indigo, hex: "#7aa2f7" },
      { label: termStrings.accentPresets.lavender, hex: "#cba6f7" },
      { label: termStrings.accentPresets.emerald, hex: "#4ade80" },
      { label: termStrings.accentPresets.amber, hex: "#fabd2f" },
      { label: termStrings.accentPresets.coral, hex: "#fb7185" },
      { label: termStrings.accentPresets.orange, hex: "#f97316" },
    ];

    const accentSwatchesHtml = accentPresets
      .map((s) => {
        const isSel = customAccent.toLowerCase() === s.hex.toLowerCase();
        return `<button type="button" class="velt-accent-swatch ${isSel ? "active" : ""}" data-accent-hex="${s.hex}" title="${escapeAttr(s.label)} (${s.hex})" style="--swatch:${s.hex}"></button>`;
      })
      .join("");

    const themeCardsHtml = VELT_THEMES.map((t) => {
      const selected = t.id === activeTheme;
      return `
        <button type="button" class="velt-theme-card ${selected ? "active" : ""}" data-theme-id="${escapeAttr(t.id)}">
          <div class="velt-theme-swatch" style="background:${t.bg};">
            <div class="velt-theme-swatch-bar" style="background:${t.surface};">
              <span class="velt-theme-swatch-dot" style="background:${t.red};"></span>
              <span class="velt-theme-swatch-dot" style="background:${t.amber};"></span>
              <span class="velt-theme-swatch-dot" style="background:${t.green};"></span>
            </div>
            <div class="velt-theme-swatch-body">
              <div class="velt-theme-swatch-line" style="width:72%;background:${t.text};opacity:0.85;"></div>
              <div class="velt-theme-swatch-palette">
                <span class="velt-theme-swatch-dot" style="width:8px;height:4px;background:${t.accent};"></span>
                <span class="velt-theme-swatch-dot" style="width:5px;height:4px;background:${t.terminal.green};"></span>
                <span class="velt-theme-swatch-dot" style="width:5px;height:4px;background:${t.terminal.magenta};"></span>
              </div>
            </div>
          </div>
          <div class="velt-theme-meta">
            <span class="velt-theme-name">${escapeHtml(t.name)}</span>
            <span class="velt-theme-tagline">${escapeHtml(getThemeTagline(t, locale))}</span>
          </div>
          ${selected ? `<span class="velt-theme-check">${iconCheck(11)}</span>` : ""}
        </button>
      `;
    }).join("");

    this.bodyEl.innerHTML = `
      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>${escapeHtml(termStrings.themeTitle)}</h3>
            <p class="velt-help">${escapeHtml(termStrings.themeHelp)}</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="reset-terminal">${iconReset(12)} <span>${escapeHtml(termStrings.resetTerminal)}</span></button>
        </div>
        <div class="velt-theme-grid" data-role="theme-grid">
          ${themeCardsHtml}
        </div>
      </div>

      <div class="velt-section-block">
        <h3>${escapeHtml(termStrings.customTitle)}</h3>
        <p class="velt-help">${escapeHtml(termStrings.customHelp)}</p>
        <div class="velt-field" style="margin-bottom: 10px;">
          <span>${escapeHtml(termStrings.languageLabel)}</span>
          <div data-slot="ui-language"></div>
        </div>
        <div class="velt-accent-bar">
          <span class="velt-accent-label">${escapeHtml(termStrings.accentLabel)}</span>
          <div class="velt-accent-swatches">
            <button type="button" class="velt-accent-reset ${!customAccent ? "active" : ""}" data-action="reset-accent" title="${escapeAttr(termStrings.accentThemeTitle)}">${escapeHtml(termStrings.accentThemeBtn)}</button>
            ${accentSwatchesHtml}
            <label class="velt-color-picker-wrap" title="${escapeAttr(termStrings.accentPickerTitle)}">
              <input type="color" class="velt-color-input" data-bind="accent_picker" value="${escapeAttr(pickerColor)}" />
              <span>${customAccent || escapeHtml(termStrings.accentCustom)}</span>
            </label>
          </div>
        </div>
        <div class="velt-grid-2" style="margin-top: 10px;">
          <div class="velt-field">
            <span>${escapeHtml(termStrings.backdropLabel)}</span>
            <div data-slot="ui-backdrop-style"></div>
          </div>
          <div class="velt-field">
            <span>${escapeHtml(termStrings.agentAuraLabel)}</span>
            <div data-slot="agent-aura"></div>
          </div>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.uiRadius)} <strong data-role="radius-val">${uiRadius}px</strong></span>
            <input type="range" class="velt-range" min="0" max="18" step="1" data-bind="ui_radius" value="${uiRadius}" />
          </label>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.termPadding)} <strong data-role="pad-val">${termPadding}px</strong></span>
            <input type="range" class="velt-range" min="2" max="28" step="1" data-bind="terminal_padding" value="${termPadding}" />
          </label>
        </div>
        <div class="velt-toggles" style="margin-top: 10px;">
          ${switchHtml("show_status_bar", termStrings.showStatusBar, this.draft.show_status_bar ?? true)}
          ${switchHtml("compact_chrome", termStrings.compactChrome, Boolean(this.draft.compact_chrome))}
          ${switchHtml("cursor_blink", termStrings.cursorBlink, this.draft.cursor_blink ?? true)}
          ${switchHtml("focus_follows_mouse", termStrings.focusFollowsMouse, Boolean(this.draft.focus_follows_mouse))}
          ${switchHtml("copy_on_select", termStrings.copyOnSelect, Boolean(this.draft.copy_on_select))}
          ${switchHtml("middle_click_paste", termStrings.middleClickPaste, this.draft.middle_click_paste ?? true)}
          ${switchHtml("webgl_renderer", termStrings.webglRenderer, this.draft.webgl_renderer ?? true)}
        </div>
      </div>

      <div class="velt-section-block">
        <h3>${escapeHtml(termStrings.glassTitle)}</h3>
        <div class="velt-toggles">
          ${switchHtml("blur", termStrings.blurToggle, blurEnabled)}
          ${switchHtml("animations", termStrings.animationsToggle, this.draft.animations ?? true)}
        </div>
        <div class="velt-grid-2">
          <label class="velt-field">
            <span>${escapeHtml(termStrings.opacityLabel)} <strong data-role="op-val">${opacityPct}%</strong></span>
            <input type="range" class="velt-range" min="0.35" max="1" step="0.01" data-bind="opacity" value="${this.draft.opacity}" />
          </label>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.blurRadiusLabel)} <strong data-role="blur-val">${blurEnabled ? `${blurRadius}px` : escapeHtml(termStrings.blurOff)}</strong></span>
            <input type="range" class="velt-range" min="0" max="40" step="1" data-bind="blur_radius" value="${blurRadius}" ${blurEnabled ? "" : "disabled"} />
          </label>
        </div>
      </div>

      <div class="velt-section-block">
        <h3>${escapeHtml(termStrings.typoTitle)}</h3>
        <div class="velt-grid-2">
          <label class="velt-field">
            <span>${escapeHtml(termStrings.fontFamily)}</span>
            <input type="text" class="velt-input" data-bind="font_family" value="${escapeAttr(this.draft.font_family)}" />
          </label>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.shellLabel)}</span>
            <input type="text" class="velt-input" data-bind="shell" value="${escapeAttr(this.draft.shell)}" placeholder="${escapeAttr(termStrings.shellPlaceholder)}" />
          </label>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.fontSize)}</span>
            <input type="number" min="9" max="32" class="velt-input" data-bind="font_size" value="${this.draft.font_size}" />
          </label>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.lineHeight)}</span>
            <input type="number" step="0.05" min="1.0" max="2.0" class="velt-input" data-bind="line_height" value="${this.draft.line_height}" />
          </label>
          <div class="velt-field">
            <span>${escapeHtml(termStrings.cursorStyle)}</span>
            <div data-slot="cursor-style"></div>
          </div>
          <label class="velt-field">
            <span>${escapeHtml(termStrings.scrollback)}</span>
            <input type="number" min="500" max="100000" step="500" class="velt-input" data-bind="scrollback" value="${this.draft.scrollback}" />
          </label>
        </div>
      </div>
    `;

    const langSlot = this.bodyEl.querySelector('[data-slot="ui-language"]')!;
    langSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "auto", label: termStrings.langAuto, sub: termStrings.langAutoSub },
          { value: "it", label: termStrings.langIt },
          { value: "en", label: termStrings.langEn },
        ],
        this.draft.language || "auto",
        false,
        (val) => {
          this.draft.language = val as VeltConfig["language"];
          this.onPreviewAppearance?.(structuredClone(this.draft));
          this.updateModalChrome();
          this.renderTerminalSection();
        }
      )
    );

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".velt-theme-card").forEach((card) => {
      card.addEventListener("click", () => {
        const themeId = card.dataset.themeId;
        if (!themeId) return;
        this.draft.theme = themeId;
        this.onPreviewAppearance?.(structuredClone(this.draft));
        this.renderTerminalSection();
      });
    });

    this.bodyEl.querySelector('[data-action="reset-accent"]')?.addEventListener("click", () => {
      this.draft.accent_override = "";
      this.onPreviewAppearance?.(structuredClone(this.draft));
      this.renderTerminalSection();
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".velt-accent-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hex = btn.dataset.accentHex;
        if (!hex) return;
        this.draft.accent_override = hex;
        this.onPreviewAppearance?.(structuredClone(this.draft));
        this.renderTerminalSection();
      });
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-bind="accent_picker"]')?.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.draft.accent_override = val;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-bind="accent_picker"]')?.addEventListener("change", () => {
      this.renderTerminalSection();
    });

    const backdropSlot = this.bodyEl.querySelector('[data-slot="ui-backdrop-style"]')!;
    backdropSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "aurora", label: termStrings.backdropAurora, sub: termStrings.backdropAuroraSub },
          { value: "subtle", label: termStrings.backdropSubtle, sub: termStrings.backdropSubtleSub },
          { value: "flat", label: termStrings.backdropFlat, sub: termStrings.backdropFlatSub },
        ],
        this.draft.ui_backdrop_style || "aurora",
        false,
        (val) => {
          this.draft.ui_backdrop_style = val as VeltConfig["ui_backdrop_style"];
          this.onPreviewAppearance?.(structuredClone(this.draft));
          this.renderTerminalSection();
        }
      )
    );

    const auraSlot = this.bodyEl.querySelector('[data-slot="agent-aura"]')!;
    auraSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "vivid", label: termStrings.auraVivid, sub: termStrings.auraVividSub },
          { value: "minimal", label: termStrings.auraMinimal, sub: termStrings.auraMinimalSub },
          { value: "off", label: termStrings.auraOff, sub: termStrings.auraOffSub },
        ],
        this.draft.agent_aura || "vivid",
        false,
        (val) => {
          this.draft.agent_aura = val as VeltConfig["agent_aura"];
          this.onPreviewAppearance?.(structuredClone(this.draft));
          this.renderTerminalSection();
        }
      )
    );

    this.bodyEl.querySelector('[data-bind="ui_radius"]')?.addEventListener("input", (e) => {
      const val = Math.min(18, Math.max(0, Number((e.target as HTMLInputElement).value) || 0));
      this.draft.ui_radius = val;
      const lbl = this.bodyEl.querySelector('[data-role="radius-val"]');
      if (lbl) lbl.textContent = `${val}px`;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector('[data-bind="terminal_padding"]')?.addEventListener("input", (e) => {
      const val = Math.min(28, Math.max(2, Number((e.target as HTMLInputElement).value) || 10));
      this.draft.terminal_padding = val;
      const lbl = this.bodyEl.querySelector('[data-role="pad-val"]');
      if (lbl) lbl.textContent = `${val}px`;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector('[data-bind="show_status_bar"]')?.addEventListener("change", (e) => {
      this.draft.show_status_bar = (e.target as HTMLInputElement).checked;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector('[data-bind="compact_chrome"]')?.addEventListener("change", (e) => {
      this.draft.compact_chrome = (e.target as HTMLInputElement).checked;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector('[data-action="reset-terminal"]')?.addEventListener("click", async () => {
      const def = await invoke<VeltConfig>("get_default_config");
      this.draft.language = def.language;
      this.draft.theme = def.theme;
      this.draft.accent_override = def.accent_override;
      this.draft.ui_backdrop_style = def.ui_backdrop_style;
      this.draft.agent_aura = def.agent_aura;
      this.draft.ui_radius = def.ui_radius;
      this.draft.terminal_padding = def.terminal_padding;
      this.draft.show_status_bar = def.show_status_bar;
      this.draft.compact_chrome = def.compact_chrome;
      this.draft.cursor_blink = def.cursor_blink;
      this.draft.cursor_style = def.cursor_style;
      this.draft.copy_on_select = def.copy_on_select;
      this.draft.middle_click_paste = def.middle_click_paste;
      this.draft.focus_follows_mouse = def.focus_follows_mouse;
      this.draft.webgl_renderer = def.webgl_renderer;
      this.draft.blur = def.blur;
      this.draft.blur_radius = def.blur_radius;
      this.draft.opacity = def.opacity;
      this.draft.animations = def.animations;
      this.draft.font_family = def.font_family;
      this.draft.font_size = def.font_size;
      this.draft.line_height = def.line_height;
      this.draft.scrollback = def.scrollback;
      this.onPreviewAppearance?.(structuredClone(this.draft));
      this.updateModalChrome();
      this.renderTerminalSection();
    });

    this.bodyEl.querySelector('[data-bind="cursor_blink"]')?.addEventListener("change", (e) => {
      this.draft.cursor_blink = (e.target as HTMLInputElement).checked;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector('[data-bind="focus_follows_mouse"]')?.addEventListener("change", (e) => {
      this.draft.focus_follows_mouse = (e.target as HTMLInputElement).checked;
    });

    this.bodyEl.querySelector('[data-bind="copy_on_select"]')?.addEventListener("change", (e) => {
      this.draft.copy_on_select = (e.target as HTMLInputElement).checked;
    });

    this.bodyEl.querySelector('[data-bind="middle_click_paste"]')?.addEventListener("change", (e) => {
      this.draft.middle_click_paste = (e.target as HTMLInputElement).checked;
    });

    this.bodyEl.querySelector('[data-bind="webgl_renderer"]')?.addEventListener("change", (e) => {
      this.draft.webgl_renderer = (e.target as HTMLInputElement).checked;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    const cursorSlot = this.bodyEl.querySelector('[data-slot="cursor-style"]')!;
    cursorSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "block", label: termStrings.cursorBlock },
          { value: "bar", label: termStrings.cursorBar },
          { value: "underline", label: termStrings.cursorUnderline },
        ],
        this.draft.cursor_style,
        false,
        (val) => {
          this.draft.cursor_style = val as VeltConfig["cursor_style"];
          this.onPreviewAppearance?.(structuredClone(this.draft));
          this.renderTerminalSection();
        }
      )
    );

    const blurSlider = this.bodyEl.querySelector<HTMLInputElement>('[data-bind="blur_radius"]');
    const blurLbl = this.bodyEl.querySelector('[data-role="blur-val"]');

    this.bodyEl.querySelector('[data-bind="blur"]')?.addEventListener("change", (e) => {
      this.draft.blur = (e.target as HTMLInputElement).checked;
      if (blurSlider) blurSlider.disabled = !this.draft.blur;
      if (blurLbl) {
        blurLbl.textContent = this.draft.blur ? `${this.draft.blur_radius}px` : termStrings.blurOff;
      }
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    blurSlider?.addEventListener("input", (e) => {
      const val = Math.min(40, Math.max(0, Number((e.target as HTMLInputElement).value) || 0));
      this.draft.blur_radius = val;
      if (blurLbl) blurLbl.textContent = this.draft.blur ? `${val}px` : termStrings.blurOff;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    this.bodyEl.querySelector('[data-bind="animations"]')?.addEventListener("change", (e) => {
      this.draft.animations = (e.target as HTMLInputElement).checked;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });
    this.bodyEl.querySelector('[data-bind="font_family"]')?.addEventListener("input", (e) => {
      this.draft.font_family = (e.target as HTMLInputElement).value;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });
    this.bodyEl.querySelector('[data-bind="shell"]')?.addEventListener("input", (e) => {
      this.draft.shell = (e.target as HTMLInputElement).value;
    });
    this.bodyEl.querySelector('[data-bind="font_size"]')?.addEventListener("input", (e) => {
      this.draft.font_size = Math.min(32, Math.max(9, Number((e.target as HTMLInputElement).value) || 14));
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });
    this.bodyEl.querySelector('[data-bind="line_height"]')?.addEventListener("input", (e) => {
      this.draft.line_height = Math.min(2, Math.max(1, Number((e.target as HTMLInputElement).value) || 1.32));
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });
    this.bodyEl.querySelector('[data-bind="scrollback"]')?.addEventListener("input", (e) => {
      this.draft.scrollback = Math.max(500, Number((e.target as HTMLInputElement).value) || 10000);
    });
    this.bodyEl.querySelector('[data-bind="opacity"]')?.addEventListener("input", (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.draft.opacity = val;
      const lbl = this.bodyEl.querySelector('[data-role="op-val"]');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });
  }

  private renderKeysSection(): void {
    const keysStrings = STRINGS[this.getLocale()].settings.keys;
    const keyOrder: Array<keyof Keybindings> = [
      "toggle_agent",
      "toggle_agent_alt",
      "select_all",
      "model_switcher",
      "cycle_effort",
      "insert_command",
      "new_agent_session",
      "split_vertical",
      "split_horizontal",
      "close_pane",
      "new_tab",
      "close_tab",
      "open_settings",
    ];

    this.bodyEl.innerHTML = `
      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>${escapeHtml(keysStrings.title)}</h3>
            <p class="velt-help">${keysStrings.helpHtml}</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="reset-keys">${iconReset(12)} <span>${escapeHtml(keysStrings.resetKeys)}</span></button>
        </div>
        <div class="velt-keys-list" data-role="keys"></div>
      </div>
    `;

    this.bodyEl.querySelector('[data-action="reset-keys"]')?.addEventListener("click", async () => {
      const def = await invoke<VeltConfig>("get_default_config");
      this.draft.keybindings = structuredClone(def.keybindings);
      this.recordingField = null;
      this.renderKeysSection();
    });

    const list = this.bodyEl.querySelector('[data-role="keys"]')!;
    keyOrder.forEach((key) => {
      const [title, desc] = keysStrings.items[key];
      const row = document.createElement("div");
      row.className = "velt-key-row";
      const isRec = this.recordingField === key;
      const val = this.draft.keybindings[key];
      const wmWarn =
        val.toLowerCase() === "alt+space"
          ? `<span class="velt-warn-tag">${escapeHtml(keysStrings.wmConflict)}</span>`
          : "";

      row.innerHTML = `
        <div>
          <div class="velt-key-title">${escapeHtml(title)} ${wmWarn}</div>
          <div class="velt-key-desc">${escapeHtml(desc)}</div>
        </div>
        <button type="button" class="velt-kbd-btn ${isRec ? "recording" : ""}">
          ${isRec ? escapeHtml(keysStrings.recording) : escapeHtml(val)}
        </button>
      `;

      row.querySelector("button")?.addEventListener("click", () => {
        this.recordingField = key;
        this.renderKeysSection();
      });

      list.appendChild(row);
    });
  }
}

function switchHtml(bind: string, label: string, checked: boolean): string {
  return `
    <label class="velt-switch-row">
      <span class="velt-switch">
        <input type="checkbox" data-bind="${bind}" ${checked ? "checked" : ""} />
        <span class="velt-switch-track"><span class="velt-switch-thumb"></span></span>
      </span>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
