# Design: `#ru` Admin Translation Trigger

**Date:** 2026-06-03  
**Status:** Approved

## Problem

Admins need to relay important group messages to Russian-speaking members. Currently this requires manually translating and re-typing. The goal is a zero-friction trigger: write the message naturally, append `#ru`, and the bot posts the Russian translation.

## Solution

Suffix-tag detection in `handleMessage()` in `index.js`. When an eligible sender's message ends with `#ru`, the bot strips the tag, translates the remaining text to Russian using the existing `translationService`, and replies in the group quoting the original message.

## Trigger Conditions

- Message is in a **group** (not private chat)
- Message text **ends with** `#ru` (case-insensitive, whitespace-tolerant)
- Sender is a **WhatsApp group admin** (`isAdmin === true`) OR the **bot owner** (`isBotOwner === true`, phone `0544345287` / `ALERT_PHONE`)
- Text remaining after stripping `#ru` is **non-empty**

## Data Flow

```
Admin sends: "No spam please! #ru"
     ↓
handleMessage() — normal checks run (mute, command block) — none match
     ↓
Suffix check: endsWith('#ru') ✅ + (isAdmin || isBotOwner) ✅
     ↓
Strip tag + trim → "No spam please!"
     ↓
translationService.translateText("No spam please!", 'ru', null, senderId)
     ↓
sock.sendMessage(chatId, { text: "Пожалуйста, без спама!", quoted: msg })
     ↓ on error only:
sock.sendMessage(ALERT_PHONE + '@s.whatsapp.net', { text: "❌ #ru translation failed in <groupId>: <error>" })
```

## Implementation Location

`CommGuard-prod/index.js` — inside `handleMessage()`, after the existing command block (`if (handled) return;`), before the auto-translation block.

No new files. Uses existing:
- `translationService` from `./services/translationService`
- `isAdmin`, `isBotOwner`, `senderId`, `chatId`, `messageText`, `msg` — all already in scope at that point
- `config.ALERT_PHONE` for error notification target

## Reply Format

Raw Russian text only, no header, no attribution. Quoted to the original message so context is clear.

```
[quoted: original admin message]
Пожалуйста, без спама!
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Translation API error | Private message to `0544345287` with error details |
| Translation quota exceeded | Same private error message |
| Empty text after stripping `#ru` | Skip silently |
| `#ru` not at end of message | No match, normal flow continues |
| Non-admin sender | Silently ignored, no response |

## Edge Cases

| Input | Behavior |
|---|---|
| `#ru` alone | Skip — nothing to translate |
| `hello #ru world` | No match — `#ru` not at end |
| `#RU` / `#Ru` | Match — case-insensitive |
| Message starts with `#` | Command block handles it first, suffix check never runs |
| Translation returns empty string | Skip reply silently |

## What Is Not Changing

- No new files or services
- No changes to `commandHandler.js`
- No changes to existing auto-translation logic
- No changes to any other command behavior
