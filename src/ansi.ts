import type { Terminal } from "@xterm/xterm";
import { STRINGS, type AppLocale } from "./i18n";
import { redactSensitiveText } from "./redact";
import { computeSoftAccent, isValidHexColor, type VeltTheme } from "./themes";

let currentAnsiLocale: AppLocale = "en";

export function setAnsiLocale(locale: AppLocale): void {
  currentAnsiLocale = locale;
}

const ESC = "\x1b";
export const RESET = `${ESC}[0m`;
export const BOLD = `${ESC}[1m`;
export const DIM = `${ESC}[2m`;
export const ITALIC = `${ESC}[3m`;
export let CYAN = `${ESC}[38;2;38;198;255m`;
export let CYAN_SOFT = `${ESC}[38;2;125;224;255m`;
export let WHITE = `${ESC}[38;2;242;244;248m`;
export let MUTED = `${ESC}[38;2;138;147;162m`;
export let GREEN = `${ESC}[38;2;74;222;128m`;
export let AMBER = `${ESC}[38;2;251;191;36m`;
export let RED = `${ESC}[38;2;248;113;113m`;
export let CODE_BG = `${ESC}[48;2;28;33;41m`;

function hexRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const n = Number.parseInt(clean, 16);
  if (Number.isNaN(n)) return [20, 21, 23];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fgHex(hex: string): string {
  const [r, g, b] = hexRgb(hex);
  return `${ESC}[38;2;${r};${g};${b}m`;
}

function bgHex(hex: string): string {
  const [r, g, b] = hexRgb(hex);
  return `${ESC}[48;2;${r};${g};${b}m`;
}

export function setAnsiTheme(theme: VeltTheme, accentOverride?: string): void {
  const accent = isValidHexColor(accentOverride) ? accentOverride.trim() : theme.accent;
  const soft = isValidHexColor(accentOverride) ? computeSoftAccent(accent) : theme.accentSoft;
  CYAN = fgHex(accent);
  CYAN_SOFT = fgHex(soft);
  WHITE = fgHex(theme.text);
  MUTED = fgHex(theme.muted);
  GREEN = fgHex(theme.green);
  AMBER = fgHex(theme.amber);
  RED = fgHex(theme.red);
  CODE_BG = bgHex(theme.codeBg);
}

export interface PromptSnapshot {
  ansiLine: string;
  cursorX: number;
  isAltScreen: boolean;
}

export interface TerminalSnapshot extends PromptSnapshot {
  ansiLines: string[];
  wrappedRows: boolean[];
}

export interface AgentCommandRecord {
  id?: string;
  toolName: string;
  command: string;
  output?: string | null;
  ok: boolean;
  errorText?: string | null;
}

type BufferLine = NonNullable<ReturnType<Terminal["buffer"]["active"]["getLine"]>>;

function serializeBufferLine(line: BufferLine, limitCol?: number): string {
  let limit = limitCol;
  if (limit === undefined) {
    let lastNonEmpty = -1;
    for (let x = line.length - 1; x >= 0; x--) {
      const c = line.getCell(x);
      if (c && c.getChars() !== "" && c.getChars() !== " ") {
        lastNonEmpty = x;
        break;
      }
    }
    limit = lastNonEmpty + 1;
  }

  let out = "";
  let prevStyle = "";
  for (let x = 0; x < limit && x < line.length; x++) {
    const c = line.getCell(x);
    if (!c) continue;
    const width = c.getWidth();
    if (width === 0) continue;

    const style = buildCellSgr(c);
    if (style !== prevStyle) {
      out += style;
      prevStyle = style;
    }
    const ch = c.getChars();
    out += ch === "" ? " " : ch;
  }

  if (prevStyle !== "" && prevStyle !== RESET) {
    out += RESET;
  }
  return out;
}

/**
 * Captures the active shell line (with ANSI colors) so we can cleanly restore
 * the visual prompt and cursor X position when returning from Agent Mode.
 */
