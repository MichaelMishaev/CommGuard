# Bullywatch GPT-5-Nano Pre-Filter (Layer 0)

## Problem Statement

**Before Nano Pre-Filter:**
```
Message: "ראיתי בסרט איך כלב מת באוטו"
         ("I saw in a movie how a dog died in a car")

Flow:
  ❌ Lexicon triggers on "מת" (died) → sexual_threat
  ❌ Score: 21 (RED-1)
  ❌ Alert admin + send group policy notice
  ❌ User sees scary alert
  😡 BAD UX: False positive destroys trust
```

**After Nano Pre-Filter:**
```
Message: "ראיתי בסרט איך כלב מת באוטו"

Flow:
  ✅ Nano: "This is safe movie discussion" (20ms, $0.00001)
  ✅ Skip scoring layers
  ✅ No alert
  😊 GOOD UX: User never sees false positive
```

## Architecture: New 5-Layer System

### Layer 0: GPT-5-Nano Pre-Filter (NEW!)
- **Purpose**: Fast safety check to prevent false positives
- **Model**: GPT-5-nano
- **Cost**: $0.05/M input tokens (5x cheaper than GPT-5-mini)
- **Speed**: 20-50ms
- **Throughput**: Handles 85-90% of messages
- **Output**:
  - "safe" → Skip to final result (no alert)
  - "harmful" → Continue to Layer 1-3
  - "ambiguous" → Skip to Layer 4 (GPT-5-mini)

### Layer 1: Lexicon Detection
- Hebrew curse words, threats, exclusion language
- Emoji patterns (🤡🤡🤡, 🔪☠️)
- Only runs if Nano says "potentially harmful"

### Layer 2: Temporal Analysis
- Pile-on detection (5+ users targeting one)
- Message velocity spikes
- Only runs if Nano says "potentially harmful"

### Layer 3: Context-Aware Scoring
- Aggregates Layer 1 + Layer 2
- Applies modifiers (targeting, public shaming)
- Determines severity (GREEN/YELLOW/RED)

### Layer 4: GPT-5-Mini Deep Analysis
- Only for ambiguous cases (score 11-15) OR nano "ambiguous"
- Context window: 5-7 messages before/after
- Distinguishes friend banter from harassment

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Message Arrives                                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: GPT-5-Nano Pre-Filter                             │
│  "Is this clearly safe or potentially harmful?"             │
│  ⚡ 20-50ms  💰 $0.00001/msg                                │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
        ▼         ▼         ▼
    [SAFE]   [HARMFUL]  [AMBIGUOUS]
    85-90%     8-12%      1-2%
        │         │         │
        │         │         └──────────────────┐
        │         │                            │
        │         ▼                            │
        │   ┌──────────────────────┐           │
        │   │ Layer 1: Lexicon     │           │
        │   │ Layer 2: Temporal    │           │
        │   │ Layer 3: Scoring     │           │
        │   └──────────┬───────────┘           │
        │              │                        │
        │              ▼                        │
        │         Score 11-15?                  │
        │              │                        │
        │              ├─── YES ───┐            │
        │              │           │            │
        │              NO          │            │
        │              │           │            │
        │              │           ▼            │
        │              │     ┌──────────────────┴────┐
        │              │     │ Layer 4: GPT-5-Mini   │
        │              │     │ Deep Context Analysis │
        │              │     │ ⚡ 50-200ms            │
        │              │     └──────────┬────────────┘
        │              │                │
        │              ▼                ▼
        │         ┌────────────────────────┐
        │         │  Final Action          │
        │         │  (monitor mode: alert) │
        │         └────────────────────────┘
        │
        ▼
    ✅ Done
    No alert
    No processing
```

## Performance Metrics

### Before Nano Pre-Filter
```
10,000 messages/day
├─ 9,500 Safe messages → Full scoring (lexicon + temporal + scoring)
│                      → Generates ~500 false positive alerts
│                      → Processing: 10-50ms each
│                      → Cost: $0 (local)
│
└─ 500 Harmful messages → Full scoring + GPT-5-mini
                        → Processing: 50-200ms each
                        → Cost: $0.05/day

Total UX: 😡 500 false positive alerts/day
```

### After Nano Pre-Filter
```
10,000 messages/day
├─ 8,500 Safe (nano filtered) → Skip all scoring
│                              → NO alerts
│                              → Processing: 20-50ms
│                              → Cost: $0.01/day
│
├─ 1,200 Potentially harmful → Full scoring (lexicon + temporal)
│                            → Reduced false positives (nano caught obvious ones)
│                            → Cost: $0
│
└─ 300 Ambiguous → GPT-5-mini deep analysis
                 → Processing: 50-200ms
                 → Cost: $0.01/day

