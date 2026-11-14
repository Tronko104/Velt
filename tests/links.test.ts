import assert from "node:assert/strict";
import test from "node:test";
import {
  extractAtFileTokens,
  extractFileLinkMatches,
  matchActiveAtQuery,
} from "../src/links.ts";

test("extractFileLinkMatches detects relative, tilde, and absolute file:line[:col] references", () => {
  const line =
    "error at src/main.ts:42:9 and ./src-tauri/src/lib.rs:28:5 or ~/notes.md and /tmp/foo.py:12 plus Cargo.toml:10";
  const matches = extractFileLinkMatches(line);

  assert.deepEqual(
    matches.map((m) => ({ path: m.path, line: m.line, col: m.col })),
    [
      { path: "src/main.ts", line: 42, col: 9 },
      { path: "./src-tauri/src/lib.rs", line: 28, col: 5 },
      { path: "~/notes.md", line: undefined, col: undefined },
      { path: "/tmp/foo.py", line: 12, col: undefined },
      { path: "Cargo.toml", line: 10, col: undefined },
    ]
  );

  for (const m of matches) {
    assert.equal(line.slice(m.startIndex, m.endIndex), m.text);
  }
});

test("extractFileLinkMatches ignores URLs, user@host strings, bare timestamps, and dotted versions", () => {
  const line =
    "Visit https://github.com/Tronko104/Velt/blob/main/README.md:12 or user@host:src/app.ts version 0.1.0 at 12:34";
  const matches = extractFileLinkMatches(line);
  assert.deepEqual(matches, []);
});

test("extractAtFileTokens extracts unique @file paths capped at 5", () => {
  const prompt =
    "Compare @src/main.ts, @src/links.ts! Also check @src/main.ts and @src-tauri/src/lib.rs @README.md @package.json @Cargo.toml";
  const tokens = extractAtFileTokens(prompt);
  assert.deepEqual(tokens, [
    "src/main.ts",
    "src/links.ts",
    "src-tauri/src/lib.rs",
    "README.md",
    "package.json",
  ]);
});

test("matchActiveAtQuery tracks active @token under cursor", () => {
  assert.deepEqual(matchActiveAtQuery("check @src/ma", 13), {
    start: 6,
    query: "src/ma",
  });
  assert.deepEqual(matchActiveAtQuery("@", 1), {
    start: 0,
    query: "",
  });
  assert.equal(matchActiveAtQuery("user@host.com ", 14), null);
  assert.equal(matchActiveAtQuery("check @src/main.ts done", 23), null);
});
