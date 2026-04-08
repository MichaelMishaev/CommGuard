const config = require('../config');
const OpenAI = require('openai');
const { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted } = require('./blacklistService');
const { addToWhitelist, removeFromWhitelist, listWhitelist, isWhitelisted } = require('./whitelistService');
const { addMutedUser, removeMutedUser, isMuted, getMutedUsers } = require('./muteService');
const { getTimestamp } = require('../utils/logger');
const { sendKickAlert } = require('../utils/alertService');
const searchService = require('./searchService');
const { translationService } = require('./translationService');
const groupJokeSettingsService = require('./groupJokeSettingsService');
const groupService = require('../database/groupService');
const { getRestartHistory } = require('../utils/restartTracker');
const memoryMonitor = require('../utils/memoryMonitor');
const memoryLeakDetector = require('../utils/memoryLeakDetector');

// Conditionally load unblacklist request service
let unblacklistRequestService;
if (config.FEATURES.FIREBASE_INTEGRATION) {
    unblacklistRequestService = require('./unblacklistRequestService');
} else {
    // Mock service when Firebase is disabled
    unblacklistRequestService = {
        canMakeRequest: async () => ({ canRequest: false, reason: 'Firebase disabled' }),
        createRequest: async () => false,
        processAdminResponse: async () => false,
        getPendingRequests: async () => []
    };
}

// Track group mute status
const groupMuteStatus = new Map();

class CommandHandler {
    // Track processed messages to prevent duplicates
    static processedMessages = new Set();

    constructor(sock) {
        this.sock = sock;
        this.config = config; // CRITICAL FIX: Store config reference to prevent "Cannot read properties of undefined" errors

        // Sassy Hebrew responses for unauthorized users
        this.sassyResponses = [
            'מה אני עובד אצלך?',
            'תמשיך לנסות, אולי יצליח לך באלף הבא',
            'אדמין? אתה? 😂',
            'חלמת שאתה המנהל כאן?',
            'רק מנהלים יכולים להשתמש בזה, לא כולם',
            'נחמד לנסות, אבל לא',
            'אתה מבין שאני רק עובד פה? 🤷‍♂️',
            'יש לך הרשאות? לא נראה לי...',
            'תשאל את המנהל בבקשה',
            'פעם הבאה תקבל הרשאות קודם',
            'אוקיי, אבל לא',
            'מה זה השטויות האלה?',
            'לא נפל לי האסימון...',
            'אולי תנסה עם אדמין אמיתי?',
            'נו באמת... 🙄'
        ];
    }
    
    // Get a random sassy response for unauthorized users
    getRandomSassyResponse() {
        return this.sassyResponses[Math.floor(Math.random() * this.sassyResponses.length)];
    }
    
    // TEMPORARY: Use direct API with rate limiting until shared cache is implemented
    async getCachedGroupMetadata(groupId) {
        try {
            // Add rate limiting protection
            await new Promise(resolve => setTimeout(resolve, 200));
            return await this.sock.groupMetadata(groupId);
        } catch (error) {
            console.error('Rate limited groupMetadata call:', error);
            throw error;
        }
    }
    
    isPrivateChat(msg) {
        return msg.key.remoteJid.endsWith('@s.whatsapp.net');
    }
    
