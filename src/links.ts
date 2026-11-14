export interface FileLinkMatch {
  text: string;
  path: string;
  line?: number;
  col?: number;
  startIndex: number;
  endIndex: number;
}

const FILE_LINK_REGEX =
  /(?:~\/|\.\.?\/|\/)?(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,12}(?::(\d{1,6})(?::(\d{1,5}))?)?|(?:~\/|\.\.?\/|\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(?::(\d{1,6})(?::(\d{1,5}))?)?/g;

/**
 * Extracts file path candidates (with optional :line[:col]) from a terminal line.
 * Caller verifies existence on disk before exposing them as clickable links.
 */
export function extractFileLinkMatches(lineText: string): FileLinkMatch[] {
  if (!lineText) return [];
  const matches: FileLinkMatch[] = [];
  FILE_LINK_REGEX.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = FILE_LINK_REGEX.exec(lineText)) !== null) {
    const full = m[0];
    const startIndex = m.index;
    const endIndex = startIndex + full.length;

    // Skip matches inside URLs (http://..., https://..., file://...) or email/user@host strings
    let tokenStart = startIndex;
    while (tokenStart > 0 && !/[\s"'`(<[]/.test(lineText[tokenStart - 1])) {
      tokenStart--;
    }
    const tokenSlice = lineText.slice(tokenStart, endIndex);
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(tokenSlice) || /@/.test(tokenSlice)) {
      continue;
    }
    if (startIndex > 0 && /[A-Za-z0-9_@:/]/.test(lineText[startIndex - 1])) {
      continue;
    }

    // Require either a path separator or an explicit :line suffix to avoid matching domain/version numbers like 0.1.0
    const lineRaw = m[1] || m[3];
    const colRaw = m[2] || m[4];
    const hasSlash = full.includes("/");
    if (!hasSlash && !lineRaw) {
      continue;
    }
    if (/^\d+(?:\.\d+)+$/.test(full)) {
      continue;
    }

    let path = full;
    let line: number | undefined;
    let col: number | undefined;

    if (lineRaw) {
      const suffix = colRaw ? `:${lineRaw}:${colRaw}` : `:${lineRaw}`;
      if (full.endsWith(suffix)) {
        path = full.slice(0, -suffix.length);
      }
      const parsedLine = Number.parseInt(lineRaw, 10);
      if (Number.isFinite(parsedLine) && parsedLine > 0) {
        line = parsedLine;
      }
      if (colRaw) {
        const parsedCol = Number.parseInt(colRaw, 10);
        if (Number.isFinite(parsedCol) && parsedCol > 0) {
          col = parsedCol;
        }
      }
    }

    if (!path || path === "/" || path === "." || path === "..") {
      continue;
    }

    matches.push({
      text: full,
      path,
      line,
      col,
      startIndex,
      endIndex,
    });
  }

  return matches;
}

/**
 * Extracts unique `@path` references from an Agent prompt (up to 5 files).
 */
export function extractAtFileTokens(prompt: string): string[] {
  if (!prompt) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const regex = /(?:^|\s)@([^\s@,;:'"`()[\]{}<>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(prompt)) !== null) {
    const clean = m[1].replace(/[.,;:!?]+$/, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Checks if the text before the textarea cursor ends with an active `@query` mention.
 */
export function matchActiveAtQuery(
  value: string,
  cursorPos: number
): { start: number; query: string } | null {
  const prefix = value.slice(0, cursorPos);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(prefix);
  if (!m) return null;
  const query = m[1];
  const atIndex = prefix.length - query.length - 1;
  return { start: atIndex, query };
}
