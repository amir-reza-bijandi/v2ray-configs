import { TelegramClient } from '@mtcute/bun';
import * as fs from 'fs';

// ─── Config ───────────────────────────────────────────────────────────────────
const CHANNEL_USERNAME = Bun.env.CHANNEL_USERNAME ?? 'ConfigsHUB2';
const FETCH_LIMIT = 500;
const MAX_CONFIGS = 500;
const OUTPUT_TXT = 'configs.txt';
const OUTPUT_YAML = 'configs.yaml';

const CONFIG_PREFIXES = [
  'vless://',
  'vmess://',
  'trojan://',
  'ss://',
  'ssr://',
  'tuic://',
  'hysteria://',
  'hysteria2://',
  'hy2://',
  'wireguard://',
];

// ─── Types ────────────────────────────────────────────────────────────────────
type ClashProxy = Record<string, unknown>;

// ─── URI Extraction ───────────────────────────────────────────────────────────
function extractConfigs(text: string): string[] {
  const configs: string[] = [];
  for (const line of text.split(/\s+/)) {
    const t = line.trim();
    if (CONFIG_PREFIXES.some((p) => t.startsWith(p))) configs.push(t);
  }
  return configs;
}

function isV2rayPost(text: string): boolean {
  return text.toLowerCase().includes('#v2ray') || CONFIG_PREFIXES.some((p) => text.includes(p));
}

// ─── URI → Clash Proxy Parsers ────────────────────────────────────────────────

let _nameCounter = 0;

