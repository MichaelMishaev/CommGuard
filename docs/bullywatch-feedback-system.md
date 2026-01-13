# Bullywatch Feedback System Documentation

## Overview

The Bullywatch Feedback System allows administrators to review, provide feedback on, and track the accuracy of bullying detection in bCommGuard. The system uses **Redis for persistent storage** with **automatic fallback to in-memory storage** when Redis is unavailable.

## Architecture

### Storage Strategy

**Primary Storage: Redis**
- Persistent, fast, distributed
- Supports atomic operations
- Automatic expiration and cleanup
- Production-ready for multi-instance deployments

**Fallback Storage: In-Memory (Global Object)**
- Used when Redis is unavailable
- Lost on bot restart
- Suitable for development and testing
- Automatically activated if Redis connection fails

### Data Structures

#### 1. Flagged Messages (`bullywatch:flagged`)
**Type:** Redis List (LPUSH/LRANGE)

**Purpose:** Store messages flagged by bullying detection system

**Format:**
```json
{
  "id": "msg_1234567890_abc123",
  "timestamp": 1705132800000,
  "groupName": "Class ג3",
  "groupId": "972123456789@g.us",
  "senderName": "John Doe",
  "senderPhone": "972501234567",
  "messageText": "בן זונה",
  "matchedWords": ["זונה"],
  "severity": "mild",
  "verdict": null,
  "feedbackTimestamp": null
}
```

**Retention:** Last 100 messages (automatic trimming)

#### 2. Feedback Data (`bullywatch:feedback`)
**Type:** Redis Hash (HSET/HGETALL)

**Purpose:** Store admin feedback for metrics calculation

**Format:**
```json
{
  "msg_1234567890_abc123": {
    "verdict": "true_positive",
    "timestamp": 1705132900000,
    "messageId": "msg_1234567890_abc123"
  }
}
```

**Verdicts:**
- `true_positive` - Correctly flagged bullying
- `false_positive` - Incorrectly flagged (not bullying)
- `low` - Low severity bullying
- `medium` - Medium severity bullying
- `high` - High severity bullying

#### 3. Word Suggestions (`bullywatch:suggestions`)
**Type:** Redis Sorted Set (ZADD/ZRANGE)

**Purpose:** Store admin suggestions for new offensive words

**Format:**
```json
{
  "word": "חנון",
  "timestamp": 1705132800000,
  "suggestedBy": "972544345287@s.whatsapp.net"
}
```

**Score:** Timestamp (for chronological ordering)

---

## Admin Commands

### 1. `#bullywatch review`

**Purpose:** Show last 10 flagged messages for admin review

**Usage:**
```
#bullywatch review
```

**Response Example:**
```
🎯 *BULLYWATCH REVIEW*
📊 Source: Redis
📝 Showing 10 flagged messages

━━━━━━━━━━━━━━━━
🆔 ID: msg_1234567890_abc123
⏰ 15m ago
👥 Group: Class ג3
👤 User: John Doe
💬 Message: "בן זונה"
🚩 Words: זונה
⏳ Status: Pending

━━━━━━━━━━━━━━━━
📝 *Provide Feedback:*
#bullywatch feedback <id> <verdict>

Verdicts: true_positive | false_positive | low | medium | high
```

**Features:**
- Shows last 10 flagged messages
- Displays timestamp, group, user, message, matched words
- Shows verdict status (✅ true_positive, ❌ false_positive, 🟢 low, 🟡 medium, 🔴 high, ⏳ pending)
- Indicates storage source (Redis or memory)

---

### 2. `#bullywatch feedback <id> <verdict>`

**Purpose:** Provide feedback on a flagged message

**Usage:**
```
#bullywatch feedback msg_1234567890_abc123 true_positive
```

**Parameters:**
- `<id>` - Message ID from review list
- `<verdict>` - One of: `true_positive`, `false_positive`, `low`, `medium`, `high`

**Response Example:**
```
✅ Feedback recorded!

🆔 Message ID: msg_1234567890_abc123
📊 Verdict: true_positive
💾 Stored in: Redis

Use #bullywatch metrics to view accuracy stats.
```

**Features:**
- Validates verdict against allowed values
- Updates message verdict in Redis/memory
- Stores feedback in separate hash for metrics
- Records timestamp of feedback

---

### 3. `#bullywatch suggest <word>`

**Purpose:** Suggest a new offensive word to add to detection

**Usage:**
```
#bullywatch suggest חנון
```

