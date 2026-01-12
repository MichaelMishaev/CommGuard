# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bCommGuard is a WhatsApp group moderation bot built with Baileys WebSocket API. It replaces the original CommGuard (which used whatsapp-web.js) for better performance and reliability. The bot automatically detects and removes WhatsApp group invite links, manages blacklists, and provides moderation commands.

## Server Access

### SSH Connection
- **Server IP**: `209.38.231.184`
- **Connection**: `ssh root@209.38.231.184`
- **Bot Path**: `/root/CommGuard/`
- **Process Manager**: PM2 (process name: `commguard`)
- **Full SSH Guide**: See `docs/ssh.md` for complete server management instructions

### Quick Server Commands
```bash
# Connect to server
ssh root@209.38.231.184

# Check bot status
pm2 status

# View logs
pm2 logs commguard

# Restart bot
pm2 restart commguard

# Check system resources (memory/CPU)
free -h && df -h
```

## Common Development Commands

### Running and Testing
- `npm start` - Start the bot in production mode
- `npm run dev` - Start with nodemon for auto-restart during development
- `npm run fresh` - Clean start using start-fresh.js
- `npm test` - Run the test suite (tests/runTests.js)
- `npm run diagnose` - Run diagnostic checks
- `node tests/testInviteDetection.js` - Test invite link pattern detection
- `node tests/stressTest.js` - Performance stress testing
- `node setupFirebase.js` - Test Firebase connection and permissions

### MCP Integration Testing
- `node tests/testMcpSearch.js` - Test MCP search functionality
- `./start-with-mcp.sh` - Start bot with MCP integration enabled

### Debugging Commands
- `node debugBotStatus.js` - Debug bot admin status issues
- `node debugCommandFlow.js` - Debug command processing flow
- `node tests/debugKick.js` - Debug user kicking functionality
- `node tests/qaTestBotAdmin.js` - Test bot admin detection
- `node tests/testMuteFunctionality.js` - Test mute service functionality
- `node tests/testAlertService.js` - Test alert notifications

## Architecture and Key Flows

