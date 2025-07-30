const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { logger, getTimestamp } = require('./utils/logger');
const config = require('./config');

// Conditionally load Firebase services only if enabled
let blacklistService, whitelistService, muteService;
if (config.FEATURES.FIREBASE_INTEGRATION) {
    const blacklistModule = require('./services/blacklistService');
    const whitelistModule = require('./services/whitelistService');
    const muteModule = require('./services/muteService');
    
    blacklistService = {
        loadBlacklistCache: blacklistModule.loadBlacklistCache,
        isBlacklisted: blacklistModule.isBlacklisted,
        addToBlacklist: blacklistModule.addToBlacklist
    };
    whitelistService = {
        loadWhitelistCache: whitelistModule.loadWhitelistCache,
        isWhitelisted: whitelistModule.isWhitelisted
    };
    muteService = {
        loadMutedUsers: muteModule.loadMutedUsers,
        isMuted: muteModule.isMuted,
        incrementMutedMessageCount: muteModule.incrementMutedMessageCount
    };
} else {
    // Mock services when Firebase is disabled
    blacklistService = {
        loadBlacklistCache: async () => { console.log('📋 Firebase disabled - skipping blacklist cache load'); },
        isBlacklisted: () => false,
        addToBlacklist: async () => { console.log('📋 Firebase disabled - blacklist add skipped'); }
    };
    whitelistService = {
        loadWhitelistCache: async () => { console.log('📋 Firebase disabled - skipping whitelist cache load'); },
        isWhitelisted: () => false
    };
    muteService = {
        loadMutedUsers: async () => { console.log('📋 Firebase disabled - skipping muted users load'); },
        isMuted: () => false,
        incrementMutedMessageCount: async () => { console.log('📋 Firebase disabled - mute count skipped'); }
    };
}

const CommandHandler = require('./services/commandHandler');
const { handleSessionError, clearSessionErrors, mightContainInviteLink, extractMessageText } = require('./utils/sessionManager');

// Track kicked users to prevent spam
const kickCooldown = new Map();

// Track reconnection attempts
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Create a custom logger for Baileys with minimal output
const baileysLogger = {
    ...pino({ 
        level: 'error',
        timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    }),
    child: () => baileysLogger,
    level: 'error',
    // Override logging methods to filter messages
    error: function(...args) {
        // Check if it's a decryption error we want to hide
        if (args[0] && typeof args[0] === 'object') {
            const msg = args[0].msg || '';
            const err = args[0].err || {};
            
            // Skip these common non-critical errors but track them
            if (msg.includes('failed to decrypt') || 
                msg.includes('processing offline nodes') ||
                err.message?.includes('No SenderKeyRecord') ||
                err.message?.includes('Bad MAC') ||
                err.message?.includes('Invalid PreKey') ||
                err.message?.includes('Received message with old counter') ||
                err.message?.includes('No session found to decrypt') ||
                err.type === 'PreKeyError') {
                
                // Track decryption failures for monitoring
                const userId = args[0].key?.participant || args[0].key?.remoteJid || 'unknown';
                console.log(`[${getTimestamp()}] 🔐 Decryption failed for ${userId} - ${err.message || msg}`);
                return; // Don't spam logs with full error details
            }
        }
        // Log other errors normally
        console.error(...args);
    },
    info: () => {},  // Suppress info logs
    warn: () => {},  // Suppress warnings
    debug: () => {}, // Suppress debug logs
    trace: () => {}, // Suppress trace logs
    fatal: console.error // Keep fatal errors
};