**Parameters:**
- `<word>` - Word to suggest (can include spaces for phrases)

**Response Example:**
```
✅ Word suggestion recorded!

📝 Word: "חנון"
💾 Stored in: Redis

Thank you for helping improve bullying detection!
```

**Features:**
- Stores word in sorted set (chronologically ordered)
- Records who suggested the word
- Admin can review suggestions later for addition to lexicon

---

### 4. `#bullywatch metrics`

**Purpose:** View accuracy statistics from feedback data

**Usage:**
```
#bullywatch metrics
```

**Response Example:**
```
📊 *BULLYWATCH METRICS*

💾 Source: Redis
📈 Total Feedback: 47

━━━━━━━━━━━━━━━━
✅ True Positives: 42 (89.4%)
❌ False Positives: 5 (10.6%)

🟢 Low Severity: 15
🟡 Medium Severity: 20
🔴 High Severity: 7

━━━━━━━━━━━━━━━━
🎯 Detection Accuracy: 89.4%
⚠️  False Positive Rate: 10.6%

✨ *Excellent detection accuracy!*

Use #bullywatch export to download full data.
```

**Metrics Calculated:**
- **Total Feedback:** Number of reviewed messages
- **True Positives:** Correctly flagged bullying
- **False Positives:** Incorrectly flagged messages
- **Severity Distribution:** Low, medium, high counts
- **Detection Accuracy:** (True Positives / Total) × 100%
- **False Positive Rate:** (False Positives / Total) × 100%

**Recommendations:**
- FPR > 20%: "⚠️ High false positive rate detected. Consider reviewing detection thresholds."
- Accuracy > 85%: "✨ Excellent detection accuracy!"

---

### 5. `#bullywatch export`

**Purpose:** Export feedback data as CSV

**Usage:**
```
#bullywatch export
```

**Response Example:**
```
📊 *BULLYWATCH DATA EXPORT*

💾 Source: Redis
📝 Total Records: 47
📅 Export Date: 13/01/2026, 09:30

━━━━━━━━━━━━━━━━

```ID,Timestamp,Group Name,Sender Name,Message,Matched Words,Verdict,Feedback Timestamp
"msg_1234567890_abc123","2026-01-13T07:30:00.000Z","Class ג3","John Doe","בן זונה","זונה","true_positive","2026-01-13T07:35:00.000Z"
...```

💡 Copy the CSV data above and save as .csv file.
```

**CSV Format:**
- **ID:** Unique message identifier
- **Timestamp:** When message was flagged (ISO 8601)
- **Group Name:** WhatsApp group name
- **Sender Name:** User who sent the message
- **Message:** Full message text
- **Matched Words:** Offensive words detected (semicolon-separated)
- **Verdict:** Admin feedback (or "pending")
- **Feedback Timestamp:** When feedback was provided (ISO 8601 or "N/A")

**Features:**
- CSV-escaped (handles commas, quotes, newlines)
- Includes all flagged messages (not just reviewed)
- Can be imported into Excel, Google Sheets, or analysis tools

---

## Integration with Bullying Detection

### Automatic Storage

When bullying is detected and an alert is sent, the message is **automatically stored** in the feedback system:

**Location:** `services/bullyingMonitoringService.js` → `sendAlert()`

**Process:**
1. Bullying detection triggers alert
2. Alert message is sent to admin
3. Flagged message data is stored in Redis (or memory if Redis unavailable)
4. Message includes: ID, timestamp, group, user, message text, matched words, severity
5. Verdict is initially `null` (pending admin feedback)

**Storage Limits:**
- Redis: Last 100 messages (automatic LTRIM)
- Memory: Last 100 messages (manual array slicing)

---

## Performance Considerations

### Redis Storage (Recommended)

**Advantages:**
- ✅ Persistent across bot restarts
- ✅ Atomic operations (no race conditions)
- ✅ Fast lookups (O(1) for hashes, O(log N) for sorted sets)
- ✅ Supports multi-instance deployments
- ✅ Automatic expiration and cleanup

**Resource Usage:**
- ~500 bytes per flagged message
- 100 messages = ~50 KB
- Negligible impact on 960MB server

### In-Memory Fallback

**Advantages:**
- ✅ No external dependencies
- ✅ Zero network latency
- ✅ Works in development without Redis

**Disadvantages:**
- ❌ Lost on bot restart
- ❌ Not suitable for production long-term
- ❌ Single-instance only

---

## Error Handling

### Redis Connection Failures

