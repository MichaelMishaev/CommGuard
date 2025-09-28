const config = require('../config');
const { addToBlacklist, removeFromBlacklist, listBlacklist, isBlacklisted } = require('./blacklistService');
const { addToWhitelist, removeFromWhitelist, listWhitelist, isWhitelisted } = require('./whitelistService');
const { addMutedUser, removeMutedUser, isMuted, getMutedUsers } = require('./muteService');
const { getTimestamp } = require('../utils/logger');
const { sendKickAlert } = require('../utils/alertService');
const searchService = require('./searchService');
const { translationService } = require('./translationService');
const groupJokeSettingsService = require('./groupJokeSettingsService');

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
        
        try {
            switch (cmd) {
                case '#help':
                    return await this.handleHelp(msg);
                    
                case '#status':
                    return await this.handleStatus(msg);
                    
                case '#mute':
                    return await this.handleMute(msg, args, isAdmin);
                    
                case '#unmute':
                    return await this.handleUnmute(msg, args, isAdmin);
                    
                case '#clear':
                    return await this.handleClear(msg, isAdmin);
                    
                case '#kick':
                    return await this.handleKick(msg, isAdmin);
                    
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
                    return await this.handleBlacklistRemove(msg, args, isAdmin);
                    
                case '#blacklst':
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
        // Check if sender is the authorized admin
        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderPhone = senderId.split('@')[0];
        const isPrivateChat = !msg.key.remoteJid.endsWith('@g.us');
        
        // Check if it's admin (handle both regular and LID format)
        const isAdminPhone = senderPhone === config.ALERT_PHONE || 
                           senderPhone === config.ADMIN_PHONE ||
                           senderId.includes(config.ALERT_PHONE) ||
                           senderId.includes(config.ADMIN_PHONE);
        
        // Check if it's specifically the alert phone
        const isAlertPhone = senderPhone === config.ALERT_PHONE || 
                            senderId.includes(config.ALERT_PHONE);
        
        // ONLY allow help command in private chat from admin
        if (!isPrivateChat) {
            // In groups, don't reveal anything about the help command
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Unknown command.' 
            });
            return true;
        }
        
        // In private chat, check if it's the admin
        if (!isAdminPhone) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: this.getRandomSassyResponse()
            });
            return true;
        }
        
        // Special detailed help for alert phone
        if (isAlertPhone) {
            const detailedHelpText = `📝 *CommGuard Bot - FULL COMMAND REFERENCE*

*✅ WORKING COMMANDS:*

*🔧 Basic Commands:*
• *#status* - Shows bot online status, ID, version, and configuration
• *#stats* - Displays group statistics (members, admins, etc)
• *#help* - This command list (private chat only)
• *#msg1* - Send pre-written admin warning about invite links

*👮 Moderation Commands:*
• *#kick* - Reply to message → Kicks user + deletes their message + adds to blacklist (bot only)
• *#ban* - Reply to message → Permanently bans user (same as kick but called ban)
• *#clear* - ⚠️ NOT IMPLEMENTED (will show "not yet implemented")

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
• *#unblacklist 972555123456* - Removes from blacklist
• *#blacklst* - Shows all blacklisted numbers
• *#botkick* - Scans current group and kicks all blacklisted members

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

*🌐 Translation Commands (✅ CONFIGURED & READY):*
• *#translate <text>* - Translate to English (auto-detect source)
• *#translate <lang> <text>* - Translate to specific language
• *#langs* - Show supported language codes (20+ languages)
• *#autotranslate <on/off/status>* - Control auto-translation (bot only)
• **Auto-Translation** - Bot automatically translates non-Hebrew messages to Hebrew immediately
• **Smart Detection** - Only translates pure non-Hebrew (ignores mixed Hebrew/English)

*🎭 Entertainment Commands:*
• *#jokestats* - View motivational phrase usage statistics
• *#jokeson* - Enable משעמם jokes for this group
• *#jokesoff* - Disable משעמם jokes for this group
• *#jokesstatus* - Show joke settings for this group
• **Automatic Jokes** - Bot responds to "משעמם" with funny Hebrew jokes (125+ jokes)

*🚨 AUTO-PROTECTION FEATURES:*
1. **Invite Link Detection** ✅
   - All users: Immediate kick + blacklist (no warnings)
   - Always: Message deleted + Admin alert
   - Detects: chat.whatsapp.com links

2. **Blacklist Auto-Kick** ✅
   - When blacklisted user joins → Instant kick
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

*⚙️ SPECIAL BEHAVIORS:*
• Bot needs admin to work (bypass enabled for LID issues)
• #kick now deletes the target message too
• All kicks add user to blacklist automatically
• Muted users kicked after 10 messages
• Session errors handled automatically

*🔒 SECURITY NOTES:*
• #help only works in private chat
• #help shows "Unknown command" in groups
• Only admin phones can access commands
• Alert phone: ${config.ALERT_PHONE} (YOU)
• Admin phone: ${config.ADMIN_PHONE}

*📱 BOT STATUS:*
• Version: 2.1 (Baileys + Enhanced Nationality System)
• Firebase: ${config.FEATURES.FIREBASE_INTEGRATION ? 'Enabled (Optimized)' : 'Disabled'}
• Blacklist System: ${config.FEATURES.AUTO_KICK_BLACKLISTED ? 'Enabled (24hr Cache)' : 'Disabled'}
• Bot Admin Bypass: ${config.FEATURES.BYPASS_BOT_ADMIN_CHECK ? 'Enabled' : 'Disabled'}
• Country Restrictions: ${config.FEATURES.RESTRICT_COUNTRY_CODES ? 'Enabled' : 'Disabled'}

*🛡️ Bot is protecting your groups 24/7!*`;

            await this.sock.sendMessage(msg.key.remoteJid, { text: detailedHelpText });
        } else {
            // Regular help text for admin phone
            const helpText = `📝 *CommGuard Bot Commands*

*🔧 Basic Commands:*
• *#status* - Check bot status and configuration
• *#stats* - Show group statistics
• *#msg1* - Send admin warning about invite links

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
• *#unblacklist [number]* - Remove from blacklist
• *#blacklst* - List blacklisted numbers
• *#botkick* - Scan group and kick all blacklisted users

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

*🚨 Auto-Protection Features:*
• **Invite Link Detection** - Auto-kick + blacklist
• **Blacklist Enforcement** - Auto-kick banned users
• **Country Code Restriction** - Auto-kick +1 and +6 numbers
• **Whitelist Protection** - Bypass all restrictions
• **Anti-Boredom System** - Responds to "משעמם" with Hebrew jokes (per-group control)

*💡 Usage Examples:*
• Kick user: Bot-only automated moderation
• Mute group: \`#mute 30\` (30 minutes)
• Add to whitelist: \`#whitelist 972555123456\`
• Remove all foreign users: \`#botforeign\`
• Get jokes: Any message with "משעמם" → Bot responds with humor
• View joke stats: \`#jokestats\`
• Control jokes: \`#jokesoff\` → Disable jokes in this group
• Enable jokes: \`#jokeson\` → Enable jokes in this group
• Check joke status: \`#jokesstatus\` → Show current settings
• Translate text: \`#translate שלום עולם\` → "Hello world" ✅ READY
• Translate to Hebrew: \`#translate he Good morning\` → "בוקר טוב" ✅ READY
• Auto-translate: Send "Hello world" → Bot shows Hebrew translation immediately ✅ ACTIVE
• Control auto-translate: \`#autotranslate off\` → Bot only ✅ READY

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
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `⚠️ Please reply to a message to mute that user.\n` +
                      `⚠️ אנא השב להודעה כדי להשתיק את המשתמש.`
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

        // Primary method - extendedTextMessage with contextInfo (most common)
        if (msg.message?.extendedTextMessage?.contextInfo) {
            const contextInfo = msg.message.extendedTextMessage.contextInfo;

            // The participant field contains the user who sent the quoted message
            targetUserId = contextInfo.participant;

            // Get message ID from stanzaId
            messageId = contextInfo.stanzaId;

            // Store the full context for later use
            quotedMsg = contextInfo;

            console.log(`[${require('../utils/logger').getTimestamp()}] ✅ Found quoted message via extendedTextMessage`);
        }

        console.log(`[${require('../utils/logger').getTimestamp()}] 🔍 Kick command analysis:`, {
            hasQuotedMsg: !!quotedMsg,
            hasParticipant: !!targetUserId,
            participant: targetUserId,
            messageId: messageId,
            messageType: Object.keys(msg.message || {})[0]
        });

        if (!quotedMsg || !targetUserId) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ Please reply to a message from the user you want to kick.\n\nUsage: Reply to a user\'s message and type #kick'
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

            // Add to blacklist (no group message sent)
            const { addToBlacklist } = require('./blacklistService');
            await addToBlacklist(targetUserId, 'Kicked by admin command');

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
                additionalInfo: 'Kicked by admin using #kick command',
                groupInviteLink: groupInviteLink
            });

            // Send notification to admin instead of user
            try {
                await this.sock.sendMessage('0544345287@s.whatsapp.net', {
                    text: `👮‍♂️ User kicked by admin command\n\n` +
                          `👤 User: ${targetUserId}\n` +
                          `📍 Group: ${groupMetadata?.subject || 'Unknown Group'}\n` +
                          `📱 Reason: Manual kick by admin\n` +
                          `⏰ Time: ${new Date().toLocaleString()}`
                });
                console.log(`✅ Admin notification sent for kicked user: ${targetUserId}`);
            } catch (notificationError) {
                console.error(`Failed to send admin notification:`, notificationError.message);
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

    async handleClear(msg, isAdmin) {
        if (!isAdmin) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: 'מה אני עובד אצלך?!' 
            });
            return true;
        }

        // Check if in private chat
        if (this.isPrivateChat(msg)) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ The #clear command can only be used in groups.\n\nUsage: In a group, type #clear to clear recent messages' 
            });
            return true;
        }

        await this.sock.sendMessage(msg.key.remoteJid, { 
            text: '⚠️ Clear command not yet implemented in Baileys version.' 
        });
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

        // Check if this is a reply to another message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        if (!quotedMsg || !quotedMsg.participant) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please reply to a message from the user you want to ban.\n\nUsage: Reply to a user\'s message and type #ban' 
            });
            return true;
        }

        const groupId = msg.key.remoteJid;
        const targetUserId = quotedMsg.participant;
        
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
                    await this.sock.sendMessage('0544345287@s.whatsapp.net', {
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
                        await this.sock.sendMessage('0544345287@s.whatsapp.net', {
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

        if (!args) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '⚠️ Please provide a phone number. Example: #unblacklist 972555123456' 
            });
            return true;
        }

        const { removeFromBlacklist } = require('./blacklistService');
        const success = await removeFromBlacklist(args);
        if (success) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ Removed ${args} from blacklist.` 
            });
        } else {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Failed to remove ${args} from blacklist.` 
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

        const { blacklistCache } = require('./blacklistService');
        if (blacklistCache.size === 0) {
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: '📝 Blacklist is empty.' 
            });
        } else {
            const list = Array.from(blacklistCache).slice(0, 50).map((num, index) => `${index + 1}. ${num}`).join('\n');
            const totalCount = blacklistCache.size;
            const message = totalCount > 50 
                ? `📝 *Blacklisted Users (showing first 50 of ${totalCount}):*\n\n${list}` 
                : `📝 *Blacklisted Users (${totalCount} total):*\n\n${list}`;
            await this.sock.sendMessage(msg.key.remoteJid, { text: message });
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
                        await this.sock.sendMessage('0544345287@s.whatsapp.net', {
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
}

module.exports = CommandHandler;