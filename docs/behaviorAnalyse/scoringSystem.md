# Anti-Bullying Scoring System (Production-Ready v2.0)

## Overview
This document defines the **deterministic, mathematically precise** scoring system for detecting cyberbullying in Hebrew WhatsApp groups tagged with `#bullywatch`.

## Architecture
```
Message → Pre-Processing → Base Scoring → Context Modifiers → Behavior Analysis → Severity Tier → Action
```

---

## PHASE 1: Pre-Processing (Normalization)

**All messages are normalized BEFORE scoring to prevent evasion.**

### 1.1 Hebrew Letter Swap Normalization
Common intentional misspellings to evade detection:
```javascript
א ↔ ע  (alef/ayin confusion)
ט ↔ ת  (tet/tav confusion)
כ ↔ ק  (kaf/qof confusion)
```

**Example:**
- Input: `"אתה טיפש"` or `"עתה תיפש"` → Normalized: `"אתה טיפש"`

### 1.2 Spacing Evasion Removal
Kids type "מ פ ג ר" to evade "מפגר" detection.

**Normalization:**
```javascript
Remove spaces between Hebrew characters if:
- Each segment is 1-2 characters
- Total length when joined is a known lexicon word
```

**Example:**
- Input: `"א ת ה ל ו ז ר"` → Normalized: `"אתה לוזר"`

### 1.3 Transliteration Detection
English transliteration of Hebrew insults: "lozer", "metumtam", "sahi"

**Approach:**
- Maintain dual lexicon (Hebrew + transliteration)
- Match both forms

**Example:**
- Input: `"you are such a lozer"` → Matched as: `"אתה לוזר"`

### 1.4 Emoji Standardization
- Convert all emoji variations to canonical form
- Remove zero-width joiners and invisible characters

---

## PHASE 2: Base Scoring

### 2.1 Category Weights (Per Match)

#### Critical Threats (Instant RED Floor)
| Category | Points | Examples (Hebrew) | Examples (English) |
|----------|--------|-------------------|-------------------|
| **Sexual Threat/Coercion** | +20 | "תשלח תמונה או אני מפרסם", "אם לא תעשה X יש לי וידאו" | "send pic or I'll publish", "I have your video" |
| **Self-Harm Encouragement** | +20 | "לך תמות", "תתאבד", "למה אתה עדיין חי" | "go die", "kill yourself", "why are you still alive" |
| **Violence Threat** | +18 | "חכה לי אחרי בית ספר", "אני אשבור אותך", "תקבל מכות" | "wait for me after school", "I'll break you" |
| **Doxxing/Privacy Threat** | +18 | "מה הכתובת שלך", "יש לי את המספר שלך", "תשלח מיקום" | "what's your address", "I have your number" |

#### Severe Harassment
| Category | Points | Examples (Hebrew) | Examples (English) |
|----------|--------|-------------------|-------------------|
| **Hate/Identity Attack** | +16 | Slurs against protected traits | Ethnic, religious, gender slurs |
| **Blackmail/Leak Threat** | +14 | "יש לי צילום מסך", "אני מעלה את זה לכולם" | "I have screenshot", "I'll upload it" |
| **Targeted Humiliation** | +12 | "בואו נעשה ממנו סטיקר", "תעלו צילום שלו" | "let's make a sticker of him", "upload his photo" |

#### Bullying/Harassment
| Category | Points | Examples (Hebrew) | Examples (English) |
|----------|--------|-------------------|-------------------|
| **Degrading Comparison** | +6 | "אתה חזיר 🐷", "נראה כמו כלב" | "you're a pig", "looks like a dog" |
| **Direct Insult** | +4 | "טיפש", "לוזר", "מפגר", "קרינג'" | "idiot", "loser", "stupid", "cringe" |
| **Mocking Emojis** | +3 | 🤡, 🙄, 💀 (when directed at person) | (context-dependent) |

#### Group Harm
| Category | Points | Examples (Hebrew) | Examples (English) |
|----------|--------|-------------------|-------------------|
| **Exclusion/Boycott** | +10 | "אל תצרפו אותו", "תעיפו אותה", "כולם תחסמו" | "don't add him", "kick her", "everyone block" |
| **Incitement/Pile-On** | +9 | "מי מסכים שהוא...", "כולם תצחקו עליו" | "who agrees he's...", "everyone laugh at him" |