export function capturePromptSnapshot(term: Terminal): PromptSnapshot {
  const buf = term.buffer.active;
  const isAltScreen = buf.type === "alternate";
  if (isAltScreen) {
    return { ansiLine: "", cursorX: 0, isAltScreen: true };
  }

  const row = buf.baseY + buf.cursorY;
  const line = buf.getLine(row);
  if (!line || !line.getCell(0)) {
    return { ansiLine: "", cursorX: buf.cursorX, isAltScreen: false };
  }

  let lastNonEmpty = -1;
  for (let x = line.length - 1; x >= 0; x--) {
    const c = line.getCell(x);
    if (c && c.getChars() !== "" && c.getChars() !== " ") {
      lastNonEmpty = x;
      break;
    }
  }
  const limit = Math.max(lastNonEmpty + 1, buf.cursorX);
  return {
    ansiLine: serializeBufferLine(line, limit),
    cursorX: buf.cursorX,
    isAltScreen: false,
  };
}

/**
 * Captures the full pre-agent scrollback + active prompt line with ANSI SGR colors,
 * preserving wrapped logical lines cleanly.
 */
export function captureTerminalSnapshot(term: Terminal): TerminalSnapshot {
  const prompt = capturePromptSnapshot(term);
  if (prompt.isAltScreen) {
    return { ...prompt, ansiLines: [], wrappedRows: [] };
  }

  const buf = term.buffer.active;
  const cursorAbsRow = buf.baseY + buf.cursorY;
  const ansiLines: string[] = [];
  const wrappedRows: boolean[] = [];

  for (let r = 0; r < cursorAbsRow; r++) {
    const line = buf.getLine(r);
    if (!line) {
      ansiLines.push("");
      wrappedRows.push(false);
      continue;
    }
    const nextLine = r + 1 < cursorAbsRow ? buf.getLine(r + 1) : undefined;
    const isNextWrapped = Boolean(nextLine?.isWrapped);
    ansiLines.push(serializeBufferLine(line, isNextWrapped ? line.length : undefined));
    wrappedRows.push(Boolean(line.isWrapped));
  }

  // Trim any trailing completely empty non-wrapped lines at the very end only?
  // No: preserve exact pre-prompt spacing so layout matches 1:1.
  return {
    ...prompt,
    ansiLines,
    wrappedRows,
  };
}

export function formatTerminalSnapshotBody(snap: TerminalSnapshot): string {
  if (snap.ansiLines.length === 0) return "";
  let out = "";
  for (let i = 0; i < snap.ansiLines.length; i++) {
    if (i > 0 && !snap.wrappedRows[i]) {
      out += "\r\n";
    }
    out += snap.ansiLines[i];
  }
  return out;
}

function buildCellSgr(c: NonNullable<ReturnType<NonNullable<ReturnType<Terminal["buffer"]["active"]["getLine"]>>["getCell"]>>): string {
  const codes: string[] = ["0"];
  if (c.isBold()) codes.push("1");
  if (c.isDim()) codes.push("2");
  if (c.isItalic()) codes.push("3");
  if (c.isUnderline()) codes.push("4");
  if (c.isInverse()) codes.push("7");

  if (c.isFgRGB()) {
    const v = c.getFgColor();
    codes.push(`38;2;${(v >> 16) & 0xff};${(v >> 8) & 0xff};${v & 0xff}`);
  } else if (c.isFgPalette()) {
    codes.push(`38;5;${c.getFgColor()}`);
  }

  if (c.isBgRGB()) {
    const v = c.getBgColor();
    codes.push(`48;2;${(v >> 16) & 0xff};${(v >> 8) & 0xff};${v & 0xff}`);
  } else if (c.isBgPalette()) {
    codes.push(`48;5;${c.getBgColor()}`);
  }

  return `${ESC}[${codes.join(";")}m`;
}

export interface ExtractedContext {
  text: string;
  redactedCount: number;
}

