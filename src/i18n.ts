export type AppLocale = "it" | "en";
export type LanguagePref = "auto" | "it" | "en";

export function resolveLocale(pref?: string | null, systemLocale?: string | null): AppLocale {
  if (pref === "it" || pref === "en") {
    return pref;
  }
  const candidates = [
    systemLocale,
    typeof navigator !== "undefined" ? navigator.language : null,
    ...(typeof navigator !== "undefined" && Array.isArray(navigator.languages)
      ? navigator.languages
      : []),
  ];
  for (const raw of candidates) {
    const clean = (raw || "").trim().toLowerCase();
    if (!clean || clean === "c" || clean === "posix") continue;
    if (clean.startsWith("it")) return "it";
    if (clean.startsWith("en")) return "en";
    // Any other non-Italian system locale falls back to English.
    return "en";
  }
  return "en";
}

export interface I18nStrings {
  topbar: {
    splitV: string;
    splitH: string;
    newTab: string;
    find: string;
    settings: string;
    minimize: string;
    maximize: string;
    restore: string;
    close: string;
  };
  find: {
    placeholder: string;
    prev: string;
    next: string;
    close: string;
  };
  dock: {
    thinkingBadge: string;
    thinkingInit: string;
    agentBadge: string;
    contextLabel: string;
    contextTitle: string;
    hintSend: string;
    hintSendKey: string;
    hintNewline: string;
    hintNewlineKey: string;
    hintReset: string;
    hintShell: string;
    inputPlaceholder: string;
    stop: string;
    send: string;
    streamingThink: string;
    streamingWrite: string;
  };
  status: {
    shellMode: string;
    agentMode: string;
    insertCmdLabel: string;
    insertCmdTitle: string;
    ocStatusTitle: string;
    ocConnected: (ver: string) => string;
    ocNotFound: string;
    modelPillTitle: string;
  };
  drop: {
    card: string;
  };
  contextMenu: {
    copy: string;
    paste: string;
    selectAll: string;
    askSelection: string;
    askSelectionPrompt: (snippet: string) => string;
    sendSelection: string;
    sendSelectionPrompt: (snippet: string) => string;
    toShellMode: string;
    toAgentMode: string;
    splitRight: string;
    splitDown: string;
    closePane: string;
    clearScrollback: string;
    themeTransparency: string;
  };
  toasts: {
    contextOn: string;
    contextOff: string;
    secretsRedacted: (count: number) => string;
    scrollbackCleared: string;
    textCopied: string;
    allSelected: string;
    fontSize: (px: number) => string;
    fontReset: string;
    droppedOne: string;
    droppedMany: (count: number) => string;
    newSession: string;
    commandInserted: string;
    effortChanged: (effort: string) => string;
    settingsSaved: string;
  };
  terminal: {
    paneClose: string;
    shellStartError: (err: string) => string;
    processExited: (code: number | null) => string;
    opencodeUnavailable: string;
    sendError: (err: string) => string;
    opencodeError: (err: string) => string;
    generationStopped: string;
    newSessionNotice: string;
    helpTitle: string;
    helpToggle: string;
    helpSwitcher: string;
    helpEffort: string;
    helpInsert: string;
    helpSelectAll: string;
    helpSession: string;
    tabTooltip: (title: string, idx: number) => string;
    closeTab: string;
  };
  ansi: {
    reasoningHeader: string;
    reasoningFooter: (secs: string) => string;
    moreLines: (count: number) => string;
    shellFallbackCmd: string;
    exitError: (detail: string) => string;
    insertCommandHint: string;
    escToShell: string;
  };
  switcher: {
    ariaLabel: string;
    title: string;
    kbdHint: string;
    presetsLabel: string;
    searchPlaceholder: string;
    effortLabel: string;
    setDefault: string;
    cancel: string;
    apply: string;
    emptyState: string;
    standard: string;
  };
  settings: {
    ariaLabel: string;
    title: string;
    closeAria: string;
    navAi: string;
    navTerminal: string;
    navKeys: string;
    cancel: string;
    save: string;
    filterPlaceholder: string;
    emptyFilter: string;
    selectPlaceholder: string;
    ai: {
      defaultTitle: string;
      defaultHelp: string;
      defaultModel: string;
      defaultEffort: string;
      presetsTitle: string;
      presetsHelp: string;
      addPreset: string;
      presetNamePlaceholder: string;
      removePreset: string;
      newPresetDefaultName: string;
      exitTitle: string;
      exitHelp: string;
      resetAi: string;
      exitModeLabel: string;
      exitModeCommands: string;
      exitModeCommandsSub: string;
      exitModeClean: string;
      exitModeCleanSub: string;
      exitModeKeep: string;
      exitModeKeepSub: string;
      cmdStyleLabel: string;
      cmdStyleShell: string;
      cmdStyleShellSub: string;
      cmdStyleTagged: string;
      cmdStyleTaggedSub: string;
      cmdStyleMinimal: string;
      cmdStyleMinimalSub: string;
      liveThinkBar: string;
      toolOutputInAgent: string;
      showThinking: string;
      cliTitle: string;
      statusLabel: string;
      connected: (ver: string) => string;
      notFound: (err: string) => string;
      verifyPath: string;
      autoContext: string;
      redactSecrets: string;
      autoApprove: string;
      showHiddenModels: string;
      showModelInShell: string;
      contextLines: string;
      opencodeBin: string;
      autoDetected: string;
    };
    terminal: {
      themeTitle: string;
      themeHelp: string;
      resetTerminal: string;
      customTitle: string;
      customHelp: string;
      accentLabel: string;
      accentThemeBtn: string;
      accentThemeTitle: string;
      accentPickerTitle: string;
      accentCustom: string;
      accentPresets: { cyan: string; indigo: string; lavender: string; emerald: string; amber: string; coral: string; orange: string };
      backdropLabel: string;
      backdropAurora: string;
      backdropAuroraSub: string;
      backdropSubtle: string;
      backdropSubtleSub: string;
      backdropFlat: string;
      backdropFlatSub: string;
      agentAuraLabel: string;
      auraVivid: string;
      auraVividSub: string;
      auraMinimal: string;
      auraMinimalSub: string;
      auraOff: string;
      auraOffSub: string;
      languageLabel: string;
      langAuto: string;
      langAutoSub: string;
      langIt: string;
      langEn: string;
      uiRadius: string;
      termPadding: string;
      showStatusBar: string;
      compactChrome: string;
      cursorBlink: string;
      focusFollowsMouse: string;
      copyOnSelect: string;
      middleClickPaste: string;
      webglRenderer: string;
      glassTitle: string;
      blurToggle: string;
      animationsToggle: string;
      opacityLabel: string;
      blurRadiusLabel: string;
      blurOff: string;
      typoTitle: string;
      fontFamily: string;
      shellLabel: string;
      shellPlaceholder: string;
      fontSize: string;
      lineHeight: string;
      cursorStyle: string;
      cursorBlock: string;
      cursorBar: string;
      cursorUnderline: string;
      scrollback: string;
    };
    keys: {
      title: string;
      helpHtml: string;
      resetKeys: string;
      wmConflict: string;
      recording: string;
      items: {
        toggle_agent: [string, string];
        toggle_agent_alt: [string, string];
        select_all: [string, string];
        model_switcher: [string, string];
        cycle_effort: [string, string];
        insert_command: [string, string];
        new_agent_session: [string, string];
        split_vertical: [string, string];
        split_horizontal: [string, string];
        close_pane: [string, string];
        new_tab: [string, string];
        close_tab: [string, string];
        open_settings: [string, string];
      };
    };
  };
}

