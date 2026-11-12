import type { ITheme } from "@xterm/xterm";

export interface VeltTheme {
  id: string;
  name: string;
  tagline: string;
  bg: string;
  surface: string;
  surface2: string;
  inputBg: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  codeBg: string;
  green: string;
  amber: string;
  red: string;
  selection: string;
  terminal: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const VELT_THEMES: VeltTheme[] = [
  {
    id: "velt-obsidian",
    name: "Velt Obsidian",
    tagline: "Nero ossidiana & ciano elettrico",
    bg: "#141517",
    surface: "#1a1c20",
    surface2: "#22262c",
    inputBg: "#121418",
    border: "#2b3038",
    text: "#f2f4f8",
    muted: "#9aa5b5",
    accent: "#26c6ff",
    accentSoft: "#80e2ff",
    codeBg: "#1c2129",
    green: "#4ade80",
    amber: "#fbbf24",
    red: "#f87171",
    selection: "rgba(38, 198, 255, 0.28)",
    terminal: {
      black: "#1a1d23",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#fbbf24",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#26c6ff",
      white: "#e2e8f0",
      brightBlack: "#64748b",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#7de0ff",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    tagline: "Notte zaffiro & indaco neon",
    bg: "#1a1b26",
    surface: "#1f2335",
    surface2: "#292e42",
    inputBg: "#16161e",
    border: "#343b58",
    text: "#c0caf5",
    muted: "#7a86b3",
    accent: "#7aa2f7",
    accentSoft: "#7dcfff",
    codeBg: "#24283b",
    green: "#9ece6a",
    amber: "#e0af68",
    red: "#f7768e",
    selection: "rgba(122, 162, 247, 0.30)",
    terminal: {
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#ff899d",
      brightGreen: "#9fe044",
      brightYellow: "#faba4a",
      brightBlue: "#8db0ff",
      brightMagenta: "#c7a9ff",
      brightCyan: "#a4daff",
      brightWhite: "#c0caf5",
    },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    tagline: "Lavanda vellutata & toni pastello",
    bg: "#1e1e2e",
    surface: "#242437",
    surface2: "#313244",
    inputBg: "#181825",
    border: "#45475a",
    text: "#cdd6f4",
    muted: "#9399b2",
    accent: "#cba6f7",
    accentSoft: "#89dceb",
    codeBg: "#2a2b3d",
    green: "#a6e3a1",
    amber: "#f9e2af",
    red: "#f38ba8",
    selection: "rgba(203, 166, 247, 0.28)",
    terminal: {
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5",
      brightWhite: "#cdd6f4",
    },
  },
  {
    id: "nord",
    name: "Nord Arctic",
    tagline: "Ghiaccio polare & ardesia nordica",
    bg: "#242933",
    surface: "#2e3440",
    surface2: "#3b4252",
    inputBg: "#1e222b",
    border: "#434c5e",
    text: "#eceff4",
    muted: "#9aa5b8",
    accent: "#88c0d0",
    accentSoft: "#8fbcbb",
    codeBg: "#2e3440",
    green: "#a3be8c",
    amber: "#ebcb8b",
    red: "#bf616a",
    selection: "rgba(136, 192, 208, 0.28)",
    terminal: {
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#d06f79",
      brightGreen: "#b1d196",
      brightYellow: "#f0d399",
      brightBlue: "#88c0d0",
      brightMagenta: "#c895bf",
      brightCyan: "#93ccdc",
      brightWhite: "#eceff4",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Amber",
    tagline: "Grafite calda & oro retrò",
    bg: "#1d2021",
    surface: "#282828",
    surface2: "#32302f",
    inputBg: "#181a1b",
    border: "#504945",
    text: "#ebdbb2",
    muted: "#a89984",
    accent: "#fabd2f",
    accentSoft: "#fe8019",
    codeBg: "#2b2928",
    green: "#b8bb26",
    amber: "#fabd2f",
    red: "#fb4934",
    selection: "rgba(250, 189, 47, 0.26)",
    terminal: {
      black: "#282828",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2",
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    tagline: "Inchiostro prugna & oro rosa",
    bg: "#191724",
    surface: "#1f1d2e",
    surface2: "#26233a",
    inputBg: "#14121d",
    border: "#403d52",
    text: "#e0def4",
    muted: "#908caa",
    accent: "#ebbcba",
    accentSoft: "#9ccfd8",
    codeBg: "#232033",
    green: "#9ccfd8",
    amber: "#f6c177",
    red: "#eb6f92",
    selection: "rgba(235, 188, 186, 0.26)",
    terminal: {
      black: "#26233a",
      red: "#eb6f92",
      green: "#9ccfd8",
      yellow: "#f6c177",
      blue: "#31748f",
      magenta: "#c4a7e7",
      cyan: "#ebbcba",
      white: "#e0def4",
      brightBlack: "#6e6a86",
      brightRed: "#eb6f92",
      brightGreen: "#9ccfd8",
      brightYellow: "#f6c177",
      brightBlue: "#31748f",
      brightMagenta: "#c4a7e7",
      brightCyan: "#ebbcba",
      brightWhite: "#f2effb",
    },
  },
  {
    id: "dracula",
    name: "Dracula Violet",
    tagline: "Viola gotico & menta brillante",
    bg: "#1e1f29",
    surface: "#282a36",
    surface2: "#343746",
    inputBg: "#191a22",
    border: "#44475a",
    text: "#f8f8f2",
    muted: "#9ea8c7",
    accent: "#bd93f9",
    accentSoft: "#8be9fd",
    codeBg: "#282a36",
    green: "#50fa7b",
    amber: "#f1fa8c",
    red: "#ff5555",
    selection: "rgba(189, 147, 249, 0.28)",
    terminal: {
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "kanagawa",
    name: "Kanagawa Wave",
    tagline: "Inchiostro giapponese & onde blu",
    bg: "#1f1f28",
    surface: "#252532",
    surface2: "#2d2d3d",
    inputBg: "#181820",
    border: "#3d3d4f",
    text: "#dcd7ba",
    muted: "#95927c",
    accent: "#7e9cd8",
    accentSoft: "#7fb4ca",
    codeBg: "#262633",
    green: "#98bb6c",
    amber: "#e6c384",
    red: "#e46876",
    selection: "rgba(126, 156, 216, 0.28)",
    terminal: {
      black: "#16161d",
      red: "#c34043",
      green: "#76946a",
      yellow: "#c0a36e",
      blue: "#7e9cd8",
      magenta: "#957fb8",
      cyan: "#6a9589",
      white: "#c8c093",
      brightBlack: "#727169",
      brightRed: "#e82424",
      brightGreen: "#98bb6c",
      brightYellow: "#e6c384",
      brightBlue: "#7fb4ca",
      brightMagenta: "#938aa9",
      brightCyan: "#7aa89f",
      brightWhite: "#dcd7ba",
    },
  },
  {
    id: "monokai-pro",
    name: "Monokai Pro",
    tagline: "Antracite editoriale & oro vivo",
    bg: "#1c1b1d",
    surface: "#262427",
    surface2: "#322f33",
    inputBg: "#161517",
    border: "#444046",
    text: "#fcfcfa",
    muted: "#9b969c",
    accent: "#ffd866",
    accentSoft: "#78dce8",
    codeBg: "#28262a",
    green: "#a9dc76",
    amber: "#ffd866",
    red: "#ff6188",
    selection: "rgba(255, 216, 102, 0.24)",
    terminal: {
      black: "#2c292d",
      red: "#ff6188",
      green: "#a9dc76",
      yellow: "#ffd866",
      blue: "#fc9867",
      magenta: "#ab9df2",
      cyan: "#78dce8",
      white: "#fcfcfa",
      brightBlack: "#727072",
      brightRed: "#ff6188",
      brightGreen: "#a9dc76",
      brightYellow: "#ffd866",
      brightBlue: "#fc9867",
      brightMagenta: "#ab9df2",
      brightCyan: "#78dce8",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Deep",
    tagline: "Petrolio classico & verde acqua",
    bg: "#002b36",
    surface: "#073642",
    surface2: "#0d4352",
    inputBg: "#00232c",
    border: "#1c5666",
    text: "#eee8d5",
    muted: "#839496",
    accent: "#2aa198",
    accentSoft: "#268bd2",
    codeBg: "#05333f",
    green: "#859900",
    amber: "#b58900",
    red: "#dc322f",
    selection: "rgba(42, 161, 152, 0.28)",
    terminal: {
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#859900",
      brightYellow: "#b58900",
      brightBlue: "#6c71c4",
      brightMagenta: "#d33682",
      brightCyan: "#2aa198",
      brightWhite: "#fdf6e3",
    },
  },
];

export function getThemeById(id: string | undefined | null): VeltTheme {
  return VELT_THEMES.find((t) => t.id === id) || VELT_THEMES[0];
}

export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return "20, 21, 23";
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

export function isValidHexColor(val: string | undefined | null): val is string {
  return Boolean(val && /^#[0-9a-fA-F]{6}$/.test(val.trim()));
}

export function computeSoftAccent(hex: string): string {
  const clean = hex.replace("#", "").trim();
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return "#80e2ff";
  const r = Math.min(255, Math.round(((num >> 16) & 255) * 0.62 + 255 * 0.38));
  const g = Math.min(255, Math.round(((num >> 8) & 255) * 0.62 + 255 * 0.38));
  const b = Math.min(255, Math.round((num & 255) * 0.62 + 255 * 0.38));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function toXtermTheme(
  theme: VeltTheme,
  mode: "shell" | "agent",
  accentOverride?: string
): ITheme {
  const accent = isValidHexColor(accentOverride) ? accentOverride.trim() : theme.accent;
  const selection = isValidHexColor(accentOverride)
    ? `rgba(${hexToRgbTriplet(accent)}, 0.28)`
    : theme.selection;
  return {
    background: "rgba(0, 0, 0, 0)",
    foreground: theme.text,
    cursor: mode === "agent" ? accent : theme.text,
    cursorAccent: theme.bg,
    selectionBackground: selection,
    ...theme.terminal,
  };
}