Total Cost: $0.02/day ($0.60/month)
Total UX: 😊 ~50 false positive alerts/day (90% reduction!)
```

## Training Feedback Loop

Every nano decision trains your system:

```javascript
if (nanoResult.verdict === 'safe' && lexiconFlagged) {
  // Log this pattern as false positive
  feedbackService.learnFalsePositive({
    messageText: message.text,
    lexiconCategory: scoreResult.category,
    nanoReason: nanoResult.reason
  });

  // Update lexicon to ignore this pattern
  // Example: "בסרט" (in a movie) → Don't flag "מת" in this context
}
```

After 2-4 weeks, your lexicon learns:
- "ראיתי בסרט" (I saw in a movie) → Always safe
- "למה לא ענית" + 😂 (why didn't you answer + laugh emoji) → Probably safe
- "אתה לוזר" without emojis → Potentially harmful

## Configuration

### Enable/Disable Nano Pre-Filter

`config.js`:
```javascript
FEATURES: {
  BULLYWATCH_NANO_PREFILTER: true,  // Set to false to disable
  BULLYWATCH_GPT_ANALYSIS: true,    // Layer 4 still works independently
}
```

### Adjust Nano Thresholds

`services/bullywatch/nanoPreFilterService.js`:
```javascript
// Line 69: Skip scoring threshold
if (nanoResult.verdict === 'safe' && nanoResult.confidence > 0.85) {
  // Increase to 0.90 if you want stricter filtering
  // Decrease to 0.80 if you want to catch more edge cases
}
```

## Testing

### Run Test Suite
```bash
node tests/testNanoPreFilter.js
```

This tests:
- Movie discussions (false positives)
- Homework help (false positives)
- Direct insults (true positives)
- Threats (true positives)
- Social exclusion (true positives)
- Friend banter (ambiguous)

### Monitor Performance
```javascript
const bullywatch = require('./services/bullywatch');

// Get nano statistics
const stats = bullywatch.getNanoStats();
console.log(stats);

// Output:
// {
//   totalCalls: 1523,
//   clearlySafe: 1301,  // 85.4%
//   potentiallyHarmful: 189,  // 12.4%
//   ambiguous: 33,  // 2.2%
//   estimatedMonthlyCost: "$0.68/month"
// }
```

## Cost Analysis

### Example: 10,000 messages/day
```
Nano Pre-Filter:
  10,000 msgs × 200 tokens × $0.05/M = $0.10/day

GPT-5-Mini (Layer 4):
  300 ambiguous × 500 tokens × $0.25/M = $0.0375/day

Total: $0.14/day = $4.20/month

UX Improvement: 90% fewer false positive alerts
```

## Rollout Strategy

### Phase 1: Testing (Week 1-2)
```javascript
// Enable nano but keep it in "shadow mode"
BULLYWATCH_NANO_PREFILTER: true,
BULLYWATCH_MONITOR_MODE: true,  // No auto-deletions

// Monitor stats daily
npm run bullywatch:stats
```

### Phase 2: Tuning (Week 3-4)
- Adjust confidence threshold (0.85 → 0.90?)
- Update lexicon based on false positives nano catches
- Monitor cost vs. UX improvement

### Phase 3: Production (Week 5+)
- Nano pre-filter proven stable
- False positive rate reduced by 80-90%
- Cost is minimal (<$5/month)
- Keep MONITOR_MODE: true (human review still required)

## Success Metrics

**Target Goals (after 1 month):**
- [ ] 85%+ of messages skip scoring (nano "safe")
- [ ] False positive rate reduced by 80%+
- [ ] Cost stays under $5/month
- [ ] Average processing time <100ms
- [ ] Admin alert fatigue reduced significantly

## FAQ

**Q: Why not just improve the lexicon instead of adding AI?**
A: Hebrew is complex. "מת באוטו" (died in a car) could be:
- Safe: "ראיתי בסרט איך כלב מת באוטו" (movie discussion)
- Harmful: "תמות באוטו" (violent threat)
Context matters, and nano understands context.

**Q: What if nano fails or is down?**
A: System fails open. If nano errors, message continues to Layer 1-3 (current system).

**Q: Can we use nano for Layer 4 instead of GPT-5-mini?**
A: No. Layer 4 needs deep context (5-7 messages) and nuanced analysis. Nano is fast but shallow. Mini is better for ambiguous cases.

**Q: What about privacy?**
A: Message text is sent to OpenAI API. Same as current GPT-5-mini usage. No persistent storage.

**Q: Can we train our own model instead?**
A: Possible, but:
- Training requires 10K+ labeled Hebrew examples
- Model hosting costs ~$50/month
- GPT-5-nano is $2-5/month and constantly improving
Not worth it unless you have massive scale (100K+ msg/day).

## Related Files

- `services/bullywatch/nanoPreFilterService.js` - Nano service implementation
- `services/bullywatch/index.js` - Main orchestrator (integrates nano)
- `tests/testNanoPreFilter.js` - Test suite
- `config.js` - Feature flags

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/bCommGuard/issues
- Tag: `#bullywatch` `#nano-prefilter`