export const STRINGS: Record<AppLocale, I18nStrings> = {
  it: {
    topbar: {
      splitV: "Dividi a destra",
      splitH: "Dividi in basso",
      newTab: "Nuovo Tab",
      find: "Cerca",
      settings: "Impostazioni",
      minimize: "Minimizza",
      maximize: "Ingrandisci",
      restore: "Ripristina",
      close: "Chiudi",
    },
    find: {
      placeholder: "Cerca nello scrollback...",
      prev: "Precedente",
      next: "Successivo",
      close: "Chiudi",
    },
    dock: {
      thinkingBadge: "Ragiono",
      thinkingInit: "Analizzo il contesto...",
      agentBadge: "AGENT MODE",
      contextLabel: "contesto",
      contextTitle: "Includi contesto recente del terminale",
      hintSend: "invia",
      hintSendKey: "Invio",
      hintNewline: "a capo",
      hintNewlineKey: "Shift+Invio",
      hintReset: "reset",
      hintShell: "shell",
      inputPlaceholder: "Parla con OpenCode (spiega un errore, genera un comando, modifica file)...",
      stop: "Stop",
      send: "Invia",
      streamingThink: "Ragiono...",
      streamingWrite: "Scrivo...",
    },
    status: {
      shellMode: "SHELL",
      agentMode: "AGENT",
      insertCmdLabel: "Incolla comando",
      insertCmdTitle: "Incolla ultimo comando suggerito nella shell",
      ocStatusTitle: "Stato OpenCode CLI",
      ocConnected: (ver) => `OpenCode connesso (${ver})`,
      ocNotFound: "OpenCode non trovato",
      modelPillTitle: "Cambia modello & reasoning effort",
    },
    drop: {
      card: "Rilascia file o cartelle per inserire i percorsi",
    },
    contextMenu: {
      copy: "Copia",
      paste: "Incolla",
      selectAll: "Seleziona tutto",
      askSelection: "Chiedi a OpenCode sulla selezione",
      askSelectionPrompt: (s) => `Spiega o risolvi questo output:\n\`\`\`\n${s}\n\`\`\`\n`,
      sendSelection: "Invia subito selezione a OpenCode",
      sendSelectionPrompt: (s) => `Analizza questo output del terminale e dimmi cosa fare:\n\`\`\`\n${s}\n\`\`\``,
      toShellMode: "Torna a Shell Mode",
      toAgentMode: "Attiva Agent Mode",
      splitRight: "Dividi a destra",
      splitDown: "Dividi in basso",
      closePane: "Chiudi riquadro",
      clearScrollback: "Pulisci scrollback",
      themeTransparency: "Cambia tema & trasparenza...",
    },
    toasts: {
      contextOn: "Contesto terminale attivo",
      contextOff: "Contesto terminale disattivato",
      secretsRedacted: (n) =>
        n === 1 ? "1 segreto oscurato dal contesto" : `${n} segreti oscurati dal contesto`,
      scrollbackCleared: "Scrollback pulito",
      textCopied: "Testo copiato",
      allSelected: "Tutto il testo selezionato",
      fontSize: (px) => `Font: ${px}px`,
      fontReset: "Font ripristinato: 14px",
      droppedOne: "Percorso inserito",
      droppedMany: (n) => `${n} percorsi inseriti`,
      newSession: "Nuova sessione OpenCode",
      commandInserted: "Comando inserito nel prompt",
      effortChanged: (eff) => `Reasoning Effort -> ${eff}`,
      settingsSaved: "Impostazioni salvate",
    },
    terminal: {
      paneClose: "Chiudi riquadro",
      shellStartError: (err) => `Impossibile avviare la shell: ${err}`,
      processExited: (code) =>
        `[Processo terminato${code !== null ? ` (exit ${code})` : ""}]`,
      opencodeUnavailable: "Impossibile interrogare opencode-cli",
      sendError: (err) => `Errore invio a OpenCode: ${err}`,
      opencodeError: (err) => `Errore OpenCode: ${err || "Errore sconosciuto"}`,
      generationStopped: ":: Generazione interrotta",
      newSessionNotice: "[V] Nuova sessione OpenCode avviata per questo riquadro",
      helpTitle: "[V] Comandi rapidi Velt Agent:",
      helpToggle: "Torna alla shell (mantiene lo scrollback)",
      helpSwitcher: "Cambia modello, reasoning effort o preset",
      helpEffort: "Cicla solo il reasoning effort",
      helpInsert: "Incolla comando suggerito nella shell",
      helpSelectAll: "Seleziona tutto il testo",
      helpSession: "Nuova sessione OpenCode / pulisci scrollback",
      tabTooltip: (title, idx) => (idx < 9 ? `${title} (Ctrl+${idx + 1})` : title),
      closeTab: "Chiudi tab",
    },
    ansi: {
      reasoningHeader: "RAGIONAMENTO",
      reasoningFooter: (secs) => `ragionamento (${secs}s)`,
      moreLines: (count) => `… (+${count} righe)`,
      shellFallbackCmd: "(comando shell)",
      exitError: (detail) => `[exit errore${detail}]`,
      insertCommandHint: "per inserire comando:",
      escToShell: "── Esc per tornare alla shell ──",
    },
    switcher: {
      ariaLabel: "Modello e Reasoning Effort",
      title: "Modello & Reasoning Effort",
      kbdHint: "↑↓ modello · ←→ effort · Invio applica · Esc chiudi",
      presetsLabel: "Preset:",
      searchPlaceholder: "Cerca modello (es. deepseek, gemma, nemotron, flint)...",
      effortLabel: "Sforzo di ragionamento (Reasoning Effort)",
      setDefault: "Imposta anche come combinazione predefinita",
      cancel: "Annulla",
      apply: "Applica",
      emptyState: "Nessun modello trovato",
      standard: "standard",
    },
    settings: {
      ariaLabel: "Impostazioni Velt",
      title: "Impostazioni Velt",
      closeAria: "Chiudi",
      navAi: "OpenCode & Modelli",
      navTerminal: "Terminale & Aspetto",
      navKeys: "Scorciatoie",
      cancel: "Annulla",
      save: "Salva impostazioni",
      filterPlaceholder: "Filtra...",
      emptyFilter: "Nessun risultato",
      selectPlaceholder: "Seleziona...",
      ai: {
        defaultTitle: "Combinazione predefinita all'avvio",
        defaultHelp: "Scelta automaticamente per ogni nuovo tab e alla riapertura di Velt.",
        defaultModel: "Modello predefinito",
        defaultEffort: "Reasoning Effort predefinito",
        presetsTitle: "Preset rapidi",
        presetsHelp: "Combinazioni pronte da richiamare con un clic o numero nel Quick Switcher.",
        addPreset: "Aggiungi preset",
        presetNamePlaceholder: "Nome",
        removePreset: "Rimuovi preset",
        newPresetDefaultName: "Nuovo Preset",
        exitTitle: "Uscita da Agent Mode & Ragionamento",
        exitHelp: "Scegli cosa resta visibile nel terminale quando torni alla shell e come mostrare pensieri e comandi.",
        resetAi: "Predefiniti AI",
        exitModeLabel: "All'uscita dall'Agent Mode",
        exitModeCommands: "Solo comandi agente (input & output)",
        exitModeCommandsSub: "Consigliato",
        exitModeClean: "Terminale pulito (nascondi tutto)",
        exitModeCleanSub: "Zero tracce",
        exitModeKeep: "Mantieni conversazione completa",
        exitModeKeepSub: "Chat AI",
        cmdStyleLabel: "Stile comandi agente in Shell Mode",
        cmdStyleShell: "Shell ($ comando)",
        cmdStyleShellSub: "Pulito",
        cmdStyleTagged: "Tagged ([agent]$ comando)",
        cmdStyleTaggedSub: "Con stato",
        cmdStyleMinimal: "Minimale (# comando)",
        cmdStyleMinimalSub: "Discreto",
        liveThinkBar: "Mostra barra live del ragionamento nel Dock mentre OpenCode pensa",
        toolOutputInAgent: "Mostra anteprima compatta dell'output dei comandi dentro Agent Mode",
        showThinking: "Scrivi anche il riquadro ragionamento completo nello scrollback",
        cliTitle: "Integrazione OpenCode CLI",
        statusLabel: "Stato:",
        connected: (ver) => `Connesso (${ver})`,
        notFound: (err) => `Non trovato: ${err}`,
        verifyPath: "verifica percorso",
        autoContext: "Includi automaticamente directory e ultime righe del terminale",
        redactSecrets: "Oscura automaticamente chiavi API, token e password dal contesto inviato",
        autoApprove: "Auto-approva esecuzione tool OpenCode (--auto)",
        showHiddenModels: "Mostra anche i modelli nascosti in OpenCode Desktop",
        showModelInShell: "Mostra selettore modello nella barra anche in modalità terminale (Shell)",
        contextLines: "Righe di contesto terminale",
        opencodeBin: "Percorso opencode-cli (vuoto = auto)",
        autoDetected: "Auto-rilevato",
      },
      terminal: {
        themeTitle: "Tema terminale & interfaccia",
        themeHelp: "Seleziona una palette: anteprima immediata in tempo reale sull'intera finestra.",
        resetTerminal: "Predefiniti aspetto",
        customTitle: "Personalizzazione Estetica, Lingua & Colori",
        customHelp: "Scegli la lingua dell'interfaccia, sovrascrivi l'accento del tema e personalizza comportamento e geometria.",
        accentLabel: "Colore d'accento",
        accentThemeBtn: "Tema",
        accentThemeTitle: "Usa colore predefinito del tema",
        accentPickerTitle: "Scegli colore personalizzato",
        accentCustom: "Custom",
        accentPresets: {
          cyan: "Ciano Velt",
          indigo: "Indaco",
          lavender: "Lavanda",
          emerald: "Smeraldo",
          amber: "Ambra",
          coral: "Corallo",
          orange: "Arancio",
        },
        backdropLabel: "Sfondo finestra",
        backdropAurora: "Aurora",
        backdropAuroraSub: "Bagliore bicolore",
        backdropSubtle: "Sottile",
        backdropSubtleSub: "Riflesso discreto",
        backdropFlat: "Flat",
        backdropFlatSub: "Tinta uniforme",
        agentAuraLabel: "Aura visiva Agent Mode",
        auraVivid: "Vivida",
        auraVividSub: "Bordo + bagliore",
        auraMinimal: "Minimale",
        auraMinimalSub: "Solo bordo sottile",
        auraOff: "Disattiva",
        auraOffSub: "Nessuna cornice",
        languageLabel: "Lingua interfaccia",
        langAuto: "Automatica (Sistema)",
        langAutoSub: "IT / EN",
        langIt: "Italiano",
        langEn: "English",
        uiRadius: "Arrotondamento bordi:",
        termPadding: "Margine interno terminale:",
        showStatusBar: "Mostra barra di stato inferiore (cwd, modello, scorciatoia)",
        compactChrome: "Barra superiore compatta (nasconde testo logo, guadagna spazio)",
        cursorBlink: "Cursore lampeggiante nel terminale",
        focusFollowsMouse: "Focus automatico al passaggio del mouse nei riquadri divisi (scrivi senza cliccare)",
        copyOnSelect: "Copia automaticamente il testo quando lo selezioni nel terminale",
        middleClickPaste: "Incolla con clic centrale del mouse (Primary / Clipboard)",
        webglRenderer: "Accelerazione WebGL nel terminale (disattiva se noti artefatti grafici su Wayland/WebKitGTK)",
        glassTitle: "Trasparenza, Sfocatura & Animazioni",
        blurToggle: "Sfocatura finestra (Wayland/X11 compositor blur + vetro satinato)",
        animationsToggle: "Animazioni fluide, aura Agent Mode e toast visivi",
        opacityLabel: "Opacità finestra:",
        blurRadiusLabel: "Intensità sfocatura vetro:",
        blurOff: "Off",
        typoTitle: "Tipografia & Buffer",
        fontFamily: "Font Family",
        shellLabel: "Shell (vuoto = $SHELL)",
        shellPlaceholder: "/bin/zsh, /bin/bash, /usr/bin/fish",
        fontSize: "Dimensione Font (px)",
        lineHeight: "Line Height",
        cursorStyle: "Stile Cursore",
        cursorBlock: "Block (stile Velt)",
        cursorBar: "Bar",
        cursorUnderline: "Underline",
        scrollback: "Scrollback (righe)",
      },
      keys: {
        title: "Scorciatoie da tastiera",
        helpHtml:
          "Clicca su una scorciatoia e premi la nuova combinazione (evita <code>Alt+Space</code> su Hyprland/Sway). Navigazione riquadri: <code>Ctrl+Shift+Frecce</code>. Premi <code>Esc</code> per annullare.",
        resetKeys: "Predefiniti tasti",
        wmConflict: "Possibile conflitto WM",
        recording: "Premi i tasti...",
        items: {
          toggle_agent: ["Attiva / Esci da Agent Mode", "Scorciatoia principale (WM-safe)"],
          toggle_agent_alt: ["Attiva / Esci da Agent Mode (Alt)", "Scorciatoia secondaria rapida"],
          select_all: ["Seleziona tutto il testo", "Seleziona l'intero buffer del terminale"],
          model_switcher: ["Apri Quick Switcher Modello & Effort", "Cambia modello, reasoning effort o preset"],
          cycle_effort: ["Cicla Reasoning Effort", "Scala low -> medium -> high -> max"],
          insert_command: ["Incolla comando suggerito nella shell", "Senza eseguirlo automaticamente"],
          new_agent_session: ["Nuova sessione OpenCode nel riquadro", "Azzera la conversazione AI attiva"],
          split_vertical: ["Dividi riquadro a destra (Verticale)", "Apre una seconda shell affiancata"],
          split_horizontal: ["Dividi riquadro in basso (Orizzontale)", "Apre una seconda shell sotto"],
          close_pane: ["Chiudi riquadro attivo", "Chiude il riquadro split corrente (o il tab se ultimo)"],
          new_tab: ["Nuovo Tab", "Apre una nuova shell (anche Ctrl+T)"],
          close_tab: ["Chiudi Tab", "Chiude il tab corrente"],
          open_settings: ["Apri Impostazioni", "Mostra questa finestra"],
        },
      },
    },
  },
  en: {
    topbar: {
      splitV: "Split right",
      splitH: "Split down",
      newTab: "New Tab",
      find: "Find",
      settings: "Settings",
      minimize: "Minimize",
      maximize: "Maximize",
      restore: "Restore",
      close: "Close",
    },
    find: {
      placeholder: "Search scrollback...",
      prev: "Previous",
      next: "Next",
      close: "Close",
    },
    dock: {
      thinkingBadge: "Thinking",
      thinkingInit: "Analyzing context...",
      agentBadge: "AGENT MODE",
      contextLabel: "context",
      contextTitle: "Include recent terminal context",
      hintSend: "send",
      hintSendKey: "Enter",
      hintNewline: "newline",
      hintNewlineKey: "Shift+Enter",
      hintReset: "reset",
      hintShell: "shell",
      inputPlaceholder: "Ask OpenCode (explain an error, craft a command, edit files)...",
      stop: "Stop",
      send: "Send",
      streamingThink: "Thinking...",
      streamingWrite: "Writing...",
    },
    status: {
      shellMode: "SHELL",
      agentMode: "AGENT",
      insertCmdLabel: "Paste command",
      insertCmdTitle: "Paste last suggested command into the shell",
      ocStatusTitle: "OpenCode CLI status",
      ocConnected: (ver) => `OpenCode connected (${ver})`,
      ocNotFound: "OpenCode not found",
      modelPillTitle: "Switch model & reasoning effort",
    },
    drop: {
      card: "Drop files or folders to insert their paths",
    },
    contextMenu: {
      copy: "Copy",
      paste: "Paste",
      selectAll: "Select all",
      askSelection: "Ask OpenCode about selection",
      askSelectionPrompt: (s) => `Explain or fix this output:\n\`\`\`\n${s}\n\`\`\`\n`,
      sendSelection: "Send selection to OpenCode now",
      sendSelectionPrompt: (s) => `Analyze this terminal output and tell me what to do:\n\`\`\`\n${s}\n\`\`\``,
      toShellMode: "Return to Shell Mode",
      toAgentMode: "Enable Agent Mode",
      splitRight: "Split right",
      splitDown: "Split down",
      closePane: "Close pane",
      clearScrollback: "Clear scrollback",
      themeTransparency: "Theme & transparency...",
    },
    toasts: {
      contextOn: "Terminal context enabled",
      contextOff: "Terminal context disabled",
      secretsRedacted: (n) =>
        n === 1 ? "1 secret redacted from context" : `${n} secrets redacted from context`,
      scrollbackCleared: "Scrollback cleared",
      textCopied: "Text copied",
      allSelected: "All text selected",
      fontSize: (px) => `Font: ${px}px`,
      fontReset: "Font reset: 14px",
      droppedOne: "Path inserted",
      droppedMany: (n) => `${n} paths inserted`,
      newSession: "New OpenCode session",
      commandInserted: "Command pasted into prompt",
      effortChanged: (eff) => `Reasoning Effort -> ${eff}`,
      settingsSaved: "Settings saved",
    },
    terminal: {
      paneClose: "Close pane",
      shellStartError: (err) => `Failed to start shell: ${err}`,
      processExited: (code) =>
        `[Process exited${code !== null ? ` (exit ${code})` : ""}]`,
      opencodeUnavailable: "Unable to query opencode-cli",
      sendError: (err) => `Failed to send prompt to OpenCode: ${err}`,
      opencodeError: (err) => `OpenCode error: ${err || "Unknown error"}`,
      generationStopped: ":: Generation stopped",
      newSessionNotice: "[V] Started a new OpenCode session for this pane",
      helpTitle: "[V] Velt Agent quick commands:",
      helpToggle: "Return to shell (keeps scrollback)",
      helpSwitcher: "Switch model, reasoning effort, or preset",
      helpEffort: "Cycle reasoning effort",
      helpInsert: "Paste suggested command into shell",
      helpSelectAll: "Select all text",
      helpSession: "New OpenCode session / clear scrollback",
      tabTooltip: (title, idx) => (idx < 9 ? `${title} (Ctrl+${idx + 1})` : title),
      closeTab: "Close tab",
    },
    ansi: {
      reasoningHeader: "REASONING",
      reasoningFooter: (secs) => `reasoning (${secs}s)`,
      moreLines: (count) => `… (+${count} lines)`,
      shellFallbackCmd: "(shell command)",
      exitError: (detail) => `[exit error${detail}]`,
      insertCommandHint: "to paste command:",
      escToShell: "── Esc to return to shell ──",
    },
    switcher: {
      ariaLabel: "Model and Reasoning Effort",
      title: "Model & Reasoning Effort",
      kbdHint: "↑↓ model · ←→ effort · Enter apply · Esc close",
      presetsLabel: "Presets:",
      searchPlaceholder: "Search model (e.g. deepseek, gemma, nemotron, flint)...",
      effortLabel: "Reasoning Effort",
      setDefault: "Also set as default combination",
      cancel: "Cancel",
      apply: "Apply",
      emptyState: "No models found",
      standard: "standard",
    },
    settings: {
      ariaLabel: "Velt Settings",
      title: "Velt Settings",
      closeAria: "Close",
      navAi: "OpenCode & Models",
      navTerminal: "Terminal & Appearance",
      navKeys: "Keybindings",
      cancel: "Cancel",
      save: "Save settings",
      filterPlaceholder: "Filter...",
      emptyFilter: "No results",
      selectPlaceholder: "Select...",
      ai: {
        defaultTitle: "Startup defaults",
        defaultHelp: "Automatically selected for every new tab and when Velt opens.",
        defaultModel: "Default model",
        defaultEffort: "Default reasoning effort",
        presetsTitle: "Quick presets",
        presetsHelp: "Saved combinations you can trigger with one click in the Quick Switcher.",
        addPreset: "Add preset",
        presetNamePlaceholder: "Name",
        removePreset: "Remove preset",
        newPresetDefaultName: "New Preset",
        exitTitle: "Agent Mode Exit & Reasoning",
        exitHelp: "Choose what stays in the terminal when returning to the shell and how thoughts and commands appear.",
        resetAi: "Reset AI defaults",
        exitModeLabel: "On Agent Mode exit",
        exitModeCommands: "Agent commands only (input & output)",
        exitModeCommandsSub: "Recommended",
        exitModeClean: "Clean terminal (hide agent chat)",
        exitModeCleanSub: "Zero clutter",
        exitModeKeep: "Keep full conversation",
        exitModeKeepSub: "AI transcript",
        cmdStyleLabel: "Agent command style in Shell Mode",
        cmdStyleShell: "Shell ($ command)",
        cmdStyleShellSub: "Clean",
        cmdStyleTagged: "Tagged ([agent]$ command)",
        cmdStyleTaggedSub: "Labeled",
        cmdStyleMinimal: "Minimal (# command)",
        cmdStyleMinimalSub: "Subtle",
        liveThinkBar: "Show live reasoning bar in Dock while OpenCode thinks",
        toolOutputInAgent: "Show compact command output preview inside Agent Mode",
        showThinking: "Also write full reasoning box into scrollback",
        cliTitle: "OpenCode CLI integration",
        statusLabel: "Status:",
        connected: (ver) => `Connected (${ver})`,
        notFound: (err) => `Not found: ${err}`,
        verifyPath: "check path",
        autoContext: "Automatically include working directory and recent terminal lines",
        redactSecrets: "Automatically redact API keys, tokens, and passwords from sent context",
        autoApprove: "Auto-approve OpenCode tool execution (--auto)",
        showHiddenModels: "Also show models hidden in OpenCode Desktop",
        showModelInShell: "Show model selector pill in Shell Mode as well",
        contextLines: "Terminal context lines",
        opencodeBin: "opencode-cli path (empty = auto)",
        autoDetected: "Auto-detected",
      },
      terminal: {
        themeTitle: "Terminal & interface theme",
        themeHelp: "Pick a palette for instant live preview across the entire window.",
        resetTerminal: "Reset appearance",
        customTitle: "Appearance, Language & Colors",
        customHelp: "Choose interface language, override theme accent, and customize behavior and geometry.",
        accentLabel: "Accent color",
        accentThemeBtn: "Theme",
        accentThemeTitle: "Use theme default accent",
        accentPickerTitle: "Choose custom color",
        accentCustom: "Custom",
        accentPresets: {
          cyan: "Velt Cyan",
          indigo: "Indigo",
          lavender: "Lavender",
          emerald: "Emerald",
          amber: "Amber",
          coral: "Coral",
          orange: "Orange",
        },
        backdropLabel: "Window backdrop",
        backdropAurora: "Aurora",
        backdropAuroraSub: "Dual-tone glow",
        backdropSubtle: "Subtle",
        backdropSubtleSub: "Soft highlight",
        backdropFlat: "Flat",
        backdropFlatSub: "Uniform tint",
        agentAuraLabel: "Agent Mode visual aura",
        auraVivid: "Vivid",
        auraVividSub: "Border + glow",
        auraMinimal: "Minimal",
        auraMinimalSub: "Thin border only",
        auraOff: "Off",
        auraOffSub: "No frame",
        languageLabel: "Interface language",
        langAuto: "Auto (System)",
        langAutoSub: "IT / EN",
        langIt: "Italiano",
        langEn: "English",
        uiRadius: "Corner radius:",
        termPadding: "Terminal padding:",
        showStatusBar: "Show bottom status bar (cwd, model, shortcut)",
        compactChrome: "Compact top bar (hides brand label to save space)",
        cursorBlink: "Blinking terminal cursor",
        focusFollowsMouse: "Focus follows mouse in split panes (type without clicking)",
        copyOnSelect: "Copy selected text automatically in terminal",
        middleClickPaste: "Middle-click paste (Primary selection / Clipboard)",
        webglRenderer: "WebGL terminal acceleration (disable if you see Wayland/WebKitGTK artifacts)",
        glassTitle: "Transparency, Blur & Animations",
        blurToggle: "Window blur (Wayland/X11 compositor blur + frosted glass)",
        animationsToggle: "Smooth animations, Agent Mode aura, and visual toasts",
        opacityLabel: "Window opacity:",
        blurRadiusLabel: "Glass blur intensity:",
        blurOff: "Off",
        typoTitle: "Typography & Buffer",
        fontFamily: "Font Family",
        shellLabel: "Shell (empty = $SHELL)",
        shellPlaceholder: "/bin/zsh, /bin/bash, /usr/bin/fish",
        fontSize: "Font Size (px)",
        lineHeight: "Line Height",
        cursorStyle: "Cursor Style",
        cursorBlock: "Block (Velt style)",
        cursorBar: "Bar",
        cursorUnderline: "Underline",
        scrollback: "Scrollback (lines)",
      },
      keys: {
        title: "Keyboard shortcuts",
        helpHtml:
          "Click a shortcut and press a new key combination (avoid <code>Alt+Space</code> on Hyprland/Sway). Pane navigation: <code>Ctrl+Shift+Arrows</code>. Press <code>Esc</code> to cancel.",
        resetKeys: "Reset keybindings",
        wmConflict: "Possible WM conflict",
        recording: "Press keys...",
        items: {
          toggle_agent: ["Toggle Agent Mode", "Primary shortcut (WM-safe)"],
          toggle_agent_alt: ["Toggle Agent Mode (Alt)", "Quick secondary shortcut"],
          select_all: ["Select all text", "Select the entire terminal buffer"],
          model_switcher: ["Open Model & Effort Switcher", "Change model, reasoning effort, or preset"],
          cycle_effort: ["Cycle Reasoning Effort", "Step low -> medium -> high -> max"],
          insert_command: ["Paste suggested command into shell", "Without auto-executing it"],
          new_agent_session: ["New OpenCode session in pane", "Reset the active AI conversation"],
          split_vertical: ["Split pane right (Vertical)", "Open a side-by-side shell"],
          split_horizontal: ["Split pane down (Horizontal)", "Open a shell below"],
          close_pane: ["Close active pane", "Close current split pane (or tab if last)"],
          new_tab: ["New Tab", "Open a new shell (also Ctrl+T)"],
          close_tab: ["Close Tab", "Close current tab"],
          open_settings: ["Open Settings", "Show this dialog"],
        },
      },
    },
  },
};