export function extractRecentContext(
  term: Terminal,
  maxLines: number,
  redactSecrets = true
): ExtractedContext {
  const buf = term.buffer.active;
  const total = buf.length;
  const start = Math.max(0, total - Math.max(10, maxLines * 2));
  const lines: string[] = [];

  for (let i = start; i < total; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true);
    if (text.trim().length > 0) {
      lines.push(text);
    }
  }

  const raw = lines.slice(-maxLines).join("\n");
  if (!redactSecrets || !raw) {
    return { text: raw, redactedCount: 0 };
  }
  return redactSensitiveText(raw);
}

export function formatAgentPromptHeader(
  model: string,
  effort: string,
  cwd: string,
  prompt: string,
  hasContext: boolean
): string {
  const shortModel = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  const effortLabel = effort && effort !== "default" ? ` • ${effort}` : "";
  const ctxTag = hasContext ? ` ${DIM}${MUTED}[+ctx]${RESET}` : "";
  const shortCwd = cwd.replace(/^\/home\/[^/]+/, "~");

  const lines = prompt.split(/\r?\n/);
  let out = `\r\n${CYAN}╭─ [V] VELT AGENT${RESET}  ${BOLD}${WHITE}${shortModel}${CYAN_SOFT}${effortLabel}${RESET}${ctxTag}  ${DIM}${MUTED}${shortCwd}${RESET}\r\n`;
  for (const l of lines) {
    out += `${CYAN}│${RESET} ${WHITE}${l}${RESET}\r\n`;
  }
  out += `${CYAN}╰─${RESET}\r\n`;
  return out;
}

export function isShellCommandTool(name?: string | null): boolean {
  if (!name) return false;
  return ["bash", "shell", "sh", "exec", "terminal", "run_command"].includes(
    name.toLowerCase()
  );
}

export function formatToolStart(name: string, input?: string | null): string {
  const detail = input ? ` ${MUTED}${truncateInline(input, 96)}${RESET}` : "";
  return `  ${AMBER}>> ${name}${RESET}${detail}\r\n`;
}

export function formatToolDone(name: string, ok: boolean, err?: string | null): string {
  if (ok) {
    return `  ${GREEN}[ok]${RESET} ${DIM}${MUTED}${name}${RESET}\r\n`;
  }
  const msg = err ? `: ${err}` : "";
  return `  ${RED}[err] ${name}${msg}${RESET}\r\n`;
}

export function formatToolOutputPreview(output: string, maxLines = 8): string {
  const normalized = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  if (!normalized) return "";
  const lines = normalized.split("\n");
  const sliced = lines.slice(0, maxLines);
  let out = "";
  for (const line of sliced) {
    out += `  ${DIM}${CYAN}│${RESET} ${MUTED}${line}${RESET}\r\n`;
  }
  if (lines.length > maxLines) {
    const more = STRINGS[currentAnsiLocale].ansi.moreLines(lines.length - maxLines);
    out += `  ${DIM}${CYAN}│${RESET} ${DIM}${MUTED}${more}${RESET}\r\n`;
  }
  return out;
}

export function formatAgentCommandIoForShell(
  records: AgentCommandRecord[],
  style: "shell" | "tagged" | "minimal" = "shell"
): string {
  if (records.length === 0) return "";
  let out = "";

  for (const rec of records) {
    const cmdLines = rec.command.replace(/\r\n/g, "\n").split("\n");
    cmdLines.forEach((line, idx) => {
      if (idx === 0) {
        if (style === "tagged") {
          out += `${CYAN}[agent]${RESET} ${MUTED}$${RESET} ${BOLD}${WHITE}${line}${RESET}\r\n`;
        } else if (style === "minimal") {
          out += `${DIM}${CYAN}#${RESET} ${WHITE}${line}${RESET}\r\n`;
        } else {
          out += `${CYAN}$${RESET} ${BOLD}${WHITE}${line}${RESET}\r\n`;
        }
      } else {
        out += `  ${WHITE}${line}${RESET}\r\n`;
      }
    });

    const cleanOut = (rec.output ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n+$/g, "");
    if (cleanOut.length > 0) {
      out += cleanOut.replace(/\n/g, "\r\n") + `${RESET}\r\n`;
    }

    if (!rec.ok) {
      const errDetail = rec.errorText ? ` (${rec.errorText})` : "";
      const errTag = STRINGS[currentAnsiLocale].ansi.exitError(errDetail);
      out += `${RED}${errTag}${RESET}\r\n`;
    } else if (style === "tagged" && cleanOut.length === 0) {
      out += `${DIM}${GREEN}[ok]${RESET}\r\n`;
    }
  }

  return out;
}