function sanitizeName(raw: string): string {
  return (
    raw
      // ASCII control characters
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      // Zero-width spaces, bidirectional overrides, BOM, soft-hyphen (common in Telegram)
      .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function uniqueName(base: string): string {
  const clean = sanitizeName(base);
  return clean ? `${clean}-${++_nameCounter}` : `proxy-${++_nameCounter}`;
}

function safeBase64(s: string): string {
  // URL-safe base64 → standard
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return atob(b);
  } catch {
    return '';
  }
}

function parseVless(uri: string): ClashProxy | null {
  try {
    const url = new URL(uri);
    const params = url.searchParams;
    const name = uniqueName(decodeURIComponent(url.hash.slice(1)));
    const proxy: ClashProxy = {
      name,
      type: 'vless',
      server: url.hostname,
      port: Number(url.port),
      uuid: url.username,
      udp: true,
      tls: params.get('security') === 'tls' || params.get('security') === 'reality',
      'skip-cert-verify': false,
      network: params.get('type') || 'tcp',
    };
    if (params.get('security') === 'reality') {
      proxy['reality-opts'] = {
        'public-key': params.get('pbk') ?? '',
        'short-id': params.get('sid') ?? '',
      };
      proxy['servername'] = params.get('sni') ?? '';
    }
    if (params.get('sni')) proxy['servername'] = params.get('sni');
    if (proxy.network === 'ws') {
      proxy['ws-opts'] = {
        path: params.get('path') ?? '/',
        headers: { Host: params.get('host') ?? url.hostname },
      };
    }
    if (proxy.network === 'grpc') {
      proxy['grpc-opts'] = { 'grpc-service-name': params.get('serviceName') ?? '' };
    }
    return proxy;
  } catch {
    return null;
  }
}

function parseVmess(uri: string): ClashProxy | null {
  try {
    const json = JSON.parse(safeBase64(uri.slice(8)));
    if (!json.add || !json.port) return null;
    const proxy: ClashProxy = {
      name: uniqueName(json.ps ?? json.add),
      type: 'vmess',
      server: json.add,
      port: Number(json.port),
      uuid: json.id,
      alterId: Number(json.aid ?? 0),
      cipher: json.scy ?? 'auto',
      udp: true,
      tls: json.tls === 'tls',
      'skip-cert-verify': false,
      network: json.net ?? 'tcp',
    };
    if (json.sni) proxy['servername'] = json.sni;
    if (proxy.network === 'ws') {
      proxy['ws-opts'] = {
        path: json.path ?? '/',
        headers: { Host: json.host ?? json.add },
      };
    }
    if (proxy.network === 'grpc') {
      proxy['grpc-opts'] = { 'grpc-service-name': json.path ?? '' };
    }
    return proxy;
  } catch {
    return null;
  }
}

function parseTrojan(uri: string): ClashProxy | null {
  try {
    const url = new URL(uri);
    const params = url.searchParams;
    const name = uniqueName(decodeURIComponent(url.hash.slice(1)));
    const proxy: ClashProxy = {
      name,
      type: 'trojan',
      server: url.hostname,
      port: Number(url.port),
      password: url.username,
      udp: true,
      tls: true,
      'skip-cert-verify': false,
      network: params.get('type') ?? 'tcp',
    };
    if (params.get('sni')) proxy['sni'] = params.get('sni');
    if (proxy.network === 'ws') {
      proxy['ws-opts'] = {
        path: params.get('path') ?? '/',
        headers: { Host: params.get('host') ?? url.hostname },
      };
    }
    return proxy;
  } catch {
    return null;
  }
}

function parseSs(uri: string): ClashProxy | null {
  try {
    const url = new URL(uri);
    const name = uniqueName(decodeURIComponent(url.hash.slice(1)));
    // userinfo may be base64 or plain cipher:password
    let cipher: string, password: string;
    const userinfo = url.username
      ? decodeURIComponent(url.username) + (url.password ? ':' + decodeURIComponent(url.password) : '')
      : '';
    if (userinfo.includes(':')) {
      [cipher = '', password = ''] = userinfo.split(':');
    } else {
      const decoded = safeBase64(userinfo);
      [cipher = '', password = ''] = decoded.split(':');
    }
    return {
      name,
      type: 'ss',
      server: url.hostname,
      port: Number(url.port),
      cipher: cipher ?? 'aes-256-gcm',
      password: password ?? '',
      udp: true,
    };
  } catch {
    return null;
  }
}

function parseTuic(uri: string): ClashProxy | null {
  try {
    const url = new URL(uri);
    const params = url.searchParams;
    const name = uniqueName(decodeURIComponent(url.hash.slice(1)));
    return {
      name,
      type: 'tuic',
      server: url.hostname,
      port: Number(url.port),
      uuid: url.username,
      password: url.password,
      alpn: params.get('alpn') ? [params.get('alpn')!] : ['h3'],
      'congestion-controller': params.get('congestion_control') ?? 'bbr',
      'udp-relay-mode': params.get('udp_relay_mode') ?? 'native',
      tls: true,
      'skip-cert-verify': false,
      sni: params.get('sni') ?? '',
    };
  } catch {
    return null;
  }
}

function parseHysteria2(uri: string): ClashProxy | null {
  try {
    const url = new URL(uri);
    const params = url.searchParams;
    const name = uniqueName(decodeURIComponent(url.hash.slice(1)));
    return {
      name,
      type: 'hysteria2',
      server: url.hostname,
      port: Number(url.port),
      password: url.username || url.password,
      sni: params.get('sni') ?? '',
      'skip-cert-verify': false,
      obfs: params.get('obfs') ?? undefined,
      'obfs-password': params.get('obfs-password') ?? undefined,
    };
  } catch {
    return null;
  }
}

function parseHysteria(uri: string): ClashProxy | null {
  try {
    const url = new URL(uri);
    const params = url.searchParams;
    const name = uniqueName(decodeURIComponent(url.hash.slice(1)));
    return {
      name,
      type: 'hysteria',
      server: url.hostname,
      port: Number(url.port),
      'auth-str': params.get('auth') ?? params.get('auth_str') ?? '',
      obfs: params.get('obfs') ?? '',
      alpn: params.get('alpn') ? [params.get('alpn')!] : ['h3'],
      protocol: params.get('protocol') ?? 'udp',
      sni: params.get('peer') ?? params.get('sni') ?? '',
      'skip-cert-verify': false,
      up: params.get('up') ?? '100',
      down: params.get('down') ?? '100',
    };
  } catch {
    return null;
  }
}

function uriToClashProxy(uri: string): ClashProxy | null {
  if (uri.startsWith('vless://')) return parseVless(uri);
  if (uri.startsWith('vmess://')) return parseVmess(uri);
  if (uri.startsWith('trojan://')) return parseTrojan(uri);
  if (uri.startsWith('ss://')) return parseSs(uri);
  if (uri.startsWith('hysteria2://') || uri.startsWith('hy2://')) return parseHysteria2(uri);
  if (uri.startsWith('hysteria://')) return parseHysteria(uri);
  if (uri.startsWith('tuic://')) return parseTuic(uri);
  return null;
}

// ─── Clash YAML Builder ───────────────────────────────────────────────────────

/** Strip control/invisible chars from any string value before writing to YAML */
function safeYamlStr(v: unknown): string {
  return JSON.stringify(
    String(v)
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, ''),
  );
}

