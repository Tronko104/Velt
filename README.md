# Velt

Emulatore di terminale Linux basato su **Tauri v2**, **xterm.js (WebGL)** e **opencode-cli**.

## Caratteristiche principali

- **Terminale reale + Agent Mode nella stessa finestra**: nessun pannello separato. Quando attivi Agent Mode, il bordo e il cursore passano al ciano Velt e le risposte di OpenCode vengono rese direttamente nello scrollback del terminale.
- **Scrollback unificato**: in Agent Mode puoi scorrere verso l'alto per rivedere comandi e output precedenti della shell; quando esci da Agent Mode, tutta la conversazione resta nello storico e il prompt shell riprende sotto.
- **Cambio rapido Modello & Reasoning Effort**:
  - `Ctrl+Shift+M`: apre il Quick Switcher con ricerca modelli, varianti di reasoning effort supportate dal modello (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `thinking`) e preset rapidi.
  - `Ctrl+Shift+E`: cicla al volo il reasoning effort del tab corrente.
  - `Ctrl+,`: Apri le Impostazioni per scegliere **tema**, **trasparenza**, **sfocatura** (compositor Wayland/X11 + vetro interfaccia), combinazione predefinita, preset e scorciatoie.
- **Temi & Effetto Vetro**:
  - 10 temi integrati (`Velt Obsidian`, `Tokyo Night`, `Catppuccin Mocha`, `Nord Arctic`, `Gruvbox Amber`, `Rosé Pine`, `Dracula Violet`, `Kanagawa Wave`, `Monokai Pro`, `Solarized Deep`) con anteprima live su terminale, UI, icone e frame Agent.
  - Opacità finestra (`35%`–`100%`) e sfocatura configurabili (protocollo Wayland `ext_background_effect_v1` / legacy KWin, X11 `_KDE_NET_WM_BLUR_BEHIND_REGION` + raggio `backdrop-filter` vetro `0`–`40px`).
- **Contesto automatico & sicurezza comandi**:
  - Invia opzionalmente (`@contesto`) la directory corrente (`cwd`) e le ultime righe del terminale a `opencode`.
  - `Ctrl+Shift+Enter`: incolla l'ultimo comando suggerito dall'agente nel prompt della shell **senza eseguirlo automaticamente**.

## Scorciatoie predefinite (WM-safe)

Tutte le scorciatoie sono personalizzabili dalle Impostazioni o in `~/.config/velt/config.toml`:

- `Ctrl+Shift+G` / `Ctrl+/`: Attiva / Esci da Agent Mode (`Esc` torna alla shell o interrompe lo streaming)
- `Ctrl+Shift+A`: Seleziona tutto il testo (nel terminale o nell'input agent)
- `Ctrl+Shift+M`: Apri Quick Switcher Modello & Reasoning Effort
- `Ctrl+Shift+E`: Cicla Reasoning Effort
- `Ctrl+Shift+Enter`: Incolla comando suggerito nella shell
- `Ctrl+Shift+N` (in Agent Mode) / `/new`: Nuova sessione OpenCode per il tab
- `Ctrl+T` / `Ctrl+Shift+T`: Nuovo Tab (`Ctrl+Shift+W` chiude il tab corrente)
- `Ctrl+Tab` / `Ctrl+Shift+Tab`: Passa al tab successivo / precedente (`Ctrl+PageDown` / `Ctrl+PageUp`)
- `Ctrl+1..9` / `Alt+1..9`: Salto diretto al tab 1..9 (`Ctrl+9` seleziona il 9° o l'ultimo tab)
- `Ctrl+Shift+L`: Pulisci scrollback
- `Ctrl+Shift+F`: Cerca nello scrollback
- `Ctrl+=` / `Ctrl+-` / `Ctrl+0`: Zoom font (+ / - / reset)
- `Ctrl+,`: Apri Impostazioni

## Sviluppo e Build

```bash
npm install
npm run tauri dev
```

Per compilare il binario di rilascio:

```bash
npm run tauri build -- --no-bundle
```