### 2.2 Hard Cap Rule (Anti-Gaming)
**Maximum 2 matches per category counted per message.**

**Example:**
- Message: "טיפש טיפש טיפש טיפש טיפש" (5x insult)
- Counted as: +4 (first) +4 (second) = +8 total
- Remaining 3 matches ignored

### 2.3 Cross-Category Stacking
**Maximum 3 categories counted per message.**

**Example:**
- Message: "תמות לוזר יש לי צילום מסך שלך"
- Categories: Self-harm (+20), Insult (+4), Blackmail (+14)
- Only top 3 counted: 20 + 14 + 4 = 38

---

## PHASE 3: Context Modifiers

### 3.1 Targeting Multiplier (×1.5)
**Applied when victim is directly addressed.**

**Triggers:**
- Direct pronouns: אתה, את, הוא, היא, אתם, אתן
- @mention or name tag
- Reply quoting victim's message

**Example:**
```
"לוזר" (no targeting) → +4
"אתה לוזר" (targeting) → +4 × 1.5 = 6
```

### 3.2 Public-Shaming Multiplier (×1.3)
**Applied when message amplifies harm publicly.**

**Triggers:**
- Keywords: כולם, לכולם, תראו, שלחו
- Forwarding patterns detected
- Screenshot/caption patterns

**Example:**
```
"אתה טיפש" → +4 × 1.5 = 6
"כולם תראו איזה טיפש" → +4 × 1.5 × 1.3 = 7.8 ≈ 8
```

### 3.3 Emoji Intensity Add-On (+2)
**Applied when emoji harassment is severe.**

**Triggers:**
- 3+ mocking emojis (🤡, 🙄, 💀, 😂) in single message
- Clap-spaced sarcasm: 👏word👏word👏

**Example:**
```
"אתה לוזר 🤡🤡🤡" → Base: +4, Emoji: +3, Intensity: +2 = 9 × 1.5 = 13.5 ≈ 14
```

### 3.4 Friend Group Dampener (×0.5)
**Applied to small, high-interaction groups to reduce false positives.**

**Criteria:**
- Group <10 members
- High message frequency (>100 msgs/day)
- Low complaint history
- Manually whitelisted by admin

**Application:**
```
Final Score = (Base + Add-ons) × Targeting × Public-Shaming × Friend-Group
```

**Example:**
```
"אתה ממש טיפש" in friend group:
→ (+4 × 1.5) × 0.5 = 3 (GREEN, not YELLOW)
```

---

## PHASE 4: Behavior Points (Pattern Detection)

### 4.1 Repeat Offender (Same Sender)
**Tracks sender's recent violation history.**

| Condition | Points | Window |
|-----------|--------|--------|
| Sender had 🟡/🔴 in last 60 min | +3 | Rolling 60min |
| Sender had 🔴 in last 24 hours | +6 | Rolling 24hr |
| Sender had 3+ 🟡 in last 7 days | +10 | Rolling 7 days |

**Decay:** -4 points/day from rolling 7-day score

### 4.2 Pile-On Detection (Multi-User Attack)
**Tracks when multiple users target same victim.**

**Rule:**
- If 2+ different senders target same victim within 10 minutes
- Add +8 to **2nd and subsequent** attacking messages
- **1st message does NOT get retroactive +8**

**Example:**
```
10:00 - User A: "אתה טיפש" → Score: 6 (GREEN)
10:05 - User B: "כן הוא ממש טיפש" → Score: 6 + pile-on +8 = 14 (YELLOW)
10:07 - User C: "לוזר" → Score: 4 + pile-on +8 = 12 (YELLOW)
```

**User A's message stays GREEN** (no retroactive scoring).

### 4.3 Harassment Persistence (Same Sender → Same Victim)
**Tracks repeated targeting of one victim.**

| Occurrence | Points | Window |
|------------|--------|--------|
| 2nd message to same victim | +4 | Within 30 min |
| 3rd+ message to same victim | +7 | Within 30 min |

---

## PHASE 5: Final Score Calculation

