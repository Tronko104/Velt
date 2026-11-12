import assert from "node:assert/strict";
import test from "node:test";
import { STRINGS, resolveLocale } from "../src/i18n.ts";
import { redactSensitiveText } from "../src/redact.ts";

test("redactSensitiveText masks common secrets while preserving ordinary shell output", () => {
  const pemBlock = [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ==",
    "-----END OPENSSH PRIVATE KEY-----",
  ].join("\n");

  const input = [
    "PWD=/home/user/Velt",
    "$ git status",
    "On branch main",
    pemBlock,
    "sk-proj-abc1234567890XYZ987654",
    "ghp_1234567890abcdefghijklmnop",
    "github_pat_11ABCDEFG_0123456789abcdefghij",
    "AKIA1234567890ABCDEF",
    "AIzaSyDummyKeyForTestingPurposes1234567",
    "xoxb-123456789012-123456789012-abcdef",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "Authorization: Basic dXNlcjpzZWNyZXRwYXNz",
    "https://alice:supersecretpass@example.com/repo.git",
    "OPENAI_API_KEY=sk-anotherkey9876543210abcd",
    'PASSWORD="my-secret-password"',
  ].join("\n");

  const result = redactSensitiveText(input);

  assert.ok(result.redactedCount >= 11, `expected >= 11 redactions, got ${result.redactedCount}`);
  assert.ok(result.text.includes("PWD=/home/user/Velt"));
  assert.ok(result.text.includes("$ git status\nOn branch main"));
  assert.ok(result.text.includes("[REDACTED_PRIVATE_KEY]"));
  assert.ok(result.text.includes("[REDACTED_KEY]"));
  assert.ok(result.text.includes("[REDACTED_GH_TOKEN]"));
  assert.ok(result.text.includes("[REDACTED_AWS_KEY]"));
  assert.ok(result.text.includes("[REDACTED_API_KEY]"));
  assert.ok(result.text.includes("Bearer [REDACTED_TOKEN]"));
  assert.ok(result.text.includes("Basic [REDACTED_TOKEN]"));
  assert.ok(result.text.includes("https://alice:[REDACTED]@example.com/repo.git"));
  assert.ok(result.text.includes("OPENAI_API_KEY=[REDACTED]") || result.text.includes("OPENAI_API_KEY=[REDACTED_KEY]"));
  assert.ok(result.text.includes('PASSWORD="[REDACTED]"'));

  assert.equal(result.text.includes("supersecretpass"), false);
  assert.equal(result.text.includes("my-secret-password"), false);
  assert.equal(result.text.includes("b3BlbnNzaC1rZXktdjE"), false);
  assert.equal(result.text.includes("AKIA1234567890ABCDEF"), false);
  assert.equal(result.text.includes("AIzaSyDummyKeyForTestingPurposes1234567"), false);
  assert.equal(result.text.includes("ghp_1234567890abcdefghijklmnop"), false);
  assert.equal(result.text.includes("github_pat_11ABCDEFG_0123456789abcdefghij"), false);
  assert.equal(result.text.includes("xoxb-123456789012-123456789012-abcdef"), false);
});

test("redactSensitiveText handles empty or clean input with zero redactions", () => {
  assert.deepEqual(redactSensitiveText(""), { text: "", redactedCount: 0 });
  const clean = "PWD=/home/tronko/Velt\nLANG=it_IT.UTF-8\ncargo test\nrunning 4 tests\n";
  assert.deepEqual(redactSensitiveText(clean), { text: clean, redactedCount: 0 });
});

test("resolveLocale respects explicit overrides and system locale fallback", () => {
  assert.equal(resolveLocale("it", "en_US.UTF-8"), "it");
  assert.equal(resolveLocale("en", "it_IT.UTF-8"), "en");
  assert.equal(resolveLocale("auto", "it_IT.UTF-8"), "it");
  assert.equal(resolveLocale("auto", "it"), "it");
  assert.equal(resolveLocale("auto", "en_US.UTF-8"), "en");
  assert.equal(resolveLocale("auto", "C"), "en");
  assert.equal(resolveLocale("auto", "POSIX"), "en");
  assert.equal(resolveLocale("auto", "fr_FR.UTF-8"), "en");
  assert.equal(resolveLocale(undefined, undefined), "en");
});

function collectShape(obj: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") {
        for (const [k, v] of collectShape(value, path)) {
          out.set(k, v);
        }
      } else {
        out.set(path, typeof value);
      }
    }
  }
  return out;
}

function collectTextValues(obj: unknown): string[] {
  const out: string[] = [];
  if (typeof obj === "string") {
    out.push(obj);
  } else if (typeof obj === "function") {
    const fn = obj as (...args: unknown[]) => unknown;
    const sampleArgs = [1, "sample", 12, "medium"];
    const res = fn(...sampleArgs);
    if (typeof res === "string") out.push(res);
  } else if (obj && typeof obj === "object") {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      out.push(...collectTextValues(value));
    }
  }
  return out;
}

test("STRINGS.it and STRINGS.en share identical key structure and contain no emojis", () => {
  const itShape = collectShape(STRINGS.it);
  const enShape = collectShape(STRINGS.en);

  assert.deepEqual([...itShape.keys()].sort(), [...enShape.keys()].sort());
  for (const [key, itType] of itShape.entries()) {
    assert.equal(enShape.get(key), itType, `Type mismatch at key ${key}`);
  }

  const emojiRegex = /\p{Extended_Pictographic}/u;
  for (const locale of ["it", "en"] as const) {
    for (const text of collectTextValues(STRINGS[locale])) {
      assert.equal(
        emojiRegex.test(text),
        false,
        `Unexpected emoji found in STRINGS.${locale}: ${text}`
      );
    }
  }
});
