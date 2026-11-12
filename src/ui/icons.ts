// Custom geometric SVG logos and UI icons tailored for Velt (zero emojis).

export function veltLogoSvg(size = 18, className = ""): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" class="velt-svg-logo ${className}" aria-hidden="true">
    <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="var(--velt-bg, #141517)" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>
    <path d="M5.6 6.2L10.3 18.2L14.9 6.2" stroke="var(--velt-text, #F2F4F8)" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/>
    <rect x="15.8" y="12.2" width="3.2" height="5.6" rx="0.8" fill="var(--velt-accent, #26C6FF)" class="velt-logo-cursor"/>
  </svg>`;
}

export function iconAgent(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 3.5L6.5 13L10.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="11.5" y="8.5" width="2.5" height="4.5" rx="0.6" fill="var(--velt-accent, #26C6FF)"/>
  </svg>`;
}

export function iconTerminal(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" stroke="currentColor" stroke-width="1.35"/>
    <path d="M4.6 6.1L7.1 8.1L4.6 10.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.5 10.2H11.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

export function iconPlus(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 3.2V12.8M3.2 8H12.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}

export function iconSearch(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7.1" cy="7.1" r="4.3" stroke="currentColor" stroke-width="1.45"/>
    <path d="M10.4 10.4L13.4 13.4" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
  </svg>`;
}

export function iconGear(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="2.3" stroke="currentColor" stroke-width="1.4"/>
    <path d="M8 1.8V3.1M8 12.9V14.2M1.8 8H3.1M12.9 8H14.2M3.6 3.6L4.5 4.5M11.5 11.5L12.4 12.4M12.4 3.6L11.5 4.5M4.5 11.5L3.6 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

export function iconClose(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4.2 4.2L11.8 11.8M11.8 4.2L4.2 11.8" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
  </svg>`;
}

export function iconArrowUp(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 10L8 6L12 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function iconArrowDown(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function iconSend(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function iconStop(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="8" height="8" rx="1.4" fill="currentColor"/>
  </svg>`;
}

export function iconContext(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 4.5H13M3 8H10.5M3 11.5H8.5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
    <circle cx="12.5" cy="11.2" r="1.6" fill="currentColor"/>
  </svg>`;
}

export function iconCommandInsert(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5V8.5C3.5 9.6 4.4 10.5 5.5 10.5H12.5M9.5 7.5L12.5 10.5L9.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function iconCpu(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.35"/>
    <rect x="6.5" y="6.5" width="3" height="3" rx="0.5" fill="var(--velt-accent, #26C6FF)"/>
    <path d="M6.2 1.8V4M9.8 1.8V4M6.2 12V14.2M9.8 12V14.2M1.8 6.2H4M1.8 9.8H4M12 6.2H14.2M12 9.8H14.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
  </svg>`;
}

export function iconSliders(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 4.5H13.5M2.5 8H13.5M2.5 11.5H13.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
    <circle cx="5.5" cy="4.5" r="1.6" fill="var(--velt-bg, #141517)" stroke="currentColor" stroke-width="1.35"/>
    <circle cx="10.5" cy="8" r="1.6" fill="var(--velt-bg, #141517)" stroke="currentColor" stroke-width="1.35"/>
    <circle cx="6.5" cy="11.5" r="1.6" fill="var(--velt-bg, #141517)" stroke="currentColor" stroke-width="1.35"/>
  </svg>`;
}

export function iconKeyboard(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3.5" width="13" height="9" rx="1.8" stroke="currentColor" stroke-width="1.35"/>
    <path d="M4.2 6.5H5.2M7.5 6.5H8.5M10.8 6.5H11.8M5 9.8H11" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
  </svg>`;
}

export function iconCopy(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5.5" y="5.5" width="7.5" height="8" rx="1.4" stroke="currentColor" stroke-width="1.35"/>
    <path d="M10.5 5.5V3.9C10.5 3.1 9.9 2.5 9.1 2.5H3.9C3.1 2.5 2.5 3.1 2.5 3.9V9.1C2.5 9.9 3.1 10.5 3.9 10.5H5.5" stroke="currentColor" stroke-width="1.35"/>
  </svg>`;
}

export function iconPaste(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3.2" y="3.5" width="9.6" height="10.5" rx="1.5" stroke="currentColor" stroke-width="1.35"/>
    <path d="M6 2.2H10V4.3H6V2.2Z" fill="var(--velt-bg, #141517)" stroke="currentColor" stroke-width="1.2"/>
  </svg>`;
}

export function iconSelectAll(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 5V3.2C2.5 2.8 2.8 2.5 3.2 2.5H5M11 2.5H12.8C13.2 2.5 13.5 2.8 13.5 3.2V5M13.5 11V12.8C13.5 13.2 13.2 13.5 12.8 13.5H11M5 13.5H3.2C2.8 13.5 2.5 13.2 2.5 12.8V11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="5.2" y="5.2" width="5.6" height="5.6" rx="0.8" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="1.1"/>
  </svg>`;
}

export function iconClear(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 4.5H13M4.5 8H11.5M6.5 11.5H9.5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
  </svg>`;
}

export function iconWave(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" class="velt-wave-svg" aria-hidden="true">
    <rect x="2" y="5" width="2" height="6" rx="1" fill="var(--velt-accent, #26C6FF)" class="bar b1"/>
    <rect x="6" y="3" width="2" height="10" rx="1" fill="var(--velt-accent, #26C6FF)" class="bar b2"/>
    <rect x="10" y="4" width="2" height="8" rx="1" fill="var(--velt-accent, #26C6FF)" class="bar b3"/>
    <rect x="14" y="6" width="2" height="4" rx="1" fill="var(--velt-accent, #26C6FF)" class="bar b4"/>
  </svg>`;
}

export function iconPalette(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="5.8" stroke="currentColor" stroke-width="1.35"/>
    <circle cx="5.7" cy="6.2" r="1.1" fill="var(--velt-accent, #26C6FF)"/>
    <circle cx="9.8" cy="5.7" r="1" fill="var(--velt-green, #4ADE80)"/>
    <circle cx="10.8" cy="9.2" r="1" fill="var(--velt-amber, #FBBF24)"/>
    <circle cx="6.8" cy="10.4" r="1" fill="var(--velt-red, #F87171)"/>
  </svg>`;
}

export function iconCheck(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.2 8.4L6.4 11.6L12.8 4.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function iconWinMinimize(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.2 8.5H12.8" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
  </svg>`;
}

export function iconWinMaximize(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.6" stroke="currentColor" stroke-width="1.35"/>
  </svg>`;
}

export function iconWinRestore(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2.8" y="4.8" width="8" height="8" rx="1.3" stroke="currentColor" stroke-width="1.3"/>
    <path d="M5.5 4.8V3.6C5.5 3.0 6.0 2.5 6.6 2.5H12.4C13.0 2.5 13.5 3.0 13.5 3.6V9.4C13.5 10.0 13.0 10.5 12.4 10.5H10.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`;
}

export function iconWinClose(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

export function iconThink(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" class="velt-think-svg" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" stroke="var(--velt-accent, #26C6FF)" stroke-opacity="0.45" stroke-width="1.3" stroke-dasharray="3 2.5"/>
    <circle cx="8" cy="8" r="2.2" fill="var(--velt-accent, #26C6FF)" class="velt-think-core"/>
  </svg>`;
}

export function iconSplitVertical(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="1.8" stroke="currentColor" stroke-width="1.35"/>
    <path d="M8 2.8V13.2" stroke="currentColor" stroke-width="1.35"/>
  </svg>`;
}

export function iconSplitHorizontal(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="1.8" stroke="currentColor" stroke-width="1.35"/>
    <path d="M2.3 8H13.7" stroke="currentColor" stroke-width="1.35"/>
  </svg>`;
}

export function iconPaneClose(size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2.2" y="2.5" width="11.6" height="11" rx="1.8" stroke="currentColor" stroke-width="1.3"/>
    <path d="M6.2 6.2L9.8 9.8M9.8 6.2L6.2 9.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

export function iconReset(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.2 7.8A4.8 4.8 0 1 1 4.8 11.4" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
    <path d="M2.5 4.8V8.1H5.8" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