### Core Architecture
- **Main Entry**: `index.js` - Bot initialization, QR code generation, message handling, and reconnection logic
- **Configuration**: `config.js` - Admin phones, feature toggles, patterns, and settings
- **Command Processing**: `services/commandHandler.js` - All bot commands (#help, #kick, #ban, etc.)
- **Service Layer**:
  - `blacklistService.js` - Manages blacklisted users with Firebase persistence
  - `whitelistService.js` - Manages whitelisted users who bypass all restrictions
  - `muteService.js` - Manages muted users and groups
  - `searchService.js` - MCP-based web search functionality with rate limiting
- **Utilities**:
  - `utils/sessionManager.js` - Handles WhatsApp session errors and decryption failures
  - `utils/botAdminChecker.js` - Checks if bot has admin privileges in groups
  - `utils/jidUtils.js` - WhatsApp ID format handling
  - `utils/logger.js` - Timestamp formatting and logging
  - `utils/alertService.js` - Handles kick alerts and security notifications

### Critical Message Flow
1. **Message Reception** → `handleMessage()` in index.js
2. **Private vs Group** → Routes to command handler or link detection
3. **Link Detection** → Regex pattern matching for invite links
4. **Action Execution** → Delete message → Add to blacklist → Kick user → Send alerts
5. **Error Handling** → Session errors, decryption failures, reconnection logic

### Authentication and Session Management
- Uses multi-file auth state stored in `baileys_auth_info/` directory
- Handles error 515 (Stream Error) with exponential backoff and auth clearing
- Manages decryption failures for potential encrypted spam detection
- Automatic reconnection with MAX_RECONNECT_ATTEMPTS = 10

### Firebase Integration
- Optional feature controlled by `FEATURES.FIREBASE_INTEGRATION` flag
- Collections: `blacklist`, `whitelist`, `muted`
- Falls back to memory-only mode if Firebase unavailable
- Service account key: `guard1-dbkey.json`

### MCP (Model Context Protocol) Integration
- Web search functionality through `services/searchService.js`
- Configuration in `mcp.json` with chrome-search and web-search servers
- Commands: `#search <query>`, `#verify <url>` (admin only, rate limited)
- Requires MCP server setup for full functionality

n## Translation Features

### Auto-Translation
- **Feature**:  - Automatically translates non-Hebrew messages to Hebrew
- **Russian Exclusion**: Russian language messages are **NOT translated** to preserve original text
- **Detection**: Uses Cyrillic character patterns and common Russian word matching
- **Supported Languages**: All languages except Hebrew (source) and Russian (excluded)
- **Rate Limiting**: 10 translations per minute per user
- **Log Indicators**: 
  - 🌐 for translated messages
  - 🇷🇺 for skipped Russian messages
  - 🔗 for skipped URLs
  - 📧 for skipped email addresses



## Translation Features

### Auto-Translation
- **Feature**: AUTO_TRANSLATION - Automatically translates non-Hebrew messages to Hebrew
- **Russian Exclusion**: Russian language messages are **NOT translated** to preserve original text
- **Detection**: Uses Cyrillic character patterns and common Russian word matching
- **Supported Languages**: All languages except Hebrew (source) and Russian (excluded)
- **Rate Limiting**: 10 translations per minute per user
- **Log Indicators**: 
  - 🌐 for translated messages
  - 🇷🇺 for skipped Russian messages
  - 🔗 for skipped URLs
  - 📧 for skipped email addresses

## Known Issues (from CLAUDE.local.md)

1. **#mute command** - Not working properly, requires bot admin status fixes
2. **#clear command** - Does not delete messages as expected, needs deep debugging
3. **Enhancement needed**: #clear should delete last 10 messages from replied-to user
4. **Link sharing flow**: Should delete message, blacklist user, and send PHONE_ALERT with unblacklist option

## Bot Commands Reference

### Admin Commands (Group)
- `#kick` - Kick user from replied message
- `#ban` - Kick and blacklist user
- `#warn` - Send warning to user
- `#mute [user/group/time]` - Mute user or entire group
- `#unmute [user/group]` - Unmute user or group
- `#clear` - Clear messages (BROKEN - needs fix)
- `#sweep` - Remove all +1/+6 country codes (superadmin only)
- `#stats` - Show group statistics

### Admin Commands (Private)
- `#help` - Show all available commands
- `#status` - Bot status and configuration
- `#blacklist [phone]` - Add to blacklist
- `#unblacklist [phone]` - Remove from blacklist
- `#blacklst` - List all blacklisted users
- `#whitelist [phone]` - Add to whitelist
- `#unwhitelist [phone]` - Remove from whitelist
- `#whitelst` - List all whitelisted users

### Debugging Commands
- `#botadmin` - Check bot admin status
- `#debugnumbers` - Debug participant phone formats
- `#sessioncheck` - Check session error statistics

### MCP Search Commands (Admin Only)
- `#search <query>` - Search the web using MCP integration
- `#verify <url>` - Verify URL safety before sharing

## Critical Patterns and Behaviors

### Invite Link Detection
- Pattern: `/https?:\/\/(chat\.)?whatsapp\.com\/(chat\/)?([A-Za-z0-9]{6,})/gi`
- Triggers on any WhatsApp invite link format
- Admin users are immune to link detection
- Whitelisted users bypass all restrictions

### Country Code Restrictions
- Auto-kicks users from +1 (US/Canada) and +6 (Southeast Asia)
- NEVER kicks Israeli numbers (+972)
- Controlled by `FEATURES.RESTRICT_COUNTRY_CODES`
- Handles both regular and LID format numbers

### Bot Admin Detection Issues
- LID format (multi-device) causes bot admin detection problems
- Workaround: `FEATURES.BYPASS_BOT_ADMIN_CHECK = true`
- Bot assumes admin status and verifies through action success/failure

## Testing Approach

1. **Unit Tests**: Pattern detection, ID formatting
2. **Integration Tests**: Firebase operations, command handling, MCP integration
3. **Live QA**: Manual testing checklist in `tests/qaChecklist.md`
4. **Stress Testing**: Message processing performance (`tests/stressTest.js`)
5. **Debug Scripts**: Specific issue debugging (kick, admin status, mute functionality)
6. **Test Suite**: Run `npm test` or `node tests/runTests.js` for comprehensive testing

### Key Test Files
- `tests/testInviteDetection.js` - Regex pattern validation
- `tests/testMuteFunctionality.js` - Mute service functionality
- `tests/testMcpSearch.js` - MCP search integration
- `tests/testAlertService.js` - Alert notification system

## Performance Characteristics
- Memory usage: ~50-100MB typical, max 400MB before auto-restart (vs 500MB+ for whatsapp-web.js)
- Message processing: <0.1ms per message
- Can handle 10,000+ messages per second
- Instant message deletion and user kicks
- WebSocket-based (no browser needed)

### Memory Protection (Critical for 960MB Server)
The bot has **triple-layer memory protection** to prevent OOM crashes:

1. **PM2 Auto-Restart at 400MB** (`ecosystem.config.js: max_memory_restart`)
   - Gracefully restarts before reaching OOM threshold (~500MB)
   - Prevents hard crashes from Linux OOM killer

2. **Daily Scheduled Restart at Midnight** (`ecosystem.config.js: cron_restart: '0 0 * * *'`)
   - Proactive memory cleanup every 24 hours at 00:00
   - Prevents gradual memory buildup
   - Low-traffic time window for minimal disruption

3. **1GB Swap Space** (`/swapfile`)
   - Emergency buffer for memory spikes
   - Configured via `/etc/fstab` for persistence

**Verify protection:**
```bash
ssh root@209.38.231.184 "pm2 info commguard-bot | grep -E 'cron|memory' && swapon --show"
```

## Security Considerations
- Admin immunity for all bot actions
- Whitelist system for trusted users
- Blacklist persistence across restarts
- No logging of message content beyond invite links
- Firebase credentials must be kept secure

## Error Handling Philosophy
- Graceful degradation when Firebase unavailable
- Automatic reconnection on connection loss
- Session error tracking and recovery
- Clear error messages to admin phone
- Non-blocking error handling for group operations
- Smart decryption error filtering (logged but not spammed)
- Exponential backoff for error 515 (Stream Error)

## Development Patterns

### Service Layer Pattern
- All services follow singleton pattern with async initialization
- Firebase services gracefully degrade to memory-only when unavailable
- Services are conditionally loaded based on feature flags

### Error Handling Pattern
- `handleSessionError()` in utils/sessionManager.js for connection issues
- Rate limiting and cooldowns prevent spam/abuse
- Admin immunity built into all moderation actions

### Testing Pattern
- Individual test files for each major component
- Stress testing for performance validation
- Debug scripts for specific issue investigation
- QA checklist for manual testing workflows
- always use real phone number for all, NOT LID

## Anti-Bullying System (#bullywatch)

### Overview
bCommGuard includes an advanced anti-bullying detection system for groups tagged with `#bullywatch`. This system uses multi-layered analysis to detect harassment, social exclusion, doxxing, sextortion, and other harmful behaviors.

### CRITICAL: Analysis Scope
**ONLY analyze chat history for groups with `#bullywatch` tag in their group description or subject.**
- NEVER analyze regular groups without explicit #bullywatch tag
- NEVER suggest improvements for non-#bullywatch groups
- When analyzing history, use sub-agents (Task tool with Explore agent) for comprehensive pattern detection

### Architecture Layers

#### Layer 1: Lexicon-Based Detection (Fast, Local)
- Hebrew trigger words and patterns (curse words, exclusion language, threats)
- Emoji analysis (🤡🤡🤡 for mocking, 🔪☠️ for threats, etc.)
- Hebrew normalization (letter swaps: א/ע, ט/ת, כ/ק; spacing: "מ פ ג ר"; transliteration: "lozer", "sahi")
- File: `services/bullywatch/lexiconService.js`

#### Layer 2: Temporal Analysis (Pile-On Detection)
- Tracks multiple users targeting one individual
- Detects message velocity spikes (5+ messages in 5 minutes)
- Identifies when previously active users go silent after harassment
- Tracks group dynamics and social exclusion patterns
- File: `services/bullywatch/temporalAnalysisService.js`

#### Layer 3: Context-Aware Scoring System
- Scoring rules:
  - +2 for direct personal address (אתה/את/יא...)
  - +2 for violent verbs/threats (להרביץ/לשבור/להרוג)
  - +1 for 3+ mocking emojis
  - +3 for exclusion language (כולם/אף אחד/מי ש...)
  - +5 for doxxing/sextortion/blackmail patterns
- Context window: 5-7 messages before and after for GPT analysis
- File: `services/bullywatch/scoringService.js`

#### Layer 4: GPT Context Analysis (Expensive, Only for Ambiguous Cases)
- Only triggered when score is in ambiguous range (11-15)
- Receives 5-7 message context window
- Distinguishes friend banter from actual harassment
- File: `services/bullywatch/gptAnalysisService.js`

### Action Thresholds

```
Score 0-4:   Safe (no action)
Score 5-10:  Monitor (log only, weekly digest)
Score 11-15: Alert (notify admin immediately)
Score 16+:   High Risk (alert + auto-action if monitor mode disabled)
```

### Monitor Mode (Default: ENABLED)
- **MONITOR_MODE = true** (default): No auto-deletions, only logging and alerts
- Collect 2-4 weeks of real data before enabling auto-actions
- Tune thresholds based on false positive/negative rates
- File: `config.js` → `FEATURES.BULLYWATCH_MONITOR_MODE`

### Friend Group Whitelisting
- Groups <10 members with high interaction frequency get 0.5x score multiplier
- Admins can whitelist specific groups to reduce false positives from close friend banter
- File: `services/bullywatch/groupWhitelistService.js`

### Feedback Loop for Continuous Learning
- Admins review each alert: `true_positive` | `false_positive` | `low` | `medium` | `high`
- System updates lexicon weights monthly based on feedback
- Learns new slang and evolving harassment patterns
- File: `services/bullywatch/feedbackService.js`

### Threat Categories Detected

1. **Social Exclusion**: "אל תצרפו", "תעיפו", "כולם נגד", "אף אחד לא"
2. **Public Humiliation**: "תעלה צילום", "שלחו לכולם", "בואו נעשה סטיקר"
3. **Doxxing/Privacy**: "מה הכתובת", "שלח מיקום", "יש לי ת׳מספר"
4. **Impersonation**: "פתחתי עליו חשבון", "עשיתי פרופיל בשמו"
5. **Sextortion/Blackmail**: "אם לא תעשה X אני מפרסם", "יש לי צילום מסך", "תשלח תמונה ואז אמחק"
6. **Direct Threats**: "חכה לי", "אני אשבור אותך", "ניפגש אחרי ביס"

### Class Assignment (Mandatory)

Every #bullywatch-enabled group MUST have a class identifier for tracking and reporting.

**Format**: Hebrew letter + number (e.g., ג3 = class ג, grade 3)

**Database Field**: `groups.class_name` (VARCHAR(20), indexed)

### Commands

#### Admin Commands (Group - Managing #bullywatch)
- `#bullywatch on [class]` - Enable bullying detection with class name (MANDATORY)
  - Example: `#bullywatch on ג3`
  - Example: `#bullywatch on א7`
- `#bullywatch off` - Disable bullying detection (class name preserved in DB)
- `#bullywatch class [class]` - Update class name for already-enabled group
  - Example: `#bullywatch class ב10`
- `#bullywatch status` - Show monitoring status and current class assignment

#### Admin Commands (Private)
- `#bullywatch review` - Review pending alerts and provide feedback
- `#bullywatch whitelist <group>` - Whitelist friend group (reduce sensitivity)
- `#bullywatch unwhitelist <group>` - Remove from whitelist

#### Admin Commands (Group with #bullywatch tag)
- `#bullywatch report` - Generate harassment report for this group
- `#bullywatch history` - Analyze last 100 messages for patterns (uses sub-agent)

### History Analysis with Sub-Agents

When admin requests `#bullywatch history` in a #bullywatch-tagged group:
1. Use Task tool with `subagent_type=Explore` to analyze message patterns
2. Sub-agent should:
   - Read last 100-500 messages from group
   - Identify temporal patterns (pile-ons, silencing)
   - Detect recurring harassment targets
   - Analyze group dynamics and cliques
   - Generate comprehensive report with actionable insights
3. Return findings with severity scores and recommendations

### Files Structure

```
services/bullywatch/
├── lexiconService.js          # Layer 1: Fast keyword matching
├── temporalAnalysisService.js # Layer 2: Pile-on detection
├── scoringService.js          # Layer 3: Context-aware scoring
├── gptAnalysisService.js      # Layer 4: GPT analysis
├── groupWhitelistService.js   # Friend group management
├── feedbackService.js         # Admin feedback loop
└── reportGenerator.js         # Generate harassment reports
```

### Performance Expectations

**With all features enabled:**
- True positive rate: ~95%
- False positive rate: ~5%
- False negative rate: ~3%
- Processing time: <50ms per message (lexicon + temporal)
- GPT calls: Only 5-10% of flagged messages (cost-optimized)

### Testing

```bash
# Test lexicon detection
node tests/testBullywatchLexicon.js

# Test temporal analysis
node tests/testTemporalAnalysis.js

# Test scoring system
node tests/testBullywatchScoring.js

# Test feedback loop
node tests/testBullywatchFeedback.js

# Full integration test
node tests/testBullywatchIntegration.js
```

### Ethical Safeguards

1. ✅ Human-in-loop: No auto-bans without admin approval
2. ✅ Transparency: Groups know #bullywatch is active (tag in description)
3. ✅ Appeal process: Flagged users can contest via admin
4. ✅ Regular audits: Review 10% of decisions monthly
5. ✅ Privacy: Only message text analyzed, no persistent storage of content
6. ✅ Consent: Only active in groups with explicit #bullywatch tag