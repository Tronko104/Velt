import type { ModelInfo, Preset, VeltConfig } from "../types";
import { iconCpu, veltLogoSvg } from "./icons";

export interface SwitcherResult {
  model: string;
  effort: string;
  saveAsDefault: boolean;
}

export class ModelSwitcherModal {
  private overlay: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private presetsRow: HTMLDivElement;
  private listEl: HTMLDivElement;
  private effortRow: HTMLDivElement;
  private defaultCheck: HTMLInputElement;

  private models: ModelInfo[] = [];
  private config!: VeltConfig;
  private selectedModel = "";
  private selectedEffort = "";
  private filtered: ModelInfo[] = [];
  private activeIdx = 0;
  private onApply?: (res: SwitcherResult) => void;
  private onClose?: () => void;

  constructor(root: HTMLElement) {
    this.overlay = document.createElement("div");
    this.overlay.className = "velt-modal-backdrop hidden";
    this.overlay.innerHTML = `
      <div class="velt-modal velt-switcher" role="dialog" aria-label="Modello e Reasoning Effort">
        <div class="velt-modal-header">
          <div class="velt-modal-title">
            ${veltLogoSvg(20)}
            <span>Modello &amp; Reasoning Effort</span>
          </div>
          <span class="velt-kbd-hint">↑↓ modello · ←→ effort · Invio applica · Esc chiudi</span>
        </div>

        <div class="velt-presets-strip" data-role="presets"></div>

        <div class="velt-search-wrap">
          <input type="text" class="velt-input" data-role="search" placeholder="Cerca modello (es. deepseek, gemma, nemotron, flint)..." />
        </div>

        <div class="velt-model-list" data-role="list"></div>

        <div class="velt-effort-panel">
          <div class="velt-effort-label">${iconCpu(13)} <span>Sforzo di ragionamento (Reasoning Effort)</span></div>
          <div class="velt-effort-chips" data-role="efforts"></div>
        </div>

        <div class="velt-modal-footer">
          <label class="velt-switch-row">
            <span class="velt-switch">
              <input type="checkbox" data-role="save-default" />
              <span class="velt-switch-track"><span class="velt-switch-thumb"></span></span>
            </span>
            <span>Imposta anche come combinazione predefinita</span>
          </label>
          <div class="velt-footer-actions">
            <button type="button" class="velt-btn velt-btn-ghost" data-action="cancel">Annulla</button>
            <button type="button" class="velt-btn velt-btn-primary" data-action="apply">Applica</button>
          </div>
        </div>
      </div>
    `;

    root.appendChild(this.overlay);

    this.searchInput = this.overlay.querySelector('[data-role="search"]')!;
    this.presetsRow = this.overlay.querySelector('[data-role="presets"]')!;
    this.listEl = this.overlay.querySelector('[data-role="list"]')!;
    this.effortRow = this.overlay.querySelector('[data-role="efforts"]')!;
    this.defaultCheck = this.overlay.querySelector('[data-role="save-default"]')!;

    this.overlay.addEventListener("mousedown", (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.overlay.querySelector('[data-action="cancel"]')?.addEventListener("click", () => this.close());
    this.overlay.querySelector('[data-action="apply"]')?.addEventListener("click", () => this.commit());

    this.searchInput.addEventListener("input", () => {
      this.applyFilter();
    });

    this.overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (this.filtered.length > 0) {
          this.activeIdx = (this.activeIdx + 1) % this.filtered.length;
          this.selectModelObj(this.filtered[this.activeIdx]);
          this.renderList();
          this.scrollActiveIntoView();
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.filtered.length > 0) {
          this.activeIdx = (this.activeIdx - 1 + this.filtered.length) % this.filtered.length;
          this.selectModelObj(this.filtered[this.activeIdx]);
          this.renderList();
          this.scrollActiveIntoView();
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        this.stepEffort(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.ctrlKey) {
          this.defaultCheck.checked = true;
        }
        this.commit();
      }
    });
  }

  public isOpen(): boolean {
    return !this.overlay.classList.contains("hidden");
  }