### 5.1 Order of Operations (Explicit Formula)

```javascript
// Step 1: Sum base points (max 2 per category, max 3 categories)
baseScore = sum(categoryPoints)

// Step 2: Add emoji and other add-ons
withAddOns = baseScore + emojiIntensity

// Step 3: Apply context multipliers (multiplicative stacking)
withContext = withAddOns × targetingMultiplier × publicShamingMultiplier

// Step 4: Apply friend group dampener (if applicable)
withFriendGroup = withContext × friendGroupMultiplier

// Step 5: Add behavior points (AFTER multipliers)
finalScore = withFriendGroup + behaviorPoints

// Step 6: Apply Critical Floor Rule
if (hasCriticalCategory) {
  finalScore = max(finalScore, 20)  // Force minimum RED-1
}

// Step 7: Round to nearest integer
finalScore = Math.round(finalScore)
```

### 5.2 Critical Floor Rule
**Any message with Critical category (Sexual/Violence/Self-Harm/Doxxing) = minimum score 20 (RED-1).**

**Rationale:** Short threats like "חכה לי" (wait for me) would score low without context, but are severe threats.

---

## PHASE 6: Severity Tiers & Actions

### 6.1 Tier Definitions

#### 🟢 GREEN (Score 1-9): Safe
**Action:**
- Log only (store: score, categories, sender, messageId, timestamp)
- No group message
- No admin alert

#### 🟡 YELLOW (Score 10-17): Monitor
**Action:**
- Alert admin (0544345287) with:
  ```
  🟡 YELLOW Alert
  Group: [name]
  Sender: [name/phone]
  Message: "[text]"
  Score: [X]
  Categories: [list]
  Why: [explanation]
  ```
- Send group reminder (no naming):
  ```
  🟡 תזכורת: שומרים על שיח מכבד בקבוצה.
  גם כשלא מסכימים, מדברים בכבוד. תודה 🙏
  ```

#### 🔴 RED-1 (Score 18-29): Delete & Alert
**Action:**
- Alert admin with "🔴 RED-1" label
- Delete message immediately
- Send group policy notice:
  ```
  🔴 הודעה הוסרה עקב הפרת כללי הקבוצה (איומים/הטרדה/פגיעה בפרטיות).
  זו קבוצה בית-ספרית שמחויבת לסביבה בטוחה.
  המשך הפרות יטופלו בהסלמה בהתאם למדיניות.
  ```

#### 🔴 RED-2 (Score 30-44): Delete, Alert Parents, Temporary Mute
**Action:**
- All RED-1 actions +
- Alert admin with "🔴 RED-2" label + recommendation to contact parents
- Temporary mute sender (60 minutes)
- Escalation notice to group:
  ```
  🔴 משתמש הושתק זמנית (60 דקות) עקב הפרה חמורה.
  הורים יקבלו התראה. המשך הפרות יגרום להסרה מהקבוצה.
  ```

#### 🔴 RED-3 (Score 45+): Delete, Alert All Stakeholders, Auto-Ban
**Action:**
- All RED-2 actions +
- Alert admin with "🔴 RED-3 - CRITICAL" label + recommendation for:
  - Parent contact
  - School counselor notification
  - Police report (if applicable: violence threats, sexual coercion, doxxing)
- Auto-ban sender from group
- Critical notice to group:
  ```
  🔴 משתמש הוסר מהקבוצה עקב הפרה קריטית של כללי הבטיחות.
  הרשויות המתאימות יקבלו דיווח בהתאם לחומרת ההפרה.
  ```

---

## PHASE 7: Worked Examples (Deterministic Testing)

### Example A: Mild Insult (GREEN)
```
Message: "אתה טיפש"
Normalized: "אתה טיפש"

Base Scoring:
→ Direct Insult: +4

Context Modifiers:
→ Targeting (אתה): ×1.5

Calculation:
→ 4 × 1.5 = 6

✅ GREEN (6) → Log only
```