// Main function to start the bot
async function startBot() {
    // Load all caches
    await blacklistService.loadBlacklistCache();
    await whitelistService.loadWhitelistCache();
    await muteService.loadMutedUsers();
    
    console.log(`[${getTimestamp()}] 🔄 Starting bot connection (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    // Use multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // Get latest version with error handling
    let version;
    try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        console.log(`[${getTimestamp()}] 📱 Using WhatsApp Web version: ${version}`);
    } catch (error) {
        console.warn(`[${getTimestamp()}] ⚠️ Failed to fetch latest version, using default`);
        version = [2, 2413, 1]; // Fallback version
    }
    
    // Create socket connection with improved configuration
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false, // We'll handle QR display manually
        logger: baileysLogger,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 60000, // 60 seconds timeout
        keepAliveIntervalMs: 30000, // Send keep-alive every 30 seconds
        connectTimeoutMs: 60000, // 60 seconds connection timeout
        emitOwnEvents: false,
        browser: ['CommGuard Bot', 'Chrome', '120.0.0'], // Updated browser info
    });
    
    // Save credentials whenever updated
    sock.ev.on('creds.update', saveCreds);
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        
        if (qr) {
            console.log('\n📱 Scan this QR code to connect:\n');
            qrcode.generate(qr, { small: true });
            console.log('\n⏳ Waiting for QR code scan...');
        }
        
        if (connection === 'close') {
            const disconnectReason = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
            
            console.error(`\n[${getTimestamp()}] ❌ Connection closed:`);
            console.error(`   Error: ${errorMessage}`);
            console.error(`   Status Code: ${disconnectReason}`);
            
            // Check if it's error 515
            if (errorMessage.includes('515') || disconnectReason === 515) {
                console.error(`\n[${getTimestamp()}] 🚨 Stream Error 515 detected!`);
                console.log('This is a known issue with WhatsApp Web connections.');
                console.log('Attempting workaround...\n');
            }
            
            // Check if it's a conflict error (status 440)
            if (disconnectReason === 440 || errorMessage.includes('conflict') || errorMessage.includes('replaced')) {
                console.log(`\n[${getTimestamp()}] ⚠️ Connection conflict detected - another instance may be running`);
                console.log('This happens when WhatsApp detects multiple connections.');
                console.log('The bot will reconnect automatically...\n');
            }
            
            const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
            
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                
                // Calculate delay with exponential backoff
                let delayMs;
                if (disconnectReason === 515) {
                    // For error 515, use longer delays
                    delayMs = Math.min(60000 * reconnectAttempts, 300000); // Up to 5 minutes
                } else if (disconnectReason === 440) {
                    // For conflict errors, use moderate delay
                    delayMs = 10000; // 10 seconds
                } else {
                    delayMs = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), 60000); // Standard exponential backoff
                }
                
                console.log(`[${getTimestamp()}] 🔄 Reconnecting in ${delayMs / 1000} seconds (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                
                // Clear auth if too many 515 errors or session issues
                if ((disconnectReason === 515 && reconnectAttempts > 3) ||
                    (errorMessage.includes('session') && reconnectAttempts > 5) ||
                    (errorMessage.includes('decrypt') && reconnectAttempts > 5)) {
                    console.log(`[${getTimestamp()}] 🗑️ Clearing authentication data for fresh start...`);
                    console.log(`   Reason: ${errorMessage.includes('515') ? 'Stream Error 515' : 'Session/Decryption errors'}`);
                    try {
                        const fs = require('fs').promises;
                        await fs.rm('baileys_auth_info', { recursive: true, force: true });
                        reconnectAttempts = 0; // Reset counter for fresh auth
                        console.log(`[${getTimestamp()}] ✅ Authentication data cleared - will require QR scan`);
                    } catch (err) {
                        console.error('Failed to clear auth:', err);
                    }
                }
                
                setTimeout(startBot, delayMs);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.error(`\n[${getTimestamp()}] ❌ Max reconnection attempts reached. Please restart the bot manually.`);
                console.log('\nTroubleshooting tips:');
                console.log('1. Delete the "baileys_auth_info" folder and restart');
                console.log('2. Make sure you\'re not logged in on too many devices');
                console.log('3. Try using a different WhatsApp account');
                console.log('4. Check if WhatsApp Web is working in your browser');
                process.exit(1);
            } else {
                console.log(`\n[${getTimestamp()}] 📱 Bot logged out. Please restart to reconnect.`);
                process.exit(0);
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0; // Reset counter on successful connection
            console.log(`\n[${getTimestamp()}] ✅ Bot connected successfully!`);
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}`);
            console.log(`Bot Platform: ${sock.user.platform || 'Unknown'}`);
            
            // Store bot phone for later use
            const botPhone = sock.user.id.split(':')[0].split('@')[0];
            sock.botPhone = botPhone;
            console.log(`Bot Phone: ${botPhone}`);
            
            console.log(`\n🛡️ CommGuard Bot (Baileys Edition) is now protecting your groups!`);
            
            // Send startup notification
            try {
                const adminId = config.ADMIN_PHONE + '@s.whatsapp.net';
                await sock.sendMessage(adminId, { 
                    text: `🟢 CommGuard Bot Started\n\nBot is now online and monitoring groups.\nTime: ${getTimestamp()}` 
                });
            } catch (err) {
                console.error('Failed to send startup notification:', err.message);
            }
        } else if (connection === 'connecting') {
            console.log(`[${getTimestamp()}] 🔄 Connecting to WhatsApp...`);
        }
    });
    
    // Initialize command handler
    const commandHandler = new CommandHandler(sock);
    
    // Helper function to send message with retry logic
    async function sendMessageWithRetry(jid, content, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                await sock.sendMessage(jid, content);
                return true;
            } catch (error) {
                if (error.message?.includes('Connection Closed') || 
                    error.message?.includes('precondition')) {
                    console.log(`[${getTimestamp()}] ⚠️ Message send failed (attempt ${i + 1}/${retries}), retrying...`);
                    await delay(1000 * (i + 1)); // Exponential backoff
                } else {
                    throw error; // Non-recoverable error
                }
            }
        }
        console.error(`[${getTimestamp()}] ❌ Failed to send message after ${retries} attempts`);
        return false;
    }
    
    // Make sendMessageWithRetry available to command handler
    sock.sendMessageWithRetry = sendMessageWithRetry;

    // Handle incoming messages with improved error handling
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Only process new messages
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            try {
                await handleMessage(sock, msg, commandHandler);
            } catch (error) {
                // Handle session errors specifically
                if (error.message?.includes('decrypt') || 
                    error.message?.includes('session') ||
                    error.message?.includes('Bad MAC')) {
                    
                    const result = await handleSessionError(sock, error, msg);
                    
                    // If suspicious activity detected, take action
                    if (result.suspicious && msg.key.remoteJid.endsWith('@g.us')) {
                        console.log(`🚨 Suspicious encrypted message in group - potential invite spam`);
                        
                        try {
                            // Try to delete the message as a precaution
                            await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                            console.log('✅ Deleted suspicious encrypted message');
                            
                            // Alert admin with retry
                            const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
                            const alertMessage = `🚨 *Suspicious Activity Detected*\n\n` +
                                               `📍 Group: ${msg.key.remoteJid}\n` +
                                               `👤 User: ${result.userId}\n` +
                                               `🔒 Issue: Multiple decryption failures\n` +
                                               `⚠️ Possible invite spam via encrypted message\n` +
                                               `⏰ Time: ${getTimestamp()}\n\n` +
                                               `Action taken: Message deleted as precaution`;
                            await sendMessageWithRetry(adminId, { text: alertMessage });
                        } catch (deleteError) {
                            console.error('Failed to handle suspicious message:', deleteError.message);
                        }
                    }
                    
                    // Retry if needed
                    if (result.retry) {
                        try {
                            await handleMessage(sock, msg, commandHandler);
                        } catch (retryError) {
                            console.error('Retry failed:', retryError.message);
                        }
                    }
                } else {
                    console.error(`Error handling message:`, error);
                }
            }
        }
    });
    
    // Handle group participant updates
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (action === 'add') {
            await handleGroupJoin(sock, id, participants);
        }
    });
    
    return sock;
}

// Handle incoming messages
async function handleMessage(sock, msg, commandHandler) {
    // Check if it's a group or private message
    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    const isPrivate = msg.key.remoteJid.endsWith('@s.whatsapp.net');
    
    // Skip if not from group or private chat
    if (!isGroup && !isPrivate) return;
    
    // Skip if from self
    if (msg.key.fromMe) return;
    
    // Skip if no message content
    if (!msg.message) return;
    
    // Extract message text with improved handling
    const messageText = extractMessageText(msg);
    
    // Skip if no text UNLESS it might contain invite link
    if (!messageText && !mightContainInviteLink(msg)) return;
    
    // Clear session errors on successful message
    const senderId = msg.key.participant || msg.key.remoteJid;
    if (messageText) {
        clearSessionErrors(senderId);
    }

    const chatId = msg.key.remoteJid;
    
    // Handle private message commands from admin
    if (isPrivate) {
        const senderPhone = senderId.split('@')[0];
        
        // Log all private messages to console
        console.log(`\n[${getTimestamp()}] 📱 Private Message Received:`);
        console.log(`   From: ${senderPhone} (${senderId})`);
        console.log(`   Text: ${messageText || '[No text content]'}`);
        console.log(`   Message Type: ${Object.keys(msg.message || {}).join(', ')}`);
        
        // Check if it's admin (handle both regular and LID format)
        const isAdmin = senderPhone === config.ALERT_PHONE || 
                       senderPhone === config.ADMIN_PHONE ||
                       senderId.includes(config.ALERT_PHONE) ||
                       senderId.includes(config.ADMIN_PHONE);
        
        console.log(`   Is Admin: ${isAdmin ? '✅ Yes' : '❌ No'}`);
        
        // Only process commands from admin in private
        if (isAdmin && messageText && messageText.startsWith('#')) {
            console.log(`   Command Detected: ${messageText}`);
            
            const parts = messageText.trim().split(/\s+/);
            const command = parts[0];
            const args = parts.slice(1).join(' ');
            
            // Allow all commands in private from admin
            const handled = await commandHandler.handleCommand(msg, command, args, true, true);
            if (handled) {
                console.log(`   Command Handled: ✅ Successfully`);
                return;
            }
            
            // If command wasn't handled, show unknown command
            console.log(`   Command Handled: ❌ Unknown command`);
            await sock.sendMessage(chatId, { 
                text: '❌ Unknown command. Use #help to see available commands.' 
            });
        }
        return;
    }
    
    // Continue with group message handling
    const groupId = chatId;

    // Check if user is whitelisted (whitelisted users bypass all restrictions)
    if (await whitelistService.isWhitelisted(senderId)) {
        return;
    }

    // Get group metadata for admin checking
    let groupMetadata, isAdmin = false, isSuperAdmin = false;
    try {
        groupMetadata = await sock.groupMetadata(groupId);
        
        // Check if sender is admin
        const senderParticipant = groupMetadata.participants.find(p => p.id === senderId);
        isAdmin = senderParticipant && (
            senderParticipant.admin === 'admin' || 
            senderParticipant.admin === 'superadmin' ||
            senderParticipant.isAdmin || 
            senderParticipant.isSuperAdmin
        );
        isSuperAdmin = senderParticipant && (
            senderParticipant.admin === 'superadmin' ||
            senderParticipant.isSuperAdmin
        );
    } catch (error) {
        console.error('Failed to get group metadata:', error);
        return;
    }

    // Check if group is muted (only allow admin messages)
    if (commandHandler.isGroupMuted(groupId) && !isAdmin) {
        try {
            await sock.sendMessage(groupId, { delete: msg.key });
            console.log(`[${getTimestamp()}] 🔇 Deleted message from non-admin in muted group`);
        } catch (error) {
            console.error('Failed to delete message in muted group:', error);
        }
        return;
    }

    // Check if user is individually muted
    if (await muteService.isMuted(senderId) && !isAdmin) {
        try {
            await sock.sendMessage(groupId, { delete: msg.key });
            const msgCount = await muteService.incrementMutedMessageCount(senderId);
            console.log(`[${getTimestamp()}] 🔇 Deleted message from muted user (${msgCount} messages deleted)`);
            
            // Kick user if they send too many messages while muted (after 10 messages)
            if (msgCount >= 10) {
                try {
                    await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                    console.log(`[${getTimestamp()}] 👢 Kicked muted user for excessive messaging`);
                } catch (kickError) {
                    console.error('Failed to kick muted user:', kickError);
                }
            }
        } catch (error) {
            console.error('Failed to delete muted user message:', error);
        }
        return;
    }

    // Handle commands (only for admins, except #help)
    if (messageText.startsWith('#')) {
        const parts = messageText.trim().split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1).join(' ');
        
        // Log group commands to console
        const senderPhone = senderId.split('@')[0];
        console.log(`\n[${getTimestamp()}] 👥 Group Command Received:`);
        console.log(`   Group: ${groupMetadata?.subject || groupId}`);
        console.log(`   From: ${senderPhone} (${senderId})`);
        console.log(`   Command: ${command}`);
        console.log(`   Args: ${args || '[none]'}`);
        console.log(`   Is Admin: ${isAdmin ? '✅ Yes' : '❌ No'}`);
        
        // Block #help command in groups for security
        if (command === '#help') {
            console.log(`   Result: ❌ Help command blocked in groups`);
            await sock.sendMessage(groupId, { 
                text: '❌ Unknown command.' 
            });
            return;
        }
        
        // Require admin for all other commands
        if (!isAdmin) {
            console.log(`   Result: ❌ Non-admin tried to use command`);
            await sock.sendMessage(groupId, { 
                text: '❌ Only admins can use bot commands.' 
            });
            return;
        }
        
        const handled = await commandHandler.handleCommand(msg, command, args, isAdmin, isSuperAdmin);
        if (handled) {
            console.log(`   Result: ✅ Command handled successfully`);
        } else {
            console.log(`   Result: ❌ Unknown command`);
        }
        if (handled) return;
    }
    
    // Check for invite links
    const matches = messageText.match(config.PATTERNS.INVITE_LINK);
    if (!matches || matches.length === 0) return;
    
    console.log(`\n[${getTimestamp()}] 🚨 INVITE LINK DETECTED!`);
    console.log(`Group: ${groupId}`);
    console.log(`Sender: ${senderId}`);
    console.log(`Links: ${matches.join(', ')}`);
    
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Debug: Log all participants to see how bot appears
        console.log(`\n[${getTimestamp()}] 📋 Group participants:`, groupMetadata.participants.map(p => ({ 
            id: p.id, 
            admin: p.admin || p.isAdmin || p.isSuperAdmin,
            phone: p.id.split('@')[0]
        })));
        
        // Multiple ways to identify the bot
        const botPhone = sock.user.id.split(':')[0];
        const botId = sock.user.id;
        
        console.log(`[${getTimestamp()}] 🤖 Looking for bot with:`);
        console.log(`   - Full ID: ${botId}`);
        console.log(`   - Phone: ${botPhone}`);
        
        // In multi-device mode, the bot might have a LID instead of phone number
        // Let's implement a workaround: assume bot is admin if we can execute admin actions
        let botIsAdmin = true; // Assume true and verify by trying admin actions
        
        console.log(`[${getTimestamp()}] ⚠️ Bot admin check bypassed due to LID format issue`);
        console.log(`[${getTimestamp()}] ⚡ Attempting admin actions...`);
        
        // Check if sender is admin
        const senderParticipant = groupMetadata.participants.find(p => p.id === senderId);
        if (senderParticipant?.admin) {
            console.log('✅ Sender is admin, ignoring invite link');
            return;
        }
        
        // Check cooldown
        const lastKick = kickCooldown.get(senderId);
        if (lastKick && Date.now() - lastKick < config.KICK_COOLDOWN) {
            console.log('⏳ User recently kicked, skipping to prevent spam');
            return;
        }
        
        // Delete the message
        try {
            await sock.sendMessage(groupId, { delete: msg.key });
            console.log('✅ Deleted invite link message');
        } catch (deleteError) {
            console.error('❌ Failed to delete message:', deleteError.message);
        }
        
        // Add to blacklist
        await blacklistService.addToBlacklist(senderId, 'Sent invite link spam');
        
        // Kick the user
        try {
            await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
            console.log('✅ Kicked user:', senderId);
            kickCooldown.set(senderId, Date.now());
            
            // Send notification to kicked user
            const kickMessage = `🚫 You have been removed from ${groupMetadata.subject} for sending unauthorized invite links.\n\n` +
                              `If you believe this was a mistake, please contact the group admin.`;
            await sock.sendMessage(senderId, { text: kickMessage }).catch(() => {});
        } catch (kickError) {
            console.error('❌ Failed to kick user:', kickError.message);
        }
        
        // Send alert to admin
        const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
        
        // Try to get group invite link
        let groupLink = 'N/A';
        try {
            const inviteCode = await sock.groupInviteCode(groupId);
            groupLink = `https://chat.whatsapp.com/${inviteCode}`;
        } catch (err) {
            console.log('Could not get group invite link:', err.message);
        }
        
        const alertMessage = `🚨 *Invite Spam Detected*\n\n` +
                           `📍 Group: ${groupMetadata.subject}\n` +
                           `🔗 Group Link: ${groupLink}\n` +
                           `👤 User: ${senderId}\n` +
                           `🔗 Spam Links: ${matches.join(', ')}\n` +
                           `⏰ Time: ${getTimestamp()}\n\n` +
                           `✅ Actions taken:\n` +
                           `• Message deleted\n` +
                           `• User blacklisted\n` +
                           `• User kicked from group`;
        
        await sock.sendMessage(adminId, { text: alertMessage });
        
    } catch (error) {
        console.error('❌ Error handling invite spam:', error);
    }
}

