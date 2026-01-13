# Bullywatch Feedback System - Quick Reference

## 5 Admin Commands

### 1️⃣ Review Flagged Messages
```
#bullywatch review
```
Shows last 10 flagged messages with IDs for feedback

---

### 2️⃣ Provide Feedback
```
#bullywatch feedback <id> <verdict>
```

**Verdicts:**
- `true_positive` - Correctly flagged bullying ✅
- `false_positive` - Not bullying, false alarm ❌
- `low` - Low severity bullying 🟢
- `medium` - Medium severity bullying 🟡
- `high` - High severity bullying 🔴

**Example:**
```
#bullywatch feedback msg_1234567890_abc123 true_positive
```

---

### 3️⃣ Suggest New Offensive Word
```
#bullywatch suggest <word>
```

**Example:**
```
#bullywatch suggest חנון
```

---

### 4️⃣ View Accuracy Metrics
```
#bullywatch metrics
```

Shows:
- Total feedback count
- True/false positive rates
- Severity distribution
- Detection accuracy

---

### 5️⃣ Export Data as CSV
```
#bullywatch export
```

Exports all flagged messages with feedback to CSV format

---

## Storage

**Primary:** Redis (persistent, fast)
**Fallback:** In-Memory (if Redis unavailable)

**Capacity:** Last 100 flagged messages

---

## Workflow

1. **Bot detects bullying** → Message auto-stored
2. **Admin receives alert** → Uses `#bullywatch review`
3. **Admin reviews messages** → Uses `#bullywatch feedback <id> <verdict>`
4. **System learns** → Metrics calculated from feedback
5. **Monthly review** → Admin checks `#bullywatch metrics`
6. **Data export** → Admin uses `#bullywatch export` for analysis

---

## Metrics Interpretation

| Metric | Good | Warning | Action |
|--------|------|---------|--------|
| Accuracy | >85% | <75% | Review thresholds |
| False Positive Rate | <15% | >20% | Tune detection |
| True Positives | High | Low | System working well |

---

## Test the System

```bash
node tests/testBullywatchFeedback.js
```

Expected: ✅ All tests pass (both Redis and in-memory)

---

## Troubleshooting

**No messages in review?**
- Bullying hasn't been detected yet
- Redis was restarted (in-memory data lost)
- Enable monitoring: `#bullywatch on [class]`

**Message ID not found?**
- Use exact ID from `#bullywatch review`
- Message may have expired (>100 messages ago)

**Metrics show 0%?**
- No feedback provided yet
- Provide feedback first: `#bullywatch feedback <id> <verdict>`

---

## Access Control

**Admin Only:** Must be `ALERT_PHONE`, `ADMIN_PHONE`, or `ADMIN_LID`
**Group Admins:** Cannot use these commands (bot admin required)

---

## Files Modified

1. **services/commandHandler.js**
   - Added 5 new handler methods
   - Integrated with existing `#bullywatch` command

2. **services/bullyingMonitoringService.js**
   - Auto-stores flagged messages in Redis/memory
   - Triggers on every bullying alert

3. **tests/testBullywatchFeedback.js**
   - Comprehensive test suite
   - Tests both Redis and in-memory storage

---

## Quick Demo

```bash
# 1. Enable monitoring in a group
#bullywatch on ג3

# 2. Wait for bullying detection (or trigger manually for testing)

# 3. Review flagged messages
#bullywatch review

# 4. Provide feedback
#bullywatch feedback msg_123 true_positive

# 5. View metrics
#bullywatch metrics

# 6. Export data
#bullywatch export
```

---

**Documentation:** `docs/bullywatch-feedback-system.md`
**Tests:** `tests/testBullywatchFeedback.js`
**Version:** 1.0.0 (January 2026)
