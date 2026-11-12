export interface RedactionResult {
  text: string;
  redactedCount: number;
}

interface SecretRule {
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const SECRET_RULES: SecretRule[] = [
  // PEM private key blocks (multiline)
  {
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: () => "[REDACTED_PRIVATE_KEY]",
  },
  // OpenAI / Anthropic / Stripe secret keys
  {
    pattern: /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g,
    replace: () => "[REDACTED_KEY]",
  },
  // GitHub tokens (classic & fine-grained)
  {
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    replace: () => "[REDACTED_GH_TOKEN]",
  },
  {
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replace: () => "[REDACTED_GH_TOKEN]",
  },
  // AWS Access Key IDs
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: () => "[REDACTED_AWS_KEY]",
  },
  // Google / Gemini API keys
  {
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replace: () => "[REDACTED_API_KEY]",
  },
  // Slack tokens
  {
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
    replace: () => "[REDACTED_TOKEN]",
  },
  // Bearer / Basic authorization tokens
  {
    pattern: /\b(Bearer|Basic)[ \t]+([A-Za-z0-9._~+/=-]{12,})\b/gi,
    replace: (_match, scheme) => `${scheme} [REDACTED_TOKEN]`,
  },
  // URLs with embedded user:password@host credentials
  {
    pattern: /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s/@"']+:)([^@\s"']{2,})(@)/g,
    replace: (_match, prefix, _secret, at) => `${prefix}[REDACTED]${at}`,
  },
  // Sensitive environment / config KEY=VALUE or KEY: VALUE pairs (excludes PWD)
  {
    pattern:
      /\b([A-Z0-9_]*(?:API_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN|REFRESH_?TOKEN|SECRET_?KEY|PRIVATE_?KEY|CLIENT_?SECRET|PASSWORD|PASSWD|TOKEN|SECRET|CREDENTIAL|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GITHUB_TOKEN|GH_TOKEN)[A-Z0-9_]*)([ \t]*[=:][ \t]*)(["']?)([^\s"'`;,]{4,})\3/gi,
    replace: (_match, key, sep, quote, val) => {
      if (/^\[REDACTED/i.test(val)) return _match;
      return `${key}${sep}${quote}[REDACTED]${quote}`;
    },
  },
];

/**
 * Redacts common API keys, tokens, private keys, URL credentials, and secret
 * environment variables before terminal scrollback context is sent to OpenCode.
 */
export function redactSensitiveText(input: string): RedactionResult {
  if (!input) {
    return { text: input, redactedCount: 0 };
  }

  let text = input;
  let redactedCount = 0;

  for (const rule of SECRET_RULES) {
    text = text.replace(rule.pattern, (...args) => {
      const match = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      const replaced = rule.replace(match, ...groups);
      if (replaced !== match) {
        redactedCount++;
      }
      return replaced;
    });
  }

  return { text, redactedCount };
}