### Example B: Insult + Mocking Emojis (YELLOW)
```
Message: "אתה לוזר 🤡🤡🤡"
Normalized: "אתה לוזר 🤡🤡🤡"

Base Scoring:
→ Direct Insult: +4
→ Mocking Emojis: +3
→ Emoji Intensity (3+ emojis): +2
→ Subtotal: 9

Context Modifiers:
→ Targeting (אתה): ×1.5

Calculation:
→ 9 × 1.5 = 13.5 ≈ 14

✅ YELLOW (14) → Admin alert + group reminder
```

**Note:** Fixed from original document (was 2 emojis, now correctly 3+)

### Example C: Violence Threat (RED-1)
```
Message: "חכה לי אחרי בית ספר"
Normalized: "חכה לי אחרי בית ספר"

Base Scoring:
→ Violence Threat: +18

Context Modifiers:
→ Targeting (לי = implied): ×1.5

Critical Floor:
→ Has Critical category → minimum 20

Calculation:
→ 18 × 1.5 = 27
→ Apply floor: max(27, 20) = 27

✅ RED-1 (27) → Delete + admin alert + group notice
```

### Example D: Exclusion Language (YELLOW)
```
Message: "אל תצרפו אותו לקבוצה"
Normalized: "אל תצרפו אותו לקבוצה"

Base Scoring:
→ Exclusion: +10

Context Modifiers:
→ Targeting (אותו): ×1.5

Calculation:
→ 10 × 1.5 = 15

✅ YELLOW (15) → Admin alert + group reminder
```

### Example E: Blackmail + Public Shaming (RED-2)
```
Message: "יש לי צילום מסך, אם לא תעשה מה שאני רוצה אני שולח לכולם"
Normalized: same

Base Scoring:
→ Blackmail: +14

Context Modifiers:
→ Targeting (אתה implied): ×1.5
→ Public-Shaming (לכולם): ×1.3

Calculation:
→ 14 × 1.5 × 1.3 = 27.3 ≈ 27

✅ RED-1 (27) → Delete + admin alert + group notice

(Note: Would be RED-2 at score 30+, but close enough for escalation consideration)
```

### Example F: Pile-On Attack (Multiple Users)
```
10:00 - User A: "אתה טיפש"
Base: +4 × 1.5 = 6
✅ GREEN (6)

10:05 - User B: "כן הוא ממש טיפש"
Base: +4 × 1.5 = 6
Pile-on: +8 (2nd attacker within 10 min)
Total: 6 + 8 = 14
✅ YELLOW (14)

10:07 - User C: "לוזר"
Base: +4
Pile-on: +8 (3rd attacker within 10 min)
Total: 4 + 8 = 12
✅ YELLOW (12)
```

**Note:** User A's message does NOT get retroactive +8

### Example G: Repeat Offender Escalation
```
Day 1, 10:00 - User D: "אתה טיפש" → Score: 6 (GREEN)
Day 1, 10:30 - User D: "ממש טיפש" → Score: 6 + repeat +3 = 9 (GREEN, but flagged)
Day 1, 11:00 - User D: "לוזר" → Score: 4 + repeat +3 = 7 (GREEN, pattern emerging)

Day 1, 15:00 - User D: "אתה מפגר 🤡🤡🤡"
Base: +4 +3 +2 = 9
Targeting: ×1.5 = 13.5 ≈ 14
Behavior (3+ yellow in 7 days): +10
Total: 14 + 10 = 24
✅ RED-1 (24) → Delete + admin alert
```

### Example H: Friend Group Dampener
```
Message: "אתה ממש טיפש חחחח" (in whitelisted friend group <10 members)

Base Scoring:
→ Direct Insult: +4

Context Modifiers:
→ Targeting (אתה): ×1.5
→ Friend Group: ×0.5

Calculation:
→ 4 × 1.5 × 0.5 = 3

✅ GREEN (3) → Log only (banter between friends)
```

---

## PHASE 8: Anti-Gaming & Edge Cases

### 8.1 Spam Prevention
**Max 2 matches per category per message** prevents:
```
"טיפש טיפש טיפש טיפש טיפש" (50 times)
→ Only counts first 2 matches: +4 +4 = 8 (not 200)
```

### 8.2 Critical Floor
**Prevents short threats from being under-scored:**
```
"חכה" (wait) alone without context:
→ Violence threat: +18 × 1.5 = 27
→ Floor: max(27, 20) = 27 ✅ RED-1

Without floor, borderline threats could slip to YELLOW.
```

