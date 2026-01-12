1) The core model
You compute a Message Risk Score:
Score = BasePoints (by category) + Modifiers (context) + BehaviorPoints (repetition/pile-on)
Then map score → actions.
This matches how modern moderation scoring is usually treated: scores are for choosing thresholds/actions, not “how offensive” in a human sense.
2) BasePoints by category (the “perfect” part)
Instead of “offensive word count”, each matched item carries category severity.
Category weights (per match)
Critical threats / safety (instant danger)
Sexual threat / coercion: +18
Violence threat / “I’ll hurt you”: +16
Self-harm encouragement / “go die” / “kill yourself”: +18
Doxxing / privacy threat (address/phone/location threat): +16
Blackmail / leak threat (“I’ll publish”, “I have screenshots” as leverage): +14
Severe harassment
Hate/identity attack (against protected traits): +16
Targeted humiliation (expose, shame, “let’s make a sticker of him”, “send to everyone”): +12
Bullying / harassment
Direct insult (“idiot”, “loser”, “cringe”, etc.): +4
Degrading comparison / animal emoji as insult: +6
Mocking emojis used to belittle (🤡, 🙄, 💀 when directed at a person): +3
Emojis are widely used as non-verbal harassment signals, including mocking/bullying contexts.
Group harm
Exclusion / boycott / “kick him”, “don’t add her”, “everyone block”: +10
Incitement / pile-on prompts (“who agrees he’s…”, “everyone laugh at…”): +9
Hard cap rule (prevents “spammy” stacking)
Count max 2 matches per category for BasePoints in a single message (otherwise kids can force red by spamming a word).
3) Context modifiers (where accuracy jumps)
These multiply or add, because the same token behaves differently depending on targeting.
Targeting multiplier
Apply ×1.5 if any of:
Direct address (“אתה/את/הוא/היא/אתם”)
Mention/tag of a student name
Reply quoting the victim
Public-shaming multiplier
Apply ×1.3 if any of:
“כולם”, “לכולם”, “תראו”, “שלחו”
Forwarded screenshot/caption patterns (even without image analysis)
Emoji intensity add-on
Add +2 if:
3+ mocking emojis (🤡/🙄/💀/😂) OR clap-spaced sarcasm 👏word👏word👏
(Emoji-led harassment is a known pattern: “emojis not words” phenomenon.)
4) BehaviorPoints (bullying is often a pattern)
This is how you catch “one word at a time” bullying.
Repeat offender in rolling window
If same sender has prior flags:
+3 if sender had any 🟡/🔴 in last 60 minutes
+6 if sender had any 🔴 in last 24 hours
+10 if sender had 3+ 🟡 in last 7 days
Pile-on detection (group attack)
If 2+ different users target the same victim within 10 minutes:
add +8 to each new attacking message (until window closes)
Harassment persistence
If the same sender targets same victim repeatedly:
+4 on 2nd hit in 30 minutes
+7 on 3rd+ hit in 30 minutes
(These behavior signals line up with research emphasis that cyberbullying is deliberate, repeated, and socially reinforced.)
5) Thresholds → actions (your exact requirements)
🟢 GREEN (Score 1–9)
Action
Log only (store score + categories + sender + messageId)
No group message
No admin alert
🟡 YELLOW (Score 10–17)
Action
Alert admin (0544345287) with structured text:
Group, sender, message, score, categories, why it crossed yellow
Send group reminder (no naming)
Group reminder text
🟡 תזכורת: שומרים על שיח מכבד בקבוצה.
גם כשלא מסכימים, מדברים בכבוד. תודה 🙏
🔴 RED (Score ≥18) OR any single Critical category present
Action
Alert admin (0544345287) with “RED” label + details
Delete message
Send group policy notice
Group policy text
🔴 הודעה הוסרה עקב הפרת כללי הקבוצה (איומים/הטרדה/פגיעה בפרטיות).
זו קבוצה בית-ספרית שמחויבת לסביבה בטוחה.
המשך הפרות יטופלו בהסלמה בהתאם למדיניות.
למה “Critical = תמיד אדום”? כי אחרת איום קצר יכול להיראות “ירוק”. זה בדיוק הכשל של word-count.
6) Worked examples (so it’s deterministic)
Example A: “אתה טיפש”
Insult +4
Targeting ×1.5 → 6
✅ GREEN (6)
Example B: “אתה לוזר 🤡🤡”
Insult +4
Mocking emojis +3 (once) + emoji intensity +2
Sum = 9
Targeting ×1.5 → 13.5
✅ YELLOW (14)
Example C: “חכה לי אחרי בית ספר”
Violence threat +16
Targeting ×1.5 → 24
✅ RED (delete + admin + policy)
Example D: “אל תצרפו אותו לקבוצה”
Exclusion +10
Targeting (implicit “אותו”) treat as targeted: ×1.5 → 15
✅ YELLOW (admin + reminder)
Example E: “יש לי צילום מסך, אם לא… אני שולח לכולם”
Blackmail/leak threat +14
Public-shaming ×1.3 → 18.2
✅ RED
7) Anti-gaming rules (kids will try)
Category cap (max 2 matches per category per message)
Score floor for Critical (any Critical match = RED regardless of final score)
Decay: BehaviorPoints reset gradually (so a kid isn’t “red forever”)
daily decay: −4 from rolling 7-day offender score