export function formatAgentFooter(
  lastCommand: string | null,
  insertShortcut: string,
  tokensOut?: number | null
): string {
  const t = STRINGS[currentAnsiLocale].ansi;
  const tokStr = tokensOut ? `  ${DIM}${MUTED}(${tokensOut} tok)${RESET}` : "";
  const cmdHint = lastCommand
    ? `  ${CYAN}-> ${insertShortcut}${RESET} ${MUTED}${t.insertCommandHint}${RESET} ${CYAN_SOFT}${truncateInline(lastCommand, 48)}${RESET}\r\n`
    : "";
  return `\r\n${cmdHint}${DIM}${MUTED}  ${t.escToShell}${RESET}${tokStr}\r\n`;
}

function truncateInline(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

/**
 * Stateful streaming Markdown -> ANSI converter writing directly into xterm.js
 * token-by-token with zero newline lag, while extracting the latest shell command block.
 */
export class StreamingMarkdownAnsi {
  private term: Terminal;
  private atLineStart = true;
  private startBuf = "";
  private inCodeBlock = false;
  private waitingCodeLang = false;
  private codeLang = "";
  private currentCodeBuf = "";
  private inInlineCode = false;
  private inBold = false;
  private inHeading = false;
  private pendingStar = false;
  private lastCommand: string | null = null;
  private wroteAnything = false;
  private inThinking = false;
  private thinkAtLineStart = true;
  private thinkCol = 0;
  private thinkStartedAt = 0;
  private thinkBlankLines = 0;
  private thinkHasContent = false;

  constructor(term: Terminal) {
    this.term = term;
  }

  public getLastCommand(): string | null {
    return this.lastCommand;
  }

  public hasOutput(): boolean {
    return this.wroteAnything;
  }

  public pushReasoningDelta(delta: string): void {
    if (!delta) return;
    if (!this.inThinking) {
      this.inThinking = true;
      this.thinkAtLineStart = true;
      this.thinkCol = 0;
      this.thinkStartedAt = performance.now();
      this.thinkBlankLines = 0;
      this.thinkHasContent = false;
      const header = STRINGS[currentAnsiLocale].ansi.reasoningHeader;
      this.term.write(`  ${DIM}${CYAN}╭─${RESET} ${DIM}${MUTED}${header}${RESET}\r\n`);
    }

    const maxCols = Math.max(48, Math.min(88, (this.term.cols || 88) - 8));
    let out = "";

    for (const ch of delta) {
      if (ch === "\r") continue;

      if (ch === "\n") {
        if (!this.thinkHasContent) continue;
        this.thinkBlankLines++;
        if (this.thinkBlankLines <= 1) {
          out += `${RESET}\r\n`;
          this.thinkAtLineStart = true;
          this.thinkCol = 0;
        }
        continue;
      }

      if (!this.thinkHasContent && (ch === " " || ch === "\t")) {
        continue;
      }

      if (this.thinkAtLineStart) {
        if (ch === " " || ch === "\t") {
          // Strip excess indentation from LLM thought blocks so rail stays aligned
          continue;
        }
        out += `  ${DIM}${CYAN}│${RESET} ${DIM}${ITALIC}${MUTED}`;
        this.thinkAtLineStart = false;
        this.thinkCol = 0;
      }

      this.thinkHasContent = true;
      this.thinkBlankLines = 0;

      if (this.thinkCol >= maxCols && (ch === " " || ch === "\t")) {
        out += `${RESET}\r\n`;
        this.thinkAtLineStart = true;
        this.thinkCol = 0;
        continue;
      }

      out += ch;
      this.thinkCol++;
    }

    if (out.length > 0) {
      this.term.write(out);
    }
  }

  public endReasoningIfActive(): void {
    if (this.inThinking) {
      this.inThinking = false;
      const secs = Math.max(0.1, (performance.now() - this.thinkStartedAt) / 1000).toFixed(1);
      const newline = this.thinkAtLineStart ? "" : `${RESET}\r\n`;
      const footer = STRINGS[currentAnsiLocale].ansi.reasoningFooter(secs);
      this.term.write(`${newline}  ${DIM}${CYAN}╰─${RESET} ${DIM}${MUTED}${footer}${RESET}\r\n\r\n`);
    }
  }

  public pushTextDelta(delta: string): void {
    if (!delta) return;
    this.endReasoningIfActive();
    this.wroteAnything = true;

    for (const ch of delta) {
      if (ch === "\r") continue;
      this.feedChar(ch);
    }
  }

  public finish(): void {
    this.endReasoningIfActive();
    if (this.startBuf.length > 0) {
      this.flushStartBufAsProse();
    }
    if (this.pendingStar) {
      this.term.write("*");
      this.pendingStar = false;
    }
    if (this.inInlineCode || this.inBold || this.inHeading) {
      this.term.write(RESET);
      this.inInlineCode = false;
      this.inBold = false;
      this.inHeading = false;
    }
    if (this.inCodeBlock) {
      this.closeCodeBlock();
    } else if (!this.atLineStart) {
      this.term.write("\r\n");
      this.atLineStart = true;
    }
  }

  private feedChar(ch: string): void {
    if (this.waitingCodeLang) {
      if (ch === "\n") {
        this.waitingCodeLang = false;
        this.codeLang = this.codeLang.trim().toLowerCase();
        const label = this.codeLang ? ` ${this.codeLang} ` : "";
        this.term.write(`  ${CYAN}┌─${DIM}${CYAN_SOFT}${label}${RESET}\r\n`);
        this.atLineStart = true;
      } else {
        this.codeLang += ch;
      }
      return;
    }

    if (this.atLineStart) {
      if (ch === "\n") {
        if (this.startBuf.length > 0) {
          this.flushStartBufAsProse();
        }
        if (this.inCodeBlock) {
          this.currentCodeBuf += "\n";
          this.term.write(`  ${CYAN}│${RESET}\r\n`);
        } else {
          this.term.write("\r\n");
        }
        return;
      }

      this.startBuf += ch;

      if (this.startBuf === "```") {
        this.startBuf = "";
        this.atLineStart = false;
        if (!this.inCodeBlock) {
          this.inCodeBlock = true;
          this.waitingCodeLang = true;
          this.codeLang = "";
          this.currentCodeBuf = "";
        } else {
          this.closeCodeBlock();
          // Swallow trailing newline after closing fence smoothly on next \n
        }
        return;
      }

      // Still possibly building ```
      if ("```".startsWith(this.startBuf)) {
        return;
      }

      if (this.inCodeBlock) {
        this.atLineStart = false;
        const prefix = this.startBuf;
        this.startBuf = "";
        this.currentCodeBuf += prefix;
        this.term.write(`  ${CYAN}│${RESET} ${CODE_BG}${WHITE} ${prefix}`);
        return;
      }

      // Check markdown headings (# ... ) or bullet (- / * )
      if (/^#{1,4}$/.test(this.startBuf)) {
        return; // Wait for space or next char
      }
      if (/^#{1,4}\s$/.test(this.startBuf)) {
        this.startBuf = "";
        this.atLineStart = false;
        this.inHeading = true;
        this.term.write(`  ${BOLD}${CYAN}`);
        return;
      }
      if (this.startBuf === "- " || this.startBuf === "* ") {
        this.startBuf = "";
        this.atLineStart = false;
        this.term.write(`  ${CYAN}•${RESET} `);
        return;
      }
      if (this.startBuf === "-" || this.startBuf === "*") {
        return; // Wait one more char to distinguish bullet vs **bold**
      }
      if (this.startBuf === "> ") {
        this.startBuf = "";
        this.atLineStart = false;
        this.term.write(`  ${CYAN}┃${RESET} ${ITALIC}${MUTED}`);
        return;
      }
      if (this.startBuf === ">") {
        return;
      }

      // Otherwise flush startBuf as normal prose line start
      this.flushStartBufAsProse();
      return;
    }

    // Mid-line handling
    if (ch === "\n") {
      if (this.pendingStar) {
        this.term.write("*");
        this.pendingStar = false;
      }
      if (this.inInlineCode || this.inBold || this.inHeading) {
        this.term.write(RESET);
        this.inInlineCode = false;
        this.inBold = false;
        this.inHeading = false;
      }
      if (this.inCodeBlock) {
        this.currentCodeBuf += "\n";
        this.term.write(`${RESET}\r\n`);
      } else {
        this.term.write(`${RESET}\r\n`);
      }
      this.atLineStart = true;
      return;
    }

    if (this.inCodeBlock) {
      this.currentCodeBuf += ch;
      this.term.write(ch);
      return;
    }

    this.writeProseChar(ch);
  }

  private flushStartBufAsProse(): void {
    const buf = this.startBuf;
    this.startBuf = "";
    this.atLineStart = false;
    if (this.inCodeBlock) {
      this.currentCodeBuf += buf;
      this.term.write(`  ${CYAN}│${RESET} ${CODE_BG}${WHITE} ${buf}`);
      return;
    }
    this.term.write("  ");
    for (const c of buf) {
      this.writeProseChar(c);
    }
  }

  private writeProseChar(ch: string): void {
    if (ch === "`") {
      if (this.pendingStar) {
        this.term.write("*");
        this.pendingStar = false;
      }
      if (!this.inInlineCode) {
        this.inInlineCode = true;
        this.term.write(`${CODE_BG}${CYAN_SOFT}`);
      } else {
        this.inInlineCode = false;
        this.term.write(RESET);
        if (this.inHeading) this.term.write(`${BOLD}${CYAN}`);
        else if (this.inBold) this.term.write(`${BOLD}${WHITE}`);
      }
      return;
    }

    if (!this.inInlineCode && ch === "*") {
      if (this.pendingStar) {
        this.pendingStar = false;
        if (!this.inBold) {
          this.inBold = true;
          this.term.write(`${BOLD}${WHITE}`);
        } else {
          this.inBold = false;
          this.term.write(RESET);
          if (this.inHeading) this.term.write(`${BOLD}${CYAN}`);
        }
      } else {
        this.pendingStar = true;
      }
      return;
    }

    if (this.pendingStar) {
      this.pendingStar = false;
      this.term.write("*");
    }

    this.term.write(ch);
  }

  private closeCodeBlock(): void {
    this.term.write(`  ${CYAN}└─${RESET}\r\n`);
    const body = this.currentCodeBuf.trim();
    if (body && isShellLang(this.codeLang, body)) {
      const cleaned = body
        .split("\n")
        .map((l) => l.replace(/^\$\s+/, ""))
        .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))
        .join("\n")
        .trim();
      if (cleaned) {
        this.lastCommand = cleaned;
      }
    }
    this.inCodeBlock = false;
    this.waitingCodeLang = false;
    this.codeLang = "";
    this.currentCodeBuf = "";
    this.atLineStart = true;
  }
}

function isShellLang(lang: string, body: string): boolean {
  if (["bash", "sh", "zsh", "fish", "shell", "console", "terminal"].includes(lang)) {
    return true;
  }
  if (lang === "") {
    const first = body.trim().split(/\s+/)[0] || "";
    return first.startsWith("$") || ["git", "cargo", "npm", "pnpm", "ls", "cd", "sudo", "systemctl", "pacman", "paru", "yay", "docker", "cat", "grep", "rg", "find", "chmod", "mkdir", "cp", "mv", "rm", "python", "python3", "node", "opencode"].includes(first);
  }
  return false;
}
