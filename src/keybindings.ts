export function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  if (!combo || !combo.trim()) return false;
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return false;

  const needCtrl = parts.includes("ctrl") || parts.includes("control");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  const needMeta = parts.includes("meta") || parts.includes("super");
  const keyPart = parts.find(
    (p) => !["ctrl", "control", "shift", "alt", "meta", "super"].includes(p)
  );
  if (!keyPart) return false;

  if (e.ctrlKey !== needCtrl) return false;
  if (e.altKey !== needAlt) return false;
  if (e.metaKey !== needMeta) return false;

  // Allow Shift for punctuation like "/" or "," on non-US keyboards if needed,
  // unless Shift is explicitly part of the combo.
  const k = e.key.toLowerCase();
  const code = e.code.toLowerCase();

  if (keyPart === "/" || keyPart === "slash") {
    return (k === "/" || code === "slash") && (!needShift || e.shiftKey);
  }
  if (keyPart === "," || keyPart === "comma") {
    return (k === "," || code === "comma") && e.shiftKey === needShift;
  }

  if (e.shiftKey !== needShift) return false;

  if (keyPart === "enter" || keyPart === "return") return k === "enter";
  if (keyPart === "space") return k === " " || code === "space";
  if (keyPart === "esc" || keyPart === "escape") return k === "escape";
  if (keyPart === "tab") return k === "tab";

  if (keyPart.length === 1) {
    return k === keyPart || code === `key${keyPart}`;
  }
  return k === keyPart || code === keyPart;
}

export function formatRecordedShortcut(e: KeyboardEvent): string | null {
  const ignore = ["Control", "Shift", "Alt", "Meta", "Super", "OS"];
  if (ignore.includes(e.key)) return null;

  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");

  if (mods.length === 0 && !["Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"].includes(e.key)) {
    return null;
  }

  let keyName = e.key;
  if (keyName === " ") keyName = "Space";
  else if (keyName.length === 1) keyName = keyName.toUpperCase();

  return [...mods, keyName].join("+");
}