### 8.3 Decay Mechanism
**Prevents permanent "red-flagging" of reformed users:**

```javascript
// Daily decay: -4 points from rolling 7-day behavior score
behaviorScore(day) = max(0, behaviorScore(day-1) - 4)

// Example:
Day 1: User gets +10 (3 yellow flags) → behaviorScore = 10
Day 2: -4 decay → behaviorScore = 6
Day 3: -4 decay → behaviorScore = 2
Day 4: -4 decay → behaviorScore = 0 (reset)
```

**What decays:**
- The cumulative "offender modifier" from repeat violations
- Individual violation flags expire after their time window (60min, 24hr, 7 days)
- Message scores themselves do NOT decay (permanent record)

### 8.4 No Retroactive Scoring
**Pile-on detection does NOT retroactively change previous messages:**
```
Message 1 (10:00): Score 6 → stays 6 (even if Message 2 triggers pile-on)
Message 2 (10:05): Score 8 + pile-on → becomes 16
```

**Rationale:** Retroactive deletion would be confusing and unfair.

---

## PHASE 9: Performance & Accuracy

### 9.1 Expected Performance (After Testing)
**Targets (to be validated with real data):**
- True Positive Rate: >90%
- False Positive Rate: <8%
- False Negative Rate: <5%
- Processing Time: <50ms per message (lexicon + temporal)
- GPT Calls: Only 5-10% of flagged messages (cost-optimized)

**Baseline Comparison:**
- Simple keyword filtering: ~60% accuracy
- Rule-based systems (like ours): 70-85% accuracy
- ML systems (LSTM): 90-99% accuracy
- Hybrid (rules + ML): 95%+ accuracy

### 9.2 Validation Required
**Before production deployment:**
1. Test with 100-500 real Hebrew school chat messages
2. Manual labeling by experts (true/false positives)
3. Calculate precision, recall, F1 score
4. Tune thresholds based on results
5. A/B test in monitor mode for 2-4 weeks

**Note:** Accuracy claims above are estimates based on similar systems. Real validation pending.

---

## PHASE 10: Monitor Mode & Tuning

### 10.1 Monitor Mode (Default: ENABLED)
```javascript
FEATURES.BULLYWATCH_MONITOR_MODE = true  // No auto-deletions, only logging
```

**Purpose:**
- Collect real-world data without risking false deletions
- Tune thresholds based on actual group dynamics
- Identify new slang/patterns not in lexicon

**Duration:** 2-4 weeks minimum before enabling auto-actions

### 10.2 Feedback Loop
**Admin reviews each alert:**
```
#bullywatch review
→ Shows pending alerts
→ Admin marks: true_positive | false_positive | severity (low/med/high)
→ System updates lexicon weights monthly
```

**Learning Process:**
- Track which patterns cause most false positives
- Identify new Hebrew slang not in lexicon
- Adjust category weights based on severity feedback
- Update friend group whitelist based on complaint history

---

## Summary

### ✅ Fixed Issues from Original Document:
1. ✅ Example B emoji count corrected (3+ emojis)
2. ✅ Order of operations explicitly defined with formula
3. ✅ Pile-on timing clarified (2nd+ messages only, no retroactive)
4. ✅ Decay logic specified (behavior score, -4/day)
5. ✅ Hebrew normalization pre-processing added
6. ✅ Friend group multiplier documented with formula
7. ✅ RED severity tiers added (RED-1, RED-2, RED-3)
8. ✅ Cross-category stacking rules defined (max 3)
9. ✅ Accuracy claims marked as estimates pending validation
10. ✅ Context-aware emoji handling improved

### 🎯 Production Readiness Checklist:
- [x] Deterministic scoring (no ambiguity)
- [x] Anti-gaming rules (spam prevention)
- [x] Severity tiers (escalation path)
- [x] Monitor mode (safe deployment)
- [x] Feedback loop (continuous learning)
- [ ] Real data validation (100-500 messages)
- [ ] Performance testing (50ms target)
- [ ] Hebrew lexicon completion (all slang)
- [ ] Integration testing (end-to-end)

**System Status:** Ready for implementation and testing phase.
