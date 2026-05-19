# Image Moderation Feature — Design Spec

**Date:** 2026-05-19  
**Status:** Implemented

## Problem

CommGuard monitors WhatsApp groups for bullying and spam but had no image content analysis — only captions were checked. Groups with children need protection against sexually explicit or violently offensive images.

## Solution

Add an image moderation hook that activates automatically for groups with `#bullywatch on` enabled. Uses OpenAI GPT-5-mini vision to classify images and alerts the admin with delete/kick options.

## Trigger

Groups with `bullying_monitoring = true` in the database (same flag as `#bullywatch on`). No new command or DB column needed.

## Model

**gpt-5-mini** (vision, low-detail mode)
- ~$0.000158 per image
- ~$2–9/month at 500–2K images/day
- Fail-open: any error returns SAFE to avoid blocking legitimate images

## Flow

```
Image message received in group
  → IMAGE_MODERATION_ENABLED? (config.FEATURES)
  → Group has bullying_monitoring=true? (DB check)
  → Sender is group admin? → skip (admins bypass)
  → Download image buffer (Baileys downloadMediaMessage)
  → GPT-5-mini analyzes → {verdict, confidence 1-10, reason}
  → confidence >= 7 AND verdict != 'SAFE'?
    → Forward image to admin
    → Send Hebrew alert with 1/2 reply options
    → Store in pendingImageAlerts Map
  → Admin replies '1' → delete image
  → Admin replies '2' → delete + kick sender
```

## Bypass Rules

- Sender is group admin → skip
- `IMAGE_MODERATION_ENABLED: false` in config → skip globally
- Image download fails → skip (no false positives)
- GPT error → treat as SAFE (fail-open)

## Admin Alert (Hebrew)

```
🖼️ *תמונה חשודה זוהתה*
👤 שולח: +[phone] ([name])
📍 קבוצה: [group name]
⚠️ סיבה: [GPT reason, max 8 words]
📊 ביטחון: [confidence]/10

↩️ *השב להודעה זו:*
*1* — מחק תמונה
*2* — מחק + הסר מהקבוצה
```

## Files Changed

| File | Change |
|------|--------|
| `services/imageModeration.js` | **New** — `analyzeImage(buffer)` function |
| `config.js` | Added `IMAGE_MODERATION_ENABLED: true` and `IMAGE_MODERATION_CONFIDENCE_THRESHOLD: 7` |
| `index.js` | Added `downloadMediaMessage` to Baileys imports, `pendingImageAlerts` Map, image check block after bullywatch (~line 1522), reply handler in private messages section |

## Configuration

```js
FEATURES: {
    IMAGE_MODERATION_ENABLED: true,           // master on/off
    IMAGE_MODERATION_CONFIDENCE_THRESHOLD: 7, // 1-10, raise to reduce false positives
}
```

## Cost

- Model: gpt-5-mini at ~$0.75/1M input tokens
- Low-detail image: ~210 tokens → $0.000158/image
- 500–2K images/day → ~$2.37–9.45/month