    async sendGroupOnlyMessage(msg, commandName) {
        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: `⚠️ The ${commandName} command can only be used in groups.` 
        });
    }

    async handleCommand(msg, command, args, isAdmin, isSuperAdmin) {
        const cmd = command.toLowerCase();

        // Check if this is a pending global ban group selection response
        const senderPhone = msg.key.remoteJid.split('@')[0];
        const pendingBanKey = `pending_global_ban_${senderPhone}`;

        if (global[pendingBanKey] && this.isPrivateChat(msg)) {
            // This might be a group selection response
            const messageText = msg.message?.conversation ||
                              msg.message?.extendedTextMessage?.text ||
                              '';

            // Check if it looks like a group selection (numbers with commas or "all")
            if (/^\d+(,\s*\d+)*$/.test(messageText.trim()) || messageText.trim().toLowerCase() === 'all') {
                return await this.handleGroupSelectionResponse(msg, messageText.trim());
            }
        }

        try {
            switch (cmd) {
                case '#help':
                    return await this.handleHelp(msg);
                    
                case '#status':
                    return await this.handleStatus(msg);

                case '#restarthistory':
                    return await this.handleRestartHistory(msg, isAdmin);

                case '#memory':
                case '#memcheck':
                    return await this.handleMemoryCheck(msg, isAdmin);

                case '#memreport':
                    return await this.handleMemoryReport(msg, isAdmin);

                case '#gc':
                case '#clearmem':
                    return await this.handleForceGC(msg, isAdmin);

                case '#mute':
                    return await this.handleMute(msg, args, isAdmin);
                    
                case '#unmute':
                    return await this.handleUnmute(msg, args, isAdmin);
                    
                case '#clear':
                    return await this.handleClear(msg, isAdmin);

                case '#bullywatch':
                    return await this.handleBullyWatch(msg, args, isAdmin);

                case '#bullyalert':
                    return await this.handleBullyAlert(msg, args, isAdmin);

                case '#kick':
                    return await this.handleKick(msg, isAdmin);

                case '#kickglobal':
                    return await this.handleKickGlobal(msg, isAdmin);

                case '#ban':
                    return await this.handleBan(msg, isAdmin);
                    
                    
                case '#whitelist':
                    return await this.handleWhitelist(msg, args, isAdmin);
                    
                case '#unwhitelist':
                    return await this.handleUnwhitelist(msg, args, isAdmin);
                    
                case '#whitelst':
                    return await this.handleWhitelistList(msg, isAdmin);
                    
                case '#blacklist':
                    return await this.handleBlacklistAdd(msg, args, isAdmin);
                    
                case '#unblacklist':
                case '#ub':
                    return await this.handleBlacklistRemove(msg, args, isAdmin);

                case '#blacklst':
                case '#blklst':
                    return await this.handleBlacklistList(msg, isAdmin);

                case '#sweep':
                    return await this.handleSweep(msg, isSuperAdmin);
                    
                case '#botkick':
                    return await this.handleBotKick(msg, isAdmin);
                    
                case '#stats':
                    return await this.handleStats(msg, isAdmin);
                    
                case '#botforeign':
                    return await this.handleBotForeign(msg, isAdmin);
                    
                case '#debugnumbers':
                    return await this.handleDebugNumbers(msg, isAdmin);
                    
                case '#sessioncheck':
                    return await this.handleSessionCheck(msg, isAdmin);
                    
                case '#msg1':
                    return await this.handleMsg1(msg, isAdmin);
                    
                case '#jokestats':
                    return await this.handleJokeStats(msg, isAdmin);
                    
                    
                case '#rejoinlinks':
                    return await this.handleRejoinLinks(msg, args, isAdmin);
                    
                case '#botadmin':
                    return await this.handleBotAdminCheck(msg, isAdmin);
                    
                case '#search':
                    return await this.handleSearch(msg, args, isAdmin);
                    
                case '#verify':
                    return await this.handleVerifyLink(msg, args, isAdmin);
                    
                case '#translate':
                    return await this.handleTranslate(msg, args, isAdmin);

                case '#ru':
                    return await this.handleTranslateRu(msg);

                case '#langs':
                    return await this.handleLanguageList(msg, isAdmin);
                    
                case '#autotranslate':
                case '#translation':
                    return await this.handleTranslationToggle(msg, args);
                    
                case '#jokeson':
                    return await this.handleJokesOn(msg, isAdmin);
                    
                case '#jokesoff':
                    return await this.handleJokesOff(msg, isAdmin);
                    
                case '#jokesstatus':
                    return await this.handleJokesStatus(msg, isAdmin);

                case '#markmine':
                    return await this.handleMarkMine(msg, isAdmin, args);

                case '#unmarkmine':
                    return await this.handleUnmarkMine(msg, isAdmin);

                case '#mygroups':
                    return await this.handleMyGroups(msg, isAdmin, args);

                case '#setcategory':
                    return await this.handleSetCategory(msg, args, isAdmin);

                case '#categories':
                    return await this.handleCategories(msg, isAdmin);

                // #free system removed - use admin #unblacklist instead

                default:
                    // Check for admin approval patterns (yes/no userId)
                    if (isAdmin && (cmd === 'yes' || cmd === 'no')) {
                        return await this.handleAdminApproval(msg, command, args);
                    }
                    return false; // Command not handled
            }
        } catch (error) {
            console.error(`❌ Error handling command ${cmd}:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Error executing command: ${error.message}` 
            });
            return true;
        }
    }

    async handleHelp(msg) {
        // STRICT SECURITY: #help ONLY works in private chat from 972544345287
        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderPhone = senderId.split('@')[0];
        const isPrivateChat = !msg.key.remoteJid.endsWith('@g.us');

        // DEBUG: Log the actual values to see what's coming in
        console.log(`[${getTimestamp()}] 🔍 #help DEBUG:`);
        console.log(`   senderId: ${senderId}`);
        console.log(`   senderPhone: ${senderPhone}`);
        console.log(`   config.ALERT_PHONE: ${config.ALERT_PHONE}`);
        console.log(`   config.ADMIN_PHONE: ${config.ADMIN_PHONE}`);
        console.log(`   config.ADMIN_LID: ${config.ADMIN_LID}`);
        console.log(`   isPrivateChat: ${isPrivateChat}`);

        // Check if it's the authorized admin (same pattern as index.js)
        // Handles both regular phone format AND LID format
        const isAuthorizedAdmin =
            senderPhone === config.ALERT_PHONE ||
            senderPhone === config.ADMIN_PHONE ||
            senderPhone === config.ADMIN_LID ||
            senderId.includes(config.ALERT_PHONE) ||
            senderId.includes(config.ADMIN_PHONE) ||
            senderId.includes(config.ADMIN_LID);

        console.log(`   isAuthorizedAdmin: ${isAuthorizedAdmin}`);

        // RULE 1: If NOT private chat (i.e., in a group) → Hide the command completely
        if (!isPrivateChat) {
            console.log(`[${getTimestamp()}] 🚫 Unauthorized #help attempt in group: ${msg.key.remoteJid} from ${senderPhone}`);
            // Don't reveal that this command exists in groups
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Unknown command.'
            });
            return true;
        }

        // RULE 2: If in private chat but NOT from authorized admin → Send sassy response
        if (!isAuthorizedAdmin) {
            console.log(`[${getTimestamp()}] 🚫 Unauthorized #help attempt from: ${senderPhone} (not admin)`);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // RULE 3: Only reaches here if BOTH conditions met:
        // ✓ Private chat
        // ✓ From 972544345287 (your number or LID)
        console.log(`[${getTimestamp()}] ✅ Authorized #help access from admin: ${senderPhone}`);

        // Check if it's specifically the alert phone for detailed help
        const isAlertPhone =
            senderPhone === config.ALERT_PHONE ||
            senderPhone === config.ADMIN_LID ||
            senderId.includes(config.ALERT_PHONE);

        // Special detailed help for alert phone
        if (isAlertPhone) {
            const detailedHelpText = `📝 *CommGuard Bot - FULL COMMAND REFERENCE*

*✅ WORKING COMMANDS:*

*🔧 Basic Commands:*
• *#status* - Shows bot online status, ID, version, and configuration
• *#stats* - Displays group statistics (members, admins, etc)
• *#help* - This command list (private chat only)
• *#msg1* - Send pre-written admin warning about invite links

*📂 Group Management:*
• *#markmine [category] [notes]* - Mark group as yours with optional category and notes
  Example: #markmine family Main family group
• *#unmarkmine* - Unmark current group
• *#mygroups [category]* - List all your groups (private chat)
  Example: #mygroups family (filter by category)
• *#setcategory <category>* - Set category for current group
  Categories: personal, business, community, family, friends, hobby, education, work, other
• *#categories* - Show category statistics (private chat)

*👮 Moderation Commands:*
• *#kick* - Reply to message → Kicks user + deletes message + asks for blacklist
• *#kickglobal* - Reply to message → Shows group list → Select specific groups (max 10 recommended)
• *#ban* - Reply to message → Permanently bans user (same as kick but called ban)
• *#clear* - Remove all blacklisted users from current group

*🛡️ Bullywatch Commands:*
• *#bullywatch on [class]* - Enable bullying monitoring with class name (MANDATORY)
  Example: #bullywatch on ג3
• *#bullywatch off* - Disable bullying monitoring
• *#bullywatch class [class]* - Update class name for group
• *#bullywatch status* - Show monitoring status and class assignment
• *#bullyalert on/off* - Send alerts to all group admins (admin only)
  When ON: All group admins receive bullying alerts
  When OFF: Only main admin receives alerts

*📊 Bullywatch Admin Feedback (Continuous Learning):*
• *#bullywatch review* - Review last 10 flagged messages for feedback
• *#bullywatch feedback <id> <verdict>* - Provide verdict on flagged message
  Verdicts: true_positive | false_positive | low | medium | high
  Example: #bullywatch feedback msg_123 true_positive
• *#bullywatch suggest <word>* - Suggest new offensive word for detection
  Example: #bullywatch suggest חנון
• *#bullywatch suggestions* - List all pending word suggestions
• *#bullywatch approve <word> <category>* - Add word to lexicon (NO RESTART NEEDED)
  Categories: sexual_harassment | general_insult | social_exclusion | direct_threat | privacy_threat
  Example: #bullywatch approve חנון general_insult
• *#bullywatch metrics* - View accuracy statistics (true/false positives)
• *#bullywatch export* - Export all feedback data as CSV for analysis

*🔇 Mute Commands:*
• *#mute 30* - Mutes entire group for 30 minutes (only admins can speak)
• *#mute* (reply) - Mutes specific user (deletes all their messages)
• *#unmute* - Unmutes group or user

*📋 Whitelist Management:*
• *#whitelist 972555123456* - Adds number to whitelist (bypasses ALL restrictions)
• *#unwhitelist 972555123456* - Removes from whitelist
• *#whitelst* - Shows all whitelisted numbers

*🚫 Blacklist Management:*
• *#blacklist 972555123456* - Adds to blacklist (auto-kicked on join)
• *#unblacklist 972555123456* or *#ub 972555123456* - Removes from blacklist
• *#blacklst* or *#blklst* - Shows all blacklisted numbers with violation counts
• *#botkick* - Scans current group and kicks all blacklisted members
• *#rejoinlinks <phone>* - Shows rejoin links for kicked user
  Example: #rejoinlinks 972555123456

*📊 Violation Tracking System:*
• When user posts invite link → Kicked + Violation recorded + Alert sent
• When admin uses #kick → Kicked + Violation recorded + Alert sent
• Admin receives alert asking: "Reply 1 = blacklist, 0 = skip"
• Reply *1* to alert → User added to blacklist
• Reply *0* to alert → Skip blacklist (violation still recorded)
• Reply *#ub* to alert → Remove user from blacklist
• Violation types tracked: invite_link, kicked_by_admin
• Violations preserved in database even after unblacklist

*🌍 Country Restriction:*
• *#botforeign* - Removes ALL users with +1 (US/Canada) and +6 (Southeast Asia) numbers
  - Protects Israeli numbers (+972)
  - Skips whitelisted users

*🧹 Advanced Commands:*
• *#sweep* - Removes inactive users (requires superadmin)
• *#sessioncheck* - Shows session decryption error statistics
• *#botadmin* - Checks if bot has admin privileges in current group
• *#debugnumbers* - Shows participant phone formats (for debugging LID issues)

*🔍 Search Commands (Requires MCP Setup):*
• *#search <query>* - Search the web (rate limited: 5/minute)
• *#verify <url>* - Verify if a link is safe

*🌐 Translation Commands:*
• *#translate <text>* - Translate to English (auto-detect source)
• *#translate <lang> <text>* - Translate to specific language
• *#langs* - Show supported language codes (20+ languages)
• *#autotranslate <on/off/status>* - Control auto-translation (bot only)
• **Auto-Translation** - ${config.FEATURES.AUTO_TRANSLATION ? '✅ ENABLED' : '❌ DISABLED'} (translates non-Hebrew to Hebrew)
• **Smart Detection** - Only translates pure non-Hebrew (ignores mixed Hebrew/English, Russian)

*🎭 Entertainment Commands:*
• *#jokestats* - View motivational phrase usage statistics
• *#jokeson* - Enable משעמם jokes for this group
• *#jokesoff* - Disable משעמם jokes for this group
• *#jokesstatus* - Show joke settings for this group
• **Automatic Jokes** - Bot responds to "משעמם" with funny Hebrew jokes (125+ jokes)

*🚨 AUTO-PROTECTION FEATURES:*
1. **Invite Link Detection** ✅
   - All users: Immediate kick + violation tracking
   - Always: Message deleted + Admin alert with violation count
   - Detects: chat.whatsapp.com links
   - Admin can reply 1/0 to blacklist/skip
   - Violations stored permanently in database

2. **Blacklist Auto-Kick** ✅
   - When blacklisted user joins → Instant kick + Alert sent
   - Alert shows violation history and #ub option to unblacklist
   - Admin override: If ADMIN adds blacklisted user → Allowed to stay

3. **Country Code Auto-Kick** ✅
   - Auto-kicks: +1 (US/Canada) and +6x (Southeast Asia)
   - Protected: +972 (Israel) NEVER kicked
   - Admin override: If ADMIN adds restricted user → Allowed to stay

4. **Whitelist Bypass** ✅
   - Whitelisted users bypass ALL restrictions
   - Never kicked for any reason

5. **Anti-Boredom System** ✅
   - Auto-detects: Messages containing "משעמם"
   - Actions: Responds with random funny Hebrew jokes
   - Features: Smart rotation, usage tracking, 125+ modern Hebrew jokes
   - Group Control: Can enable/disable per group (#jokeson/#jokesoff)

6. **Bullywatch AI System** 🛡️ (Advanced Anti-Bullying)
   - Multi-Layer Detection:
     * Layer -1: Critical word filter (instant alerts)
     * Layer 0: Multi-model AI voting (GPT-5-nano + Sentiment)
     * Layer 1: Hebrew lexicon with compound pattern detection
     * Layer 2: Temporal analysis (pile-on detection)
     * Layer 3: Context-aware scoring
     * Layer 4: GPT-5-mini deep analysis (ambiguous cases)
   - Detects: Sexual harassment, social exclusion, doxxing, threats, body shaming
   - Smart Features:
     * Context-aware: "חתיכת עוגה" (safe) vs "חתיכת חרה" (harmful)
     * Narrative dampening: "ראיתי בסרט כלב" (movie context) = safe
     * Defense in depth: Lexicon ALWAYS runs even if AI says safe
     * Model disagreement escalation: Auto-escalates to GPT-5-mini
   - Continuous Learning:
     * Admin feedback loop (#bullywatch feedback)
     * Crowdsourced lexicon updates (#bullywatch suggest)
     * Runtime word addition - NO RESTART NEEDED (#bullywatch approve)
     * Accuracy tracking and metrics (#bullywatch metrics)
   - Monitor Mode: Enabled by default (logs only, no auto-delete)
   - Class Assignment: Mandatory for reporting and tracking
   - Expected Accuracy: 95%+ true positive rate, <5% false positives

*🧠 Memory & Performance Commands:*
• *#memory* or *#memcheck* - Quick memory status check
• *#memreport* - Detailed memory report with leak detection
• *#gc* or *#clearmem* - Force garbage collection (requires --expose-gc)
• *#restarthistory* - View last 10 bot restarts with reasons

*⚙️ SPECIAL BEHAVIORS:*
• Bot needs admin to work (bypass enabled for LID issues)
• #kick now deletes the target message too
• Violations tracked for invite_link and kicked_by_admin
• Admin controls blacklisting via reply system (1/0/#ub)
• Violation history preserved permanently in PostgreSQL database
• Blacklist synced across PostgreSQL + Firebase + Redis
• Muted users kicked after 10 messages
• Session errors handled automatically
• Automatic memory monitoring with alerts at 85%+ usage
• Memory leak detection with 5-minute snapshots

*🔒 SECURITY NOTES:*
• #help only works in private chat
• #help shows "Unknown command" in groups
• Only admin phones can access commands
• Alert phone: ${config.ALERT_PHONE} (YOU)
• Admin phone: ${config.ADMIN_PHONE}

*📱 BOT STATUS:*
• Version: 2.1 (Baileys + Enhanced Nationality System)
• Firebase: ${config.FEATURES.FIREBASE_INTEGRATION ? '✅ Enabled (Optimized)' : '❌ Disabled'}
• Blacklist System: ${config.FEATURES.AUTO_KICK_BLACKLISTED ? '✅ Enabled (24hr Cache)' : '❌ Disabled'}
• Bot Admin Bypass: ${config.FEATURES.BYPASS_BOT_ADMIN_CHECK ? '✅ Enabled' : '❌ Disabled'}
• Country Restrictions: ${config.FEATURES.RESTRICT_COUNTRY_CODES ? '✅ Enabled' : '❌ Disabled'}
• Auto-Translation: ${config.FEATURES.AUTO_TRANSLATION ? '✅ Enabled' : '❌ Disabled'}
• Stealth Mode: ${config.FEATURES.STEALTH_MODE ? '✅ Enabled' : '❌ Disabled'}
• Randomize Responses: ${config.FEATURES.RANDOMIZE_RESPONSES ? '✅ Enabled' : '❌ Disabled'}
• Simulate Typing: ${config.FEATURES.SIMULATE_TYPING ? '✅ Enabled' : '❌ Disabled'}

*🛡️ Bot is protecting your groups 24/7!*`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: detailedHelpText });
        } else {
            // Regular help text for admin phone
            const helpText = `📝 *CommGuard Bot Commands*

*🔧 Basic Commands:*
• *#status* - Check bot status and configuration
• *#stats* - Show group statistics
• *#msg1* - Send admin warning about invite links

*📂 Group Management:*
• *#markmine [category] [notes]* - Mark group as yours
• *#unmarkmine* - Unmark current group
• *#mygroups [category]* - List your groups (private chat)
• *#setcategory <category>* - Set group category
• *#categories* - Show category stats (private chat)

*👮 Moderation Commands:* (Reply to message)
• *#kick* - Remove user from group + blacklist (bot only)
• *#ban* - Permanently ban user from group
• *#clear* - Clear messages (not yet implemented)

*🔇 Mute Commands:*
• *#mute [minutes]* - Mute entire group (admin only)
• *#mute (reply) [minutes]* - Mute specific user
• *#unmute* - Unmute group/user

*📋 Whitelist Management:*
• *#whitelist [number]* - Add number to whitelist
• *#unwhitelist [number]* - Remove from whitelist
• *#whitelst* - List whitelisted numbers

*🚫 Blacklist Management:*
• *#blacklist [number]* - Add to blacklist
• *#unblacklist [number]* or *#ub [number]* - Remove from blacklist
• *#blacklst* or *#blklst* - List blacklisted numbers with violations
• *#botkick* - Scan group and kick all blacklisted users
• *#rejoinlinks <phone>* - Show rejoin links for kicked user

*🧠 Memory & Performance:*
• *#memory* - Quick memory status check
• *#memreport* - Detailed memory report
• *#gc* - Force garbage collection

*📊 Violation Tracking:*
• Reply *1* or *0* to kick alerts to blacklist/skip
• Reply *#ub* to alerts to unblacklist users
• Violations tracked: invite_link, kicked_by_admin

*🌍 Country Restriction:*
• *#botforeign* - Remove all +1 and +6 users from group

*🧹 Advanced Commands:*
• *#sweep* - Clean up inactive users (superadmin)
• *#sessioncheck* - Check for session decryption errors
• *#botadmin* - Check if bot has admin privileges
• *#jokestats* - View joke usage statistics

*🎭 Joke Control Commands:*
• *#jokeson* - Enable משעמם jokes in this group
• *#jokesoff* - Disable משעמם jokes in this group
• *#jokesstatus* - Show joke settings for this group

*🌐 Translation Commands:*
• *#translate <text>* - Translate text
• *#langs* - Show supported languages
• *#autotranslate <on/off/status>* - Control auto-translation (bot only)
• Status: ${config.FEATURES.AUTO_TRANSLATION ? '✅ Enabled' : '❌ Disabled'}

*🚨 Auto-Protection Features:*
• **Invite Link Detection** - Auto-kick + blacklist
• **Blacklist Enforcement** - Auto-kick banned users
• **Country Code Restriction** - Auto-kick +1 and +6 numbers
• **Whitelist Protection** - Bypass all restrictions
• **Anti-Boredom System** - Responds to "משעמם" with Hebrew jokes (per-group control)

*💡 Usage Examples:*
• Mark group: \`#markmine family Main family group\`
• Mute group: \`#mute 30\` (30 minutes)
• Add to whitelist: \`#whitelist 972555123456\`
• Remove all foreign users: \`#botforeign\`
• Get jokes: Any message with "משעמם" → Bot responds with humor
• View joke stats: \`#jokestats\`
• Control jokes: \`#jokesoff\` → Disable jokes in this group
• Translate text: \`#translate שלום עולם\` → "Hello world"
• Show rejoin links: \`#rejoinlinks 972555123456\`

*⚠️ Important Notes:*
• Most commands require admin privileges
• Cannot kick/ban other admins
• Whitelisted users bypass all restrictions
• All actions are logged and tracked

*🔒 Security Notice:*
• This command list is PRIVATE
• Only accessible via DM to authorized admin
• #help is disabled in groups for security

*🛡️ Bot protects your groups 24/7 automatically!*`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: helpText });
        }
        return true;
    }

    async handleStatus(msg) {
        const botId = this.sock.user.id;
        const statusText = `🤖 *CommGuard Bot Status*

✅ *Online and Active*
🆔 Bot ID: ${botId}
📱 Version: 2.0 (Baileys)
⏰ Current Time: ${getTimestamp()}

*Features Status:*
• Invite Link Detection: ✅ Active
• Auto-kick Blacklisted: ✅ Active
• Firebase Integration: ✅ Connected (guard1-d43a3)
• Mute System: ✅ Active
• Whitelist System: ✅ Active

*Configuration:*
• Admin Phone: ${config.ADMIN_PHONE}
• Alert Phone: ${config.ALERT_PHONE}
• Kick Cooldown: ${config.KICK_COOLDOWN / 1000}s

🛡️ *Protecting your groups 24/7*`;

        await this.sock.sendMessage(msg.key.remoteJid, { text: statusText });
        return true;
    }

    async handleRestartHistory(msg, isAdmin) {
        // Only admins can view restart history
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return false;
        }

        try {
            const history = getRestartHistory(10); // Get last 10 restarts

            if (history.length === 0) {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '📊 *Bot Restart History*\n\nNo restart history available yet.'
                });
                return true;
            }

            let historyText = `📊 *Bot Restart History* (Last ${history.length})\n\n`;

            history.forEach((restart, index) => {
                const timeSince = restart.timeSinceLastStartFormatted || 'N/A';
                const reasons = restart.possibleReasons.join(', ');
                const memUsage = (restart.memory.heapUsed / 1024 / 1024).toFixed(0);

                historyText += `*${index + 1}. ${restart.timestampLocal}*\n`;
                historyText += `🔄 Reason: ${reasons}\n`;
                historyText += `⏱️ Time since last: ${timeSince}\n`;
                historyText += `💾 Memory: ${memUsage}MB\n`;
                historyText += `🆔 PID: ${restart.pid}\n\n`;
            });

            historyText += `\n📁 Full log: restart_history.jsonl`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: historyText });
            return true;
        } catch (error) {
            console.error('Error fetching restart history:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error fetching restart history. Check logs.'
            });
            return false;
        }
    }

    async handleMute(msg, args, isAdmin) {
        console.log(`[${require('../utils/logger').getTimestamp()}] 🔇 Mute command received from ${msg.key.participant || msg.key.remoteJid}`);
        
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sendGroupOnlyMessage(msg, '#mute');
            return true;
        }
        
        // Add extra logging for debugging
        console.log(`[${require('../utils/logger').getTimestamp()}] 🔍 Mute command details:`, {
            hasQuoted: !!(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage),
            args: args,
            messageStructure: Object.keys(msg.message || {})
        });

        const groupId = msg.key.remoteJid;
        const hasQuotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (hasQuotedMsg) {
            // Mute specific user
            return await this.handleMuteUser(msg, args);
        } else {
            // Mute entire group
            return await this.handleMuteGroup(msg, args);
        }
    }

    async handleMuteGroup(msg, args) {
        const argsString = Array.isArray(args) ? args[0] : args;
        const minutes = parseInt(argsString, 10);
        if (!minutes || minutes <= 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `⚠️ Please specify valid minutes. Example: #mute 10\n` +
                      `⚠️ אנא ציין דקות חוקיות. דוגמה: #mute 10`
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const muteUntil = Date.now() + (minutes * 60000);
        
        groupMuteStatus.set(groupId, muteUntil);

        await this.sock.sendMessage(groupId, { 
            text: `🔇 הקבוצה הושתקה ל-${minutes} דקות\n` +
                  `👮‍♂️ רק מנהלים יכולים לשלוח הודעות`
        });

        // Auto-unmute after specified time
        setTimeout(async () => {
            groupMuteStatus.delete(groupId);
            await this.sock.sendMessage(groupId, { 
                text: `🔊 Group has been unmuted. Everyone can now send messages.\n` +
                      `🔊 הקבוצה שוחררה מההשתקה. כולם יכולים לשלוח הודעות עכשיו.`
            });
        }, minutes * 60000);

        return true;
    }

    async handleMuteUser(msg, args) {
        // Implementation for muting specific user
        const argsString = Array.isArray(args) ? args.join(' ') : args;
        const parts = argsString.split(' ');
        const minutes = parseInt(parts[0], 10) || 60; // Default 1 hour
        
        if (minutes <= 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `⚠️ Please specify valid minutes. Example: #mute 30\n` +
                      `⚠️ אנא ציין דקות חוקיות. דוגמה: #mute 30`
            });
            return true;
        }

        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

        if (!quotedMsg || !quotedParticipant) {
            // Send detailed alert to main admin phone only
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderPhone = senderJid.split('@')[0];
            const groupId = msg.key.remoteJid;

            // Get group name
            let groupName = 'Unknown';
            try {
                const groupMetadata = await this.getCachedGroupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown';
            } catch (e) {
                // Ignore metadata errors
            }

            // Send alert to main admin only - no group spam
            const alertPhone = this.config.ALERT_PHONE + '@s.whatsapp.net';
            await this.sock.sendMessage(alertPhone, {
                text: `⚠️ COMMAND ERROR ALERT\n\n` +
                      `Command: #mute\n` +
                      `User: ${senderPhone}\n` +
                      `Group: ${groupName}\n` +
                      `Error: No message reply detected\n` +
                      `Time: ${new Date().toLocaleString('en-GB')}`
            });
            return true;
        }

        // Extract user ID from quoted message
        const userToMute = quotedParticipant;
        const muteUntil = Date.now() + (minutes * 60000);
        
        // Add user to mute service
        const success = await addMutedUser(userToMute, muteUntil);
        
        if (success) {
            const muteEndTime = new Date(muteUntil).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `🔇 User muted for ${minutes} minutes until ${muteEndTime}\n` +
                      `🗑️ All their messages will be automatically deleted\n\n` +
                      `🔇 המשתמש הושתק ל-${minutes} דקות עד ${muteEndTime}\n` +
                      `🗑️ כל ההודעות שלו יימחקו אוטומטית`
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to mute user. Please try again.\n` +
                      `❌ נכשל בהשתקת המשתמש. אנא נסה שוב.`
            });
        }

        return true;
    }

    isGroupMuted(groupId) {
        const muteUntil = groupMuteStatus.get(groupId);
        if (!muteUntil) return false;
        
        if (Date.now() >= muteUntil) {
            groupMuteStatus.delete(groupId);
            return false;
        }
        
        return true;
    }

    async handleStats(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            // Show general bot statistics
            const { blacklistCache } = require('./blacklistService');
            const { listWhitelist } = require('./whitelistService');
            const mutedUsers = getMutedUsers();
            const activeMutes = Array.from(mutedUsers.entries()).filter(([id, muteUntil]) => Date.now() < muteUntil).length;
            
            // Get whitelist count
            const whitelistCount = (await listWhitelist()).length;
            
            // Get group information
            let totalGroups = 0;
            let adminGroups = 0;
            try {
                const groups = await this.sock.groupFetchAllParticipating();
                totalGroups = Object.keys(groups).length;
                
                // Count groups where bot is admin
                for (const groupId in groups) {
                    const group = groups[groupId];
                    const botId = this.sock.user.id;
                    const botParticipant = group.participants.find(p => {
                        // Check various ID formats
                        return p.id === botId || 
                               p.id === '171012763213843@lid' || // Known bot LID
                               p.id.includes(botId.split(':')[0].split('@')[0]);
                    });
                    
                    if (botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin')) {
                        adminGroups++;
                    }
                }
            } catch (error) {
                console.error('Error fetching groups:', error);
            }
            
            const statsText = `📊 *Bot Statistics*

👥 *Total Groups:* ${totalGroups}
👮 *Admin in Groups:* ${adminGroups}
🚫 *Blacklisted Users:* ${blacklistCache.size}
✅ *Whitelisted Users:* ${whitelistCount}
🔇 *Currently Muted:* ${activeMutes}
🔥 *Firebase:* ${global.FIREBASE_QUOTA_EXHAUSTED ? 'Quota Exhausted (Memory-only)' : 'Connected'} (${config.FEATURES.FIREBASE_INTEGRATION ? 'Enabled' : 'Disabled'})
🌍 *Country Filter:* ${config.FEATURES.RESTRICT_COUNTRY_CODES ? 'Active' : 'Inactive'}

⏰ *Generated:* ${getTimestamp()}`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: statsText });
            return true;
        }

        // Group statistics
        try {
            const groupMetadata = await this.getCachedGroupMetadata(msg.key.remoteJid);
            const participants = groupMetadata.participants;
            
            const adminCount = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;
            const memberCount = participants.length;
            
            const mutedUsers = getMutedUsers();
            const activeMutes = Array.from(mutedUsers.entries()).filter(([id, muteUntil]) => Date.now() < muteUntil).length;

            const statsText = `📊 *Group Statistics*

👥 *Members:* ${memberCount}
👮 *Admins:* ${adminCount}
🔇 *Muted Users:* ${activeMutes}
📝 *Group Name:* ${groupMetadata.subject}
🆔 *Group ID:* ${groupMetadata.id}

⏰ *Generated:* ${getTimestamp()}`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: statsText });
        } catch (error) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Failed to get group statistics.' 
            });
        }
        
        return true;
    }

    // Add more command handlers here...
    async handleKick(msg, isAdmin) {
        console.log(`[${require('../utils/logger').getTimestamp()}] 🔍 #kick command received from ${isAdmin ? 'admin' : 'user'}`);

        // Debug log the entire message structure
        console.log(`[${require('../utils/logger').getTimestamp()}] 📦 Message structure:`, {
            messageKeys: Object.keys(msg.message || {}),
            hasExtendedText: !!msg.message?.extendedTextMessage,
            contextInfoKeys: msg.message?.extendedTextMessage?.contextInfo ? Object.keys(msg.message.extendedTextMessage.contextInfo) : []
        });

        // Check if user is admin (allow both manual admin kicks and automated bot kicks)
        if (!isAdmin && !msg.key.fromMe) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can kick users.'
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ The #kick command can only be used in groups.\n\nUsage: Reply to a user\'s message in a group and type #kick'
            });
            return true;
        }

        // Check if this is a reply to another message - updated detection logic
        let quotedMsg = null;
        let targetUserId = null;
        let messageId = null;

        // Method 1: extendedTextMessage with contextInfo (most common for text replies)
        if (msg.message?.extendedTextMessage?.contextInfo) {
            const contextInfo = msg.message.extendedTextMessage.contextInfo;
            targetUserId = contextInfo.participant;
            messageId = contextInfo.stanzaId;
            quotedMsg = contextInfo;
            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Found quoted message via extendedTextMessage`);
        }
        // Method 2: Regular conversation message with contextInfo (alternative format)
        else if (msg.message?.conversation && msg.message?.contextInfo) {
            const contextInfo = msg.message.contextInfo;
            targetUserId = contextInfo.participant;
            messageId = contextInfo.stanzaId;
            quotedMsg = contextInfo;
            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Found quoted message via conversation contextInfo`);
        }
        // Method 3: imageMessage, videoMessage, etc. with contextInfo
        else {
            const messageType = Object.keys(msg.message || {})[0];
            if (msg.message?.[messageType]?.contextInfo) {
                const contextInfo = msg.message[messageType].contextInfo;
                if (contextInfo.quotedMessage || contextInfo.participant) {
                    targetUserId = contextInfo.participant;
                    messageId = contextInfo.stanzaId;
                    quotedMsg = contextInfo;
                    console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Found quoted message via ${messageType} contextInfo`);
                }
            }
        }

        console.log(`[${require('../utils/logger').getTimestamp()}] 🔍 Kick command analysis:`, {
            hasQuotedMsg: !!quotedMsg,
            hasParticipant: !!targetUserId,
            participant: targetUserId,
            messageId: messageId,
            messageType: Object.keys(msg.message || {})[0],
            fullMessageKeys: Object.keys(msg.message || {})
        });

        if (!quotedMsg || !targetUserId) {
            // Send warning message to the group
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ Please reply to a message from the user you want to kick.\n\nUsage: Reply to a user\'s message and type #kick'
            });

            // Also send detailed alert to main admin phone for debugging
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderPhone = senderJid.split('@')[0];
            const groupId = msg.key.remoteJid;

            // Get group name
            let groupName = 'Unknown';
            try {
                const groupMetadata = await this.getCachedGroupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown';
            } catch (e) {
                // Ignore metadata errors
            }

            // Send alert to main admin
            const alertPhone = this.config.ALERT_PHONE + '@s.whatsapp.net';
            await this.sock.sendMessage(alertPhone, {
                text: `⚠️ COMMAND ERROR ALERT\n\n` +
                      `Command: #kick\n` +
                      `User: ${senderPhone}\n` +
                      `Group: ${groupName}\n` +
                      `Error: No message reply detected\n` +
                      `MessageType: ${Object.keys(msg.message || {})[0]}\n` +
                      `Time: ${new Date().toLocaleString('en-GB')}`
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        // targetUserId already assigned above
        
        try {
            // Get group metadata to check permissions
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            
            // Check if target user is admin
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetUserId);
            if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ Cannot kick admin users.' 
                });
                return true;
            }

            // Check if target user is still in group
            if (!targetParticipant) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ User is not in this group.' 
                });
                return true;
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] 👢 Admin kick: ${targetUserId} from ${groupId}`);

            // Delete the replied-to message first
            if (messageId) {
                try {
                    await this.sock.sendMessage(groupId, {
                        delete: {
                            remoteJid: groupId,
                            fromMe: false,
                            id: messageId,
                            participant: targetUserId
                        }
                    });
                    console.log(`[${require('../utils/logger').getTimestamp()}] 🗑️ Deleted target user's message (ID: ${messageId})`);
                } catch (deleteError) {
                    console.error(`[${require('../utils/logger').getTimestamp()}] ⚠️ Failed to delete target message:`, deleteError.message);
                    // Try alternative deletion method
                    try {
                        await this.sock.sendMessage(groupId, { 
                            delete: {
                                remoteJid: groupId,
                                fromMe: false,
                                id: messageId
                            }
                        });
                        console.log(`[${require('../utils/logger').getTimestamp()}] 🗑️ Deleted target message (alternative method)`);
                    } catch (altError) {
                        console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Both deletion methods failed:`, altError.message);
                    }
                }
            } else {
                console.log(`[${require('../utils/logger').getTimestamp()}] ⚠️ No message ID found for deletion - skipping message deletion`);
            }

            // Delete the #kick command message
            try {
                await this.sock.sendMessage(groupId, { 
                    delete: msg.key 
                });
                console.log(`[${require('../utils/logger').getTimestamp()}] 🗑️ Deleted #kick command message`);
            } catch (deleteError) {
                console.error(`[${require('../utils/logger').getTimestamp()}] ⚠️ Failed to delete #kick message:`, deleteError);
            }

            // Kick the user with retry logic for large groups
            let kickSuccessful = false;
            let kickError = null;
            const maxRetries = 3;
            const retryDelay = 2000; // 2 seconds between retries
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[${require('../utils/logger').getTimestamp()}] 🦵 Attempting to kick user (attempt ${attempt}/${maxRetries})...`);
                    
                    // Set a timeout for the kick operation (10 seconds for large groups)
                    const kickPromise = this.sock.groupParticipantsUpdate(groupId, [targetUserId], 'remove');
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Kick operation timed out after 10 seconds')), 10000)
                    );
                    
                    await Promise.race([kickPromise, timeoutPromise]);
                    
                    kickSuccessful = true;
                    console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Successfully kicked user on attempt ${attempt}`);
                    break;
                } catch (error) {
                    kickError = error;
                    console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Kick attempt ${attempt} failed:`, error.message);
                    
                    if (attempt < maxRetries) {
                        console.log(`[${require('../utils/logger').getTimestamp()}] ⏳ Waiting ${retryDelay/1000} seconds before retry...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        
                        // Check if user is still in group before retrying
                        try {
                            const updatedMetadata = await this.sock.groupMetadata(groupId);
                            const stillInGroup = updatedMetadata.participants.some(p => p.id === targetUserId);
                            if (!stillInGroup) {
                                console.log(`[${require('../utils/logger').getTimestamp()}] ✅ User already removed from group`);
                                kickSuccessful = true;
                                break;
                            }
                        } catch (metadataError) {
                            console.error(`[${require('../utils/logger').getTimestamp()}] ⚠️ Could not verify group membership:`, metadataError.message);
                        }
                    }
                }
            }
            
            if (!kickSuccessful) {
                console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to kick user after ${maxRetries} attempts`);
                await this.sock.sendMessage(groupId, { 
                    text: `⚠️ Failed to kick user after ${maxRetries} attempts. This sometimes happens in large groups.\n\nError: ${kickError?.message || 'Unknown error'}\n\nPlease try again or kick manually.` 
                });
                return true;
            }

            // Track violation in database (NEW)
            const userPhone = targetUserId.split('@')[0];
            let violations = {};

            if (process.env.DATABASE_URL) {
                try {
                    const { incrementViolation, getViolations } = require('../database/groupService');
                    violations = await incrementViolation(userPhone, 'kicked_by_admin');
                    console.log(`[${require('../utils/logger').getTimestamp()}] 📊 Violation recorded for ${userPhone}:`, violations);
                } catch (error) {
                    console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to record violation:`, error.message);
                }
            }

            // Send NEW alert format (ask admin to blacklist)
            const alertResult = await sendKickAlert(this.sock, {
                userPhone: userPhone,
                userId: targetUserId,
                groupName: groupMetadata?.subject || 'Unknown Group',
                groupId: groupId,
                reason: 'kicked_by_admin',
                violations: violations
            });

            // Store pending blacklist request with groupId
            if (alertResult && alertResult.key) {
                const { storePendingRequest } = require('../utils/blacklistPendingRequests');
                storePendingRequest(alertResult.key.id, userPhone, targetUserId, 'kicked_by_admin', groupId);
                console.log(`[${require('../utils/logger').getTimestamp()}] 📋 Stored pending blacklist request for: ${userPhone}`);
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Successfully kicked user: ${targetUserId}`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to kick user:`, error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Need to be an admin' 
            });
        }

        return true;
    }

    async handleKickGlobal(msg, isAdmin) {
        console.log(`[${require('../utils/logger').getTimestamp()}] 🌍 #kickglobal command received from ${isAdmin ? 'admin' : 'user'}`);

        // Check if user is admin
        if (!isAdmin && !msg.key.fromMe) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use #kickglobal.'
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ The #kickglobal command can only be used in groups.\n\nUsage: Reply to a user\'s message in a group and type #kickglobal'
            });
            return true;
        }

        // Check if this is a reply to another message - same logic as #kick
        let quotedMsg = null;
        let targetUserId = null;
        let messageId = null;

        // Method 1: extendedTextMessage with contextInfo
        if (msg.message?.extendedTextMessage?.contextInfo) {
            const contextInfo = msg.message.extendedTextMessage.contextInfo;
            targetUserId = contextInfo.participant;
            messageId = contextInfo.stanzaId;
            quotedMsg = contextInfo;
        }
        // Method 2: Regular conversation message with contextInfo
        else if (msg.message?.conversation && msg.message?.contextInfo) {
            const contextInfo = msg.message.contextInfo;
            targetUserId = contextInfo.participant;
            messageId = contextInfo.stanzaId;
            quotedMsg = contextInfo;
        }
        // Method 3: imageMessage, videoMessage, etc. with contextInfo
        else {
            const messageType = Object.keys(msg.message || {})[0];
            if (msg.message?.[messageType]?.contextInfo) {
                const contextInfo = msg.message[messageType].contextInfo;
                if (contextInfo.quotedMessage || contextInfo.participant) {
                    targetUserId = contextInfo.participant;
                    messageId = contextInfo.stanzaId;
                    quotedMsg = contextInfo;
                }
            }
        }

        if (!quotedMsg || !targetUserId) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ Please reply to a message from the user you want to globally kick.\n\nUsage: Reply to a user\'s message and type #kickglobal'
            });
            return true;
        }

        const groupId = msg.key.remoteJid;

        try {
            // Get group metadata to check permissions
            const groupMetadata = await this.getCachedGroupMetadata(groupId);

            // Check if target user is admin
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetUserId);
            if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
                await this.sock.sendMessage(groupId, {
                    text: '❌ Cannot kick admin users.'
                });
                return true;
            }

            // Check if target user is still in group
            if (!targetParticipant) {
                await this.sock.sendMessage(groupId, {
                    text: '❌ User is not in this group.'
                });
                return true;
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] 🌍 Global kick initiated: ${targetUserId}`);

            // Delete the replied-to message first
            if (messageId) {
                try {
                    await this.sock.sendMessage(groupId, {
                        delete: {
                            remoteJid: groupId,
                            fromMe: false,
                            id: messageId,
                            participant: targetUserId
                        }
                    });
                    console.log(`[${require('../utils/logger').getTimestamp()}] 🗑️ Deleted target user's message`);
                } catch (deleteError) {
                    console.error(`[${require('../utils/logger').getTimestamp()}] ⚠️ Failed to delete target message:`, deleteError.message);
                }
            }

            // Delete the #kickglobal command message
            try {
                await this.sock.sendMessage(groupId, {
                    delete: msg.key
                });
                console.log(`[${require('../utils/logger').getTimestamp()}] 🗑️ Deleted #kickglobal command message`);
            } catch (deleteError) {
                console.error(`[${require('../utils/logger').getTimestamp()}] ⚠️ Failed to delete #kickglobal message:`, deleteError);
            }

            // Kick user from THIS group first (same as #kick)
            let kickSuccessful = false;
            const maxRetries = 3;
            const retryDelay = 2000;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const kickPromise = this.sock.groupParticipantsUpdate(groupId, [targetUserId], 'remove');
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Kick operation timed out')), 10000)
                    );

                    await Promise.race([kickPromise, timeoutPromise]);
                    kickSuccessful = true;
                    console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Kicked from current group`);
                    break;
                } catch (error) {
                    console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Kick attempt ${attempt} failed:`, error.message);
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
            }

            if (!kickSuccessful) {
                await this.sock.sendMessage(groupId, {
                    text: `⚠️ Failed to kick user from this group. Cannot proceed with global ban.`
                });
                return true;
            }

            // Send "processing" message to admin
            const adminPhone = this.config.ALERT_PHONE;
            const adminJid = `${adminPhone}@s.whatsapp.net`;

            // Decode LID if needed to get real phone number
            const { decodeLIDToPhone } = require('../utils/jidUtils');
            let userPhone = targetUserId.split('@')[0];
            if (targetUserId.includes('@lid')) {
                const decoded = await decodeLIDToPhone(this.sock, targetUserId);
                if (decoded) {
                    userPhone = decoded;
                    console.log(`[${require('../utils/logger').getTimestamp()}] 🔓 Decoded LID for display: ${targetUserId} → ${userPhone}`);
                }
            }

            await this.sock.sendMessage(adminJid, {
                text: `🌍 *Global Ban Started*\n\n` +
                      `👤 User: ${targetUserId}\n` +
                      `📞 Phone: +${userPhone}\n` +
                      `📍 Kicked from: ${groupMetadata?.subject || 'Unknown'}\n\n` +
                      `⏳ Scanning all your groups for this user...`
            });

            // Show group selection interface
            const { listGroupsForSelection } = require('../utils/globalBanHelper');
            const groupList = await listGroupsForSelection(this.sock, targetUserId, userPhone);

            // Store context for when user replies with group selection
            const pendingBanKey = `pending_global_ban_${adminPhone}`;
            global[pendingBanKey] = {
                targetUserId,
                userPhone,
                groupId,  // Original group where command was issued
                timestamp: Date.now()
            };

            // Send group selection message to admin
            await this.sock.sendMessage(adminJid, {
                text: `🌍 *Global Ban - Group Selection*\n\n` +
                      `👤 User: ${targetUserId}\n` +
                      `📞 Phone: +${userPhone}\n\n` +
                      `📋 *Select groups to ban from:*\n\n` +
                      groupList +
                      `\n\n` +
                      `💡 *How to use:*\n` +
                      `Reply with group numbers separated by commas\n` +
                      `Example: 1,3,5,7,10\n\n` +
                      `Or reply "all" to ban from all groups (not recommended)\n\n` +
                      `⚠️ *Safety Tip:* Select max 10 groups to avoid Meta bans`
            });

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Group selection sent to admin for: ${targetUserId}`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to execute #kickglobal:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to execute global kick. Check logs for details.'
            });
        }

        return true;
    }

    async handleClear(msg, isAdmin) {
        console.log(`[${require('../utils/logger').getTimestamp()}] 🧹 #clear command received (clean blacklisted users)`);

        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use #clear'
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ The #clear command can only be used in groups.\n\nUsage: Type #clear in a group to remove all blacklisted users from current group'
            });
            return true;
        }

        const groupId = msg.key.remoteJid;

        try {
            // Get group metadata
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            const groupName = groupMetadata.subject || 'Unknown Group';

            console.log(`[${require('../utils/logger').getTimestamp()}] 🧹 Cleaning blacklisted users from: ${groupName}`);

            // Get blacklist
            const blacklistService = require('../services/blacklistService');

            // Find blacklisted users in this group
            const blacklistedInGroup = [];
            for (const participant of groupMetadata.participants) {
                const participantId = participant.id;
                const participantPhone = participantId.split('@')[0];

                // Skip admins
                if (participant.admin) {
                    continue;
                }

                // Check if blacklisted
                const isBlacklisted = await blacklistService.isBlacklisted(participantId);
                if (isBlacklisted) {
                    blacklistedInGroup.push({
                        id: participantId,
                        phone: participantPhone
                    });
                }
            }

            if (blacklistedInGroup.length === 0) {
                await this.sock.sendMessage(groupId, {
                    text: '✅ No blacklisted users found in this group.\n\nGroup is clean!'
                });
                console.log(`[${require('../utils/logger').getTimestamp()}] ✅ No blacklisted users found in ${groupName}`);
                return true;
            }

            // Send start message
            await this.sock.sendMessage(groupId, {
                text: `🧹 *Cleaning Group*\n\n` +
                      `Found ${blacklistedInGroup.length} blacklisted user(s)\n` +
                      `⏳ Removing them now...`
            });

            // Remove blacklisted users with delays
            let removed = 0;
            let failed = 0;

            for (let i = 0; i < blacklistedInGroup.length; i++) {
                const user = blacklistedInGroup[i];

                try {
                    console.log(`[${require('../utils/logger').getTimestamp()}] 🗑️ Removing blacklisted user: ${user.phone}`);

                    await this.sock.groupParticipantsUpdate(groupId, [user.id], 'remove');
                    removed++;

                    console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Removed ${user.phone}`);

                    // Progress update every 5 users
                    if ((i + 1) % 5 === 0 && (i + 1) < blacklistedInGroup.length) {
                        await this.sock.sendMessage(groupId, {
                            text: `🧹 Progress: ${i + 1}/${blacklistedInGroup.length} removed...`
                        });
                    }

                    // SAFE: 2 second delay between kicks
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (error) {
                    failed++;
                    console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to remove ${user.phone}: ${error.message}`);

                    // Continue with next user
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Send completion report
            const report = `✅ *Group Cleaned!*\n\n` +
                          `📊 Results:\n` +
                          `   • Successfully removed: ${removed}\n` +
                          (failed > 0 ? `   • Failed to remove: ${failed}\n` : '') +
                          `   • Group: ${groupName}`;

            await this.sock.sendMessage(groupId, { text: report });

            // Send detailed private report to admin (0544345287)
            const adminJid = '0544345287@s.whatsapp.net';
            const detailedReport = `🧹 *Group Cleanup Report*\n\n` +
                                  `📍 Group: ${groupName}\n` +
                                  `📊 Successfully removed ${removed} blacklisted user(s):\n\n` +
                                  (blacklistedInGroup.length > 0
                                      ? blacklistedInGroup.map(u => `   • +${u.phone}`).join('\n')
                                      : '   (none found)') +
                                  (failed > 0 ? `\n\n⚠️ Failed to remove: ${failed}` : '');

            await this.sock.sendMessage(adminJid, { text: detailedReport });

            console.log(`[${require('../utils/logger').getTimestamp()}] 🏁 Clean complete: ${removed} removed, ${failed} failed`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to clean group:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to clean group. Check logs for details.'
            });
        }

        return true;
    }

    async handleBullyWatch(msg, args, isAdmin) {
        const { getTimestamp } = require('../utils/logger');
        const config = require('../config');

        console.log(`[${getTimestamp()}] 🛡️ #bullywatch command received`);

        // ADMIN ONLY - check using same pattern as rest of bot
        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderPhone = senderId.split('@')[0];

        // Check if it's the authorized admin (handles multiple formats)
        const isAuthorizedAdmin =
            senderPhone === config.ALERT_PHONE ||
            senderPhone === config.ADMIN_PHONE ||
            senderPhone === config.ADMIN_LID ||
            senderId.includes(config.ALERT_PHONE) ||
            senderId.includes(config.ADMIN_PHONE) ||
            senderId.includes(config.ADMIN_LID);

        console.log(`[${getTimestamp()}] 🔍 Admin check: sender=${senderPhone}, authorized=${isAuthorizedAdmin}`);

        if (!isAuthorizedAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only the bot administrator can use this command.',
                quoted: msg
            });
            return true;
        }

        // Must be in a group
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command can only be used in groups.\n\nUsage: Send #bullywatch on [class] in a group chat',
                quoted: msg
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const action = args && args[0] ? args[0].toLowerCase() : null;

        // Get group name for messages
        const groupMetadata = await this.getCachedGroupMetadata(groupId);
        const groupName = groupMetadata.subject || 'Unknown Group';

        try {
            const groupService = require('../database/groupService');

            // Handle different sub-commands
            if (action === 'on') {
                // Enable monitoring - class name is MANDATORY
                const className = args && args[1] ? args[1] : null;

                if (!className) {
                    await this.sock.sendMessage(groupId, {
                        text: '❌ *Class name is required*\n\n' +
                              'Usage: #bullywatch on [class_name]\n\n' +
                              'Examples:\n' +
                              '  • #bullywatch on ג3\n' +
                              '  • #bullywatch on א7\n' +
                              '  • #bullywatch on ב10',
                        quoted: msg
                    });
                    return true;
                }

                const success = await groupService.setBullyingMonitoring(groupId, true, className);

                if (!success) {
                    await this.sock.sendMessage(groupId, {
                        text: '❌ Failed to enable bullying monitoring. Group may not be in database.',
                        quoted: msg
                    });
                    return true;
                }

                await this.sock.sendMessage(groupId, {
                    text: `✅ *ניטור בריונות מופעל*\n` +
                          `✅ *Bullying Monitoring ENABLED*\n\n` +
                          `🛡️ קבוצה / Group: ${groupName}\n` +
                          `📚 כיתה / Class: ${className}\n\n` +
                          `👁️ *הבוט עוקב אחר השיחה*\n` +
                          `👁️ *Bot is watching the conversation*\n\n` +
                          `הבוט יפקח על:\n` +
                          `The bot will monitor for:\n` +
                          `• בריונות והטרדה / Bullying and harassment\n` +
                          `• השפלת גוף / Body shaming\n` +
                          `• איומים ואלימות / Threats and violence\n` +
                          `• אפליה / Discrimination\n\n` +
                          `💬 שמרו על כבוד הדדי\n` +
                          `💬 Keep it respectful`,
                    quoted: msg
                });

                console.log(`[${getTimestamp()}] ✅ Bullying monitoring ENABLED for ${groupName} (Class: ${className})`);
            }
            else if (action === 'off') {
                // Disable monitoring
                const success = await groupService.setBullyingMonitoring(groupId, false, null);

                if (!success) {
                    await this.sock.sendMessage(groupId, {
                        text: '❌ Failed to disable bullying monitoring. Group may not be in database.',
                        quoted: msg
                    });
                    return true;
                }

                await this.sock.sendMessage(groupId, {
                    text: `⏸️ *Bullying Monitoring DISABLED*\n\n` +
                          `Group: ${groupName}\n\n` +
                          `Offensive content monitoring has been turned off for this group.`,
                    quoted: msg
                });

                console.log(`[${getTimestamp()}] ⏸️ Bullying monitoring DISABLED for ${groupName}`);
            }
            else if (action === 'class') {
                // Update class name for already-enabled group
                const className = args && args[1] ? args[1] : null;

                if (!className) {
                    await this.sock.sendMessage(groupId, {
                        text: '❌ Please specify class name.\n\n' +
                              'Usage: #bullywatch class [class_name]\n\n' +
                              'Example: #bullywatch class ג3',
                        quoted: msg
                    });
                    return true;
                }

                // Check if monitoring is enabled
                const isEnabled = await groupService.isBullyingMonitoringEnabled(groupId);
                if (!isEnabled) {
                    await this.sock.sendMessage(groupId, {
                        text: '❌ Bullying monitoring is not enabled for this group.\n\n' +
                              'First enable with: #bullywatch on [class_name]',
                        quoted: msg
                    });
                    return true;
                }

                // Update class name
                const success = await groupService.setGroupClassName(groupId, className);
                if (success) {
                    await this.sock.sendMessage(groupId, {
                        text: `✅ Class updated to: ${className}`,
                        quoted: msg
                    });
                } else {
                    await this.sock.sendMessage(groupId, {
                        text: '❌ Failed to update class name.',
                        quoted: msg
                    });
                }
            }
            else if (action === 'status') {
                // Show monitoring status + class name
                const isEnabled = await groupService.isBullyingMonitoringEnabled(groupId);
                const className = await groupService.getGroupClassName(groupId);

                await this.sock.sendMessage(groupId, {
                    text: `🛡️ *Bullying Monitoring Status*\n\n` +
                          `Group: ${groupName}\n` +
                          `Status: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                          `Class: ${className || 'Not set'}`,
                    quoted: msg
                });
            }
            else if (action === 'review') {
                // Show last 10 flagged messages for admin feedback
                return await this.handleBullywatchReview(msg, groupId);
            }
            else if (action === 'feedback') {
                // Store admin feedback for flagged message
                return await this.handleBullywatchFeedback(msg, args, groupId);
            }
            else if (action === 'suggest') {
                // Store admin suggestion for new offensive word
                return await this.handleBullywatchSuggest(msg, args, groupId);
            }
            else if (action === 'metrics') {
                // Show accuracy metrics from feedback data
                return await this.handleBullywatchMetrics(msg, groupId);
            }
            else if (action === 'export') {
                // Export feedback data as CSV
                return await this.handleBullywatchExport(msg, groupId);
            }
            else if (action === 'approve') {
                // Approve and add suggested word to lexicon at runtime
                return await this.handleBullywatchApprove(msg, args, groupId);
            }
            else if (action === 'suggestions') {
                // List pending word suggestions
                return await this.handleBullywatchSuggestions(msg, groupId);
            }
            else {
                // Show usage
                await this.sock.sendMessage(groupId, {
                    text: '❌ *Usage:*\n\n' +
                          '#bullywatch on [class] - Enable monitoring\n' +
                          '#bullywatch off - Disable monitoring\n' +
                          '#bullywatch class [class] - Update class name\n' +
                          '#bullywatch status - Show status\n\n' +
                          '🎯 *Admin Feedback:*\n' +
                          '#bullywatch review - Review flagged messages\n' +
                          '#bullywatch feedback <id> <verdict> - Provide feedback\n' +
                          '#bullywatch suggest <word> - Suggest new word\n' +
                          '#bullywatch suggestions - List pending suggestions\n' +
                          '#bullywatch approve <word> <category> - Add word to lexicon\n' +
                          '#bullywatch metrics - View accuracy stats\n' +
                          '#bullywatch export - Export feedback CSV\n\n' +
                          'Example: #bullywatch on ג3',
                    quoted: msg
                });
            }

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to handle bullywatch command:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to update bullying monitoring. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    async handleBullyAlert(msg, args, isAdmin) {
        const { getTimestamp } = require('../utils/logger');
        const config = require('../config');

        console.log(`[${getTimestamp()}] 🔔 #bullyalert command received`);

        // ADMIN ONLY - check using same pattern as bullywatch
        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderPhone = senderId.split('@')[0];

        // Check if it's the authorized admin (handles multiple formats)
        const isAuthorizedAdmin =
            senderPhone === config.ALERT_PHONE ||
            senderPhone === config.ADMIN_PHONE ||
            senderPhone === config.ADMIN_LID ||
            senderId.includes(config.ALERT_PHONE) ||
            senderId.includes(config.ADMIN_PHONE) ||
            senderId.includes(config.ADMIN_LID);

        console.log(`[${getTimestamp()}] 🔍 Admin check: sender=${senderPhone}, authorized=${isAuthorizedAdmin}`);

        if (!isAuthorizedAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only the bot administrator can use this command.',
                quoted: msg
            });
            return true;
        }

        // Must be in a group
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command can only be used in groups.\n\nUsage: Send #bullyalert on/off in a group chat',
                quoted: msg
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const action = args && args[0] ? args[0].toLowerCase() : null;

        if (!action || !['on', 'off'].includes(action)) {
            await this.sock.sendMessage(groupId, {
                text: '❌ Usage: #bullyalert on|off\n\n' +
                      'Examples:\n' +
                      '  • #bullyalert on - Send alerts to ALL group admins\n' +
                      '  • #bullyalert off - Send alerts ONLY to main admin (+' + config.ALERT_PHONE + ')',
                quoted: msg
            });
            return true;
        }

        const enabled = action === 'on';

        try {
            const groupService = require('../database/groupService');
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            const groupName = groupMetadata.subject || 'Unknown Group';

            if (enabled) {
                // Get all group admins (excluding bot and main admin)
                const admins = groupMetadata.participants.filter(p => {
                    const phone = p.id.split('@')[0];
                    return p.admin &&
                           !p.id.includes(':') && // Exclude bot
                           phone !== config.ALERT_PHONE &&
                           phone !== config.ADMIN_PHONE;
                });

                if (admins.length === 0) {
                    await this.sock.sendMessage(groupId, {
                        text: `ℹ️ No additional admins found in this group.\n\n` +
                              `Only the main admin (+${config.ALERT_PHONE}) will receive alerts.`,
                        quoted: msg
                    });
                    return true;
                }

                // Add all admins to alert recipients
                for (const admin of admins) {
                    const adminPhone = admin.id.split('@')[0];
                    try {
                        await groupService.addAlertRecipient(groupId, adminPhone);
                        console.log(`[${getTimestamp()}] ➕ Added admin ${adminPhone} to alert recipients`);
                    } catch (error) {
                        console.error(`[${getTimestamp()}] ❌ Failed to add admin ${adminPhone}:`, error.message);
                    }
                }

                // Get final recipient list
                const recipients = await groupService.getAlertRecipients(groupId);

                await this.sock.sendMessage(groupId, {
                    text: `✅ *Multi-Admin Alerts ENABLED*\n\n` +
                          `🛡️ Group: ${groupName}\n\n` +
                          `Bullying alerts will be sent to:\n` +
                          `• Main admin: +${config.ALERT_PHONE} (always)\n` +
                          (recipients.length > 0
                              ? `• ${recipients.length} additional admin(s): ${recipients.map(p => '+' + p).join(', ')}\n\n`
                              : '\n') +
                          `All group admins will be notified when offensive content is detected.`,
                    quoted: msg
                });

                console.log(`[${getTimestamp()}] ✅ Multi-admin alerts ENABLED for ${groupName} (${recipients.length} additional recipients)`);

            } else {
                // Clear all alert recipients
                const currentRecipients = await groupService.getAlertRecipients(groupId);

                for (const phone of currentRecipients) {
                    try {
                        await groupService.removeAlertRecipient(groupId, phone);
                        console.log(`[${getTimestamp()}] ➖ Removed ${phone} from alert recipients`);
                    } catch (error) {
                        console.error(`[${getTimestamp()}] ❌ Failed to remove ${phone}:`, error.message);
                    }
                }

                await this.sock.sendMessage(groupId, {
                    text: `⏸️ *Multi-Admin Alerts DISABLED*\n\n` +
                          `Group: ${groupName}\n\n` +
                          `Bullying alerts will only be sent to:\n` +
                          `• Main admin: +${config.ALERT_PHONE}\n\n` +
                          `Other group admins will no longer receive alerts.`,
                    quoted: msg
                });

                console.log(`[${getTimestamp()}] ⏸️ Multi-admin alerts DISABLED for ${groupName}`);
            }

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to set multi-admin alerts:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to update multi-admin alerts. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    async handleWhitelist(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #whitelist 972555123456' 
            });
            return true;
        }

        const success = await addToWhitelist(args);
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Added ${args} to whitelist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to add ${args} to whitelist (may already exist).` 
            });
        }
        return true;
    }

    async handleWhitelistList(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        const whitelisted = await listWhitelist();
        if (whitelisted.length === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '📝 Whitelist is empty.' 
            });
        } else {
            const list = whitelisted.map((num, index) => `${index + 1}. ${num}`).join('\n');
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `📝 *Whitelisted Users:*\n\n${list}` 
            });
        }
        return true;
    }

    async handleBan(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך??' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #ban command can only be used in groups.\n\nUsage: Reply to a user\'s message in a group and type #ban' 
            });
            return true;
        }

        // Check if this is a reply to another message - updated detection logic
        let quotedMsg = null;
        let targetUserId = null;

        // Method 1: extendedTextMessage with contextInfo (most common for text replies)
        if (msg.message?.extendedTextMessage?.contextInfo) {
            const contextInfo = msg.message.extendedTextMessage.contextInfo;
            targetUserId = contextInfo.participant;
            quotedMsg = contextInfo;
        }
        // Method 2: Regular conversation message with contextInfo (alternative format)
        else if (msg.message?.conversation && msg.message?.contextInfo) {
            const contextInfo = msg.message.contextInfo;
            targetUserId = contextInfo.participant;
            quotedMsg = contextInfo;
        }
        // Method 3: imageMessage, videoMessage, etc. with contextInfo
        else {
            const messageType = Object.keys(msg.message || {})[0];
            if (msg.message?.[messageType]?.contextInfo) {
                const contextInfo = msg.message[messageType].contextInfo;
                if (contextInfo.quotedMessage || contextInfo.participant) {
                    targetUserId = contextInfo.participant;
                    quotedMsg = contextInfo;
                }
            }
        }

        if (!quotedMsg || !targetUserId) {
            // Send warning message to the group
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ Please reply to a message from the user you want to ban.\n\nUsage: Reply to a user\'s message and type #ban'
            });

            // Also send detailed alert to main admin phone for debugging
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderPhone = senderJid.split('@')[0];
            const groupId = msg.key.remoteJid;

            // Get group name
            let groupName = 'Unknown';
            try {
                const groupMetadata = await this.getCachedGroupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown';
            } catch (e) {
                // Ignore metadata errors
            }

            // Send alert to main admin
            const alertPhone = this.config.ALERT_PHONE + '@s.whatsapp.net';
            await this.sock.sendMessage(alertPhone, {
                text: `⚠️ COMMAND ERROR ALERT\n\n` +
                      `Command: #ban\n` +
                      `User: ${senderPhone}\n` +
                      `Group: ${groupName}\n` +
                      `Error: No message reply detected\n` +
                      `MessageType: ${Object.keys(msg.message || {})[0]}\n` +
                      `Time: ${new Date().toLocaleString('en-GB')}`
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        // targetUserId already assigned above
        
        try {
            // Get group metadata to check permissions
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            
            // Check if target user is admin
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetUserId);
            if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ Cannot ban admin users.' 
                });
                return true;
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] 🚫 Admin ban: ${targetUserId} from ${groupId}`);

            // Add to blacklist first - must succeed before kicking
            const { addToBlacklist } = require('./blacklistService');
            const blacklistSuccess = await addToBlacklist(targetUserId, 'Banned by admin command');
            if (!blacklistSuccess) {
                await this.sock.sendMessage(groupId, { 
                    text: '❌ Failed to add user to blacklist. Ban command aborted.' 
                });
                return true;
            }

            // Then kick the user if they're still in group (only if blacklisting succeeded)
            if (targetParticipant) {
                await this.sock.groupParticipantsUpdate(groupId, [targetUserId], 'remove');
                
                // Send alert to alert phone  
                const userPhone = targetUserId.split('@')[0];
                
                // Get group invite link
                let groupInviteLink = 'N/A';
                try {
                    const inviteCode = await this.sock.groupInviteCode(groupId);
                    groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                } catch (err) {
                    console.log('Could not get group invite link:', err.message);
                }
                
                await sendKickAlert(this.sock, {
                    userPhone: userPhone,
                    userName: `User ${userPhone}`,
                    groupName: groupMetadata?.subject || 'Unknown Group',
                    groupId: groupId,
                    reason: 'admin_command',
                    additionalInfo: 'Banned by admin using #ban command',
                    groupInviteLink: groupInviteLink
                });
                
                // Send ban notification to admin instead of user
                try {
                    await this.sock.sendMessage(`${config.ADMIN_PHONE}@s.whatsapp.net`, {
                        text: `🚫 User banned by admin command\n\n` +
                              `👤 User: ${targetUserId}\n` +
                              `📍 Group: ${groupMetadata?.subject || 'Unknown Group'}\n` +
                              `📱 Reason: Manual ban by admin\n` +
                              `🗃️ Added to blacklist\n` +
                              `⏰ Time: ${new Date().toLocaleString()}`
                    });
                    console.log(`✅ Admin notification sent for banned user: ${targetUserId}`);
                } catch (notificationError) {
                    console.error(`Failed to send admin notification:`, notificationError.message);
                }
                
                await this.sock.sendMessage(groupId, { 
                    text: `🚫 User has been banned and removed from the group.\nThey cannot rejoin until unbanned.` 
                });
            } else {
                await this.sock.sendMessage(groupId, { 
                    text: `🚫 User has been banned and cannot join this group.` 
                });
            }

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Successfully banned user: ${targetUserId}`);

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to ban user:`, error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Need to be an admin' 
            });
        }

        return true;
    }


    async handleBotForeign(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #botforeign command can only be used in groups.\n\nUsage: In a group, type #botforeign to remove all users with +1 or +6 country codes' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        
        try {
            // Get group metadata
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            const participants = groupMetadata.participants;
            
            // Find all users with +1 or +6 country codes
            const usersToKick = [];
            const whitelistedSkipped = [];
            
            for (const participant of participants) {
                const userId = participant.id;
                const phoneNumber = userId.split('@')[0];
                const isLidFormat = userId.endsWith('@lid');
                
                // Debug: Log all phone numbers to see format
                console.log(`🔍 Checking participant: ${phoneNumber} (length: ${phoneNumber.length}, LID: ${isLidFormat})`);
                
                // Skip bot and admins
                if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                    console.log(`👮 Skipping admin: ${phoneNumber}`);
                    continue;
                }
                
                // Check if user is whitelisted
                if (await isWhitelisted(userId)) {
                    if (phoneNumber.startsWith('1') || phoneNumber.startsWith('6') || 
                        phoneNumber.startsWith('+1') || phoneNumber.startsWith('+6')) {
                        whitelistedSkipped.push(phoneNumber);
                    }
                    continue;
                }
                
                // Check if phone number starts with +1 or +6
                // More precise check: US/Canada (+1) has 11 digits, Southeast Asia (+6x) has varying lengths
                // IMPORTANT: Never kick Israeli numbers (+972)
                const isIsraeliNumber = phoneNumber.startsWith('972') || phoneNumber.startsWith('+972');
                
                // Debug: Show detailed condition checking
                const startsWithOne = phoneNumber.startsWith('1');
                const startsWithPlusOne = phoneNumber.startsWith('+1');
                const startsWithSix = phoneNumber.startsWith('6');
                const startsWithPlusSix = phoneNumber.startsWith('+6');
                const lengthEleven = phoneNumber.length === 11;
                const lengthTwelve = phoneNumber.length === 12;
                const lengthTenToTwelve = phoneNumber.length >= 10 && phoneNumber.length <= 12;
                const lengthElevenToThirteen = phoneNumber.length >= 11 && phoneNumber.length <= 13;
                
                // Also check for US numbers stored as 10 digits (without country code)
                const isTenDigitUSNumber = phoneNumber.length === 10 && /^[2-9]\d{9}$/.test(phoneNumber); // US format without +1
                
                console.log(`📊 ${phoneNumber}: starts1=${startsWithOne}, starts+1=${startsWithPlusOne}, starts6=${startsWithSix}, starts+6=${startsWithPlusSix}, len=${phoneNumber.length}, israeli=${isIsraeliNumber}, 10digitUS=${isTenDigitUSNumber}, isLID=${isLidFormat}`);
                
                // CRITICAL FIX: LID format users are exempt from country code restrictions
                // @lid identifiers are encrypted privacy IDs, NOT phone numbers
                if (isLidFormat) {
                    console.log(`🔒 LID format user exempt from country restrictions: ${phoneNumber} (encrypted privacy ID)`);
                }
                
                // Only match if it's clearly a US/Canada or Southeast Asian number AND NOT Israeli AND NOT LID format
                if (!isIsraeliNumber && !isLidFormat && 
                    ((startsWithOne && lengthEleven) || // US/Canada format with 1
                     (startsWithPlusOne && lengthTwelve) || // US/Canada with +1
                     isTenDigitUSNumber || // US format without country code (10 digits)
                     (startsWithSix && lengthTenToTwelve) || // Southeast Asia
                     (startsWithPlusSix && lengthElevenToThirteen))) { // Southeast Asia with +
                    
                    console.log(`🌍 Adding to kick list: ${phoneNumber} (length: ${phoneNumber.length})`);
                    usersToKick.push({
                        id: userId,
                        phone: phoneNumber,
                        countryCode: phoneNumber.startsWith('+') ? phoneNumber.substring(0, 2) : phoneNumber.charAt(0)
                    });
                } else if (isIsraeliNumber) {
                    console.log(`🇮🇱 Protecting Israeli number: ${phoneNumber}`);
                } else {
                    console.log(`❌ No match for ${phoneNumber} - not US/Canada/SE Asia format`);
                }
            }
            
            if (usersToKick.length === 0) {
                let message = '✅ No users with +1 or +6 country codes found in this group.';
                if (whitelistedSkipped.length > 0) {
                    message += `\n\nℹ️ ${whitelistedSkipped.length} whitelisted user(s) were skipped.`;
                }
                await this.sock.sendMessage(groupId, { text: message });
                return true;
            }
            
            // Send initial message
            await this.sock.sendMessage(groupId, { 
                text: `🌍 Starting to remove ${usersToKick.length} user(s) with restricted country codes (+1 and +6)...` 
            });
            
            // Kick users in batches with delay
            let successCount = 0;
            let failCount = 0;
            
            for (const user of usersToKick) {
                try {
                    await this.sock.groupParticipantsUpdate(groupId, [user.id], 'remove');
                    successCount++;
                    console.log(`✅ Kicked foreign user: ${user.phone}`);
                    
                    // Send alert to alert phone
                    await sendKickAlert(this.sock, {
                        userPhone: user.phone,
                        userName: `User ${user.phone}`,
                        groupName: groupMetadata?.subject || 'Unknown Group',
                        groupId: groupId,
                        reason: 'country_code',
                        additionalInfo: `Foreign country code restriction (+1/+6)`,
                        groupInviteLink: 'N/A' // Will be obtained by alert service
                    });
                    
                    // Send notification to admin instead of user
                    try {
                        await this.sock.sendMessage(`${config.ADMIN_PHONE}@s.whatsapp.net`, {
                            text: `🌍 Country code restriction kick\n\n` +
                                  `👤 User: ${user.phone}\n` +
                                  `📍 Group: ${groupMetadata?.subject || 'Unknown Group'}\n` +
                                  `📱 Reason: +1/+6 country code not allowed\n` +
                                  `⏰ Time: ${new Date().toLocaleString()}`
                        });
                    } catch (notificationError) {
                        console.error(`Failed to send admin notification:`, notificationError.message);
                    }
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    failCount++;
                    console.error(`❌ Failed to kick ${user.phone}:`, error.message);
                }
            }
            
            // Send summary
            let summaryMessage = `🌍 *Foreign User Removal Complete*\n\n`;
            summaryMessage += `✅ Successfully removed: ${successCount} users\n`;
            if (failCount > 0) {
                summaryMessage += `❌ Failed to remove: ${failCount} users\n`;
            }
            if (whitelistedSkipped.length > 0) {
                summaryMessage += `ℹ️ Whitelisted users skipped: ${whitelistedSkipped.length}\n`;
            }
            summaryMessage += `\n⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(groupId, { text: summaryMessage });
            
            // Alert admin
            const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
            
            // Try to get group invite link
            let groupLink = 'N/A';
            try {
                const inviteCode = await this.sock.groupInviteCode(groupId);
                groupLink = `https://chat.whatsapp.com/${inviteCode}`;
            } catch (err) {
                console.log('Could not get group invite link:', err.message);
            }
            
            const alertMessage = `🌍 *Botforeign Command Executed*\n\n` +
                               `📍 Group: ${groupMetadata.subject}\n` +
                               `🔗 Group Link: ${groupLink}\n` +
                               `👮 Executed by: Admin\n` +
                               `✅ Removed: ${successCount} users\n` +
                               `❌ Failed: ${failCount} users\n` +
                               `ℹ️ Whitelisted skipped: ${whitelistedSkipped.length}\n` +
                               `⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(adminId, { text: alertMessage });
            
        } catch (error) {
            console.error('❌ Error in botforeign command:', error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Need to be an admin' 
            });
        }
        
        return true;
    }

    async handleDebugNumbers(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #debugnumbers command can only be used in groups.\n\nUsage: In a group, type #debugnumbers to see phone number formats' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        
        try {
            // Get group metadata
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            const participants = groupMetadata.participants;
            
            let debugReport = `🔍 *Group Number Formats Debug*\n\n`;
            debugReport += `Total participants: ${participants.length}\n\n`;
            
            for (const participant of participants) {
                const userId = participant.id;
                const phoneNumber = userId.split('@')[0];
                const isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
                const isLidFormat = userId.endsWith('@lid');
                
                debugReport += `📱 ${phoneNumber}\n`;
                debugReport += `   Full ID: ${userId}\n`;
                debugReport += `   Length: ${phoneNumber.length}\n`;
                debugReport += `   LID Format: ${isLidFormat}\n`;
                debugReport += `   Starts with 1: ${phoneNumber.startsWith('1')}\n`;
                debugReport += `   Starts with +1: ${phoneNumber.startsWith('+1')}\n`;
                debugReport += `   Starts with 6: ${phoneNumber.startsWith('6')}\n`;
                debugReport += `   Starts with +6: ${phoneNumber.startsWith('+6')}\n`;
                debugReport += `   Starts with 972: ${phoneNumber.startsWith('972')}\n`;
                debugReport += `   Admin: ${isAdmin}\n`;
                debugReport += `   10-digit US pattern: ${phoneNumber.length === 10 && /^[2-9]\d{9}$/.test(phoneNumber)}\n`;
                debugReport += `   LID exempt: ${isLidFormat ? 'Yes (encrypted privacy ID)' : 'No'}\n\n`;
                
                // Break if message gets too long
                if (debugReport.length > 3000) {
                    debugReport += `... (truncated - too many participants)\n`;
                    break;
                }
            }
            
            await this.sock.sendMessage(groupId, { text: debugReport });
            
        } catch (error) {
            console.error('❌ Error in debug numbers command:', error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Failed to debug numbers.' 
            });
        }
        
        return true;
    }

    async handleUnmute(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sendGroupOnlyMessage(msg, '#unmute');
            return true;
        }

        const groupId = msg.key.remoteJid;
        const hasQuotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (hasQuotedMsg) {
            // Unmute specific user
            const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
            
            if (quotedParticipant) {
                await removeMutedUser(quotedParticipant);
                await this.sock.sendMessage(groupId, { 
                    text: `🔊 User has been unmuted.\n` +
                          `🔊 המשתמש שוחרר מההשתקה.`
                });
            } else {
                await this.sock.sendMessage(groupId, { 
                    text: `⚠️ Could not identify user to unmute.\n` +
                          `⚠️ לא ניתן לזהות את המשתמש לביטול השתקה.`
                });
            }
        } else {
            // Unmute entire group
            if (groupMuteStatus.has(groupId)) {
                groupMuteStatus.delete(groupId);
                await this.sock.sendMessage(groupId, { 
                    text: `🔊 Group has been unmuted. Everyone can now send messages.\n` +
                          `🔊 הקבוצה שוחררה מההשתקה. כולם יכולים לשלוח הודעות עכשיו.`
                });
            } else {
                await this.sock.sendMessage(groupId, { 
                    text: `⚠️ Group is not muted.\n` +
                          `⚠️ הקבוצה לא מושתקת.`
                });
            }
        }
        return true;
    }

    async handleUnwhitelist(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #unwhitelist 972555123456' 
            });
            return true;
        }

        const success = await removeFromWhitelist(args);
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Removed ${args} from whitelist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to remove ${args} from whitelist (may not exist).` 
            });
        }
        return true;
    }
    async handleBlacklistAdd(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #blacklist 972555123456' 
            });
            return true;
        }

        const { addToBlacklist } = require('./blacklistService');
        const success = await addToBlacklist(args, 'Added by admin command');
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Added ${args} to blacklist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to add ${args} to blacklist.` 
            });
        }
        return true;
    }
    
    async handleBlacklistRemove(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: 'מה אני עובד אצלך?!'
            });
            return true;
        }

        // Convert args to string if it's an array
        let phoneNumber = Array.isArray(args) ? args.join(' ').trim() : (args || '').trim();

        // If no args provided, try to extract from quoted message (alert reply)
        if (!phoneNumber || phoneNumber === '') {
            // Check if replying to a message (alert)
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = quotedMessage?.conversation ||
                             quotedMessage?.extendedTextMessage?.text || '';

            // Try to extract phone number from alert message
            // Pattern: "Phone: +972539632985" or "User: 3655507063087@lid"
            const phoneMatch = quotedText.match(/Phone:\s*\+?(\d+)/);
            const userMatch = quotedText.match(/User:\s*(\d+)@/);

            if (phoneMatch) {
                phoneNumber = phoneMatch[1];
                console.log(`[${require('../utils/logger').getTimestamp()}] 📞 Extracted phone from quoted message: ${phoneNumber}`);
            } else if (userMatch) {
                phoneNumber = userMatch[1];
                console.log(`[${require('../utils/logger').getTimestamp()}] 👤 Extracted user ID from quoted message: ${phoneNumber}`);
            }
        }

        // Validate we have a phone number
        if (!phoneNumber || phoneNumber === '') {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ Please provide a phone number or reply to an alert message.\n\nUsage:\n• #unblacklist 972555123456\n• Reply #ub to an alert message'
            });
            return true;
        }

        // Remove from Firebase blacklist
        const { removeFromBlacklist } = require('./blacklistService');
        const firebaseSuccess = await removeFromBlacklist(phoneNumber);

        // Remove from PostgreSQL database if available
        let dbSuccess = false;
        if (process.env.DATABASE_URL) {
            try {
                const { unblacklistUser } = require('../database/groupService');
                await unblacklistUser(phoneNumber);
                dbSuccess = true;
                console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Removed ${phoneNumber} from PostgreSQL blacklist`);
            } catch (error) {
                console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to remove from database:`, error.message);
            }
        }

        // Remove from Redis cache if available
        if (process.env.REDIS_URL) {
            try {
                const { removeFromBlacklistCache } = require('../services/redisService');
                await removeFromBlacklistCache(phoneNumber);
                console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Removed ${phoneNumber} from Redis cache`);
            } catch (error) {
                console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Failed to remove from cache:`, error.message);
            }
        }

        const success = firebaseSuccess || dbSuccess;
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: `✅ Removed +${phoneNumber} from blacklist.\n\nViolation history preserved for record keeping.`
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to remove ${phoneNumber} from blacklist.`
            });
        }
        return true;
    }
    
    async handleBlacklistList(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: 'מה אני עובד אצלך?!'
            });
            return true;
        }

        try {
            // Get blacklist from PostgreSQL
            const { getBlacklistedUsers, getViolations, formatViolations } = require('../database/groupService');
            const blacklistedUsers = await getBlacklistedUsers();

            if (blacklistedUsers.length === 0) {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '📝 Blacklist is empty.'
                });
            } else {
                // Show first 50 with violation counts
                const list = await Promise.all(
                    blacklistedUsers.slice(0, 50).map(async (user, index) => {
                        const violations = await getViolations(user.phone_number);
                        const violationStr = formatViolations(violations);
                        const displayNum = user.phone_number || user.lid;
                        return `${index + 1}. ${displayNum} - ${violationStr}`;
                    })
                );

                const totalCount = blacklistedUsers.length;
                const message = totalCount > 50
                    ? `📝 *Blacklisted Users (showing first 50 of ${totalCount}):*\n\n${list.join('\n')}`
                    : `📝 *Blacklisted Users (${totalCount} total):*\n\n${list.join('\n')}`;

                await this.sock.sendMessage(msg.key.remoteJid, { text: message });
            }
        } catch (error) {
            console.error('Error fetching blacklist:', error.message);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error fetching blacklist from database.'
            });
        }

        return true;
    }
    async handleSweep(msg, isSuperAdmin) {
        if (!isSuperAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Only superadmins can use the sweep command.' 
            });
            return true;
        }
        
        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #sweep command can only be used in groups.\n\nUsage: In a group, type #sweep to clean up inactive users' 
            });
            return true;
        }

        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: '⚠️ Sweep command not yet implemented in Baileys version.' 
        });
        return true;
    }
    async handleBotKick(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #botkick command can only be used in groups.\n\nUsage: In a group, type #botkick to scan and remove all blacklisted users' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        
        try {
            // Get group metadata
            const groupMetadata = await this.getCachedGroupMetadata(groupId);
            const participants = groupMetadata.participants;
            
            // Import blacklist check function
            const { isBlacklisted } = require('./blacklistService');
            
            await this.sock.sendMessage(groupId, { 
                text: `🔍 Scanning ${participants.length} group members for blacklisted users...` 
            });
            
            // Find all blacklisted users
            const blacklistedUsers = [];
            
            for (const participant of participants) {
                const userId = participant.id;
                const phoneNumber = userId.split('@')[0];
                
                // Skip bot and admins
                if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                    continue;
                }
                
                // Check if user is blacklisted
                if (await isBlacklisted(userId)) {
                    blacklistedUsers.push({
                        id: userId,
                        phone: phoneNumber
                    });
                    console.log(`🚫 Found blacklisted user in group: ${phoneNumber}`);
                }
            }
            
            if (blacklistedUsers.length === 0) {
                await this.sock.sendMessage(groupId, { 
                    text: '✅ No blacklisted users found in this group.' 
                });
                return true;
            }
            
            // Kick blacklisted users
            await this.sock.sendMessage(groupId, { 
                text: `🚫 Found ${blacklistedUsers.length} blacklisted user(s). Removing them now...` 
            });
            
            let successCount = 0;
            let failCount = 0;
            
            for (const user of blacklistedUsers) {
                try {
                    await this.sock.groupParticipantsUpdate(groupId, [user.id], 'remove');
                    successCount++;
                    console.log(`✅ Kicked blacklisted user: ${user.phone}`);
                    
                    // Send alert to alert phone
                    await sendKickAlert(this.sock, {
                        userPhone: user.phone,
                        userName: `User ${user.phone}`,
                        groupName: groupMetadata?.subject || 'Unknown Group',
                        groupId: groupId,
                        reason: 'blacklisted',
                        additionalInfo: `User was on blacklist`,
                        groupInviteLink: 'N/A' // Will be obtained by alert service
                    });
                    
                    // Send notification to admin instead of user
                    try {
                        await this.sock.sendMessage(`${config.ADMIN_PHONE}@s.whatsapp.net`, {
                            text: `🚫 Blacklisted user removed\n\n` +
                                  `👤 User: ${user.phone}\n` +
                                  `📍 Group: ${groupMetadata?.subject || 'Unknown Group'}\n` +
                                  `📱 Reason: User on blacklist\n` +
                                  `⏰ Time: ${new Date().toLocaleString()}`
                        });
                    } catch (notificationError) {
                        console.error(`Failed to send admin notification:`, notificationError.message);
                    }
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    failCount++;
                    console.error(`❌ Failed to kick ${user.phone}:`, error.message);
                }
            }
            
            // Send summary
            let summaryMessage = `🚫 *Blacklist Scan Complete*\n\n`;
            summaryMessage += `✅ Successfully removed: ${successCount} users\n`;
            if (failCount > 0) {
                summaryMessage += `❌ Failed to remove: ${failCount} users\n`;
            }
            summaryMessage += `\n⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(groupId, { text: summaryMessage });
            
            // Alert admin
            const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
            
            // Try to get group invite link
            let groupLink = 'N/A';
            try {
                const inviteCode = await this.sock.groupInviteCode(groupId);
                groupLink = `https://chat.whatsapp.com/${inviteCode}`;
            } catch (err) {
                console.log('Could not get group invite link:', err.message);
            }
            
            const alertMessage = `🚫 *Botkick (Blacklist Scan) Executed*\n\n` +
                               `📍 Group: ${groupMetadata.subject}\n` +
                               `🔗 Group Link: ${groupLink}\n` +
                               `👮 Executed by: Admin\n` +
                               `🔍 Found: ${blacklistedUsers.length} blacklisted users\n` +
                               `✅ Removed: ${successCount} users\n` +
                               `❌ Failed: ${failCount} users\n` +
                               `⏰ Time: ${getTimestamp()}`;
            
            await this.sock.sendMessage(adminId, { text: alertMessage });
            
        } catch (error) {
            console.error('❌ Error in botkick command:', error);
            await this.sock.sendMessage(groupId, { 
                text: '❌ Need to be an admin' 
            });
        }
        
        return true;
    }
    
    async handleSessionCheck(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        const { sessionErrors, failedDecryptions } = require('../utils/sessionManager');
        const { getTimestamp } = require('../utils/logger');
        
        // Prepare session health report
        let report = `🔒 *Session Health Check*\n\n`;
        report += `⏰ Time: ${getTimestamp()}\n\n`;
        
        // Check for problematic users
        if (sessionErrors.size === 0) {
            report += `✅ No session errors detected\n`;
        } else {
            report += `⚠️ *Users with session errors:*\n`;
            let count = 0;
            for (const [userId, errors] of sessionErrors.entries()) {
                if (count++ < 10) { // Limit to first 10
                    report += `• ${userId}: ${errors.length} errors\n`;
                }
            }
            if (sessionErrors.size > 10) {
                report += `... and ${sessionErrors.size - 10} more\n`;
            }
        }
        
        report += `\n📊 *Statistics:*\n`;
        report += `• Failed decryptions: ${failedDecryptions.size}\n`;
        report += `• Problematic sessions: ${sessionErrors.size}\n`;
        
        // Recommendations
        if (sessionErrors.size > 0 || failedDecryptions.size > 50) {
            report += `\n💡 *Recommendations:*\n`;
            report += `• Consider restarting the bot\n`;
            report += `• If errors persist, clear auth folder\n`;
            report += `• Monitor for spam from listed users\n`;
        }
        
        await this.sock.sendMessage(msg.key.remoteJid, { text: report });
        return true;
    }
    
    async handleBotAdminCheck(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        const { isBotAdmin, getBotGroupStatus, debugBotId } = require('../utils/botAdminChecker');
        const { getTimestamp } = require('../utils/logger');
        
        // If in group, check this group
        if (msg.key.remoteJid.endsWith('@g.us')) {
            const groupId = msg.key.remoteJid;
            
            try {
                // Get detailed status
                const status = await getBotGroupStatus(this.sock, groupId);
                
                let report = `🤖 *Bot Admin Status*\n\n`;
                report += `📍 Group: ${status.groupName}\n`;
                report += `🆔 Bot ID: ${status.botId}\n`;
                report += `👮 Admin Status: ${status.adminStatus || 'Not in group'}\n`;
                report += `✅ Is Admin: ${status.isAdmin ? 'Yes' : 'No'}\n`;
                report += `👥 Total Participants: ${status.participantCount}\n`;
                report += `👮 Total Admins: ${status.adminCount}\n`;
                report += `⏰ Time: ${getTimestamp()}\n\n`;
                
                if (!status.isAdmin) {
                    report += `⚠️ *Bot needs admin privileges to:*\n`;
                    report += `• Delete messages\n`;
                    report += `• Kick users\n`;
                    report += `• Check blacklist on join\n\n`;
                    report += `🔧 *To fix: Make bot admin in group settings*`;
                }
                
                await this.sock.sendMessage(groupId, { text: report });
                
            } catch (error) {
                await this.sock.sendMessage(groupId, { 
                    text: `❌ Error checking bot status: ${error.message}` 
                });
            }
        } else {
            // In private chat, show bot ID info
            const botInfo = debugBotId(this.sock);
            
            let report = `🤖 *Bot Information*\n\n`;
            report += `🆔 Bot ID: ${botInfo.fullId}\n`;
            report += `📱 Phone: ${botInfo.phone}\n`;
            report += `⏰ Time: ${getTimestamp()}\n\n`;
            report += `💡 Use this command in a group to check admin status`;
            
            await this.sock.sendMessage(msg.key.remoteJid, { text: report });
        }
        
        return true;
    }

    async handleSearch(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        if (args.length === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Please provide a search query\n\nUsage: #search <query>\nExample: #search WhatsApp security tips' 
            });
            return true;
        }

        // Check if search service is initialized
        if (!searchService.isConnected) {
            await searchService.initialize();
        }

        const query = args.join(' ');
        const userId = msg.key.participant || msg.key.remoteJid;

        // Check rate limit
        const rateLimit = searchService.checkRateLimit(userId);
        if (!rateLimit.allowed) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `⏳ Rate limit exceeded. Please wait ${rateLimit.remainingTime} seconds before searching again.` 
            });
            return true;
        }

        try {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `🔍 Searching for: "${query}"...` 
            });

            const results = await searchService.search(query);
            const formattedResults = searchService.formatSearchResults(results);

            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: formattedResults 
            });

            console.log(`[${getTimestamp()}] ✅ Search completed for query: ${query}`);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Search failed:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Search failed: ${error.message}\n\n💡 Note: MCP Chrome search requires setup. See MCP_SETUP.md for instructions.` 
            });
        }

        return true;
    }

    async handleVerifyLink(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        if (args.length === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Please provide a URL to verify\n\nUsage: #verify <url>\nExample: #verify https://example.com' 
            });
            return true;
        }

        const url = args[0];

        // Basic URL validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Invalid URL. Please include http:// or https://' 
            });
            return true;
        }

        // Check if search service is initialized
        if (!searchService.isConnected) {
            await searchService.initialize();
        }

        try {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `🔒 Verifying link safety: ${url}...` 
            });

            const verification = await searchService.verifyLink(url);

            let resultMessage = `🔍 *Link Verification Results*\n\n`;
            resultMessage += `📎 URL: ${url}\n`;
            resultMessage += `${verification.safe ? '✅' : '❌'} Safety: ${verification.safe ? 'SAFE' : 'UNSAFE'}\n`;
            resultMessage += `📂 Category: ${verification.category}\n`;

            if (verification.threats && verification.threats.length > 0) {
                resultMessage += `\n⚠️ *Threats Detected:*\n`;
                verification.threats.forEach(threat => {
                    resultMessage += `• ${threat}\n`;
                });
            }

            resultMessage += `\n⏰ Verified at: ${getTimestamp()}`;

            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: resultMessage 
            });

            console.log(`[${getTimestamp()}] ✅ Link verified: ${url} - Safe: ${verification.safe}`);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Link verification failed:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Verification failed: ${error.message}\n\n💡 Note: Link verification requires MCP setup. See MCP_SETUP.md for instructions.` 
            });
        }

        return true;
    }

    /**
     * Handle translation command
     */
    async handleTranslate(msg, args, isAdmin) {
        // Check if replying to a message
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let textToTranslateFromQuoted = null;
        
        if (quotedMessage) {
            // Extract text from quoted message
            textToTranslateFromQuoted = quotedMessage.conversation || 
                                      quotedMessage.extendedTextMessage?.text ||
                                      quotedMessage.imageMessage?.caption ||
                                      quotedMessage.videoMessage?.caption;
        }
        
        // If no args and no quoted message, show help
        if (args.length === 0 && !textToTranslateFromQuoted) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Please provide text to translate\n\n📝 *Usage:*\n• #translate <text> - Translate to Hebrew (default)\n• #translate <lang> <text> - Translate to specific language\n• *Reply* to a message with #translate - Translate that message\n• *Reply* to a message with #translate <lang> - Translate to specific language\n\n🌐 Example:\n• #translate Hello world\n• #translate en שלום עולם\n• #translate fr Bonjour le monde\n\nUse #langs to see supported languages' 
            });
            return true;
        }

        try {
            // Initialize translation service
            await translationService.initialize();
            
            let targetLang = 'he'; // Default to Hebrew
            let textToTranslate;
            const userId = msg.key.participant || msg.key.remoteJid;
            
            // Determine what text to translate and target language
            if (textToTranslateFromQuoted) {
                // Translating quoted message
                textToTranslate = textToTranslateFromQuoted;
                
                // Check if args specify a target language
                if (args.length > 0) {
                    const possibleLangCode = translationService.parseLanguageCode(args[0]);
                    if (possibleLangCode) {
                        targetLang = possibleLangCode;
                    }
                }
            } else {
                // Translating provided text
                textToTranslate = args.join(' ');
                
                // Check if first argument is a language code
                const possibleLangCode = translationService.parseLanguageCode(args[0]);
                if (possibleLangCode && args.length > 1) {
                    targetLang = possibleLangCode;
                    textToTranslate = args.slice(1).join(' ');
                }
            }
            
            // Check if text contains URLs or emails - skip translation
            const urlRegex = /(?:https?:\/\/|www\.|ftp:\/\/|[\w-]+\.[\w.-]+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?)/gi;
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            
            if (urlRegex.test(textToTranslate)) {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: '🔗 Cannot translate URLs. Please provide regular text instead.' 
                });
                return true;
            }
            
            if (emailRegex.test(textToTranslate)) {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: '📧 Cannot translate email addresses. Please provide regular text instead.' 
                });
                return true;
            }
            
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `🌐 Translating to ${translationService.getSupportedLanguages()[targetLang] || targetLang}...` 
            });
            
            const result = await translationService.translateText(textToTranslate, targetLang, null, userId);
            
            // Simple clean response - just the translation
            const response = result.translatedText;
            
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: response 
            });
            
            console.log(`[${getTimestamp()}] ✅ Translation completed: ${result.detectedLanguage} → ${targetLang}`);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Translation failed:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Translation failed: ${error.message}\n\n💡 Note: Translation requires Google Translate API setup. Add GOOGLE_TRANSLATE_API_KEY to your environment.` 
            });
        }
        
        return true;
    }

    /**
     * Handle #ru command — translate replied message to Russian (admin only)
     */
    async handleTranslateRu(msg) {
        const adminPhone = config.ADMIN_PHONE; // '972544345287'
        const adminJid = `${adminPhone}@s.whatsapp.net`;

        // Identify sender (group message: participant; DM: remoteJid)
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderPhone = sender.split('@')[0].split(':')[0];
        const adminLid = config.ADMIN_LID || '';

        // Silent ignore for non-admins (check both phone and LID format)
        const isAdmin = senderPhone === adminPhone || senderPhone === adminLid;
        if (!isAdmin) return true;

        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const textToTranslate = quotedMessage?.conversation ||
            quotedMessage?.extendedTextMessage?.text ||
            quotedMessage?.imageMessage?.caption ||
            quotedMessage?.videoMessage?.caption;

        if (!textToTranslate) {
            await this.sock.sendMessage(adminJid, {
                text: '❌ #ru: Reply to a message to translate it to Russian'
            });
            return true;
        }

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const response = await openai.chat.completions.create({
                model: 'gpt-4.1-nano',
                messages: [
                    { role: 'system', content: 'Translate the following text to Russian. Return ONLY the translated text, no explanations.' },
                    { role: 'user', content: textToTranslate }
                ],
                max_completion_tokens: 500
            });

            const translation = response.choices[0]?.message?.content?.trim();
            if (!translation) throw new Error('Empty response from OpenAI');

            await this.sock.sendMessage(msg.key.remoteJid, { text: translation });
            console.log(`[${getTimestamp()}] ✅ #ru translation sent`);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ #ru translation failed:`, error);
            await this.sock.sendMessage(adminJid, {
                text: `❌ #ru error: ${error.message}`
            });
        }

        return true;
    }

    /**
     * Handle language list command
     */
    async handleLanguageList(msg, isAdmin) {
        try {
            const languages = translationService.getSupportedLanguages();
            
            let response = `🌐 *Supported Languages*\n\n`;
            response += `Use these codes with #translate:\n\n`;
            
            // Group languages for better readability
            const entries = Object.entries(languages);
            for (let i = 0; i < entries.length; i += 2) {
                const [code1, name1] = entries[i];
                const line = entries[i + 1] 
                    ? `• ${code1} = ${name1}\n• ${entries[i + 1][0]} = ${entries[i + 1][1]}\n`
                    : `• ${code1} = ${name1}\n`;
                response += line;
            }
            
            response += `\n💡 *Examples:*\n`;
            response += `• #translate he Hello world\n`;
            response += `• #translate עברית Good morning\n`;
            response += `• #translate fr Bonjour`;
            
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: response 
            });
            
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Language list failed:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Failed to get language list. Please try again later.' 
            });
        }
        
        return true;
    }

    /**
     * Handle translation toggle command (bot only)
     */
    async handleTranslationToggle(msg, args) {
        // Check if message is from the bot itself
        if (!msg.key.fromMe) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '🤖 Auto-translation settings can only be changed by the bot itself.' 
            });
            return true;
        }

        const argsString = Array.isArray(args) ? args.join(' ') : args;
        const command = argsString.toLowerCase();
        const config = require('../config');
        
        try {
            if (command === 'on' || command === 'enable') {
                config.FEATURES.AUTO_TRANSLATION = true;
                
                let response = `✅ *Auto-Translation Enabled*\n\n`;
                response += `🌐 Bot will now automatically translate non-Hebrew messages to Hebrew immediately\n\n`;
                response += `📋 *How it works:*\n`;
                response += `• When someone sends a non-Hebrew message\n`;
                response += `• Bot detects if ALL words are non-Hebrew\n`;
                response += `• Bot translates the message to Hebrew immediately\n`;
                response += `• Mixed Hebrew/non-Hebrew messages are ignored\n\n`;
                response += `⚙️ Use \`#autotranslate off\` to disable`;
                
                await this.sock.sendMessage(msg.key.remoteJid, { text: response });
                console.log(`[${getTimestamp()}] ✅ Auto-translation enabled by admin`);
                
            } else if (command === 'off' || command === 'disable') {
                config.FEATURES.AUTO_TRANSLATION = false;
                
                let response = `❌ *Auto-Translation Disabled*\n\n`;
                response += `🚫 Bot will no longer automatically translate messages\n\n`;
                response += `💡 Manual translation commands still work:\n`;
                response += `• \`#translate <text>\` - Translate to English\n`;
                response += `• \`#translate <lang> <text>\` - Translate to specific language\n\n`;
                response += `⚙️ Use \`#autotranslate on\` to re-enable`;
                
                await this.sock.sendMessage(msg.key.remoteJid, { text: response });
                console.log(`[${getTimestamp()}] ❌ Auto-translation disabled by admin`);
                
            } else if (command === 'status' || command === '') {
                const isEnabled = config.FEATURES.AUTO_TRANSLATION;
                
                let response = `🌐 *Auto-Translation Status*\n\n`;
                response += `📊 Current Status: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n`;
                
                if (isEnabled) {
                    response += `🎯 *Active Settings:*\n`;
                    response += `• Translates non-Hebrew messages → Hebrew immediately\n`;
                    response += `• Strict detection: ALL words must be non-Hebrew\n`;
                    response += `• Rate limited: 10 translations/minute per user\n`;
                    response += `• Minimum text length: 5 characters\n\n`;
                    response += `⚙️ Use \`#autotranslate off\` to disable`;
                } else {
                    response += `💡 *Available Commands:*\n`;
                    response += `• \`#autotranslate on\` - Enable auto-translation\n`;
                    response += `• \`#translate <text>\` - Manual translation still works\n`;
                }
                
                await this.sock.sendMessage(msg.key.remoteJid, { text: response });
                
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: '❌ Invalid option. Use:\n• `#autotranslate on` - Enable\n• `#autotranslate off` - Disable\n• `#autotranslate status` - Check status' 
                });
            }
            
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Translation toggle failed:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Failed to toggle auto-translation. Please try again later.' 
            });
        }
        
        return true;
    }

    // #free system removed - users must contact admin directly

    /**
     * Handle admin approval commands (ok/NO userId)
     */
    async handleAdminApproval(msg, command, args) {
        // Only allow in private chats
        if (!this.isPrivateChat(msg)) {
            return false;
        }

        try {
            const decision = command.toLowerCase().startsWith('yes') ? 'yes' : 'no';
            const targetUserId = typeof args === 'string' ? args.trim() : args[0];
            
            if (!targetUserId) {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `❌ Usage: \`${decision} <phone_number>\`\nExample: \`${decision} 972555123456\`` 
                });
                return true;
            }

            // Normalize the user ID
            const normalizedUserId = unblacklistRequestService.normalizeUserId(targetUserId);
            const fullUserId = normalizedUserId + '@s.whatsapp.net';

            // Process the admin response
            const adminPhone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
            const responseProcessed = await unblacklistRequestService.processAdminResponse(
                normalizedUserId, 
                decision, 
                adminPhone
            );

            if (responseProcessed) {
                if (decision === 'yes') {
                    // Approve: Remove from blacklist
                    const removed = await removeFromBlacklist(fullUserId);
                    
                    if (removed) {
                        // Notify admin
                        await this.sock.sendMessage(msg.key.remoteJid, { 
                            text: `✅ *Request APPROVED*\n\n` +
                                  `👤 User ${normalizedUserId} has been removed from blacklist.\n` +
                                  `📨 User has been notified.` 
                        });

                        // Get rejoin links for user
                        let rejoinMessage = `🎉 *Request Approved!*\n\n` +
                                          `✅ You have been removed from the blacklist.\n` +
                                          `📱 You can now rejoin groups.\n\n`;

                        try {
                            const { kickedUserService } = require('./kickedUserService');
                            // Get recent kicks only (last 30 days) for invite link spam
                            const rejoinInfo = await kickedUserService.getRejoinInfo(fullUserId, true, 'invite link');
                            
                            if (rejoinInfo && rejoinInfo.length > 0) {
                                // Only show the MOST RECENT group (first in sorted array)
                                const lastKick = rejoinInfo[0];
                                
                                if (lastKick.groupInviteLink && lastKick.groupInviteLink !== 'N/A') {
                                    const kickDate = new Date(lastKick.kickedAt).toLocaleDateString();
                                    rejoinMessage += `🔗 *Rejoin Your Last Group:*\n\n`;
                                    rejoinMessage += `📱 *${lastKick.groupName}*\n`;
                                    rejoinMessage += `📅 Kicked: ${kickDate}\n`;
                                    rejoinMessage += `🔗 ${lastKick.groupInviteLink}\n\n`;
                                    
                                    // Include admin list if available
                                    if (lastKick.adminList && lastKick.adminList.length > 0) {
                                        rejoinMessage += `👥 *Group Admins (if link fails):*\n`;
                                        lastKick.adminList.slice(0, 3).forEach((admin, index) => {
                                            if (admin.isLID) {
                                                rejoinMessage += `${index + 1}️⃣ ${admin.name} (${admin.phone})\n`;
                                            } else {
                                                rejoinMessage += `${index + 1}️⃣ ${admin.name}\n`;
                                            }
                                        });
                                        
                                        if (lastKick.adminList.length > 3) {
                                            rejoinMessage += `   ...and ${lastKick.adminList.length - 3} more admins\n`;
                                        }
                                        rejoinMessage += '\n';
                                    }
                                    
                                    rejoinMessage += `⚠️ *Important Notes:*\n`;
                                    rejoinMessage += `• Link may require admin approval\n`;
                                    rejoinMessage += `• Link may have expired - contact group admin if it fails\n`;
                                    rejoinMessage += `• Wait a few minutes before attempting to rejoin\n\n`;
                                    
                                    if (rejoinInfo.length > 1) {
                                        rejoinMessage += `📋 For other groups, contact your admin or use group search.\n\n`;
                                    }
                                } else {
                                    rejoinMessage += `⚠️ *Last group's invite link is not available.*\n\n`;
                                }
                            } else {
                                rejoinMessage += `ℹ️ *No recent rejoin links available.*\n`;
                                rejoinMessage += `This may be because:\n`;
                                rejoinMessage += `• No recent kicks for invite link violations\n`;
                                rejoinMessage += `• Group invite links have expired\n`;
                                rejoinMessage += `• More than 30 days have passed\n\n`;
                            }
                        } catch (error) {
                            console.warn('⚠️ Failed to get rejoin links:', error.message);
                        }

                        rejoinMessage += `⚠️ *Important:* Remember your agreement to never share invite links in groups.\n` +
                                       `🚫 Sharing invite links will result in immediate re-blacklisting.\n\n` +
                                       `🎉 *הבקשה אושרה!*\n\n` +
                                       `✅ הוסרת מהרשימה השחורה.\n` +
                                       `📱 אתה יכול עכשיו להצטרף לקבוצות.\n\n` +
                                       `⚠️ *חשוב:* זכור את ההסכם שלך לעולם לא לשלוח קישורי הזמנה בקבוצות.\n` +
                                       `🚫 שליחת קישורי הזמנה תגרום להכנסה מיידית לרשימה השחורה.`;

                        // Notify user
                        await this.sock.sendMessage(fullUserId, { 
                            text: rejoinMessage 
                        }).catch(() => {
                            console.log(`Could not notify user ${normalizedUserId} - they may have blocked the bot`);
                        });

                        console.log(`[${getTimestamp()}] ✅ Admin ${adminPhone} approved unblacklist for ${normalizedUserId}`);
                    } else {
                        await this.sock.sendMessage(msg.key.remoteJid, { 
                            text: `❌ Failed to remove ${normalizedUserId} from blacklist. They may not be blacklisted.` 
                        });
                    }
                } else {
                    // Deny: Keep on blacklist
                    await this.sock.sendMessage(msg.key.remoteJid, { 
                        text: `❌ *Request DENIED*\n\n` +
                              `👤 User ${normalizedUserId} remains on blacklist.\n` +
                              `📨 User has been notified.` 
                    });

                    // Notify user
                    await this.sock.sendMessage(fullUserId, { 
                        text: `❌ *Request Denied*\n\n` +
                              `🚫 Your unblacklist request has been denied.\n` +
                              `📅 You can submit a new request in 24 hours.\n\n` +
                              `💡 Please ensure you understand and agree to follow all group rules before requesting again.\n\n` +
                              `❌ *הבקשה נדחתה*\n\n` +
                              `🚫 בקשת הסרה מהרשימה השחורה שלך נדחתה.\n` +
                              `📅 אתה יכול להגיש בקשה חדשה בעוד 24 שעות.\n\n` +
                              `💡 אנא ודא שאתה מבין ומסכים לכל כללי הקבוצה לפני הגשת בקשה שוב.` 
                    }).catch(() => {
                        console.log(`Could not notify user ${normalizedUserId} - they may have blocked the bot`);
                    });

                    console.log(`[${getTimestamp()}] ❌ Admin ${adminPhone} denied unblacklist for ${normalizedUserId}`);
                }
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `❌ Failed to process response. User ${normalizedUserId} may not have a pending request.` 
                });
            }

        } catch (error) {
            console.error(`❌ Error handling admin approval:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Error processing admin response. Please try again.' 
            });
        }

        return true;
    }

    async handleJokeStats(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        try {
            const { motivationalPhraseService } = require('./motivationalPhraseService');
            const stats = await motivationalPhraseService.getPhraseStats();

            let report = `📊 *Joke Statistics*\n\n`;
            report += `📚 Total Phrases: ${stats.totalPhrases}\n`;
            report += `✅ Used Phrases: ${stats.usedPhrases}\n`;
            report += `🎭 Total Usage: ${stats.totalUsages}\n\n`;

            if (stats.mostUsed) {
                report += `🏆 *Most Popular:*\n`;
                report += `"${stats.mostUsed.text}" (${stats.mostUsed.count} times)\n\n`;
            }

            if (stats.leastUsed) {
                report += `🆕 *Least Used:*\n`;
                report += `"${stats.leastUsed.text}" (${stats.leastUsed.count} times)\n\n`;
            }

            report += `💡 *Usage:* Reply to "משעמם" messages triggers random jokes`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: report });

        } catch (error) {
            console.error('❌ Error fetching joke stats:', error.message);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Error fetching joke statistics. Please try again.' 
            });
        }

        return true;
    }

    async handleRejoinLinks(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Usage: #rejoinlinks <phone_number>\nExample: #rejoinlinks 972555123456' 
            });
            return true;
        }

        try {
            const argsString = Array.isArray(args) ? args.join(' ') : args;
            const phoneNumber = argsString.trim();
            const userId = `${phoneNumber}@s.whatsapp.net`;
            const { kickedUserService } = require('./kickedUserService');

            // Get all kick records for this user
            const allKicks = await kickedUserService.getRejoinInfo(userId, false); // Get all, not just recent
            
            if (!allKicks || allKicks.length === 0) {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `ℹ️ No kick records found for ${phoneNumber}` 
                });
                return true;
            }

            let report = `📋 *Rejoin Links for ${phoneNumber}*\n\n`;
            
            allKicks.forEach((kick, index) => {
                const kickDate = new Date(kick.kickedAt).toLocaleDateString();
                const canRejoinStatus = kick.canRejoin ? '✅ Ready' : '⏳ Pending approval';
                
                report += `${index + 1}️⃣ *${kick.groupName}*\n`;
                report += `   📅 Kicked: ${kickDate}\n`;
                report += `   🔍 Reason: ${kick.reason}\n`;
                report += `   🎯 Status: ${canRejoinStatus}\n`;
                
                if (kick.canRejoin && kick.groupInviteLink && kick.groupInviteLink !== 'N/A') {
                    report += `   🔗 Link: ${kick.groupInviteLink}\n`;
                }
                
                report += '\n';
            });

            report += `📊 *Summary:* ${allKicks.length} total kicks, ${allKicks.filter(k => k.canRejoin).length} ready for rejoin`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: report });

        } catch (error) {
            console.error('❌ Error fetching rejoin links:', error.message);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Error fetching rejoin links. Please try again.' 
            });
        }

        return true;
    }


    /**
     * Handle jokes enable command
     */
    async handleJokesOn(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in groups
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ This command can only be used in groups.' 
            });
            return true;
        }

        try {
            const groupId = msg.key.remoteJid;
            const senderPhone = (msg.key.participant || msg.key.remoteJid).split('@')[0];
            
            // Get group metadata for name
            let groupName = 'Unknown';
            try {
                const groupMetadata = await this.getCachedGroupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown';
            } catch (error) {
                console.log(`Could not get group metadata: ${error.message}`);
            }

            const success = await groupJokeSettingsService.setJokesEnabled(groupId, true, senderPhone, groupName);
            
            if (success) {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `🎭✅ בדיחות משעמם הופעלו בקבוצה!\n\nכשמישהו כותב "משעמם", הבוט יענה עם בדיחה.` 
                });
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `⚠️ בדיחות הופעלו מקומית, אך עדכון Firebase נכשל. ההגדרה תאבד בהפעלה מחדש.` 
                });
            }
        } catch (error) {
            console.error('Error enabling jokes:', error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ שגיאה בהפעלת בדיחות. נסה שוב.' 
            });
        }

        return true;
    }

    /**
     * Handle jokes disable command
     */
    async handleJokesOff(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in groups
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ הפקודה הזו פועלת רק בקבוצות.' 
            });
            return true;
        }

        try {
            const groupId = msg.key.remoteJid;
            const senderPhone = (msg.key.participant || msg.key.remoteJid).split('@')[0];
            
            // Get group metadata for name
            let groupName = 'Unknown';
            try {
                const groupMetadata = await this.getCachedGroupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown';
            } catch (error) {
                console.log(`Could not get group metadata: ${error.message}`);
            }

            const success = await groupJokeSettingsService.setJokesEnabled(groupId, false, senderPhone, groupName);
            
            if (success) {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `🎭❌ בדיחות משעמם כובו בקבוצה!\n\nהבוט יתעלם מהודעות "משעמם" בקבוצה זו.` 
                });
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: `⚠️ בדיחות כובו מקומית, אך עדכון Firebase נכשל. ההגדרה תאבד בהפעלה מחדש.` 
                });
            }
        } catch (error) {
            console.error('Error disabling jokes:', error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ שגיאה בכיבוי בדיחות. נסה שוב.' 
            });
        }

        return true;
    }

    /**
     * Handle jokes status command
     */
    async handleJokesStatus(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in groups
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ הפקודה הזו פועלת רק בקבוצות.' 
            });
            return true;
        }

        try {
            const groupId = msg.key.remoteJid;
            
            // Get group metadata for name
            let groupName = 'Unknown';
            try {
                const groupMetadata = await this.getCachedGroupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown';
            } catch (error) {
                console.log(`Could not get group metadata: ${error.message}`);
            }

            const jokesEnabled = await groupJokeSettingsService.areJokesEnabled(groupId);
            const settings = await groupJokeSettingsService.getGroupSettings(groupId);
            
            let statusText = `🎭 *סטטוס בדיחות עבור: ${groupName}*\n\n`;
            statusText += `מצב: ${jokesEnabled ? '✅ מופעל' : '❌ כבוי'}\n`;
            
            if (settings.updated_at) {
                const updateDate = new Date(settings.updated_at).toLocaleString('he-IL');
                statusText += `עודכן לאחרונה: ${updateDate}\n`;
                statusText += `עודכן על ידי: +${settings.updated_by}\n`;
            } else {
                statusText += `מצב: ברירת מחדל (ללא שינויים)\n`;
            }
            
            statusText += `\n💡 *פקודות:*\n`;
            statusText += `• #jokeson - הפעל בדיחות משעמם\n`;
            statusText += `• #jokesoff - כבה בדיחות משעמם\n`;
            statusText += `• #jokesstatus - הצג מצב נוכחי`;
            
            await this.sock.sendMessage(msg.key.remoteJid, { text: statusText });
            
        } catch (error) {
            console.error('Error getting joke status:', error);
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ שגיאה באחזור סטטוס בדיחות. נסה שוב.' 
            });
        }

        return true;
    }
    
    /**
     * Handle #msg1 command - Send pre-written admin warning message
     */
    async handleMsg1(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ פקודה זו מיועדת למנהלים בלבד.' 
            });
            return true;
        }
        
        const warningMessage = `🚨 אזהרת הבוט! 🚨
רק מי שיש לו כתר אדמין 👑 יכול לשלוח הזמנה לקבוצת וואטסאפ כאן.
כל השאר — שלחתם קישור? הבוט מוחק את ההודעה, ואתכם שולח ל"חדר מחשבות" מחוץ לקבוצה 🚪🤔
עשו לעצמכם טובה, תשאירו את ההזמנות לאדמינים!

🤡🚷
#רק_אהבה_ולא_הזמנות`;

        await this.sock.sendMessage(msg.key.remoteJid, { text: warningMessage });
        return true;
    }

    /**
     * Handle #markmine command - Mark group as owned by admin
     * Usage: #markmine [category] [notes]
     * Example: #markmine family Main family group
     */
    async handleMarkMine(msg, isAdmin, args = []) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in groups
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ This command can only be used in groups.'
            });
            return true;
        }

        try {
            const groupId = msg.key.remoteJid;

            // Parse optional category and notes from args
            const validCategories = ['personal', 'business', 'community', 'family', 'friends', 'hobby', 'education', 'work', 'other'];
            let category = null;
            let notes = null;

            if (args && args.length > 0) {
                const firstArg = args[0].toLowerCase();
                if (validCategories.includes(firstArg)) {
                    category = firstArg;
                    notes = args.slice(1).join(' ') || null;
                } else {
                    // All args are notes
                    notes = args.join(' ');
                }
            }

            const success = await groupService.markMine(groupId, category, notes);

            if (success) {
                let response = '✅ This group has been marked as yours!';
                if (category) {
                    response += `\n📂 Category: ${category}`;
                }
                if (notes) {
                    response += `\n📝 Notes: ${notes}`;
                }
                await this.sock.sendMessage(msg.key.remoteJid, { text: response });
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Failed to mark group. Make sure database is connected.'
                });
            }
        } catch (error) {
            console.error('Error marking group as mine:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error marking group. Check logs for details.'
            });
        }

        return true;
    }

    /**
     * Handle #unmarkmine command - Unmark group as owned
     */
    async handleUnmarkMine(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in groups
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ This command can only be used in groups.'
            });
            return true;
        }

        try {
            const groupId = msg.key.remoteJid;
            const success = await groupService.unmarkMine(groupId);

            if (success) {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '✅ This group has been unmarked.'
                });
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Failed to unmark group.'
                });
            }
        } catch (error) {
            console.error('Error unmarking group:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error unmarking group. Check logs for details.'
            });
        }

        return true;
    }

    /**
     * Handle #mygroups command - List all owned groups
     * Usage: #mygroups [category]
     * Example: #mygroups family
     */
    async handleMyGroups(msg, isAdmin, args = []) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in private chat
        if (msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ This command can only be used in private chat for privacy.'
            });
            return true;
        }

        try {
            // Optional category filter
            const categoryFilter = args && args.length > 0 ? args[0].toLowerCase() : null;

            const myGroups = await groupService.getMyGroups(categoryFilter);

            if (myGroups.length === 0) {
                const noGroupsMsg = categoryFilter
                    ? `📋 *Your Groups - ${categoryFilter}*\n\nNo groups found in this category.\n\nUse #categories to see all categories.`
                    : '📋 *Your Groups*\n\nYou haven\'t marked any groups yet.\n\nUse #markmine in a group to mark it as yours.';

                await this.sock.sendMessage(msg.key.remoteJid, { text: noGroupsMsg });
                return true;
            }

            const title = categoryFilter ? `📋 *Your Groups - ${categoryFilter}* (${myGroups.length})` : `📋 *Your Groups* (${myGroups.length})`;
            let responseText = `${title}\n\n`;

            // Group by category if not filtering
            if (!categoryFilter) {
                let currentCategory = null;
                myGroups.forEach((group, index) => {
                    const groupCategory = group.category || 'Uncategorized';
                    if (groupCategory !== currentCategory) {
                        currentCategory = groupCategory;
                        const emoji = this.getCategoryEmoji(groupCategory);
                        responseText += `\n${emoji} *${groupCategory.toUpperCase()}*\n`;
                    }

                    responseText += `  ${index + 1}. ${group.name}\n`;
                    responseText += `     👥 ${group.member_count || 0} members`;
                    if (group.admin_count) {
                        responseText += ` | 👑 ${group.admin_count} admins`;
                    }
                    responseText += `\n`;
                    if (group.notes) {
                        responseText += `     📝 ${group.notes}\n`;
                    }
                });
            } else {
                // Show flat list when filtering by category
                myGroups.forEach((group, index) => {
                    responseText += `${index + 1}. *${group.name}*\n`;
                    responseText += `   👥 Members: ${group.member_count || 0}`;
                    if (group.admin_count) {
                        responseText += ` | 👑 Admins: ${group.admin_count}`;
                    }
                    responseText += `\n`;
                    if (group.notes) {
                        responseText += `   📝 ${group.notes}\n`;
                    }
                    responseText += `\n`;
                });
            }

            responseText += `\n💡 *Quick Stats:*\n`;
            responseText += `Total Groups: ${myGroups.length}\n`;
            const totalMembers = myGroups.reduce((sum, g) => sum + (g.member_count || 0), 0);
            responseText += `Total Members: ${totalMembers}\n`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: responseText });

        } catch (error) {
            console.error('Error getting my groups:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error fetching your groups. Check logs for details.'
            });
        }

        return true;
    }

    /**
     * Get emoji for category
     */
    getCategoryEmoji(category) {
        const emojiMap = {
            'personal': '👤',
            'business': '💼',
            'community': '🏘️',
            'family': '👨‍👩‍👧‍👦',
            'friends': '👥',
            'hobby': '🎨',
            'education': '📚',
            'work': '🏢',
            'other': '📂',
            'uncategorized': '❓'
        };
        return emojiMap[category.toLowerCase()] || '📂';
    }

    /**
     * Handle #setcategory command - Set category for current group
     * Usage: #setcategory <category>
     * Example: #setcategory family
     */
    async handleSetCategory(msg, args, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in groups
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ This command can only be used in groups.'
            });
            return true;
        }

        if (!args || args.length === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: `📂 *Set Category*

Usage: #setcategory <category>

*Valid categories:*
👤 personal
💼 business
🏘️ community
👨‍👩‍👧‍👦 family
👥 friends
🎨 hobby
📚 education
🏢 work
📂 other

Example: #setcategory family`
            });
            return true;
        }

        try {
            const category = args[0].toLowerCase();
            const groupId = msg.key.remoteJid;

            const success = await groupService.setCategory(groupId, category);

            if (success) {
                const emoji = this.getCategoryEmoji(category);
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ Category set to: ${emoji} *${category}*`
                });
            } else {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Failed to set category. Make sure it\'s a valid category.\n\nUse #setcategory without arguments to see valid categories.'
                });
            }
        } catch (error) {
            console.error('Error setting category:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error setting category. Check logs for details.'
            });
        }

        return true;
    }

    /**
     * Handle #categories command - Show category statistics
     */
    async handleCategories(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        // Only works in private chat
        if (msg.key.remoteJid.endsWith('@g.us')) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ This command can only be used in private chat for privacy.'
            });
            return true;
        }

        try {
            const stats = await groupService.getCategoryStats();

            if (stats.length === 0) {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: '📂 *Categories*\n\nNo groups marked yet.\n\nUse #markmine in a group to get started!'
                });
                return true;
            }

            let responseText = '📂 *Your Group Categories*\n\n';

            stats.forEach((stat) => {
                const emoji = this.getCategoryEmoji(stat.category);
                const count = parseInt(stat.count);
                const members = parseInt(stat.total_members) || 0;

                responseText += `${emoji} *${stat.category}*\n`;
                responseText += `   Groups: ${count} | Members: ${members}\n\n`;
            });

            const totalGroups = stats.reduce((sum, s) => sum + parseInt(s.count), 0);
            const totalMembers = stats.reduce((sum, s) => sum + (parseInt(s.total_members) || 0), 0);

            responseText += `\n📊 *Totals:*\n`;
            responseText += `Groups: ${totalGroups} | Members: ${totalMembers}\n\n`;
            responseText += `💡 Use #mygroups <category> to filter by category`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: responseText });

        } catch (error) {
            console.error('Error getting categories:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error fetching categories. Check logs for details.'
            });
        }

        return true;
    }

    /**
     * Handle #memory or #memcheck command - Quick memory status check
     */
    async handleMemoryCheck(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        try {
            const stats = memoryMonitor.getMemoryStats();
            const health = memoryMonitor.getMemoryHealth(stats);
            const trend = memoryMonitor.getMemoryTrend();

            const statusText = `${health.emoji} *MEMORY STATUS*\n\n` +
                `*Health:* ${health.status}\n` +
                `*Trend:* ${trend.direction} ${trend.trend}\n\n` +
                `*System Memory:*\n` +
                `• Used: ${stats.system.usedGB}GB / ${stats.system.totalGB}GB (${stats.system.usedPercent}%)\n` +
                `• Free: ${stats.system.freeGB}GB\n\n` +
                `*Bot Memory:*\n` +
                `• RSS: ${stats.process.rssMB}MB\n` +
                `• Heap: ${stats.process.heapUsedMB}MB / ${stats.process.heapTotalMB}MB\n\n` +
                `⏰ ${getTimestamp()}`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: statusText });
            console.log(`[${getTimestamp()}] ✅ Memory check sent to admin`);
            return true;
        } catch (error) {
            console.error('Error checking memory:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error checking memory. Check logs for details.'
            });
            return false;
        }
    }

    /**
     * Handle #memreport command - Detailed memory report with leak detection
     */
    async handleMemoryReport(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        try {
            // Generate comprehensive memory report
            const memReport = memoryMonitor.generateReport();
            const leakReport = memoryLeakDetector.generateReport();

            const fullReport = `${memReport}\n\n${'─'.repeat(40)}\n\n${leakReport}`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: fullReport });
            console.log(`[${getTimestamp()}] ✅ Full memory report sent to admin`);
            return true;
        } catch (error) {
            console.error('Error generating memory report:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error generating memory report. Check logs for details.'
            });
            return false;
        }
    }

    /**
     * Handle #gc or #clearmem command - Force garbage collection
     */
    async handleForceGC(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: this.getRandomSassyResponse()
            });
            return true;
        }

        try {
            const beforeStats = memoryMonitor.getMemoryStats();
            const beforeHeap = beforeStats.process.heapUsedMB;

            // Attempt garbage collection
            const freed = memoryMonitor.forceGarbageCollection();

            const afterStats = memoryMonitor.getMemoryStats();
            const afterHeap = afterStats.process.heapUsedMB;
            const actualFreed = beforeHeap - afterHeap;

            let resultText;
            if (freed === 0) {
                resultText = `⚠️ *Garbage Collection Not Available*\n\n` +
                    `To enable GC, restart the bot with:\n` +
                    `\`node --expose-gc index.js\`\n\n` +
                    `Current heap: ${afterHeap}MB`;
            } else {
                resultText = `🧹 *Garbage Collection Complete*\n\n` +
                    `*Before:* ${beforeHeap}MB\n` +
                    `*After:* ${afterHeap}MB\n` +
                    `*Freed:* ${actualFreed}MB\n\n` +
                    `System memory: ${afterStats.system.usedPercent}%\n` +
                    `⏰ ${getTimestamp()}`;
            }

            await this.sock.sendMessage(msg.key.remoteJid, { text: resultText });
            console.log(`[${getTimestamp()}] ✅ GC command executed`);
            return true;
        } catch (error) {
            console.error('Error forcing GC:', error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Error forcing garbage collection. Check logs for details.'
            });
            return false;
        }
    }

    async handleGroupSelectionResponse(msg, selection) {
        const senderPhone = msg.key.remoteJid.split('@')[0];
        const pendingBanKey = `pending_global_ban_${senderPhone}`;
        const pendingBan = global[pendingBanKey];

        if (!pendingBan) {
            return false; // No pending ban found
        }

        console.log(`[${require('../utils/logger').getTimestamp()}] 🌍 Processing group selection: ${selection}`);

        try {
            const { executeGlobalBanOnSelectedGroups, formatSelectedGroupsBanReport } = require('../utils/globalBanHelper');

            // Send processing message
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: `⏳ Processing your selection...\nThis may take a few minutes.`
            });

            let selectedGroupIds = [];

            if (selection.toLowerCase() === 'all') {
                // Use all groups from the map
                if (!global.groupSelectionMap) {
                    await this.sock.sendMessage(msg.key.remoteJid, {
                        text: `❌ Group selection expired. Please run #kickglobal again.`
                    });
                    delete global[pendingBanKey];
                    return true;
                }
                selectedGroupIds = global.groupSelectionMap.map(g => g.groupId);
                console.log(`[${require('../utils/logger').getTimestamp()}] 🌍 Selected ALL groups (${selectedGroupIds.length})`);
            } else {
                // Parse selected numbers
                const numbers = selection.split(',').map(n => parseInt(n.trim()));
                console.log(`[${require('../utils/logger').getTimestamp()}] 🌍 Selected group numbers: ${numbers.join(', ')}`);

                if (!global.groupSelectionMap) {
                    await this.sock.sendMessage(msg.key.remoteJid, {
                        text: `❌ Group selection expired. Please run #kickglobal again.`
                    });
                    delete global[pendingBanKey];
                    return true;
                }

                // Convert numbers to group IDs
                for (const num of numbers) {
                    const group = global.groupSelectionMap.find(g => g.index === num);
                    if (group) {
                        selectedGroupIds.push(group.groupId);
                    } else {
                        console.log(`[${require('../utils/logger').getTimestamp()}] ⚠️ Invalid group number: ${num}`);
                    }
                }

                if (selectedGroupIds.length === 0) {
                    await this.sock.sendMessage(msg.key.remoteJid, {
                        text: `❌ No valid groups selected. Please try again with valid group numbers.`
                    });
                    return true;
                }

                // Safety warning if more than 10 groups
                if (selectedGroupIds.length > 10) {
                    await this.sock.sendMessage(msg.key.remoteJid, {
                        text: `⚠️ *Warning:* You selected ${selectedGroupIds.length} groups.\n` +
                              `For safety, it's recommended to limit to 10 groups at a time.\n\n` +
                              `Reply "continue" to proceed anyway, or send new selection.`
                    });

                    // Store the selection and wait for confirmation
                    global[`${pendingBanKey}_needs_confirm`] = selectedGroupIds;
                    return true;
                }
            }

            // Execute the ban
            const report = await executeGlobalBanOnSelectedGroups(
                this.sock,
                pendingBan.targetUserId,
                selectedGroupIds,
                pendingBan.userPhone
            );

            // Send report
            const reportMessage = formatSelectedGroupsBanReport(report);
            await this.sock.sendMessage(msg.key.remoteJid, { text: reportMessage });

            // Cleanup
            delete global[pendingBanKey];
            delete global.groupSelectionMap;

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Global ban completed`);
            return true;

        } catch (error) {
            console.error(`[${require('../utils/logger').getTimestamp()}] ❌ Error processing group selection:`, error);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Error processing selection: ${error.message}`
            });
            delete global[pendingBanKey];
            return false;
        }
    }

    // =========================================================================
    // BULLYWATCH FEEDBACK SYSTEM (Redis-Based)
    // =========================================================================

    /**
     * Show last 10 flagged messages for admin review
     * Command: #bullywatch review
     */
    async handleBullywatchReview(msg, groupId) {
        const { getTimestamp } = require('../utils/logger');

        try {
            // Try to use Redis, fallback to in-memory
            let flaggedMessages = [];
            let source = 'memory';

            try {
                const { getRedis, isRedisConnected } = require('./redisService');

                if (isRedisConnected()) {
                    const redis = getRedis();
                    const messagesJson = await redis.lrange('bullywatch:flagged', 0, 9); // Last 10
                    flaggedMessages = messagesJson.map(json => JSON.parse(json));
                    source = 'Redis';
                }
            } catch (redisError) {
                console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback`);
                // Fallback to in-memory (stored in global object)
                if (!global.bullywatchFlagged) global.bullywatchFlagged = [];
                flaggedMessages = global.bullywatchFlagged.slice(-10).reverse();
            }

            if (flaggedMessages.length === 0) {
                await this.sock.sendMessage(groupId, {
                    text: '📭 No flagged messages to review.\n\nFlagged messages will appear here when bullying is detected.',
                    quoted: msg
                });
                return true;
            }

            // Format review message
            let reviewMessage = `🎯 *BULLYWATCH REVIEW*\n`;
            reviewMessage += `📊 Source: ${source}\n`;
            reviewMessage += `📝 Showing ${flaggedMessages.length} flagged messages\n\n`;

            flaggedMessages.forEach((item, index) => {
                const { id, timestamp, groupName, senderName, messageText, matchedWords, verdict } = item;
                const timeAgo = Math.floor((Date.now() - timestamp) / 60000); // minutes ago
                const verdictEmoji = verdict === 'true_positive' ? '✅' :
                                   verdict === 'false_positive' ? '❌' :
                                   verdict === 'low' ? '🟢' :
                                   verdict === 'medium' ? '🟡' :
                                   verdict === 'high' ? '🔴' : '⏳';

                reviewMessage += `━━━━━━━━━━━━━━━━\n`;
                reviewMessage += `🆔 ID: ${id}\n`;
                reviewMessage += `⏰ ${timeAgo}m ago\n`;
                reviewMessage += `👥 Group: ${groupName}\n`;
                reviewMessage += `👤 User: ${senderName}\n`;
                reviewMessage += `💬 Message: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"\n`;
                reviewMessage += `🚩 Words: ${matchedWords.join(', ')}\n`;
                reviewMessage += `${verdictEmoji} Status: ${verdict || 'Pending'}\n\n`;
            });

            reviewMessage += `━━━━━━━━━━━━━━━━\n`;
            reviewMessage += `📝 *Provide Feedback:*\n`;
            reviewMessage += `#bullywatch feedback <id> <verdict>\n\n`;
            reviewMessage += `Verdicts: true_positive | false_positive | low | medium | high`;

            await this.sock.sendMessage(groupId, {
                text: reviewMessage,
                quoted: msg
            });

            console.log(`[${getTimestamp()}] 📊 Bullywatch review sent (${flaggedMessages.length} items from ${source})`);

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to handle bullywatch review:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to retrieve flagged messages. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    /**
     * Store admin feedback for flagged message
     * Command: #bullywatch feedback <id> <verdict>
     */
    async handleBullywatchFeedback(msg, args, groupId) {
        const { getTimestamp } = require('../utils/logger');

        // Parse command: #bullywatch feedback <id> <verdict>
        const messageId = args[1];
        const verdict = args[2];

        if (!messageId || !verdict) {
            await this.sock.sendMessage(groupId, {
                text: '❌ *Usage:* #bullywatch feedback <id> <verdict>\n\n' +
                      'Verdicts:\n' +
                      '  • true_positive - Correctly flagged bullying\n' +
                      '  • false_positive - Incorrectly flagged (not bullying)\n' +
                      '  • low - Low severity bullying\n' +
                      '  • medium - Medium severity bullying\n' +
                      '  • high - High severity bullying\n\n' +
                      'Example: #bullywatch feedback msg_123 true_positive',
                quoted: msg
            });
            return true;
        }

        const validVerdicts = ['true_positive', 'false_positive', 'low', 'medium', 'high'];
        if (!validVerdicts.includes(verdict)) {
            await this.sock.sendMessage(groupId, {
                text: `❌ Invalid verdict: ${verdict}\n\n` +
                      `Valid verdicts: ${validVerdicts.join(' | ')}`,
                quoted: msg
            });
            return true;
        }

        try {
            let updated = false;
            let source = 'memory';

            // Try Redis first, fallback to in-memory
            try {
                const { getRedis, isRedisConnected } = require('./redisService');

                if (isRedisConnected()) {
                    const redis = getRedis();

                    // Find message by ID and update verdict
                    const messagesJson = await redis.lrange('bullywatch:flagged', 0, -1);

                    for (let i = 0; i < messagesJson.length; i++) {
                        const message = JSON.parse(messagesJson[i]);

                        if (message.id === messageId) {
                            // Update verdict and timestamp
                            message.verdict = verdict;
                            message.feedbackTimestamp = Date.now();

                            // Update in Redis list
                            await redis.lset('bullywatch:flagged', i, JSON.stringify(message));

                            // Store in feedback hash for metrics
                            await redis.hset('bullywatch:feedback', messageId, JSON.stringify({
                                verdict,
                                timestamp: Date.now(),
                                messageId
                            }));

                            updated = true;
                            source = 'Redis';
                            break;
                        }
                    }
                }
            } catch (redisError) {
                console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback`);
                // Fallback to in-memory
                if (!global.bullywatchFlagged) global.bullywatchFlagged = [];

                const message = global.bullywatchFlagged.find(m => m.id === messageId);
                if (message) {
                    message.verdict = verdict;
                    message.feedbackTimestamp = Date.now();
                    updated = true;
                }
            }

            if (updated) {
                await this.sock.sendMessage(groupId, {
                    text: `✅ Feedback recorded!\n\n` +
                          `🆔 Message ID: ${messageId}\n` +
                          `📊 Verdict: ${verdict}\n` +
                          `💾 Stored in: ${source}\n\n` +
                          `Use #bullywatch metrics to view accuracy stats.`,
                    quoted: msg
                });

                console.log(`[${getTimestamp()}] ✅ Bullywatch feedback recorded: ${messageId} → ${verdict} (${source})`);
            } else {
                await this.sock.sendMessage(groupId, {
                    text: `❌ Message ID not found: ${messageId}\n\n` +
                          `Use #bullywatch review to see available message IDs.`,
                    quoted: msg
                });
            }

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to store feedback:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to store feedback. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    /**
     * Store admin suggestion for new offensive word
     * Command: #bullywatch suggest <word>
     */
    async handleBullywatchSuggest(msg, args, groupId) {
        const { getTimestamp } = require('../utils/logger');

        // Parse command: #bullywatch suggest <word>
        const word = args.slice(1).join(' ').trim();

        if (!word) {
            await this.sock.sendMessage(groupId, {
                text: '❌ *Usage:* #bullywatch suggest <word>\n\n' +
                      'Example: #bullywatch suggest חנון\n\n' +
                      'Suggested words will be reviewed and added to the offensive words database.',
                quoted: msg
            });
            return true;
        }

        try {
            let source = 'memory';

            // Try Redis first, fallback to in-memory
            try {
                const { getRedis, isRedisConnected } = require('./redisService');

                if (isRedisConnected()) {
                    const redis = getRedis();

                    // Store in sorted set with score = timestamp (for ordering)
                    const score = Date.now();
                    await redis.zadd('bullywatch:suggestions', score, JSON.stringify({
                        word,
                        timestamp: score,
                        suggestedBy: msg.key.participant || msg.key.remoteJid
                    }));

                    source = 'Redis';
                }
            } catch (redisError) {
                console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback`);
                // Fallback to in-memory
                if (!global.bullywatchSuggestions) global.bullywatchSuggestions = [];
                global.bullywatchSuggestions.push({
                    word,
                    timestamp: Date.now(),
                    suggestedBy: msg.key.participant || msg.key.remoteJid
                });
            }

            await this.sock.sendMessage(groupId, {
                text: `✅ Word suggestion recorded!\n\n` +
                      `📝 Word: "${word}"\n` +
                      `💾 Stored in: ${source}\n\n` +
                      `Thank you for helping improve bullying detection!`,
                quoted: msg
            });

            console.log(`[${getTimestamp()}] 📝 Bullywatch word suggestion: "${word}" (${source})`);

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to store suggestion:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to store suggestion. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    /**
     * Calculate and display accuracy metrics from feedback data
     * Command: #bullywatch metrics
     */
    async handleBullywatchMetrics(msg, groupId) {
        const { getTimestamp } = require('../utils/logger');

        try {
            let feedbackData = [];
            let source = 'memory';

            // Try Redis first, fallback to in-memory
            try {
                const { getRedis, isRedisConnected } = require('./redisService');

                if (isRedisConnected()) {
                    const redis = getRedis();
                    const feedbackHash = await redis.hgetall('bullywatch:feedback');

                    feedbackData = Object.values(feedbackHash).map(json => JSON.parse(json));
                    source = 'Redis';
                }
            } catch (redisError) {
                console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback`);
                // Fallback to in-memory
                if (!global.bullywatchFlagged) global.bullywatchFlagged = [];
                feedbackData = global.bullywatchFlagged.filter(m => m.verdict);
            }

            if (feedbackData.length === 0) {
                await this.sock.sendMessage(groupId, {
                    text: '📊 *No feedback data available yet.*\n\n' +
                          'Use #bullywatch feedback to provide verdicts on flagged messages.',
                    quoted: msg
                });
                return true;
            }

            // Calculate metrics
            const total = feedbackData.length;
            const truePositives = feedbackData.filter(f => f.verdict === 'true_positive').length;
            const falsePositives = feedbackData.filter(f => f.verdict === 'false_positive').length;
            const low = feedbackData.filter(f => f.verdict === 'low').length;
            const medium = feedbackData.filter(f => f.verdict === 'medium').length;
            const high = feedbackData.filter(f => f.verdict === 'high').length;

            const accuracy = total > 0 ? ((truePositives / total) * 100).toFixed(1) : 0;
            const falsePositiveRate = total > 0 ? ((falsePositives / total) * 100).toFixed(1) : 0;

            let metricsMessage = `📊 *BULLYWATCH METRICS*\n\n`;
            metricsMessage += `💾 Source: ${source}\n`;
            metricsMessage += `📈 Total Feedback: ${total}\n\n`;
            metricsMessage += `━━━━━━━━━━━━━━━━\n`;
            metricsMessage += `✅ True Positives: ${truePositives} (${((truePositives/total)*100).toFixed(1)}%)\n`;
            metricsMessage += `❌ False Positives: ${falsePositives} (${falsePositiveRate}%)\n\n`;
            metricsMessage += `🟢 Low Severity: ${low}\n`;
            metricsMessage += `🟡 Medium Severity: ${medium}\n`;
            metricsMessage += `🔴 High Severity: ${high}\n\n`;
            metricsMessage += `━━━━━━━━━━━━━━━━\n`;
            metricsMessage += `🎯 Detection Accuracy: ${accuracy}%\n`;
            metricsMessage += `⚠️  False Positive Rate: ${falsePositiveRate}%\n\n`;

            // Recommendations based on metrics
            if (parseFloat(falsePositiveRate) > 20) {
                metricsMessage += `⚠️  *High false positive rate detected.*\n`;
                metricsMessage += `Consider reviewing detection thresholds.\n\n`;
            } else if (parseFloat(accuracy) > 85) {
                metricsMessage += `✨ *Excellent detection accuracy!*\n\n`;
            }

            metricsMessage += `Use #bullywatch export to download full data.`;

            await this.sock.sendMessage(groupId, {
                text: metricsMessage,
                quoted: msg
            });

            console.log(`[${getTimestamp()}] 📊 Bullywatch metrics sent (${total} feedback items from ${source})`);

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to calculate metrics:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to calculate metrics. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    /**
     * Export feedback data as CSV
     * Command: #bullywatch export
     */
    async handleBullywatchExport(msg, groupId) {
        const { getTimestamp } = require('../utils/logger');

        try {
            let flaggedMessages = [];
            let source = 'memory';

            // Try Redis first, fallback to in-memory
            try {
                const { getRedis, isRedisConnected } = require('./redisService');

                if (isRedisConnected()) {
                    const redis = getRedis();
                    const messagesJson = await redis.lrange('bullywatch:flagged', 0, -1);
                    flaggedMessages = messagesJson.map(json => JSON.parse(json));
                    source = 'Redis';
                }
            } catch (redisError) {
                console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback`);
                // Fallback to in-memory
                if (!global.bullywatchFlagged) global.bullywatchFlagged = [];
                flaggedMessages = global.bullywatchFlagged;
            }

            if (flaggedMessages.length === 0) {
                await this.sock.sendMessage(groupId, {
                    text: '📭 No data to export.\n\nFlagged messages will be available for export once bullying is detected.',
                    quoted: msg
                });
                return true;
            }

            // Generate CSV
            let csv = 'ID,Timestamp,Group Name,Sender Name,Message,Matched Words,Verdict,Feedback Timestamp\n';

            flaggedMessages.forEach(item => {
                const { id, timestamp, groupName, senderName, messageText, matchedWords, verdict, feedbackTimestamp } = item;

                // Escape CSV fields (handle commas and quotes)
                const escapeCSV = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

                csv += [
                    escapeCSV(id),
                    escapeCSV(new Date(timestamp).toISOString()),
                    escapeCSV(groupName),
                    escapeCSV(senderName),
                    escapeCSV(messageText),
                    escapeCSV(matchedWords.join('; ')),
                    escapeCSV(verdict || 'pending'),
                    escapeCSV(feedbackTimestamp ? new Date(feedbackTimestamp).toISOString() : 'N/A')
                ].join(',') + '\n';
            });

            // Send CSV as text (WhatsApp limitation - can't send files via Baileys easily)
            const exportMessage = `📊 *BULLYWATCH DATA EXPORT*\n\n` +
                                 `💾 Source: ${source}\n` +
                                 `📝 Total Records: ${flaggedMessages.length}\n` +
                                 `📅 Export Date: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n\n` +
                                 `━━━━━━━━━━━━━━━━\n\n` +
                                 `\`\`\`${csv}\`\`\`\n\n` +
                                 `💡 Copy the CSV data above and save as .csv file.`;

            await this.sock.sendMessage(groupId, {
                text: exportMessage,
                quoted: msg
            });

            console.log(`[${getTimestamp()}] 📤 Bullywatch export sent (${flaggedMessages.length} records from ${source})`);

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to export data:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to export data. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    /**
     * List pending word suggestions for admin review
     * Command: #bullywatch suggestions
     */
    async handleBullywatchSuggestions(msg, groupId) {
        const { getTimestamp } = require('../utils/logger');

        try {
            let suggestions = [];
            let source = 'memory';

            // Try Redis first, fallback to in-memory
            try {
                const { getRedis, isRedisConnected } = require('./redisService');

                if (isRedisConnected()) {
                    const redis = getRedis();
                    // Get all suggestions from sorted set (sorted by timestamp)
                    const suggestionsJson = await redis.zrange('bullywatch:suggestions', 0, -1);
                    suggestions = suggestionsJson.map(json => JSON.parse(json));
                    source = 'Redis';
                }
            } catch (redisError) {
                console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback`);
                // Fallback to in-memory
                if (!global.bullywatchSuggestions) global.bullywatchSuggestions = [];
                suggestions = global.bullywatchSuggestions;
            }

            if (suggestions.length === 0) {
                await this.sock.sendMessage(groupId, {
                    text: '📭 No pending word suggestions.\n\n' +
                          'Use #bullywatch suggest <word> to suggest new offensive words.',
                    quoted: msg
                });
                return true;
            }

            // Format suggestions message
            let suggestionsMessage = `📝 *PENDING WORD SUGGESTIONS*\n\n`;
            suggestionsMessage += `💾 Source: ${source}\n`;
            suggestionsMessage += `📊 Total: ${suggestions.length}\n\n`;

            suggestions.slice(0, 20).forEach((item, index) => {
                const { word, timestamp, suggestedBy } = item;
                const timeAgo = Math.floor((Date.now() - timestamp) / 60000); // minutes ago
                const phone = suggestedBy?.split('@')[0] || 'Unknown';

                suggestionsMessage += `${index + 1}. "${word}"\n`;
                suggestionsMessage += `   ⏰ ${timeAgo}m ago | 👤 ${phone}\n\n`;
            });

            if (suggestions.length > 20) {
                suggestionsMessage += `... and ${suggestions.length - 20} more\n\n`;
            }

            suggestionsMessage += `━━━━━━━━━━━━━━━━\n`;
            suggestionsMessage += `📝 *Approve Words:*\n`;
            suggestionsMessage += `#bullywatch approve <word> <category>\n\n`;
            suggestionsMessage += `Categories: sexual_harassment | general_insult | social_exclusion | direct_threat | privacy_threat`;

            await this.sock.sendMessage(groupId, {
                text: suggestionsMessage,
                quoted: msg
            });

            console.log(`[${getTimestamp()}] 📝 Bullywatch suggestions sent (${suggestions.length} items from ${source})`);

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to list suggestions:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to retrieve suggestions. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }

    /**
     * Approve and add suggested word to lexicon at runtime
     * Command: #bullywatch approve <word> <category>
     */
    async handleBullywatchApprove(msg, args, groupId) {
        const { getTimestamp } = require('../utils/logger');

        // Parse command: #bullywatch approve <word> <category>
        const word = args[1];
        const category = args[2] || 'general_insult'; // Default category

        if (!word) {
            await this.sock.sendMessage(groupId, {
                text: '❌ *Usage:* #bullywatch approve <word> <category>\n\n' +
                      'Categories:\n' +
                      '  • sexual_harassment (score: 16)\n' +
                      '  • general_insult (score: 4)\n' +
                      '  • social_exclusion (score: 10)\n' +
                      '  • direct_threat (score: 18)\n' +
                      '  • privacy_threat (score: 14)\n\n' +
                      'Example: #bullywatch approve חנון general_insult',
                quoted: msg
            });
            return true;
        }

        const validCategories = ['sexual_harassment', 'general_insult', 'social_exclusion', 'direct_threat', 'privacy_threat', 'self_harm'];
        if (!validCategories.includes(category)) {
            await this.sock.sendMessage(groupId, {
                text: `❌ Invalid category: ${category}\n\n` +
                      `Valid categories: ${validCategories.join(' | ')}`,
                quoted: msg
            });
            return true;
        }

        try {
            const lexiconService = require('./bullywatch/lexiconService');
            const adminPhone = msg.key.participant?.split('@')[0] || msg.key.remoteJid.split('@')[0];

            // Add word to lexicon at runtime
            const result = lexiconService.addWordRuntime(word, category, {
                source: 'admin_approval',
                approvedBy: adminPhone
            });

            if (result.success) {
                // Remove from suggestions if it was there
                try {
                    const { getRedis, isRedisConnected } = require('./redisService');

                    if (isRedisConnected()) {
                        const redis = getRedis();
                        // Remove matching suggestion from sorted set
                        const suggestionsJson = await redis.zrange('bullywatch:suggestions', 0, -1);
                        for (const json of suggestionsJson) {
                            const suggestion = JSON.parse(json);
                            if (suggestion.word === word) {
                                await redis.zrem('bullywatch:suggestions', json);
                                break;
                            }
                        }
                    } else {
                        // In-memory fallback
                        if (global.bullywatchSuggestions) {
                            global.bullywatchSuggestions = global.bullywatchSuggestions.filter(s => s.word !== word);
                        }
                    }
                } catch (redisError) {
                    // Non-critical error - word still added to lexicon
                    console.log(`[${getTimestamp()}] ⚠️  Could not remove from suggestions: ${redisError.message}`);
                }

                await this.sock.sendMessage(groupId, {
                    text: `✅ Word added to lexicon!\n\n` +
                          `📝 Word: "${word}"\n` +
                          `🏷️  Category: ${category}\n` +
                          `🎯 Score: ${result.entry.score}\n` +
                          `👤 Approved by: ${adminPhone}\n\n` +
                          `The bot will now detect this word in messages immediately (no restart needed).`,
                    quoted: msg
                });

                console.log(`[${getTimestamp()}] ✅ Word approved and added to lexicon: "${word}" (category: ${category}, approved by: ${adminPhone})`);
            } else {
                await this.sock.sendMessage(groupId, {
                    text: `❌ Failed to add word to lexicon.\n\nError: ${result.error}`,
                    quoted: msg
                });
            }

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to approve word:`, error);
            await this.sock.sendMessage(groupId, {
                text: '❌ Failed to add word to lexicon. Check logs for details.',
                quoted: msg
            });
        }

        return true;
    }
}

module.exports = CommandHandler;