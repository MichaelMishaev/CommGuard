# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CommGuard-prod is the **production** WhatsApp group moderation bot. It uses Baileys (WebSocket-native, no browser) and replaces the legacy `CommGuard/` repo which used `whatsapp-web.js`.

- **Server**: `root@209.38.231.184`, path `/root/CommGuard/`, PM2 process: `commguard-bot`
- **Remote**: `https://github.com/MichaelMishaev/CommGuard.git` (branch: `main`)
- **Legacy repo** (NOT in production): `/Users/michaelmishayev/Desktop/Projects/CommGuard/`

**Deploy:**
```bash
git push origin main && ssh root@209.38.231.184 "cd ~/CommGuard && git pull && pm2 restart commguard-bot"
```

**Deploy with env change:**
```bash
ssh root@209.38.231.184 "cd ~/CommGuard && git pull && pm2 restart commguard-bot --update-env"
```

## Common Commands

```bash
npm start        # node --expose-gc index.js
npm run dev      # nodemon (auto-restart)
npm test         # node tests/runTests.js

# Server
ssh root@209.38.231.184
pm2 status
pm2 logs commguard-bot --lines 50
pm2 logs commguard-bot --err --nostream --lines 20
```

## Architecture

### Entry Points
- `index.js` — 2500+ line monolith: socket init, all message handlers, pending-action Maps, startup phase logic
- `config.js` — all feature flags (`FEATURES.*`), GPT model names, stealth/rate-limit settings, bullywatch thresholds

### Message Flow

```
messages.upsert (type=notify only)
  → shouldIgnoreOldMessage() — skip messages older than startup + 60s
  → handleMessage()
      → bullywatch check (isGroup + messageText + isBullyingMonitoringEnabled)
      → image moderation (isGroup + imageMessage + isBullyingMonitoringEnabled)
      → invite/URL detection
      → mute check
      → command handler (isPrivate only)
```

### Pending Action Maps (global in `index.js`)

Admin receives an alert message → replies to it → bot looks up the quoted message ID:

| Map | Trigger | Admin replies |
|-----|---------|---------------|
| `pendingUrlAlerts` | Non-whitelisted URL posted | `1` delete · `2` delete+kick+blacklist · `3` +blacklist URL |
| `pendingImageAlerts` | NSFW/violent image detected | `1` delete · `2` delete+kick |
| `pendingRequests` (via `utils/blacklistPendingRequests.js`) | Blacklisted user rejoin attempt | `1` blacklist · `2` global ban |

All maps auto-expire after 24h via `setTimeout`.

### In-Memory Caches

- `groupAdminCache` — Map in `index.js`, 10-min TTL, caches group participant admin status
- `bullyingMonitoringCache` — Map in `database/groupService.js`, 5-min TTL, caches `SELECT bullying_monitoring FROM groups` result per group (eliminates 150-300ms DB round-trip on every message); invalidated immediately when `setBullyingMonitoring()` is called

### GPT Integration (`OPENAI_API_KEY`)

**Single model for everything: `gpt-5.4-nano`**

| Service | Purpose |
|---------|---------|
| `services/imageModeration.js` | Vision — NSFW/violent/offensive image detection |
| `services/bullywatch/nanoPreFilterService.js` | Fast text prefilter (Layer 0) |
| `services/bullywatch/gptAnalysisService.js` | Context-aware analysis for ambiguous scores (Layer 4, score 11-15 only) |
| `services/sentimentAnalysisService.js` | Sentiment scoring |
| `services/commandHandler.js` | Translation command |

**GPT-5.4 family rules:**
- Always use `max_completion_tokens` (not `max_tokens`)
- Image MIME type is detected from buffer magic bytes (`ff d8` = JPEG, `89 50` = PNG, `52 49` = WebP)
- `imageModeration.js` is fail-open: any API error returns `{verdict: 'SAFE'}` to avoid blocking legitimate images

### Services

- `imageModeration.js` — `analyzeImage(buffer)` → `{verdict, confidence, reason}`
- `bullywatch/` — 4-layer detection: lexicon → temporal → scoring → GPT
- `commandHandler.js` — all `#command` routing (3000+ lines)
- `safeBrowsingService.js` — Google Safe Browsing API (4s timeout, graceful fail)
- `urlBlacklistService.js` — file-based domain blocklist + in-memory Set
- `redisService.js` — blacklist TTL cache, rate limiting, bullywatch context window (last 5 msgs/group, 5-min TTL)

### Database (`database/`)

- `groupService.js` — most-used: `isBullyingMonitoringEnabled`, `setBullyingMonitoring`, `getAlertRecipients`
- `connection.js` — `pg` Pool; logs slow queries (>100ms)
- Schema migrations: `database/*.sql` applied via matching `apply-*.js` scripts

### Utilities (`utils/`)

- `lidDecoder.js` — decodes LID-format JIDs to phone numbers (WhatsApp multi-device migration)
- `sessionManager.js` — `extractMessageText()` handles all message types (text, image caption, video caption, viewOnce, edited, etc.)
- `kickHelper.js` — group participant removal with retries
- `stealthUtils.js` — `deleteMessageHumanLike()` adds 2-6s random delay before deletions

## Anti-Bullying System (`#bullywatch`)

### Per-Group Enable
```
#bullywatch on <className>   # e.g. #bullywatch on ג3
#bullywatch off
#bullywatch status
```
Stores `bullying_monitoring = true` + `class_name` in `groups` table. Gate: `isBullyingMonitoringEnabled(chatId)` (cached).

### Detection Layers
1. **Lexicon** (`lexiconService.js`) — Hebrew keyword + emoji pattern matching
2. **Temporal** (`temporalAnalysisService.js`) — pile-on detection, silence patterns
3. **Scoring** (`scoringService.js`) — context-aware point system
4. **GPT** (`gptAnalysisService.js`) — only for ambiguous range (score 11-15), uses 5-7 message context window

### Thresholds (`config.js → BULLYWATCH.THRESHOLDS`)
- 1-9: GREEN (log only)
- 10-17: YELLOW (alert admin)
- 18-29: RED1 (delete + alert)
- 30-44: RED2 (delete + alert + mute)
- 45+: RED3 (delete + alert + ban)

`BULLYWATCH_MONITOR_MODE: true` (default) — alerts only, no auto-deletions.

### Image Moderation (tied to bullywatch)
Activates automatically when `bullying_monitoring = true` for the group. Non-admin sends image → download via `downloadMediaMessage` → `analyzeImage()` → if confidence ≥ 7 and verdict ≠ SAFE → forward image to admin + send Hebrew alert.

## Environment Variables (`.env`)

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | GPT-5.4-nano calls (bullywatch + image moderation) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection |
| `GOOGLE_SAFE_BROWSING_API_KEY` | URL safety checks (optional) |
| `ADMIN_PHONE` / `ALERT_PHONE` | Override `config.js` defaults |

## Known Issues

- `#mute` requires bot to have group admin status
- `#clear` does not reliably delete messages — root cause unidentified
- LID-format sender IDs must go through `extractPhoneNumber()` (from `utils/lidDecoder.js`) before display
- DB connection timeout burst on startup (58 groups upserted in parallel) — recovers automatically
- `BYPASS_BOT_ADMIN_CHECK: true` in config works around LID-format bot admin detection issues

## Memory Protection (960MB Server)

Three-layer protection in `ecosystem.config.js`:
1. PM2 auto-restart at 400MB (`max_memory_restart`)
2. Daily cron restart at midnight (`cron_restart: '0 0 * * *'`)
3. 1GB swap (`/swapfile`, persistent via `/etc/fstab`)
