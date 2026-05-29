import { TelegramClient } from "@mtcute/bun";
import * as fs from "fs";

// ─── Config ──────────────────────────────────────────────────────────────────
const CHANNEL_USERNAME = Bun.env.CHANNEL_USERNAME ?? "YOUR_CHANNEL_HERE";
const FETCH_LIMIT = 100; // how many messages to scan (not configs)
const MAX_CONFIGS = 100; // max configs to keep in output
const OUTPUT_FILE = "configs.txt";

// Config URI prefixes to look for
const CONFIG_PREFIXES = [
  "vless://",
  "vmess://",
  "trojan://",
  "ss://",
  "ssr://",
  "tuic://",
  "hysteria://",
  "hysteria2://",
  "hy2://",
  "wireguard://",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract all config URIs from a message text */
function extractConfigs(text: string): string[] {
  const configs: string[] = [];
  const lines = text.split(/\s+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (CONFIG_PREFIXES.some((p) => trimmed.startsWith(p))) {
      configs.push(trimmed);
    }
  }

  return configs;
}

/** Return true if the message is a v2ray config post */
function isV2rayPost(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("#v2ray") || CONFIG_PREFIXES.some((p) => text.includes(p))
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const client = new TelegramClient({
  apiId: Number(Bun.env.TELEGRAM_API_ID),
  apiHash: Bun.env.TELEGRAM_API_HASH!,
});
if (Bun.env.TELEGRAM_SESSION)
  await client.importSession(Bun.env.TELEGRAM_SESSION);

await client.start({
  // Bot token auth — no interactive login needed in CI
  botToken: undefined,
  // If no session is stored we just need the user session exported once
  phone: async () => {
    throw new Error(
      "No session found. Run `bun scripts/gen-session.ts` locally first.",
    );
  },
  code: async () => "",
  password: async () => "",
});

console.log(`✅ Connected to Telegram`);
console.log(
  `📡 Fetching last ${FETCH_LIMIT} messages from @${CHANNEL_USERNAME} …`,
);

const allConfigs: string[] = [];

// Iterate through messages newest → oldest
for await (const message of client.iterHistory(CHANNEL_USERNAME, {
  limit: FETCH_LIMIT,
})) {
  if (!message.text) continue;
  const text = message.text;

  if (!isV2rayPost(text)) continue;

  const found = extractConfigs(text);
  if (found.length === 0) continue;

  console.log(`  ✔ msg #${message.id} — found ${found.length} config(s)`);
  allConfigs.push(...found);

  if (allConfigs.length >= MAX_CONFIGS) break;
}

await client.destroy();

const finalConfigs = allConfigs.slice(0, MAX_CONFIGS);

if (finalConfigs.length === 0) {
  console.warn("⚠️  No configs found. Output file will be empty.");
}

const timestamp = new Date().toISOString();
const output = [
  `# V2Ray / Xray Subscription`,
  `# Updated: ${timestamp}`,
  `# Configs: ${finalConfigs.length}`,
  `# Source: https://t.me/${CHANNEL_USERNAME}`,
  ``,
  ...finalConfigs,
].join("\n");

fs.writeFileSync(OUTPUT_FILE, output, "utf-8");

console.log(`\n✅ Wrote ${finalConfigs.length} configs to ${OUTPUT_FILE}`);
