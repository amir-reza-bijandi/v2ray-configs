# v2ray-configs

Automatically fetches the latest 100 V2Ray/Xray configs from a Telegram channel every 30 minutes and writes them to `configs.txt` and `configs.yaml` — ready to use as a subscription URL in any compatible client (v2rayNG, Nekoray, Hiddify, FLClash, Clash Party, etc.).

> [!NOTE]
> This project was built with the assistance of Claude (Anthropic). The code, structure, and documentation were generated through an AI-assisted development session and reviewed by the author.

---

## Setup

### 1 — Fork / clone this repo

```bash
git clone https://github.com/amir-reza-bijandi/v2ray-configs
cd v2ray-configs
bun install
```

### 2 — Get Telegram API credentials

1. Go to [my.telegram.org](https://my.telegram.org) → **API development tools**
2. Create an app → note your **API ID** and **API Hash**

### 3 — Generate a session string (run once, locally)

```bash
bun run gen-session
```

Follow the prompts (phone number + verification code). It will print a session string — **copy it**.

> The session string lets the GitHub Action authenticate without interactive login.  
> Keep it secret — it has full access to your Telegram account.

### 4 — Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name         | Value                                            |
| ------------------- | ------------------------------------------------ |
| `TELEGRAM_API_ID`   | Your numeric API ID                              |
| `TELEGRAM_API_HASH` | Your API Hash string                             |
| `TELEGRAM_SESSION`  | The session string from step 3                   |
| `CHANNEL_USERNAME`  | Channel username without `@` (e.g. `ConfigsHub`) |

### 5 — Enable Actions & trigger a first run

Go to **Actions** → select _Update V2Ray Configs_ → **Run workflow**.

`configs.txt` and `configs.yaml` will be committed to the repo after the first successful run.

---

## Subscription URLs

Once the Action has run, use these URLs in your clients:

**V2Ray / Xray — v2rayNG, Nekoray, Hiddify, etc.**

```
https://raw.githubusercontent.com/amir-reza-bijandi/v2ray-configs/main/configs.txt
```

**Clash Meta — FLClash, Mi Clash, Clash Party, etc.**

```
https://raw.githubusercontent.com/amir-reza-bijandi/v2ray-configs/main/configs.yaml
```

---

## Schedule

The workflow runs automatically:

- **Every 30 minutes** (via [cron-job.org](https://cron-job.org) webhook)
- On every **push to `main`**
- On **manual trigger** from the Actions tab

> [!NOTE]
> GitHub's built-in scheduler is unreliable for sub-hourly intervals. An external cron service (cron-job.org) is used to trigger the workflow via `workflow_dispatch` every 30 minutes for reliable execution.

---

## Supported config types

The fetcher looks for URIs starting with:  
`vless://` · `vmess://` · `trojan://` · `ss://` · `ssr://` · `tuic://` · `hysteria://` · `hysteria2://` · `hy2://` · `wireguard://`

Only messages containing `#v2ray` or a recognized URI prefix are processed.

All protocols are also converted to Clash Meta format in `configs.yaml`, including TLS, Reality, WebSocket, gRPC, and obfuscation options where applicable.
