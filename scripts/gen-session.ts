/**
 * Run this ONCE locally to generate a session string:
 *
 *   bun scripts/gen-session.ts
 *
 * Then copy the printed session string into your GitHub secret
 * as TELEGRAM_SESSION.
 */
import { TelegramClient } from "@mtcute/bun";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, res));

const apiId = Number(await ask("Enter your API_ID: "));
const apiHash = await ask("Enter your API_HASH: ");

const client = new TelegramClient({ apiId, apiHash });

await client.start({
  phone: () => ask("Phone number (with country code): "),
  code: () => ask("Verification code: "),
  password: () => ask("2FA password (leave blank if none): "),
});

const session = await client.exportSession();
console.log("\n✅ Session string (save this as TELEGRAM_SESSION secret):\n");
console.log(session);
console.log();

await client.destroy();
rl.close();