// Handle new group joins
async function handleGroupJoin(sock, groupId, participants) {
    console.log(`\n[${getTimestamp()}] 👥 New participants joined group ${groupId}`);
    
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Use the correct bot admin check
        const { isBotAdmin: checkBotAdmin } = require('./utils/botAdminChecker');
        const botIsAdmin = await checkBotAdmin(sock, groupId);
        
        if (!botIsAdmin) {
            console.log('❌ Bot is not admin, cannot check blacklist');
            // Log additional debug info
            const { debugBotId } = require('./utils/botAdminChecker');
            debugBotId(sock);
            return;
        }
        
        // Check each participant
        for (const participantId of participants) {
            // Extract phone number from participant ID
            const phoneNumber = participantId.split('@')[0];
            const isLidFormat = participantId.endsWith('@lid');
            
            console.log(`👥 New participant: ${phoneNumber} (LID: ${isLidFormat}, length: ${phoneNumber.length})`);
            
            // Check if user is whitelisted first
            if (await whitelistService.isWhitelisted(participantId)) {
                console.log(`✅ Whitelisted user joined: ${participantId}`);
                continue; // Skip all checks for whitelisted users
            }
            
            // Check if user is blacklisted
            if (await blacklistService.isBlacklisted(participantId)) {
                console.log(`🚫 Blacklisted user detected: ${participantId}`);
                
                try {
                    // Remove the blacklisted user
                    await sock.groupParticipantsUpdate(groupId, [participantId], 'remove');
                    console.log('✅ Kicked blacklisted user');
                    
                    // Notify the user
                    const message = `🚫 You have been automatically removed from ${groupMetadata.subject} ` +
                                  `because you are on the blacklist.\n\n` +
                                  `If you believe this is a mistake, please contact the admin.`;
                    await sock.sendMessage(participantId, { text: message }).catch(() => {});
                    
                    // Alert admin
                    const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
                    
                    // Try to get group invite link
                    let groupLink = 'N/A';
                    try {
                        const inviteCode = await sock.groupInviteCode(groupId);
                        groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                    } catch (err) {
                        console.log('Could not get group invite link:', err.message);
                    }
                    
                    const alert = `🚨 *Blacklisted User Auto-Kicked*\n\n` +
                                `📍 Group: ${groupMetadata.subject}\n` +
                                `🔗 Group Link: ${groupLink}\n` +
                                `👤 User: ${participantId}\n` +
                                `⏰ Time: ${getTimestamp()}`;
                    await sock.sendMessage(adminId, { text: alert });
                    
                } catch (error) {
                    console.error('❌ Failed to kick blacklisted user:', error);
                }
                continue; // Skip further checks for this user
            }
            
            // Check if phone number starts with +1 or +6 (or just 1 or 6 without +)
            // More precise check: US/Canada (+1) has 11 digits, Southeast Asia (+6x) has varying lengths
            // IMPORTANT: Never kick Israeli numbers (+972)
            const isIsraeliNumber = phoneNumber.startsWith('972') || phoneNumber.startsWith('+972');
            
            if (isIsraeliNumber) {
                console.log(`🇮🇱 Protecting Israeli number on join: ${phoneNumber}`);
            }
            
            // Handle LID format detection
            const isLidUSNumber = isLidFormat && phoneNumber.startsWith('1') && phoneNumber.length >= 11;
            const isLidSEAsiaNumber = isLidFormat && phoneNumber.startsWith('6') && phoneNumber.length >= 10;
            
            if (config.FEATURES.RESTRICT_COUNTRY_CODES && !isIsraeliNumber &&
                ((phoneNumber.startsWith('1') && phoneNumber.length === 11) || // US/Canada format
                 (phoneNumber.startsWith('+1') && phoneNumber.length === 12) || // US/Canada with +
                 isLidUSNumber || // LID format US numbers
                 (phoneNumber.startsWith('6') && phoneNumber.length >= 10 && phoneNumber.length <= 12) || // Southeast Asia
                 (phoneNumber.startsWith('+6') && phoneNumber.length >= 11 && phoneNumber.length <= 13) || // Southeast Asia with +
                 isLidSEAsiaNumber)) { // LID format SE Asia numbers
                
                console.log(`🚫 Restricted country code detected: ${participantId} (${phoneNumber}, length: ${phoneNumber.length})`);
                
                try {
                    // Remove the user
                    await sock.groupParticipantsUpdate(groupId, [participantId], 'remove');
                    console.log('✅ Kicked user with restricted country code');
                    
                    // Notify the user
                    const message = `🚫 You have been automatically removed from ${groupMetadata.subject}.\n\n` +
                                  `Users from certain regions are restricted from joining this group.\n\n` +
                                  `If you believe this is a mistake, please contact the group admin.`;
                    await sock.sendMessage(participantId, { text: message }).catch(() => {});
                    
                    // Alert admin with whitelist option
                    const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
                    
                    // Try to get group invite link
                    let groupLink = 'N/A';
                    try {
                        const inviteCode = await sock.groupInviteCode(groupId);
                        groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                    } catch (err) {
                        console.log('Could not get group invite link:', err.message);
                    }
                    
                    const alert = `🚨 *Restricted Country Code Auto-Kick*\n\n` +
                                `📍 Group: ${groupMetadata.subject}\n` +
                                `🔗 Group Link: ${groupLink}\n` +
                                `👤 User: ${participantId}\n` +
                                `📞 Phone: ${phoneNumber}\n` +
                                `🌍 Reason: Country code starts with +${phoneNumber.charAt(0)}\n` +
                                `⏰ Time: ${getTimestamp()}\n\n` +
                                `To whitelist this user, use:\n` +
                                `#whitelist ${phoneNumber}`;
                    await sock.sendMessage(adminId, { text: alert });
                    
                } catch (error) {
                    console.error('❌ Failed to kick user with restricted country code:', error);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error in group join handler:', error);
    }
}

// Start the bot with error handling
async function main() {
    console.log(`
╔═══════════════════════════════════════════╗
║       🛡️  CommGuard Bot (Baileys)  🛡️       ║
║                                           ║
║  WhatsApp Group Protection Bot v2.0       ║
║  Powered by Baileys WebSocket API         ║
╚═══════════════════════════════════════════╝
    `);
    
    // Show important info
    console.log(`\n📞 Admin Phone: ${config.ADMIN_PHONE}`);
    console.log(`📞 Alert Phone: ${config.ALERT_PHONE}`);
    console.log(`\n⚙️ Features enabled:`);
    console.log(`   • Invite Link Detection: ${config.FEATURES.INVITE_LINK_DETECTION ? '✅' : '❌'}`);
    console.log(`   • Auto-kick Blacklisted: ${config.FEATURES.AUTO_KICK_BLACKLISTED ? '✅' : '❌'}`);
    console.log(`   • Firebase Integration: ${config.FEATURES.FIREBASE_INTEGRATION ? '✅' : '❌'}`);
    console.log(`   • Restrict +1/+6 Countries: ${config.FEATURES.RESTRICT_COUNTRY_CODES ? '✅' : '❌'}`);
    
    // Check for existing auth
    const fs = require('fs');
    if (fs.existsSync('baileys_auth_info')) {
        console.log('\n🔑 Found existing authentication data. Attempting to reconnect...');
    } else {
        console.log('\n🆕 No existing authentication found. You will need to scan QR code.');
    }
    
    try {
        await startBot();
    } catch (error) {
        console.error('Fatal error:', error);
        
        // If it's a specific error, provide guidance
        if (error.message?.includes('ECONNREFUSED')) {
            console.error('\n❌ Connection refused. Please check your internet connection.');
        } else if (error.message?.includes('rate-limit')) {
            console.error('\n❌ Rate limited by WhatsApp. Please wait before trying again.');
        }
        
        process.exit(1);
    }
}

// Handle process events with proper error handling
process.on('uncaughtException', (err) => {
    console.error(`\n[${getTimestamp()}] ❌ Uncaught Exception:`, err);
    console.error('Stack:', err.stack);
    
    // Don't exit on connection-related errors
    if (err.message?.includes('Connection Closed') || 
        err.message?.includes('Stream Errored') ||
        err.message?.includes('decrypt')) {
        console.log(`[${getTimestamp()}] 🔄 Connection error detected, bot will attempt to reconnect...`);
        return;
    }
    
    // Exit on critical errors
    console.error(`[${getTimestamp()}] 💀 Critical error - exiting...`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`\n[${getTimestamp()}] ⚠️ Unhandled Promise Rejection:`);
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    
    // Handle connection-related rejections gracefully
    if (reason && typeof reason === 'object') {
        const errorMessage = reason.message || String(reason);
        
        if (errorMessage.includes('Connection Closed') || 
            errorMessage.includes('Stream Errored') ||
            errorMessage.includes('conflict') ||
            errorMessage.includes('replaced') ||
            errorMessage.includes('precondition')) {
            console.log(`[${getTimestamp()}] 🔄 Connection issue detected, will handle gracefully...`);
            return;
        }
    }
    
    // Log but don't exit for non-critical errors
    console.error(`[${getTimestamp()}] ⚠️ Non-critical error logged, continuing operation...`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`\n[${getTimestamp()}] 🛑 Received shutdown signal...`);
    console.log('Closing connections...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`\n[${getTimestamp()}] 🛑 Received termination signal...`);
    console.log('Closing connections...');
    process.exit(0);
});

// Start the application
main();