function buildClashYaml(proxies: ClashProxy[], timestamp: string): string {
  const names = proxies.map((p) => p.name as string);

  // Serialize proxies to YAML manually (no external dep needed for this structure)
  const proxyLines = proxies.map((p) => {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'object' && !Array.isArray(v)) {
        lines.push(`    ${k}:`);
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (v2 === undefined || v2 === null) continue;
          if (typeof v2 === 'object') {
            lines.push(`      ${k2}:`);
            for (const [k3, v3] of Object.entries(v2 as Record<string, unknown>)) {
              lines.push(`        ${k3}: ${typeof v3 === 'string' ? safeYamlStr(v3) : JSON.stringify(v3)}`);
            }
          } else {
            lines.push(`      ${k2}: ${typeof v2 === 'string' ? safeYamlStr(v2) : JSON.stringify(v2)}`);
          }
        }
      } else if (Array.isArray(v)) {
        lines.push(
          `    ${k}: [${v.map((i) => (typeof i === 'string' ? safeYamlStr(i) : JSON.stringify(i))).join(', ')}]`,
        );
      } else {
        lines.push(`    ${k}: ${typeof v === 'string' ? safeYamlStr(v) : JSON.stringify(v)}`);
      }
    }
    return '  - ' + lines.join('\n').trimStart();
  });

  const nameList = names.map((n) => `      - "${n}"`).join('\n');

  return `# Clash Meta Subscription
# Updated: ${timestamp}
# Configs: ${proxies.length}
# Source: https://t.me/${CHANNEL_USERNAME}

mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false

dns:
  enable: true
  ipv6: false
  nameserver:
    - 8.8.8.8
    - 1.1.1.1
  fallback:
    - 8.8.4.4
    - tls://1.0.0.1:853

proxies:
${proxyLines.join('\n')}

proxy-groups:
  - name: "Select"
    type: select
    proxies:
      - "Auto"
      - "DIRECT"
${nameList}

  - name: "Auto"
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    proxies:
${nameList}

  - name: "Fallback"
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
${nameList}

  - name: "Direct"
    type: select
    proxies:
      - DIRECT
      - "Select"

rules:
  - GEOIP,IR,DIRECT
  - GEOIP,private,DIRECT
  - MATCH,Select
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const client = new TelegramClient({
  apiId: Number(Bun.env.TELEGRAM_API_ID),
  apiHash: Bun.env.TELEGRAM_API_HASH!,
});

await client.importSession(Bun.env.TELEGRAM_SESSION ?? '');

await client.start({
  botToken: undefined,
  phone: async () => {
    throw new Error('No session. Run `bun scripts/gen-session.ts` locally first.');
  },
  code: async () => '',
  password: async () => '',
});

console.log(`✅ Connected to Telegram`);
console.log(`📡 Fetching last ${FETCH_LIMIT} messages from @${CHANNEL_USERNAME} …`);

const allConfigs: string[] = [];

for await (const message of client.iterHistory(CHANNEL_USERNAME, { limit: FETCH_LIMIT })) {
  if (!message.text) continue;
  if (!isV2rayPost(message.text)) continue;

  const found = extractConfigs(message.text);
  if (found.length === 0) continue;

  console.log(`  ✔ msg #${message.id} — found ${found.length} config(s)`);
  allConfigs.push(...found);
  if (allConfigs.length >= MAX_CONFIGS) break;
}

await client.destroy();

const finalConfigs = allConfigs.slice(0, MAX_CONFIGS);
if (finalConfigs.length === 0) console.warn('⚠️  No configs found.');

const timestamp = new Date().toISOString();

// ── Write configs.txt ──
const txtOutput = [
  `# V2Ray / Xray Subscription`,
  `# Updated: ${timestamp}`,
  `# Configs: ${finalConfigs.length}`,
  `# Source: https://t.me/${CHANNEL_USERNAME}`,
  ``,
  ...finalConfigs,
].join('\n');
fs.writeFileSync(OUTPUT_TXT, txtOutput, 'utf-8');
console.log(`✅ Wrote ${finalConfigs.length} configs to ${OUTPUT_TXT}`);

// ── Write clash.yaml ──
const clashProxies = finalConfigs.map(uriToClashProxy).filter((p): p is ClashProxy => p !== null);

console.log(`🔄 Converted ${clashProxies.length}/${finalConfigs.length} configs to Clash format`);

const yamlOutput = buildClashYaml(clashProxies, timestamp);
fs.writeFileSync(OUTPUT_YAML, yamlOutput, 'utf-8');
console.log(`✅ Wrote ${clashProxies.length} proxies to ${OUTPUT_YAML}`);