  public open(
    models: ModelInfo[],
    config: VeltConfig,
    currentModel: string,
    currentEffort: string,
    onApply: (res: SwitcherResult) => void,
    onClose: () => void
  ): void {
    this.models = models;
    this.config = config;
    this.selectedModel = currentModel || config.default_model;
    this.selectedEffort = currentEffort || config.default_effort;
    this.defaultCheck.checked = false;
    this.onApply = onApply;
    this.onClose = onClose;

    this.searchInput.value = "";
    this.renderPresets(config.presets);
    this.applyFilter();
    this.overlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      this.searchInput.focus();
      this.scrollActiveIntoView();
    });
  }

  public close(): void {
    if (!this.isOpen()) return;
    this.overlay.classList.add("hidden");
    this.onClose?.();
  }

  private renderPresets(presets: Preset[]): void {
    if (!presets.length) {
      this.presetsRow.innerHTML = "";
      this.presetsRow.classList.add("hidden");
      return;
    }
    this.presetsRow.classList.remove("hidden");
    this.presetsRow.innerHTML = `<span class="velt-presets-label">Preset:</span>`;
    presets.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isMatch = p.model === this.selectedModel && p.effort === this.selectedEffort;
      btn.className = `velt-preset-chip ${isMatch ? "active" : ""}`;
      btn.innerHTML = `<span class="velt-preset-idx">${idx + 1}</span> ${escapeHtml(p.name)} <span class="velt-muted">(${escapeHtml(shortModelName(p.model))} · ${escapeHtml(p.effort)})</span>`;
      btn.addEventListener("click", () => {
        this.selectedModel = p.model;
        this.selectedEffort = p.effort;
        this.applyFilter();
        this.commit();
      });
      this.presetsRow.appendChild(btn);
    });
  }

  private applyFilter(): void {
    const q = this.searchInput.value.trim().toLowerCase();
    this.filtered = this.models.filter((m) => {
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    });

    const foundIdx = this.filtered.findIndex((m) => m.id === this.selectedModel);
    if (foundIdx >= 0) {
      this.activeIdx = foundIdx;
    } else if (this.filtered.length > 0) {
      this.activeIdx = 0;
      this.selectModelObj(this.filtered[0]);
    } else {
      this.activeIdx = -1;
    }

    this.renderList();
    this.renderEfforts();
  }

  private selectModelObj(m: ModelInfo): void {
    this.selectedModel = m.id;
    const allowed = effectiveEfforts(m);
    if (!allowed.includes(this.selectedEffort)) {
      if (allowed.includes(this.config.default_effort)) {
        this.selectedEffort = this.config.default_effort;
      } else if (allowed.includes("medium")) {
        this.selectedEffort = "medium";
      } else {
        this.selectedEffort = allowed[0] ?? "default";
      }
    }
    this.renderEfforts();
  }

  private stepEffort(dir: number): void {
    const modelObj = this.models.find((m) => m.id === this.selectedModel);
    const allowed = effectiveEfforts(modelObj);
    if (allowed.length <= 1) return;
    const idx = allowed.indexOf(this.selectedEffort);
    const next = (Math.max(0, idx) + dir + allowed.length) % allowed.length;
    this.selectedEffort = allowed[next];
    this.renderEfforts();
  }

  private renderList(): void {
    if (this.filtered.length === 0) {
      this.listEl.innerHTML = `<div class="velt-empty-state">Nessun modello trovato</div>`;
      return;
    }
    this.listEl.innerHTML = "";
    this.filtered.forEach((m, idx) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `velt-model-row ${idx === this.activeIdx ? "active" : ""}`;
      const isDefault = m.id === this.config.default_model;
      const variantsText = m.variants.length ? m.variants.join(" · ") : "standard";
      const ctxText = m.contextLimit ? `${Math.round(m.contextLimit / 1000)}k` : "";
      row.innerHTML = `
        <div class="velt-model-main">
          <span class="velt-provider-badge">${escapeHtml(m.provider)}</span>
          <span class="velt-model-name">${escapeHtml(m.name)}</span>
          ${isDefault ? `<span class="velt-default-tag">DEFAULT</span>` : ""}
        </div>
        <div class="velt-model-meta">
          <span class="velt-model-id">${escapeHtml(m.id)}</span>
          <span class="velt-model-variants">${escapeHtml(variantsText)}${ctxText ? ` · ${ctxText}` : ""}</span>
        </div>
      `;
      row.addEventListener("click", () => {
        this.activeIdx = idx;
        this.selectModelObj(m);
        this.renderList();
        this.searchInput.focus();
      });
      row.addEventListener("dblclick", () => {
        this.activeIdx = idx;
        this.selectModelObj(m);
        this.commit();
      });
      this.listEl.appendChild(row);
    });
  }

  private renderEfforts(): void {
    const modelObj = this.models.find((m) => m.id === this.selectedModel);
    const allowed = effectiveEfforts(modelObj);
    this.effortRow.innerHTML = "";
    allowed.forEach((eff) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `velt-effort-chip ${eff === this.selectedEffort ? "active" : ""}`;
      chip.textContent = eff;
      chip.addEventListener("click", () => {
        this.selectedEffort = eff;
        this.renderEfforts();
        this.searchInput.focus();
      });
      this.effortRow.appendChild(chip);
    });
  }

  private scrollActiveIntoView(): void {
    const el = this.listEl.querySelector(".velt-model-row.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }

  private commit(): void {
    if (!this.selectedModel) return;
    const res: SwitcherResult = {
      model: this.selectedModel,
      effort: this.selectedEffort || "default",
      saveAsDefault: this.defaultCheck.checked,
    };
    this.overlay.classList.add("hidden");
    this.onApply?.(res);
  }
}

export function effectiveEfforts(model?: ModelInfo): string[] {
  if (!model || !model.variants || model.variants.length === 0) {
    return ["default"];
  }
  return model.variants;
}

export function shortModelName(modelId: string): string {
  if (!modelId) return "none";
  const parts = modelId.split("/");
  return parts[parts.length - 1] || modelId;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