**Behavior:**
1. System attempts to use Redis
2. If connection fails, catches error
3. Automatically falls back to in-memory storage
4. Logs warning: `⚠️ Redis unavailable, using in-memory fallback`
5. Commands continue to work seamlessly

**User Impact:**
- None (transparent fallback)
- Storage source is displayed in responses: `💾 Stored in: Redis` or `💾 Stored in: memory`

### Invalid Command Parameters

**#bullywatch feedback:**
- Missing ID or verdict → Shows usage help
- Invalid verdict → Lists valid verdicts
- Unknown message ID → "Message ID not found" error

**#bullywatch suggest:**
- Missing word → Shows usage help

---

## Testing

### Run Test Suite

```bash
node tests/testBullywatchFeedback.js
```

**Tests Included:**
1. ✅ In-memory storage (fallback)
2. ✅ Redis storage (if available)
3. ✅ Flagged message storage
4. ✅ Feedback recording
5. ✅ Metrics calculation
6. ✅ Word suggestions
7. ✅ CSV export

**Expected Output:**
```
✅ ALL TESTS COMPLETED

Summary:
  • In-memory fallback: ✅ Working
  • Redis storage: ✅ Working (if Redis available)
  • 5 admin commands: Ready to use
```

---

## Future Enhancements

### Phase 1: Lexicon Learning (Completed ✅)
- [x] Admin can suggest new offensive words
- [x] Suggestions stored in Redis sorted set
- [ ] Automated weekly review of suggestions
- [ ] One-click addition to offensive words database

### Phase 2: Advanced Analytics
- [ ] Trend analysis (false positive rate over time)
- [ ] Per-group accuracy metrics
- [ ] Severity distribution charts
- [ ] Monthly accuracy reports

### Phase 3: Auto-Tuning
- [ ] Automatic threshold adjustment based on feedback
- [ ] Weekly lexicon updates from high-confidence suggestions
- [ ] Machine learning integration for pattern detection

---

## Troubleshooting

### Issue: "No flagged messages to review"

**Cause:** No bullying has been detected yet, or Redis/memory is empty

**Solution:**
1. Wait for bullying detection to flag messages
2. Check if Redis is connected: `redis-cli ping`
3. Verify bullying monitoring is enabled in group: `#bullywatch status`

---

### Issue: "Message ID not found" when providing feedback

**Cause:** Message ID is incorrect or expired

**Solution:**
1. Use `#bullywatch review` to get current message IDs
2. Copy the exact ID (case-sensitive)
3. Check if Redis was restarted (in-memory data lost)

---

### Issue: Metrics show 0% accuracy

**Cause:** No feedback has been provided yet

**Solution:**
1. Use `#bullywatch review` to see flagged messages
2. Provide feedback with `#bullywatch feedback <id> <verdict>`
3. Run `#bullywatch metrics` again

---

## Security Considerations

### Admin-Only Access

**Enforcement:**
- All commands check `isAuthorizedAdmin` flag
- Only `ALERT_PHONE`, `ADMIN_PHONE`, or `ADMIN_LID` can use commands
- Group admin status is NOT sufficient (bot admin required)

### Data Privacy

**Message Storage:**
- Only flagged messages are stored (not entire chat history)
- Messages are stored for feedback purposes only
- Limited to 100 most recent flagged messages
- No third-party access

**User Information:**
- Sender name and phone stored for context
- Data is NOT shared externally
- Used only for admin review and accuracy metrics

---

## API Reference

### Internal Functions

#### `handleBullywatchReview(msg, groupId)`
- Retrieves last 10 flagged messages
- Returns formatted review message
- Falls back to memory if Redis unavailable

#### `handleBullywatchFeedback(msg, args, groupId)`
- Validates verdict against allowed values
- Updates message verdict in Redis/memory
- Stores feedback in hash for metrics

#### `handleBullywatchSuggest(msg, args, groupId)`
- Stores word suggestion in sorted set
- Records timestamp and suggester
- Returns confirmation message

#### `handleBullywatchMetrics(msg, groupId)`
- Calculates accuracy metrics from feedback
- Computes severity distribution
- Provides recommendations

#### `handleBullywatchExport(msg, groupId)`
- Generates CSV from all flagged messages
- Escapes special characters
- Returns formatted export message

---

## Credits

**Developed by:** Claude Code (Anthropic)
**Project:** bCommGuard - WhatsApp Group Moderation Bot
**Date:** January 2026
**Version:** 1.0.0

---

## License

This documentation is part of bCommGuard and follows the same license as the main project.
