import { invoke } from "@tauri-apps/api/core";
import { formatRecordedShortcut } from "../keybindings";
import { VELT_THEMES, getThemeById, isValidHexColor } from "../themes";
import type { Keybindings, ModelInfo, OpenCodeStatus, Preset, VeltConfig } from "../types";
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
  private bodyEl: HTMLDivElement;
  private navButtons: NodeListOf<HTMLButtonElement>;
  private activeSection: SettingsSection = "ai";
  private openMenuEl: HTMLDivElement | null = null;
  private openTriggerEl: HTMLButtonElement | null = null;

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
    this.overlay.innerHTML = `
      <div class="velt-modal velt-settings" role="dialog" aria-label="Impostazioni Velt">
        <div class="velt-modal-header">
          <div class="velt-modal-title">
            ${veltLogoSvg(20)}
            <span>Impostazioni Velt</span>
          </div>
          <button type="button" class="velt-icon-btn" data-action="close" aria-label="Chiudi">${iconClose(14)}</button>
        </div>

        <div class="velt-settings-layout">
          <nav class="velt-settings-nav">
            <button type="button" class="velt-nav-item active" data-sec="ai">${iconCpu(14)} <span>OpenCode &amp; Modelli</span></button>
            <button type="button" class="velt-nav-item" data-sec="terminal">${iconSliders(14)} <span>Terminale &amp; Aspetto</span></button>
            <button type="button" class="velt-nav-item" data-sec="keys">${iconKeyboard(14)} <span>Scorciatoie</span></button>
          </nav>

          <div class="velt-settings-body" data-role="body"></div>
        </div>

        <div class="velt-modal-footer">
          <span class="velt-config-path" data-role="cfg-path"></span>
          <div class="velt-footer-actions">
            <button type="button" class="velt-btn velt-btn-ghost" data-action="close">Annulla</button>
            <button type="button" class="velt-btn velt-btn-primary" data-action="save">Salva impostazioni</button>
          </div>
        </div>
      </div>
    `;

    root.appendChild(this.overlay);
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
      if (this.openMenuEl && !this.openMenuEl.contains(target) && !this.openTriggerEl?.contains(target)) {
        this.closeDropdownMenu();
      }
      if (e.target === this.overlay) this.close();
    });

    this.bodyEl.addEventListener("scroll", () => this.closeDropdownMenu());

    this.overlay.querySelectorAll('[data-action="close"]').forEach((btn) => {
      btn.addEventListener("click", () => this.close());
    });

    this.overlay.querySelector('[data-action="save"]')?.addEventListener("click", async () => {
      this.closeDropdownMenu();
      await this.onSave?.(structuredClone(this.draft));
      this.close();
    });

    this.overlay.addEventListener("keydown", (e) => {
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

  public open(
    config: VeltConfig,
    models: ModelInfo[],
    status: OpenCodeStatus,
    configPath: string,
    onSave: (cfg: VeltConfig) => Promise<void>,
    onClose: () => void,
    onRefreshModels?: (showHidden: boolean) => Promise<ModelInfo[]>,
    onPreviewAppearance?: (cfg: VeltConfig) => void,
    initialSection: SettingsSection = "ai"
  ): void {
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

    this.navButtons.forEach((b) => b.classList.toggle("active", b.dataset.sec === initialSection));

    const pathEl = this.overlay.querySelector('[data-role="cfg-path"]');
    if (pathEl) pathEl.textContent = this.configPath;

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
    const current = options.find((o) => o.value === selectedValue) || options[0];
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "velt-dropdown-trigger";
    trigger.innerHTML = `
      <span class="velt-dropdown-label">${escapeHtml(current ? current.label : selectedValue || "Seleziona...")}</span>
      <span class="velt-dropdown-caret">▾</span>
    `;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasSame = this.openTriggerEl === trigger;
      this.closeDropdownMenu();
      if (wasSame) return;

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
        searchInput.placeholder = "Filtra...";
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
          list.innerHTML = `<div class="velt-empty-state" style="padding:12px;">Nessun risultato</div>`;
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
    const selectedModelObj = this.models.find((m) => m.id === this.draft.default_model);
    const efforts = effectiveEfforts(selectedModelObj);
    if (!efforts.includes(this.draft.default_effort)) {
      this.draft.default_effort = efforts[0] ?? "default";
    }

    const statusBadge = this.ocStatus.available
      ? `<span class="velt-status-ok">Connesso (${escapeHtml(this.ocStatus.version || "opencode-cli")})</span>`
      : `<span class="velt-status-err">Non trovato: ${escapeHtml(this.ocStatus.error || "verifica percorso")}</span>`;

    this.bodyEl.innerHTML = `
      <div class="velt-section-block">
        <h3>Combinazione predefinita all'avvio</h3>
        <p class="velt-help">Scelta automaticamente per ogni nuovo tab e alla riapertura di Velt.</p>
        <div class="velt-grid-2">
          <div class="velt-field">
            <span>Modello predefinito</span>
            <div data-slot="default-model"></div>
          </div>
          <div class="velt-field">
            <span>Reasoning Effort predefinito</span>
            <div data-slot="default-effort"></div>
          </div>
        </div>
      </div>

      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>Preset rapidi</h3>
            <p class="velt-help">Combinazioni pronte da richiamare con un clic o numero nel Quick Switcher.</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="add-preset">${iconPlus(12)} <span>Aggiungi preset</span></button>
        </div>
        <div class="velt-presets-editor" data-role="presets-list"></div>
      </div>

      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>Uscita da Agent Mode &amp; Ragionamento</h3>
            <p class="velt-help">Scegli cosa resta visibile nel terminale quando torni alla shell e come mostrare pensieri e comandi.</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="reset-ai">${iconReset(12)} <span>Predefiniti AI</span></button>
        </div>
        <div class="velt-grid-2">
          <div class="velt-field">
            <span>All'uscita dall'Agent Mode</span>
            <div data-slot="agent-exit-mode"></div>
          </div>
          <div class="velt-field">
            <span>Stile comandi agente in Shell Mode</span>
            <div data-slot="agent-cmd-style"></div>
          </div>
        </div>
        <div class="velt-toggles" style="margin-top: 10px;">
          ${switchHtml("agent_live_think_bar", "Mostra barra live del ragionamento nel Dock mentre OpenCode pensa", this.draft.agent_live_think_bar ?? true)}
          ${switchHtml("show_tool_output_in_agent", "Mostra anteprima compatta dell'output dei comandi dentro Agent Mode", this.draft.show_tool_output_in_agent ?? true)}
          ${switchHtml("show_thinking", "Scrivi anche il riquadro ragionamento completo nello scrollback", this.draft.show_thinking)}
        </div>
      </div>

      <div class="velt-section-block">
        <h3>Integrazione OpenCode CLI</h3>
        <div class="velt-status-row">
          <span>Stato: ${statusBadge}</span>
          ${this.ocStatus.binaryPath ? `<span class="velt-muted">${escapeHtml(this.ocStatus.binaryPath)}</span>` : ""}
        </div>
        <div class="velt-toggles">
          ${switchHtml("auto_context", "Includi automaticamente directory e ultime righe del terminale", this.draft.auto_context)}
          ${switchHtml("auto_approve", "Auto-approva esecuzione tool OpenCode (--auto)", this.draft.auto_approve)}
          ${switchHtml("show_hidden_models", "Mostra anche i modelli nascosti in OpenCode Desktop", this.draft.show_hidden_models)}
          ${switchHtml("show_model_in_shell", "Mostra selettore modello nella barra anche in modalità terminale (Shell)", Boolean(this.draft.show_model_in_shell))}
        </div>
        <div class="velt-grid-2">
          <label class="velt-field">
            <span>Righe di contesto terminale</span>
            <input type="number" min="10" max="300" class="velt-input" data-bind="context_lines" value="${this.draft.context_lines}" />
          </label>
          <label class="velt-field">
            <span>Percorso opencode-cli (vuoto = auto)</span>
            <input type="text" class="velt-input" data-bind="opencode_bin" value="${escapeAttr(this.draft.opencode_bin)}" placeholder="Auto-rilevato" />
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
          { value: "commands_only", label: "Solo comandi agente (input & output)", sub: "Consigliato" },
          { value: "clean", label: "Terminale pulito (nascondi tutto)", sub: "Zero tracce" },
          { value: "keep_all", label: "Mantieni conversazione completa", sub: "Chat AI" },
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
          { value: "shell", label: "Shell ($ comando)", sub: "Pulito" },
          { value: "tagged", label: "Tagged ([agent]$ comando)", sub: "Con stato" },
          { value: "minimal", label: "Minimale (# comando)", sub: "Discreto" },
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
        name: "Nuovo Preset",
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
      nameInput.placeholder = "Nome";
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
      delBtn.title = "Rimuovi preset";
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
    const activeTheme = this.draft.theme || "velt-obsidian";
    const themeObj = getThemeById(activeTheme);
    const customAccent = isValidHexColor(this.draft.accent_override) ? this.draft.accent_override : "";
    const pickerColor = customAccent || themeObj.accent;
    const blurEnabled = this.draft.blur ?? true;
    const blurRadius = this.draft.blur_radius ?? 16;
    const opacityPct = Math.round(this.draft.opacity * 100);
    const uiRadius = this.draft.ui_radius ?? 10;
    const termPadding = this.draft.terminal_padding ?? 10;

    const accentPresets = [
      { label: "Ciano Velt", hex: "#26c6ff" },
      { label: "Indaco", hex: "#7aa2f7" },
      { label: "Lavanda", hex: "#cba6f7" },
      { label: "Smeraldo", hex: "#4ade80" },
      { label: "Ambra", hex: "#fabd2f" },
      { label: "Corallo", hex: "#fb7185" },
      { label: "Arancio", hex: "#f97316" },
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
            <span class="velt-theme-tagline">${escapeHtml(t.tagline)}</span>
          </div>
          ${selected ? `<span class="velt-theme-check">${iconCheck(11)}</span>` : ""}
        </button>
      `;
    }).join("");

    this.bodyEl.innerHTML = `
      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>Tema terminale &amp; interfaccia</h3>
            <p class="velt-help">Seleziona una palette: anteprima immediata in tempo reale sull'intera finestra.</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="reset-terminal">${iconReset(12)} <span>Predefiniti aspetto</span></button>
        </div>
        <div class="velt-theme-grid" data-role="theme-grid">
          ${themeCardsHtml}
        </div>
      </div>

      <div class="velt-section-block">
        <h3>Personalizzazione Estetica &amp; Colori</h3>
        <p class="velt-help">Sovrascrivi il colore d'accento del tema e personalizza sfondo, aura dell'Agent Mode e geometria.</p>
        <div class="velt-accent-bar">
          <span class="velt-accent-label">Colore d'accento</span>
          <div class="velt-accent-swatches">
            <button type="button" class="velt-accent-reset ${!customAccent ? "active" : ""}" data-action="reset-accent" title="Usa colore predefinito del tema">Tema</button>
            ${accentSwatchesHtml}
            <label class="velt-color-picker-wrap" title="Scegli colore personalizzato">
              <input type="color" class="velt-color-input" data-bind="accent_picker" value="${escapeAttr(pickerColor)}" />
              <span>${customAccent || "Custom"}</span>
            </label>
          </div>
        </div>
        <div class="velt-grid-2" style="margin-top: 10px;">
          <div class="velt-field">
            <span>Sfondo finestra</span>
            <div data-slot="ui-backdrop-style"></div>
          </div>
          <div class="velt-field">
            <span>Aura visiva Agent Mode</span>
            <div data-slot="agent-aura"></div>
          </div>
          <label class="velt-field">
            <span>Arrotondamento bordi: <strong data-role="radius-val">${uiRadius}px</strong></span>
            <input type="range" class="velt-range" min="0" max="18" step="1" data-bind="ui_radius" value="${uiRadius}" />
          </label>
          <label class="velt-field">
            <span>Margine interno terminale: <strong data-role="pad-val">${termPadding}px</strong></span>
            <input type="range" class="velt-range" min="2" max="28" step="1" data-bind="terminal_padding" value="${termPadding}" />
          </label>
        </div>
        <div class="velt-toggles" style="margin-top: 10px;">
          ${switchHtml("show_status_bar", "Mostra barra di stato inferiore (cwd, modello, scorciatoia)", this.draft.show_status_bar ?? true)}
          ${switchHtml("compact_chrome", "Barra superiore compatta (nasconde testo logo, guadagna spazio)", Boolean(this.draft.compact_chrome))}
          ${switchHtml("cursor_blink", "Cursore lampeggiante nel terminale", this.draft.cursor_blink ?? true)}
          ${switchHtml("focus_follows_mouse", "Focus automatico al passaggio del mouse nei riquadri divisi (scrivi senza cliccare)", Boolean(this.draft.focus_follows_mouse))}
          ${switchHtml("copy_on_select", "Copia automaticamente il testo quando lo selezioni nel terminale", Boolean(this.draft.copy_on_select))}
          ${switchHtml("middle_click_paste", "Incolla con clic centrale del mouse (Primary / Clipboard)", this.draft.middle_click_paste ?? true)}
        </div>
      </div>

      <div class="velt-section-block">
        <h3>Trasparenza, Sfocatura &amp; Animazioni</h3>
        <div class="velt-toggles">
          ${switchHtml("blur", "Sfocatura finestra (Wayland/X11 compositor blur + vetro satinato)", blurEnabled)}
          ${switchHtml("animations", "Animazioni fluide, aura Agent Mode e toast visivi", this.draft.animations ?? true)}
        </div>
        <div class="velt-grid-2">
          <label class="velt-field">
            <span>Opacità finestra: <strong data-role="op-val">${opacityPct}%</strong></span>
            <input type="range" class="velt-range" min="0.35" max="1" step="0.01" data-bind="opacity" value="${this.draft.opacity}" />
          </label>
          <label class="velt-field">
            <span>Intensità sfocatura vetro: <strong data-role="blur-val">${blurEnabled ? `${blurRadius}px` : "Off"}</strong></span>
            <input type="range" class="velt-range" min="0" max="40" step="1" data-bind="blur_radius" value="${blurRadius}" ${blurEnabled ? "" : "disabled"} />
          </label>
        </div>
      </div>

      <div class="velt-section-block">
        <h3>Tipografia &amp; Buffer</h3>
        <div class="velt-grid-2">
          <label class="velt-field">
            <span>Font Family</span>
            <input type="text" class="velt-input" data-bind="font_family" value="${escapeAttr(this.draft.font_family)}" />
          </label>
          <label class="velt-field">
            <span>Shell (vuoto = $SHELL)</span>
            <input type="text" class="velt-input" data-bind="shell" value="${escapeAttr(this.draft.shell)}" placeholder="/bin/zsh, /bin/bash, /usr/bin/fish" />
          </label>
          <label class="velt-field">
            <span>Dimensione Font (px)</span>
            <input type="number" min="9" max="32" class="velt-input" data-bind="font_size" value="${this.draft.font_size}" />
          </label>
          <label class="velt-field">
            <span>Line Height</span>
            <input type="number" step="0.05" min="1.0" max="2.0" class="velt-input" data-bind="line_height" value="${this.draft.line_height}" />
          </label>
          <div class="velt-field">
            <span>Stile Cursore</span>
            <div data-slot="cursor-style"></div>
          </div>
          <label class="velt-field">
            <span>Scrollback (righe)</span>
            <input type="number" min="500" max="100000" step="500" class="velt-input" data-bind="scrollback" value="${this.draft.scrollback}" />
          </label>
        </div>
      </div>
    `;

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
          { value: "aurora", label: "Aurora", sub: "Bagliore bicolore" },
          { value: "subtle", label: "Sottile", sub: "Riflesso discreto" },
          { value: "flat", label: "Flat", sub: "Tinta uniforme" },
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
          { value: "vivid", label: "Vivida", sub: "Bordo + bagliore" },
          { value: "minimal", label: "Minimale", sub: "Solo bordo sottile" },
          { value: "off", label: "Disattiva", sub: "Nessuna cornice" },
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
      this.draft.blur = def.blur;
      this.draft.blur_radius = def.blur_radius;
      this.draft.opacity = def.opacity;
      this.draft.animations = def.animations;
      this.draft.font_family = def.font_family;
      this.draft.font_size = def.font_size;
      this.draft.line_height = def.line_height;
      this.draft.scrollback = def.scrollback;
      this.onPreviewAppearance?.(structuredClone(this.draft));
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

    const cursorSlot = this.bodyEl.querySelector('[data-slot="cursor-style"]')!;
    cursorSlot.appendChild(
      this.createDarkDropdown(
        [
          { value: "block", label: "Block (stile Velt)" },
          { value: "bar", label: "Bar" },
          { value: "underline", label: "Underline" },
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
        blurLbl.textContent = this.draft.blur ? `${this.draft.blur_radius}px` : "Off";
      }
      this.onPreviewAppearance?.(structuredClone(this.draft));
    });

    blurSlider?.addEventListener("input", (e) => {
      const val = Math.min(40, Math.max(0, Number((e.target as HTMLInputElement).value) || 0));
      this.draft.blur_radius = val;
      if (blurLbl) blurLbl.textContent = this.draft.blur ? `${val}px` : "Off";
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
    const labels: Array<{ key: keyof Keybindings; title: string; desc: string }> = [
      { key: "toggle_agent", title: "Attiva / Esci da Agent Mode", desc: "Scorciatoia principale (WM-safe)" },
      { key: "toggle_agent_alt", title: "Attiva / Esci da Agent Mode (Alt)", desc: "Scorciatoia secondaria rapida" },
      { key: "select_all", title: "Seleziona tutto il testo", desc: "Seleziona l'intero buffer del terminale" },
      { key: "model_switcher", title: "Apri Quick Switcher Modello & Effort", desc: "Cambia modello, reasoning effort o preset" },
      { key: "cycle_effort", title: "Cicla Reasoning Effort", desc: "Scala low -> medium -> high -> max" },
      { key: "insert_command", title: "Incolla comando suggerito nella shell", desc: "Senza eseguirlo automaticamente" },
      { key: "new_agent_session", title: "Nuova sessione OpenCode nel riquadro", desc: "Azzera la conversazione AI attiva" },
      { key: "split_vertical", title: "Dividi riquadro a destra (Verticale)", desc: "Apre una seconda shell affiancata" },
      { key: "split_horizontal", title: "Dividi riquadro in basso (Orizzontale)", desc: "Apre una seconda shell sotto" },
      { key: "close_pane", title: "Chiudi riquadro attivo", desc: "Chiude il riquadro split corrente (o il tab se ultimo)" },
      { key: "new_tab", title: "Nuovo Tab", desc: "Apre una nuova shell (anche Ctrl+T)" },
      { key: "close_tab", title: "Chiudi Tab", desc: "Chiude il tab corrente" },
      { key: "open_settings", title: "Apri Impostazioni", desc: "Mostra questa finestra" },
    ];

    this.bodyEl.innerHTML = `
      <div class="velt-section-block">
        <div class="velt-row-between">
          <div>
            <h3>Scorciatoie da tastiera</h3>
            <p class="velt-help">Clicca su una scorciatoia e premi la nuova combinazione (evita <code>Alt+Space</code> su Hyprland/Sway). Navigazione riquadri: <code>Ctrl+Shift+Frecce</code>. Premi <code>Esc</code> per annullare.</p>
          </div>
          <button type="button" class="velt-btn velt-btn-ghost velt-btn-icon" data-action="reset-keys">${iconReset(12)} <span>Predefiniti tasti</span></button>
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
    labels.forEach(({ key, title, desc }) => {
      const row = document.createElement("div");
      row.className = "velt-key-row";
      const isRec = this.recordingField === key;
      const val = this.draft.keybindings[key];
      const wmWarn = val.toLowerCase() === "alt+space" ? `<span class="velt-warn-tag">Possibile conflitto WM</span>` : "";

      row.innerHTML = `
        <div>
          <div class="velt-key-title">${escapeHtml(title)} ${wmWarn}</div>
          <div class="velt-key-desc">${escapeHtml(desc)}</div>
        </div>
        <button type="button" class="velt-kbd-btn ${isRec ? "recording" : ""}">
          ${isRec ? "Premi i tasti..." : escapeHtml(val)}
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
