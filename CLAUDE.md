# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bCommGuard is a WhatsApp group moderation bot built with Baileys WebSocket API. It replaces the original CommGuard (which used whatsapp-web.js) for better performance and reliability. The bot automatically detects and removes WhatsApp group invite links, manages blacklists, and provides moderation commands.

## Common Development Commands

### Running and Testing
- `npm start` - Start the bot in production mode
- `npm run dev` - Start with nodemon for auto-restart during development
- `npm run fresh` - Clean start using start-fresh.js
- `node tests/testInviteDetection.js` - Test invite link pattern detection
- `node tests/stressTest.js` - Performance stress testing
- `node setupFirebase.js` - Test Firebase connection and permissions
- `node diagnose.js` - Run diagnostic checks

### Debugging Commands
- `node debugBotStatus.js` - Debug bot admin status issues
- `node debugCommandFlow.js` - Debug command processing flow
- `node tests/debugKick.js` - Debug user kicking functionality
- `node tests/qaTestBotAdmin.js` - Test bot admin detection

## Architecture and Key Flows

### Core Architecture
- **Main Entry**: `index.js` - Bot initialization, QR code generation, message handling, and reconnection logic
- **Configuration**: `config.js` - Admin phones, feature toggles, patterns, and settings
- **Command Processing**: `services/commandHandler.js` - All bot commands (#help, #kick, #ban, etc.)
- **Service Layer**:
  - `blacklistService.js` - Manages blacklisted users with Firebase persistence
  - `whitelistService.js` - Manages whitelisted users who bypass all restrictions
  - `muteService.js` - Manages muted users and groups
- **Utilities**:
  - `utils/sessionManager.js` - Handles WhatsApp session errors and decryption failures
  - `utils/botAdminChecker.js` - Checks if bot has admin privileges in groups
  - `utils/jidUtils.js` - WhatsApp ID format handling
  - `utils/logger.js` - Timestamp formatting and logging

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
2. **Integration Tests**: Firebase operations, command handling
3. **Live QA**: Manual testing checklist in `tests/qaChecklist.md`
4. **Stress Testing**: Message processing performance
5. **Debug Scripts**: Specific issue debugging (kick, admin status, etc.)

## Performance Characteristics
- Memory usage: ~50-100MB (vs 500MB+ for whatsapp-web.js)
- Message processing: <0.1ms per message
- Can handle 10,000+ messages per second
- Instant message deletion and user kicks
- WebSocket-based (no browser needed)

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