// Load environment variables from .env file
require('dotenv').config();

const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { logger, getTimestamp, advancedLogger } = require('./utils/logger');
const permissionChecker = require('./utils/permissionChecker');
const config = require('./config');
const SingleInstance = require('./single-instance');
const { handleSessionError, shouldSkipUser, clearProblematicUsers, STARTUP_TIMEOUT } = require('./utils/sessionManager');
const stealthUtils = require('./utils/stealthUtils');
const restartLimiter = require('./utils/restartLimiter');

// Conditionally load Firebase services only if enabled
let blacklistService, whitelistService, muteService, unblacklistRequestService;

// Group admin management system
const groupAdminCache = new Map(); // Memory cache for speed
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache
const DB_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour DB updates

// Startup phase management for session optimization
let isStartupPhase = true;
let startupTimer = null;

// Track bot startup time to ignore old messages from while bot was down
const BOT_START_TIME = Date.now();
const MESSAGE_GRACE_PERIOD = 60000; // 60 seconds grace period for clock differences
let skippedOldMessagesCount = 0;

// Check if message is from before bot startup (should be ignored)
function shouldIgnoreOldMessage(msg) {
    if (!msg.messageTimestamp) {
        return false; // No timestamp, process normally
    }
    
    const messageTime = msg.messageTimestamp * 1000; // Convert to milliseconds
    const cutoffTime = BOT_START_TIME - MESSAGE_GRACE_PERIOD;
    
    if (messageTime < cutoffTime) {
        const messageAge = Math.floor((BOT_START_TIME - messageTime) / 1000);
        skippedOldMessagesCount++;
        
        // Only log every 10th skipped message to avoid spam
        if (skippedOldMessagesCount % 10 === 0) {
            console.log(`⏭️ Skipped ${skippedOldMessagesCount} old messages (latest: ${messageAge}s old)`);
        }
        return true;
    }
    
    return false;
}

// Clear startup phase after timeout
const clearStartupPhase = () => {
    if (isStartupPhase) {
        isStartupPhase = false;
        clearProblematicUsers();
        console.log(`[${getTimestamp()}] 🚀 Startup phase completed - normal operation mode`);
        console.log(`[${getTimestamp()}] 📊 Startup summary: Skipped ${skippedOldMessagesCount} old messages from downtime`);
    }
};

// Smart admin checking system (DB + Cache)
async function isUserAdmin(sock, groupId, userId) {
    const now = Date.now();
    
    // 1. Check memory cache first (fastest)
    const cached = groupAdminCache.get(groupId);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        return cached.admins.has(userId);
    }
    
    // 2. Check database (fast)
    if (config.FEATURES.FIREBASE_INTEGRATION) {
        try {
            const db = require('./firebaseConfig.js');
            const doc = await db.collection('group_admins').doc(groupId).get();
            
            if (doc.exists) {
                const data = doc.data();
                // If DB data is fresh (< 1 hour), use it
                if ((now - data.lastUpdated) < DB_UPDATE_INTERVAL) {
                    // Cache in memory for speed
                    groupAdminCache.set(groupId, {
                        admins: new Set(data.adminList),
                        timestamp: now
                    });
                    return data.adminList.includes(userId);
                }
            }
        } catch (error) {
            console.warn('Failed to check admin DB:', error.message);
        }
    }
    
    // 3. Fallback to WhatsApp API (slow, rate limited)
    try {
        console.log(`🔄 Updating admin list for group ${groupId}`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit protection
        
        const metadata = await sock.groupMetadata(groupId);
        const adminList = metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
        
        // Save to database for future use
        if (config.FEATURES.FIREBASE_INTEGRATION) {
            try {
                const db = require('./firebaseConfig.js');
                await db.collection('group_admins').doc(groupId).set({
                    adminList,
                    lastUpdated: now,
                    groupName: metadata.subject || 'Unknown Group'
                });
            } catch (error) {
                console.warn('Failed to save admin list to DB:', error.message);
            }
        }
        
        // Cache in memory
        groupAdminCache.set(groupId, {
            admins: new Set(adminList),
            timestamp: now
        });
        
        return adminList.includes(userId);
        
    } catch (error) {
        console.error('Failed to check admin status:', error);
        // Return false if we can't determine admin status
        return false;
    }
}

// Cached group metadata function (for commands that need full metadata)
async function getCachedGroupMetadata(sock, groupId) {
    const now = Date.now();
    
    // Try to get from admin cache first
    const adminCached = groupAdminCache.get(groupId);
    if (adminCached && (now - adminCached.timestamp) < CACHE_DURATION && adminCached.fullMetadata) {
        return adminCached.fullMetadata;
    }
    
    // Check database for recent metadata
    if (config.FEATURES.FIREBASE_INTEGRATION) {
        try {
            const db = require('./firebaseConfig.js');
            const doc = await db.collection('group_admins').doc(groupId).get();
            
            if (doc.exists) {
                const data = doc.data();
                if ((now - data.lastUpdated) < DB_UPDATE_INTERVAL && data.fullMetadata) {
                    // Cache in memory
                    if (adminCached) {
                        adminCached.fullMetadata = data.fullMetadata;
                    }
                    return data.fullMetadata;
                }
            }
        } catch (error) {
            console.warn('Failed to get cached metadata from DB:', error.message);
        }
    }
    
    // Fallback to WhatsApp API with rate limiting
    try {
        console.log(`🔄 Fetching full metadata for group ${groupId}`);
        await new Promise(resolve => setTimeout(resolve, 200)); // More conservative delay
        
        const metadata = await sock.groupMetadata(groupId);
        
        // Save to cache and database
        const adminList = metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
        
        // Update memory cache
        groupAdminCache.set(groupId, {
            admins: new Set(adminList),
            timestamp: now,
            fullMetadata: metadata
        });
        
        // Save to database
        if (config.FEATURES.FIREBASE_INTEGRATION) {
            try {
                const db = require('./firebaseConfig.js');
                await db.collection('group_admins').doc(groupId).set({
                    adminList,
                    lastUpdated: now,
                    groupName: metadata.subject || 'Unknown Group',
                    fullMetadata: metadata
                });
            } catch (error) {
                console.warn('Failed to save full metadata to DB:', error.message);
            }
        }
        
        return metadata;
        
    } catch (error) {
        console.error('Failed to get group metadata:', error);
        throw error;
    }
}

// Hourly admin list refresh (background task)
function startAdminRefreshScheduler(sock) {
    setInterval(async () => {
        if (!config.FEATURES.FIREBASE_INTEGRATION) return;
        
        try {
            console.log('🔄 Starting hourly admin list refresh...');
            const db = require('./firebaseConfig.js');
            const snapshot = await db.collection('group_admins').get();
            
            let refreshCount = 0;
            for (const doc of snapshot.docs) {
                const groupId = doc.id;
                const data = doc.data();
                const age = Date.now() - data.lastUpdated;
                
                // Refresh if older than 1 hour
                if (age > DB_UPDATE_INTERVAL) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Spread out API calls
                        const metadata = await sock.groupMetadata(groupId);
                        const adminList = metadata.participants
                            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                            .map(p => p.id);
                        
                        // Sanitize metadata to prevent Firestore undefined value errors
                        const sanitizedMetadata = advancedLogger.sanitizeForFirestore(metadata);

                        await doc.ref.set({
                            adminList,
                            lastUpdated: Date.now(),
                            groupName: metadata.subject || 'Unknown Group',
                            fullMetadata: sanitizedMetadata
                        });
                        
                        // Update memory cache too
                        groupAdminCache.set(groupId, {
                            admins: new Set(adminList),
                            timestamp: Date.now(),
                            fullMetadata: metadata
                        });
                        
                        refreshCount++;
                    } catch (error) {
                        advancedLogger.logFirestoreError(error, 'refresh_admin_list', { groupId, metadata });
                    }
                }
            }
            
            console.log(`✅ Refreshed admin lists for ${refreshCount} groups`);
        } catch (error) {
            console.error('Admin refresh scheduler error:', error);
        }
    }, DB_UPDATE_INTERVAL); // Run every hour
}
if (config.FEATURES.FIREBASE_INTEGRATION) {
    const blacklistModule = require('./services/blacklistService');
    const whitelistModule = require('./services/whitelistService');
    const muteModule = require('./services/muteService');
    const unblacklistModule = require('./services/unblacklistRequestService');
    
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
        incrementMutedMessageCount: muteModule.incrementMutedMessageCount,
        getRemainingMuteTime: muteModule.getRemainingMuteTime
    };
    unblacklistRequestService = {
        loadRequestCache: unblacklistModule.loadRequestCache,
        canMakeRequest: unblacklistModule.canMakeRequest,
        createRequest: unblacklistModule.createRequest,
        processAdminResponse: unblacklistModule.processAdminResponse,
        getPendingRequests: unblacklistModule.getPendingRequests
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
        incrementMutedMessageCount: async () => { console.log('📋 Firebase disabled - mute count skipped'); },
        getRemainingMuteTime: () => null
    };
    unblacklistRequestService = {
        loadRequestCache: async () => { console.log('📋 Firebase disabled - skipping unblacklist request cache load'); },
        canMakeRequest: async () => ({ canRequest: false, reason: 'Firebase disabled' }),
        createRequest: async () => { console.log('📋 Firebase disabled - unblacklist request skipped'); return false; },
        processAdminResponse: async () => { console.log('📋 Firebase disabled - admin response skipped'); return false; },
        getPendingRequests: async () => { console.log('📋 Firebase disabled - pending requests unavailable'); return []; }
    };
}

const CommandHandler = require('./services/commandHandler');
const { clearSessionErrors, mightContainInviteLink, extractMessageText } = require('./utils/sessionManager');
const { sendKickAlert, sendSecurityAlert } = require('./utils/alertService');
const { robustKick } = require('./utils/kickHelper');

// Track kicked users to prevent spam
const kickCooldown = new Map();

// Track reconnection attempts with error-specific handling
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let error515Count = 0;
const MAX_515_ERRORS = 3;
let lastConnectionTime = null;
const CONNECTION_STABILITY_THRESHOLD = 60000; // 1 minute

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
                
                // Suppress @lid failures - they're handled elsewhere
                if (userId && userId.includes('@lid')) {
                    return; // Silently ignore @lid decryption errors to prevent log spam
                }
                
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
    await unblacklistRequestService.loadRequestCache();
    
    // Initialize motivational phrase service
    try {
        const { initialize } = require('./services/motivationalPhraseService');
        await initialize();
        console.log('✅ Motivational phrase service initialized');
    } catch (error) {
        console.warn('⚠️ Failed to initialize motivational phrase service:', error.message);
    }
    
    // Initialize kicked user service for rejoin links
    try {
        const { initialize } = require('./services/kickedUserService');
        await initialize();
        console.log('✅ Kicked user service initialized');
    } catch (error) {
        console.warn('⚠️ Failed to initialize kicked user service:', error.message);
    }
    
    
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
    
    // Create socket connection with improved configuration for error 515 prevention
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
        markOnlineOnConnect: false, // Disable auto-online to reduce connection stress
        defaultQueryTimeoutMs: 120000, // Extended timeout to prevent premature disconnects
        keepAliveIntervalMs: 45000, // Increased keep-alive interval
        connectTimeoutMs: 90000, // Extended connection timeout
        emitOwnEvents: false,
        browser: config.FEATURES.STEALTH_MODE ? config.STEALTH.BROWSER : ['CommGuard Bot', 'Desktop', '4.0.0'], // Stealth or normal browser info
        getMessage: async (key) => { // Add message cache handler to prevent stream errors
            return null; // Return null instead of sending "Hello" messages
        },
        // Additional WebSocket options to prevent stream errors
        options: {
            chats: {
                writeIncomingMessages: false, // Reduce database writes
                writeOutgoingMessages: false,
            },
        },
        retryRequestDelayMs: 5000, // Add delay between retries
        maxMsgRetryCount: 3, // Limit message retry attempts
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
            const boom = lastDisconnect?.error;
            
            console.error(`\n[${getTimestamp()}] ❌ Connection closed:`);
            console.error(`   Error: ${errorMessage}`);
            console.error(`   Status Code: ${disconnectReason}`);
            
            // Enhanced error 515 detection and handling
            const isError515 = errorMessage.includes('515') || 
                              disconnectReason === 515 || 
                              boom?.data?.code === '515' ||
                              errorMessage.includes('stream:error') ||
                              errorMessage.includes('Stream Errored');
            
            if (isError515) {
                error515Count++;
                console.error(`\n[${getTimestamp()}] 🚨 Stream Error 515 detected! (Count: ${error515Count}/${MAX_515_ERRORS})`);
                console.log('🔧 Implementing enhanced recovery strategy...');
                
                // Check connection stability
                const connectionDuration = lastConnectionTime ? Date.now() - lastConnectionTime : 0;
                const isStableConnection = connectionDuration > CONNECTION_STABILITY_THRESHOLD;
                
                console.log(`   Connection Duration: ${Math.round(connectionDuration / 1000)}s (Stable: ${isStableConnection})`);
                
                // If we've had too many 515 errors, try more aggressive fixes
                if (error515Count >= MAX_515_ERRORS) {
                    console.log(`\n[${getTimestamp()}] 🔧 Maximum 515 errors reached - attempting comprehensive fix...`);
                    
                    try {
                        const fs = require('fs').promises;
                        
                        // Clear all authentication data
                        await fs.rm('baileys_auth_info', { recursive: true, force: true });
                        console.log('✅ Cleared authentication data');
                        
                        // Reset all counters
                        error515Count = 0;
                        reconnectAttempts = 0;
                        lastConnectionTime = null;
                        
                        console.log('✅ Reset all connection counters');
                        console.log('📱 Fresh QR scan will be required');
                        
                        // Wait longer before restart after clearing auth
                        setTimeout(startBot, 30000); // 30 seconds
                        return;
                        
                    } catch (err) {
                        console.error('❌ Failed to clear auth data:', err);
                    }
                }
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
                
                // Enhanced delay calculation with error-specific handling
                let delayMs;
                if (isError515) {
                    // Progressive delay for 515 errors
                    delayMs = Math.min(30000 * error515Count, 180000); // 30s, 60s, 90s, up to 3 minutes
                    console.log(`[${getTimestamp()}] 🔧 Using Error 515 recovery delay: ${delayMs / 1000}s`);
                } else if (disconnectReason === 440) {
                    // Quick reconnect for conflict errors
                    delayMs = 15000; // 15 seconds
                } else {
                    // Standard exponential backoff for other errors
                    delayMs = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), 60000);
                }
                
                console.log(`[${getTimestamp()}] 🔄 Reconnecting in ${delayMs / 1000} seconds (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                console.log(`   Error 515 Count: ${error515Count}/${MAX_515_ERRORS}`);
                
                // Don't clear auth for individual 515 errors anymore - handle them at the threshold
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
            // Reset all error counters on successful connection
            reconnectAttempts = 0;
            error515Count = 0;
            lastConnectionTime = Date.now();
            
            // Start the hourly admin refresh scheduler
            startAdminRefreshScheduler(sock);
            
            // Initialize startup phase timer
            if (!startupTimer) {
                startupTimer = setTimeout(clearStartupPhase, STARTUP_TIMEOUT);
            }
            
            console.log(`\n[${getTimestamp()}] ✅ Bot connected successfully!`);
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}`);
            console.log(`Bot Platform: ${sock.user.platform || 'Unknown'}`);

            // Log timestamp filtering info
            const cutoffTime = new Date(BOT_START_TIME - MESSAGE_GRACE_PERIOD);
            console.log(`⏭️ Ignoring messages older than: ${cutoffTime.toLocaleString()}`);
            console.log(`⚡ This will skip message backlog from while bot was down`);

            // Notify admin of successful connection with restart count
            try {
                const restartStats = restartLimiter.getStats();
                await restartLimiter.notifyAdmin(sock, restartStats.todayCount, 'Connection successful');
            } catch (notifyError) {
                console.log('Could not notify admin of connection:', notifyError.message);
            }
            
            // Store bot phone for later use
            const botPhone = sock.user.id.split(':')[0].split('@')[0];
            sock.botPhone = botPhone;
            console.log(`Bot Phone: ${botPhone}`);
            
            console.log(`\n🛡️ CommGuard Bot (Baileys Edition) is now protecting your groups!`);
            console.log(`🔧 Enhanced session error recovery active`);
            console.log(`⚡ Fast startup mode enabled (${STARTUP_TIMEOUT / 1000}s)`);
            
            // NUCLEAR: Clear ALL sessions to force completely fresh start
            try {
                if (sock.authState && sock.authState.keys) {
                    let clearedCount = 0;
                    
                    // Clear ALL sessions
                    if (sock.authState.keys.sessions) {
                        const sessionCount = Object.keys(sock.authState.keys.sessions).length;
                        sock.authState.keys.sessions = {};
                        clearedCount += sessionCount;
                    }
                    
                    // Clear sender keys
                    if (sock.authState.keys.senderKeys) {
                        const senderKeyCount = Object.keys(sock.authState.keys.senderKeys).length;
                        sock.authState.keys.senderKeys = {};
                        clearedCount += senderKeyCount;
                    }
                    
                    console.log(`🚨 NUCLEAR: Cleared ALL ${clearedCount} sessions for fresh start`);
                    console.log(`⏰ Ignoring ALL messages for next 10 minutes to prevent session corruption`);
                    
                    // ULTIMATE FIX: Override Baileys decryption function during startup
                    const originalDecrypt = sock.decryptMessage;
                    if (originalDecrypt) {
                        sock.decryptMessage = async function(msg) {
                            const userId = msg.key?.participant || msg.key?.remoteJid;
                            
                            // Block ALL decryption during startup phase
                            if (isStartupPhase) {
                                return null; // Return null instead of decrypted content
                            }
                            
                            // Block @lid users permanently 
                            if (userId && userId.includes('@lid')) {
                                return null; // Block all @lid decryption
                            }
                            
                            // Allow normal decryption for regular users after startup
                            return originalDecrypt.call(this, msg);
                        };
                        
                        console.log(`🚫 OVERRODE Baileys decryption to block problematic messages`);
                    }
                }
            } catch (error) {
                console.log('⚠️ Could not clear sessions:', error.message);
            }
            
            // Initialize stealth mode if enabled
            if (config.FEATURES.STEALTH_MODE) {
                console.log('🥷 Initializing stealth mode...');
                stealthUtils.initializeDefaultVariations();
                console.log('✅ Stealth mode initialized with human-like behavior');
            }

            // Send startup notification with error status
            try {
                const adminId = config.ADMIN_PHONE + '@s.whatsapp.net';
                const statusMessage = `🟢 CommGuard Bot Started\n\n` +
                                    `✅ Bot is now online and monitoring groups\n` +
                                    `🔧 Enhanced session error recovery enabled\n` +
                                    `⚡ Fast startup mode active\n` +
                                    `📊 Connection stable after ${reconnectAttempts} attempts\n` +
                                    `⏰ Time: ${getTimestamp()}`;

                // Use stealth mode for startup notification if enabled
                if (config.FEATURES.STEALTH_MODE) {
                    await stealthUtils.sendHumanLikeMessage(sock, adminId, { text: statusMessage });
                } else {
                    await sock.sendMessage(adminId, { text: statusMessage });
                }
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
    // Startup phase is managed globally

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Only process new messages
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            try {
                // Skip old messages from before bot startup (much faster than session error handling)
                if (shouldIgnoreOldMessage(msg)) {
                    continue;
                }
                
                const userId = msg.key.participant || msg.key.remoteJid;
                
                // Skip @lid users during startup to prevent issues
                if (isStartupPhase && userId && userId.includes('@lid')) {
                    continue; // @lid users blocked during startup only
                }
                
                await handleMessage(sock, msg, commandHandler);
            } catch (error) {
                // Handle session errors specifically
                if (error.message?.includes('decrypt') || 
                    error.message?.includes('session') ||
                    error.message?.includes('Bad MAC')) {
                    
                    const result = await handleSessionError(sock, error, msg, isStartupPhase);
                    
                    // During startup, skip problematic users
                    if (result.skip && isStartupPhase) {
                        console.log(`⚡ Skipped session error during startup: ${result.userId}`);
                        continue;
                    }
                    
                    // SPECIAL HANDLING: Try to process commands even with decryption failure
                    // This is crucial for @lid users where decryption often fails but commands should work
                    if (msg.key.remoteJid.endsWith('@g.us') && msg.key.participant?.includes('@lid')) {
                        try {
                            console.log(`[${getTimestamp()}] 🔄 Attempting command fallback for @lid user with decryption failure`);
                            
                            // Try to extract any raw message content that might be available
                            let fallbackText = '';
                            
                            // Check for any available message content patterns
                            if (msg.message?.conversation) {
                                fallbackText = msg.message.conversation;
                            } else if (msg.message?.extendedTextMessage?.text) {
                                fallbackText = msg.message.extendedTextMessage.text;
                            }
                            
                            // If we found potential command text, try to process it
                            if (fallbackText && fallbackText.trim().startsWith('#')) {
                                console.log(`[${getTimestamp()}] 📝 Found potential command in fallback: ${fallbackText.substring(0, 20)}...`);
                                
                                // Create a modified message object for command processing
                                const fallbackMsg = {
                                    ...msg,
                                    message: {
                                        conversation: fallbackText
                                    }
                                };
                                
                                // Try to process as command
                                await handleMessage(sock, fallbackMsg, commandHandler);
                                console.log(`[${getTimestamp()}] ✅ Successfully processed command via fallback method`);
                                continue;
                            }
                        } catch (fallbackError) {
                            console.error(`[${getTimestamp()}] ❌ Command fallback failed:`, fallbackError.message);
                        }
                    }
                    
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
                    
                    // Retry if needed (not during startup)
                    if (result.retry && !isStartupPhase) {
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
    sock.ev.on('group-participants.update', async ({ id, participants, action, author }) => {
        if (action === 'add') {
            // Check if the bot itself was added to the group
            const botJid = sock.user.id;
            const botPhone = sock.user.id.split(':')[0].split('@')[0];
            
            // Check for bot using multiple matching patterns (handles LID format)
            const botAddedToGroup = participants.some(p => {
                return p === botJid || 
                       p.includes(botPhone) || 
                       p.startsWith(botPhone);
            });
            
            if (botAddedToGroup) {
                // Bot was added to a new group - send welcome message
                await handleBotWelcome(sock, id, author);
            } else {
                // Regular users were added - handle normal join logic
                await handleGroupJoin(sock, id, participants, author);
            }
        }
    });
    
    return sock;
}

// Helper function to check if ALL text is non-Hebrew (strict detection)

// Helper function to detect Russian text
function isTextRussian(text) {
    if (!text || text.trim().length === 0) return false;
    
    // Russian Unicode ranges
    // Cyrillic: U+0400-U+04FF
    // Cyrillic Supplement: U+0500-U+052F
    // Cyrillic Extended-A: U+2DE0-U+2DFF
    // Cyrillic Extended-B: U+A640-U+A69F
    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
    
    // Check if text contains Russian characters
    const containsRussian = russianPattern.test(text);
    
    if (containsRussian) {
        // Additional check for common Russian words
        const commonRussianWords = [
            'и', 'в', 'не', 'на', 'я', 'быть', 'он', 'с', 'как', 'а',
            'то', 'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у',
            'же', 'вы', 'за', 'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот',
            'от', 'меня', 'еще', 'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже'
        ];
        
        const words = text.toLowerCase().split(/\s+/);
        const russianWordCount = words.filter(word => 
            commonRussianWords.some(russianWord => word.includes(russianWord))
        ).length;
        
        // Consider it Russian if it has Cyrillic characters and some Russian words
        return russianWordCount > 0;
    }
    
    return false;
}

function isTextAllNonHebrew(text) {
    if (!text || text.trim().length === 0) return false;
    
    // Skip URLs - don't translate URLs or messages that are primarily URLs
    const urlRegex = /(?:https?:\/\/|www\.|ftp:\/\/|[\w-]+\.[\w.-]+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?)/gi;
    const urls = text.match(urlRegex) || [];
    
    // If text contains URLs, don't translate
    if (urls.length > 0) {
        console.log(`[${getTimestamp()}] 🔗 Skipping translation - text contains URLs`);
        return false;
    }
    
    // Skip email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    if (emailRegex.test(text)) {
        console.log(`[${getTimestamp()}] 📧 Skipping translation - text contains email addresses`);
        return false;
    }
    
    // Split text into words and check each word
    const words = text.trim().split(/\s+/);
    const hebrewRegex = /[\u0590-\u05FF]/;
    let hasNonHebrewWords = false;
    
    for (const word of words) {
        // Skip pure punctuation, numbers, or very short words
        const cleanWord = word.replace(/[^\w\u0590-\u05FF]/g, '');
        if (cleanWord.length === 0 || /^\d+$/.test(cleanWord)) continue;
        
        // If ANY word contains Hebrew characters, reject the entire text
        if (hebrewRegex.test(word)) {
            return false;
        }
        
        // Mark that we found at least one valid non-Hebrew word
        hasNonHebrewWords = true;
    }
    
    // Only return true if we have actual non-Hebrew words (not just numbers/punctuation)
    return hasNonHebrewWords;
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

    // Debug logging for #kick commands specifically
    if (msg.message?.extendedTextMessage?.text && msg.message.extendedTextMessage.text.includes('#kick')) {
        console.log(`[${getTimestamp()}] 🔍 DEBUG: Found #kick in extendedTextMessage`);
        console.log(`   Text: "${msg.message.extendedTextMessage.text}"`);
        console.log(`   Has contextInfo: ${!!msg.message.extendedTextMessage.contextInfo}`);
        console.log(`   messageText extracted: "${messageText}"`);
    }

    // Skip if no text UNLESS it might contain invite link
    if (!messageText && !mightContainInviteLink(msg)) {
        // Additional debug for messages that look like they should have text
        if (msg.message?.extendedTextMessage) {
            console.log(`[${getTimestamp()}] ⚠️ WARNING: ExtendedTextMessage but no text extracted!`);
            console.log(`   Message keys: ${Object.keys(msg.message)}`);
            console.log(`   ExtendedText keys: ${Object.keys(msg.message.extendedTextMessage)}`);
        }
        console.log(`[${getTimestamp()}] ⚠️ Skipping message - no text and no potential invite link detected`);
        return;
    }
    
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
        
        // Process commands in private chat
        if (messageText && messageText.startsWith('#')) {
            console.log(`   Command Detected: ${messageText}`);
            
            const parts = messageText.trim().split(/\s+/);
            const command = parts[0];
            const args = parts.slice(1); // Keep as array for proper command handling
            
            // Only admins can use bot commands
            if (isAdmin) {
                const handled = await commandHandler.handleCommand(msg, command, args, isAdmin, isAdmin);
                if (handled) {
                    console.log(`   Command Handled: ✅ Successfully`);
                    return;
                }
            } else {
                // Non-admin tried to use admin command
                console.log(`   Command Rejected: ❌ Non-admin user`);

                const responseText = config.FEATURES.RANDOMIZE_RESPONSES ?
                    stealthUtils.getMessageVariation('admin_only_hebrew', 'מה אני עובד אצלך?!') :
                    'מה אני עובד אצלך?!';

                if (config.FEATURES.STEALTH_MODE) {
                    await stealthUtils.sendHumanLikeMessage(sock, chatId, { text: responseText });
                } else {
                    await sock.sendMessage(chatId, { text: responseText });
                }
                return;
            }

            // If command wasn't handled, show unknown command
            console.log(`   Command Handled: ❌ Unknown command`);

            const unknownText = config.FEATURES.RANDOMIZE_RESPONSES ?
                stealthUtils.getMessageVariation('unknown_command', '❌ Unknown command. Use #help to see available commands.') :
                '❌ Unknown command. Use #help to see available commands.';

            if (config.FEATURES.STEALTH_MODE) {
                await stealthUtils.sendHumanLikeMessage(sock, chatId, { text: unknownText });
            } else {
                await sock.sendMessage(chatId, { text: unknownText });
            }
        } else if (isAdmin && messageText && 
                  (messageText.startsWith('yes ') || messageText.startsWith('no '))) {
            // Handle admin approval patterns (yes/no userId)
            console.log(`   Admin Approval Detected: ${messageText}`);
            
            const parts = messageText.trim().split(/\s+/);
            const command = parts[0]; // "yes" or "no"  
            const args = parts.slice(1); // Keep as array for proper command handling
            
            const handled = await commandHandler.handleCommand(msg, command, args, isAdmin, isAdmin);
            if (handled) {
                console.log(`   Admin Approval Handled: ✅ Successfully`);
                return;
            } else {
                console.log(`   Admin Approval Failed: ❌ Not processed`);
            }
        }
        return;
    }
    
    // Continue with group message handling
    const groupId = chatId;

    // Check if user is whitelisted (whitelisted users bypass all restrictions)
    if (await whitelistService.isWhitelisted(senderId)) {
        console.log(`[${getTimestamp()}] ✅ Whitelisted user ${senderId} - bypassing all restrictions`);
        return;
    }

    // Check admin status using smart caching system (DB + Memory Cache)
    let isAdmin = false, isSuperAdmin = false;
    try {
        isAdmin = await isUserAdmin(sock, groupId, senderId);
        // For now, treat all admins as potentially super admin
        // TODO: Implement separate super admin tracking if needed
        isSuperAdmin = isAdmin;
    } catch (error) {
        console.error('Failed to check admin status:', error);
        // Continue processing as non-admin if check fails
        isAdmin = false;
        isSuperAdmin = false;
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
            
            // Send warning at 7 messages with remaining mute time
            if (msgCount === 7) {
                const remainingTime = await muteService.getRemainingMuteTime(senderId);
                const timeText = remainingTime ? ` (${remainingTime} remaining / נותרו ${remainingTime})` : '';
                
                try {
                    await sock.sendMessage(groupId, { 
                        text: `⚠️ @${senderId.split('@')[0]} You are muted${timeText}\n` +
                              `🚨 After 3 more messages, you will be removed from the group\n\n` +
                              `⚠️ @${senderId.split('@')[0]} אתה מושתק${timeText}\n` +
                              `🚨 אחרי עוד 3 הודעות, תוסר מהקבוצה\n\n` +
                              `🤐 Please wait until your mute expires / אנא המתן עד שההשתקה תפוג`,
                        mentions: [senderId]
                    });
                    console.log(`[${getTimestamp()}] ⚠️ Sent bilingual mute warning to user`);
                } catch (warnError) {
                    console.error('Failed to send mute warning:', warnError);
                }
            }
            
            // Kick user if they send too many messages while muted (after 10 messages)
            if (msgCount >= 10) {
                try {
                    await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                    console.log(`[${getTimestamp()}] 👢 Kicked muted user for excessive messaging`);
                    
                    // Send alert to alert phone
                    const groupMetadata = await sock.groupMetadata(groupId).catch(() => null);
                    const userPhone = senderId.split('@')[0];
                    
                    await sendKickAlert(sock, {
                        userPhone: userPhone,
                        userName: `User ${userPhone}`,
                        groupName: groupMetadata?.subject || 'Unknown Group',
                        groupId: groupId,
                        reason: 'muted_excessive',
                        additionalInfo: `Sent ${msgCount} messages while muted`
                    });
                    
                    // Send bilingual private message to kicked user
                    try {
                        const remainingTime = await muteService.getRemainingMuteTime(senderId);
                        const timeText = remainingTime ? ` (${remainingTime} remaining)` : '';
                        
                        // Send notification to admin instead of user
                        await sock.sendMessage('0544345287@s.whatsapp.net', {
                            text: `🔇 Muted user removed for violations\n\n` +
                                  `👤 User: ${senderId}\n` +
                                  `📍 Group: ${groupMetadata?.subject || 'Unknown Group'}\n` +
                                  `📱 Reason: Sent ${msgCount} messages while muted${timeText}\n` +
                                  `⏰ Time: ${new Date().toLocaleString()}`
                        });
                    } catch (privateError) {
                        console.error(`Failed to send private message to muted user:`, privateError.message);
                    }
                    
                } catch (kickError) {
                    console.error('Failed to kick muted user:', kickError);
                }
            }
        } catch (error) {
            console.error('Failed to delete muted user message:', error);
        }
        return;
    }

    // Debug check for any text containing #kick
    if (messageText && messageText.includes('#kick')) {
        console.log(`[${getTimestamp()}] 🎯 DEBUG: Found #kick in messageText at command check`);
        console.log(`   Full text: "${messageText}"`);
        console.log(`   Starts with #: ${messageText.startsWith('#')}`);
        console.log(`   Will enter command block: ${messageText.startsWith('#')}`);
    }

    // Handle commands (only for admins, except #help)
    if (messageText && messageText.startsWith('#')) {
        const parts = messageText.trim().split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1); // Keep as array for proper command handling

        // Log group commands to console
        const senderPhone = senderId.split('@')[0];
        console.log(`\n[${getTimestamp()}] 👥 Group Command Received:`);
        console.log(`   Group: ${groupId}`);
        console.log(`   From: ${senderPhone} (${senderId})`);
        console.log(`   Command: ${command}`);
        console.log(`   Args: ${args || '[none]'}`);
        console.log(`   Is Admin: ${isAdmin ? '✅ Yes' : '❌ No'}`);

        // Block #help command in groups for security
        if (command === '#help') {
            console.log(`   Result: ❌ Help command blocked in groups`);

            const helpBlockedText = config.FEATURES.RANDOMIZE_RESPONSES ?
                stealthUtils.getMessageVariation('help_blocked_group', '❌ Unknown command.') :
                '❌ Unknown command.';

            if (config.FEATURES.STEALTH_MODE) {
                await stealthUtils.sendHumanLikeMessage(sock, groupId, { text: helpBlockedText });
            } else {
                await sock.sendMessage(groupId, { text: helpBlockedText });
            }
            return;
        }

        // Require admin for all other commands
        if (!isAdmin) {
            console.log(`   Result: ❌ Non-admin tried to use command`);

            const adminOnlyText = config.FEATURES.RANDOMIZE_RESPONSES ?
                stealthUtils.getMessageVariation('admin_only_hebrew', 'מה אני עובד אצלך?!') :
                'מה אני עובד אצלך?!';

            if (config.FEATURES.STEALTH_MODE) {
                await stealthUtils.sendHumanLikeMessage(sock, groupId, { text: adminOnlyText });
            } else {
                await sock.sendMessage(groupId, { text: adminOnlyText });
            }
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
    
    // Check for immediate auto-translation of non-Hebrew messages
    if (config.FEATURES.AUTO_TRANSLATION && messageText && messageText.trim().length > 5) {
        try {
            // Strict Hebrew detection - ALL words must be non-Hebrew
            const isAllNonHebrew = isTextAllNonHebrew(messageText);
            
            if (isAllNonHebrew) { // Only translate if ALL text is non-Hebrew
                // Check if message is Russian and skip translation
                const isRussian = isTextRussian(messageText);
                if (isRussian) {
                    console.log(`[${getTimestamp()}] 🇷🇺 Russian message detected - skipping translation from ${senderId}`);
                    return; // Skip translation for Russian messages
                }
                console.log(`[${getTimestamp()}] 🌐 Non-Hebrew message detected from ${senderId}`);
                console.log(`   Message text: "${messageText.substring(0, 50)}..."`);
                
                // Import translation service
                const { translationService } = require('./services/translationService');
                await translationService.initialize();
                
                if (translationService.initialized) {
                    const userId = senderId;
                    
                    try {
                        // Check rate limiting for translation
                        translationService.checkRateLimit(userId);
                        
                        // Translate to Hebrew
                        const result = await translationService.translateText(messageText, 'he', null, userId);
                        
                        // Send translation as reply to the original message
                        let translationResponse = `🌐 *תרגום לעברית:*\n\n`;
                        translationResponse += `"${result.translatedText}"\n\n`;
                        translationResponse += `📝 *מקור:* ${translationService.getSupportedLanguages()[result.detectedLanguage] || result.detectedLanguage}`;
                        
                        await sock.sendMessage(groupId, { 
                            text: translationResponse,
                            contextInfo: {
                                quotedMessage: msg.message,
                                participant: senderId
                            }
                        });
                        
                        console.log(`✅ Sent immediate Hebrew translation for ${result.detectedLanguage} text`);
                        
                    } catch (translationError) {
                        if (translationError.message.includes('Rate limit')) {
                            console.log(`   ⏳ Translation skipped: Rate limited for user ${userId}`);
                        } else {
                            console.error(`❌ Translation failed:`, translationError.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Auto-translation error:`, error.message);
        }
    }
    
    // DISABLED: Check for "משעמם" messages and respond with funny jokes
    // Commenting out this feature as requested
    /*
    if (messageText.includes('משעמם')) {
        // Use the same deduplication logic as the command handler
        const CommandHandler = require('./services/commandHandler');
        const messageId = msg.key.id;

        // Check if we already processed this "משעמם" message
        if (CommandHandler.processedMessages.has(messageId + '_boring')) {
            console.log(`[${getTimestamp()}] ⚠️ Duplicate "משעמם" message ignored: ${messageId}`);
            return; // Skip processing
        }

        // Mark message as processed for "משעמם" responses
        CommandHandler.processedMessages.add(messageId + '_boring');

        // Check if jokes are enabled for this group
        const groupJokeSettingsService = require('./services/groupJokeSettingsService');
        const jokesEnabled = await groupJokeSettingsService.areJokesEnabled(groupId);

        if (!jokesEnabled) {
            console.log(`[${getTimestamp()}] 🎭 "משעמם" jokes disabled for group ${groupId} - ignoring message`);
            return; // Skip joke response if disabled for this group
        }

        console.log(`[${getTimestamp()}] 😴 "משעמם" detected from ${senderId} in ${groupId}`);

        try {
            const { motivationalPhraseService } = require('./services/motivationalPhraseService');
            const joke = await motivationalPhraseService.getRandomPhrase();

            await sock.sendMessage(groupId, {
                text: joke
            });

            console.log(`✅ Sent funny response to "משעמם" message`);
        } catch (error) {
            console.error('❌ Failed to send motivational phrase:', error.message);

            // Fallback response if database fails
            try {
                await sock.sendMessage(groupId, {
                    text: "😴 משעמם? בואו נעשה משהו מעניין! 🎉\nBored? Let's do something interesting! 🎉"
                });
                console.log('✅ Sent fallback response to "משעמם" message');
            } catch (fallbackError) {
                console.error('❌ Failed to send fallback response:', fallbackError.message);
            }
        }

        // Continue processing (don't return, let other checks happen too)
    }
    */
    
    // Check for invite links (only if feature is enabled)
    if (!config.FEATURES.INVITE_LINK_DETECTION) {
        return; // Invite link detection disabled
    }

    // Ensure messageText exists before pattern matching
    if (!messageText || typeof messageText !== 'string') {
        console.log(`[${getTimestamp()}] ⚠️ No message text available for invite link detection`);
        return;
    }

    const matches = messageText.match(config.PATTERNS.INVITE_LINK);
    if (!matches || matches.length === 0) return;
    
    console.log(`\n[${getTimestamp()}] 🚨 INVITE LINK DETECTED!`);
    console.log(`Group: ${groupId}`);
    console.log(`Sender: ${senderId}`);
    console.log(`Links: ${matches.join(', ')}`);
    
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Check if sender is admin (using comprehensive admin detection)
        const senderParticipant = groupMetadata.participants.find(p => p.id === senderId);
        const senderIsAdmin = senderParticipant && (
            senderParticipant.admin === 'admin' || 
            senderParticipant.admin === 'superadmin' ||
            senderParticipant.isAdmin || 
            senderParticipant.isSuperAdmin
        );
        
        if (senderIsAdmin) {
            console.log('✅ Sender is admin, ignoring invite link');
            console.log(`   Admin properties: admin="${senderParticipant.admin}", isAdmin=${senderParticipant.isAdmin}, isSuperAdmin=${senderParticipant.isSuperAdmin}`);
            return;
        }
        
        // Check cooldown
        const lastKick = kickCooldown.get(senderId);
        if (lastKick && Date.now() - lastKick < config.KICK_COOLDOWN) {
            console.log('⏳ User recently kicked, skipping to prevent spam');
            return;
        }
        
        // Check bot permissions before attempting deletion (unless bypass is enabled)
        let permissions = { canDeleteMessages: true, canKickUsers: true };
        if (!config.FEATURES.BYPASS_BOT_ADMIN_CHECK) {
            permissions = await permissionChecker.checkBotPermissions(sock, groupId);
        } else {
            console.log(`[${getTimestamp()}] ⚡ Bot admin check bypassed - assuming admin permissions`);
        }

        let deletionFailed = false;
        let deletionError = null;

        if (!permissions.canDeleteMessages) {
            console.error(`❌ Bot cannot delete messages in ${groupId}`);
            permissionChecker.logPermissionIssue('delete_invite_message', groupId, permissions, {
                messageId: msg.key.id,
                senderId: senderId,
                inviteLinks: matches
            });
            deletionFailed = true;
            deletionError = 'Bot lacks delete permission';

            // Send Hebrew message to group explaining bot needs admin
            const hebrewMessage = `🚨 *קישור הזמנה לקבוצת וואטסאפ זוהה!*\n\n` +
                                `❌ הבוט לא יכול למחוק הודעות בקבוצה זו\n` +
                                `🛡️ *הבוט חייב להיות מנהל כדי למחוק קישורי הזמנה*\n\n` +
                                `⚠️ *אם לא מעוניינים להפוך את הבוט למנהל, אנא הסירו אותו מהקבוצה*`;

            try {
                await sock.sendMessage(groupId, { text: hebrewMessage });
                console.log(`📢 Sent Hebrew admin request message to group ${groupId}`);
            } catch (messageError) {
                console.error('Failed to send admin request message:', messageError.message);
            }

            // Continue with kicking even if can't delete
        } else {
            // Delete the message first (always delete invite links)
            try {
                if (config.FEATURES.STEALTH_MODE) {
                    const deleteResult = await stealthUtils.deleteMessageHumanLike(sock, groupId, msg.key, { urgent: true });
                    if (deleteResult.success) {
                        console.log('✅ Deleted invite link message (stealth mode)');
                        if (deleteResult.apiResult) {
                            console.log(`   API Response: ${JSON.stringify(deleteResult.apiResult)}`);
                        }
                    } else {
                        console.error('❌ Failed to delete message (stealth):', deleteResult.error);
                        advancedLogger.logPermissionError('delete_invite_message', groupId, deleteResult.error || 'Unknown deletion failure');
                        deletionFailed = true;
                        deletionError = deleteResult.error || 'Unknown stealth deletion failure';
                    }
                } else {
                    const deleteResult = await sock.sendMessage(groupId, { delete: msg.key });
                    console.log('✅ Deleted invite link message');
                    console.log(`   API Response: ${JSON.stringify(deleteResult)}`);
                }
            } catch (deleteError) {
                console.error('❌ Failed to delete message:', deleteError.message);
                advancedLogger.logPermissionError('delete_invite_message', groupId, deleteError);
                deletionFailed = true;
                deletionError = deleteError.message;
            }
        }

        // Send alert to admin if deletion failed
        if (deletionFailed) {
            const adminPhone = config.ALERT_PHONE || '972544345287';
            const adminId = adminPhone.startsWith('972') ?
                adminPhone + '@s.whatsapp.net' :
                '972' + adminPhone + '@s.whatsapp.net';

            const alertMessage = `🚨 *FAILED TO DELETE INVITE LINK*\n\n` +
                               `❌ *Deletion Failed*\n` +
                               `📍 Group: ${groupMetadata?.subject || groupId}\n` +
                               `👤 Sender: ${senderId}\n` +
                               `🔗 Link: ${matches.join(', ')}\n` +
                               `⏰ Time: ${getTimestamp()}\n` +
                               `❗ Error: ${deletionError}\n\n` +
                               `*Bot Permissions:*\n` +
                               `• Admin Status: ${permissions.isAdmin ? '✅ Yes' : '❌ No'}\n` +
                               `• Can Delete: ${permissions.canDeleteMessages ? '✅ Yes' : '❌ No'}\n` +
                               `• Can Kick: ${permissions.canKickUsers ? '✅ Yes' : '❌ No'}\n\n` +
                               `⚠️ *The invite link message is still visible in the group!*\n` +
                               `📱 Please delete it manually or check bot admin status.`;

            try {
                await sock.sendMessage(adminId, { text: alertMessage });
                console.log(`📱 Sent deletion failure alert to admin: ${adminPhone}`);
            } catch (alertError) {
                console.error('Failed to send deletion failure alert:', alertError.message);
            }
        }

        // Check if user is Israeli (phone starts with 972)
        const userPhone = senderId.split('@')[0];
        const isIsraeliUser = userPhone.startsWith('972');
        
        console.log(`[${getTimestamp()}] 🇮🇱 User origin check: ${userPhone} - Israeli: ${isIsraeliUser}`);
        
        if (!isIsraeliUser) {
            // Non-Israeli user - immediate kick with optimized blacklisting
            console.log(`[${getTimestamp()}] 🚨 Non-Israeli user sending invite link - immediate kick`);

            // Add to blacklist first (with minimal Firebase usage via caching)
            const blacklistSuccess = await blacklistService.addToBlacklist(senderId, 'Non-Israeli user sent invite link - immediate kick');
            if (!blacklistSuccess) {
                console.error('❌ Failed to blacklist non-Israeli user - proceeding with kick anyway');
            }

            // Kick the user immediately (only if bot has permission)
            if (permissions.canKickUsers) {
                try {
                    await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                    console.log('✅ Kicked non-Israeli user immediately:', senderId);
                    kickCooldown.set(senderId, Date.now());
                
                // Send admin alert about immediate kick
                const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
                const alertMessage = `🚨 *Non-Israeli User Kicked (Immediate)*\n\n` +
                                   `📍 Group: ${groupMetadata.subject}\n` +
                                   `👤 User: ${senderId}\n` +
                                   `📞 Phone: ${userPhone}\n` +
                                   `🌍 Origin: Non-Israeli (not +972)\n` +
                                   `🔗 Spam Links: ${matches.join(', ')}\n` +
                                   `⏰ Time: ${getTimestamp()}\n\n` +
                                   `✅ Actions taken:\n` +
                                   `• Message deleted\n` +
                                   `• User blacklisted\n` +
                                   `• User kicked immediately (non-Israeli policy)`;
                
                try {
                    await sock.sendMessage(adminId, { text: alertMessage });
                    console.log('✅ Sent immediate kick alert to admin');
                } catch (adminError) {
                    console.error('❌ Failed to send admin alert:', adminError.message);
                }
                
                // Get group invite link for rejoin system
                let groupInviteLink = 'N/A';
                try {
                    const inviteCode = await sock.groupInviteCode(groupId);
                    groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                } catch (err) {
                    console.log('Could not get group invite link for non-Israeli user:', err.message);
                }

                // Record kicked non-Israeli user for potential #free system usage
                try {
                    const { kickedUserService } = require('./services/kickedUserService');
                    
                    // Extract admin information from group metadata
                    const adminList = [];
                    if (groupMetadata && groupMetadata.participants) {
                        groupMetadata.participants
                            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                            .forEach(admin => {
                                const adminId = admin.id;
                                let adminName = 'Admin';
                                let adminPhone = 'Unknown';
                                
                                if (adminId.includes('@s.whatsapp.net')) {
                                    adminPhone = adminId.split('@')[0];
                                    adminName = `+${adminPhone}`;
                                } else if (adminId.includes('@lid')) {
                                    adminName = 'Admin (LID)';
                                    adminPhone = adminId.split('@')[0].substring(0, 8) + '...';
                                }
                                
                                adminList.push({
                                    id: adminId,
                                    name: adminName,
                                    phone: adminPhone,
                                    isLID: adminId.includes('@lid')
                                });
                            });
                    }
                    
                    await kickedUserService.recordKickedUser(
                        senderId,
                        groupId,
                        groupMetadata?.subject || 'Unknown Group',
                        groupInviteLink,
                        'Non-Israeli user - Immediate kick for invite link',
                        adminList
                    );
                    console.log('✅ Recorded kicked non-Israeli user for potential #free usage');
                } catch (error) {
                    console.error('⚠️ Failed to record kicked non-Israeli user:', error.message);
                }

                    // Non-Israeli users get NO MESSAGE - silent kick only
                    console.log('🔇 Non-Israeli user kicked silently - no message sent');

                } catch (kickError) {
                    advancedLogger.logPermissionError('kick_non_israeli_user', groupId, kickError);
                }
            } else {
                console.log(`⚠️ Cannot kick non-Israeli user - bot lacks kick permission in ${groupId}`);
            }
            
        } else {
            // Israeli user - immediate kick with optimized blacklisting
            console.log(`[${getTimestamp()}] 🚨 Israeli user sending invite link - immediate kick`);

            // Add to blacklist first (with minimal Firebase usage via caching)
            const blacklistSuccess = await blacklistService.addToBlacklist(senderId, 'Israeli user sent invite link - immediate kick');
            if (!blacklistSuccess) {
                console.error('❌ Failed to blacklist Israeli user - proceeding with kick anyway');
            }

            // Kick the user immediately (only if bot has permission)
            if (permissions.canKickUsers) {
                try {
                    await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                    console.log('✅ Kicked Israeli user immediately:', senderId);
                    kickCooldown.set(senderId, Date.now());
                
                // Send admin alert about immediate kick
                const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
                const alertMessage = `🚨 *Israeli User Kicked (Immediate)*\n\n` +
                                   `📍 Group: ${groupMetadata.subject}\n` +
                                   `👤 User: ${senderId}\n` +
                                   `📞 Phone: ${userPhone}\n` +
                                   `🌍 Origin: Israeli (+972)\n` +
                                   `🔗 Spam Links: ${matches.join(', ')}\n` +
                                   `⏰ Time: ${getTimestamp()}\n\n` +
                                   `✅ Actions taken:\n` +
                                   `• Message deleted\n` +
                                   `• User blacklisted\n` +
                                   `• User kicked immediately`;
                
                try {
                    await sock.sendMessage(adminId, { text: alertMessage });
                    console.log('✅ Sent immediate kick alert to admin');
                } catch (adminError) {
                    console.error('❌ Failed to send admin alert:', adminError.message);
                }
                
                // Get group invite link for rejoin system
                let groupInviteLink = 'N/A';
                try {
                    const inviteCode = await sock.groupInviteCode(groupId);
                    groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                } catch (err) {
                    console.log('Could not get group invite link for Israeli user:', err.message);
                }

                // Record kicked Israeli user for potential #free system usage
                try {
                    const { kickedUserService } = require('./services/kickedUserService');
                    
                    // Extract admin information from group metadata
                    const adminList = [];
                    if (groupMetadata && groupMetadata.participants) {
                        groupMetadata.participants
                            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                            .forEach(admin => {
                                const adminId = admin.id;
                                let adminName = 'Admin';
                                let adminPhone = 'Unknown';
                                
                                if (adminId.includes('@s.whatsapp.net')) {
                                    adminPhone = adminId.split('@')[0];
                                    adminName = `+${adminPhone}`;
                                } else if (adminId.includes('@lid')) {
                                    adminName = 'Admin (LID)';
                                    adminPhone = adminId.split('@')[0].substring(0, 8) + '...';
                                }
                                
                                adminList.push({
                                    id: adminId,
                                    name: adminName,
                                    phone: adminPhone,
                                    isLID: adminId.includes('@lid')
                                });
                            });
                    }
                    
                    await kickedUserService.recordKickedUser(
                        senderId,
                        groupId,
                        groupMetadata?.subject || 'Unknown Group',
                        groupInviteLink,
                        'Israeli user - Immediate kick for invite link',
                        adminList
                    );
                    console.log('✅ Recorded kicked Israeli user for potential #free usage');
                } catch (error) {
                    console.error('⚠️ Failed to record kicked Israeli user:', error.message);
                }
                    // Israeli users get NO MESSAGE - silent kick (same as non-Israeli)
                    console.log('🔇 Israeli user kicked silently - no message sent');

                } catch (kickError) {
                    advancedLogger.logPermissionError('kick_israeli_user', groupId, kickError);
                }
            } else {
                console.log(`⚠️ Cannot kick Israeli user - bot lacks kick permission in ${groupId}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error handling invite spam:', error);
    }
}

// Handle bot welcome when added to a group
async function handleBotWelcome(sock, groupId, addedBy) {
    try {
        console.log(`[${getTimestamp()}] 🎉 Bot was added to group: ${groupId}`);
        console.log(`[${getTimestamp()}] 👤 Added by: ${addedBy || 'Unknown'}`);
        
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        const groupName = groupMetadata.subject || 'Unknown Group';
        
        console.log(`[${getTimestamp()}] 🎯 Group name: ${groupName}`);
        
        // Send welcome message to the group
        const welcomeMessage = `ברור! קבל גרסה עם יותר הומור:

כל מי שישלח קישור הזמנה לוואטסאפ —
יעוף מהקבוצה מהר יותר מההודעה של "אמא בדרך"! 🚀🤣

רק האדמינים מחלקים קישורים,
אז תשאירו את הקישורים בארון, יחד עם הגרביים הלא תואמות 🧦😉

תחסכו לנו סצנות, ותישארו איתנו בצחוקים! 😜🔗🍬`;
        
        await sock.sendMessage(groupId, { text: welcomeMessage });
        
        // Alert admin about new group
        const adminId = config.ALERT_PHONE + '@s.whatsapp.net';
        const addedByPhone = addedBy ? addedBy.split('@')[0] : 'Unknown';
        
        const adminAlert = `🎉 *Bot Added to New Group!*

` +
            `🎯 **Group:** ${groupName}
` +
            `🆔 **Group ID:** ${groupId}
` +
            `👤 **Added by:** ${addedByPhone}
` +
            `👥 **Members:** ${groupMetadata.participants.length}
` +
            `⏰ **Time:** ${getTimestamp()}

` +
            `🔍 **Next steps:**
` +
            `1️⃣ Check if bot has admin privileges
` +
            `2️⃣ Test bot commands if needed
` +
            `3️⃣ Monitor group for first few hours

` +
            `🛡️ *Protection is now active in this group!*`;
        
        await sock.sendMessage(adminId, { text: adminAlert });
        
    } catch (error) {
        console.error(`❌ Error in bot welcome handler:`, error);
    }
}

// Handle new group joins
async function handleGroupJoin(sock, groupId, participants, addedBy = null) {
    console.log(`\n[${getTimestamp()}] 👥 New participants joined group ${groupId}`);
    if (addedBy) {
        console.log(`   Added by: ${addedBy}`);
    }
    
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Check if the person who added them is an admin
        let addedByAdmin = false;
        if (addedBy) {
            const adderParticipant = groupMetadata.participants.find(p => p.id === addedBy);
            addedByAdmin = adderParticipant && (adderParticipant.admin === 'admin' || adderParticipant.admin === 'superadmin');
            if (addedByAdmin) {
                console.log('✅ Participants added by admin - blacklist check will be skipped');
            }
        }
        
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
            
            // Check if user is blacklisted (optimized with local caching)
            if (!addedByAdmin && await blacklistService.isBlacklisted(participantId)) {
                console.log(`🚫 Blacklisted user detected: ${participantId}`);

                try {
                    // Remove the blacklisted user
                    await sock.groupParticipantsUpdate(groupId, [participantId], 'remove');
                    console.log('✅ Kicked blacklisted user');

                    // Send notification to admin instead of user
                    try {
                        await sock.sendMessage('0544345287@s.whatsapp.net', {
                            text: `🚫 Blacklisted user auto-removed\n\n` +
                                  `👤 User: ${participantId}\n` +
                                  `📍 Group: ${groupMetadata.subject}\n` +
                                  `📱 Reason: User on blacklist\n` +
                                  `⏰ Time: ${getTimestamp()}`
                        });
                    } catch (notifyError) {
                        console.log('Could not notify admin:', notifyError.message);
                    }

                    // No additional admin alert needed - already sent above

                } catch (error) {
                    advancedLogger.logPermissionError('kick_blacklisted_user', groupId, error);
                }
                continue; // Skip further checks for this user
            } else if (addedByAdmin && await blacklistService.isBlacklisted(participantId)) {
                console.log(`⚠️ Blacklisted user ${participantId} allowed to join - added by admin`);
            }
            
            // Check if phone number starts with +1 or +6 (or just 1 or 6 without +)
            // More precise check: US/Canada (+1) has 11 digits, Southeast Asia (+6x) has varying lengths
            // IMPORTANT: Never kick Israeli numbers (+972)
            const isIsraeliNumber = phoneNumber.startsWith('972') || phoneNumber.startsWith('+972');
            
            if (isIsraeliNumber) {
                console.log(`🇮🇱 Protecting Israeli number on join: ${phoneNumber}`);
            }
            
            // CRITICAL FIX: LID format users are exempt from country code restrictions
            // @lid identifiers are encrypted privacy IDs, NOT phone numbers
            // The first digit has NO relationship to country codes
            if (isLidFormat) {
                console.log(`🔒 LID format user exempt from country restrictions: ${phoneNumber} (encrypted privacy ID)`);
            }
            
            if (config.FEATURES.RESTRICT_COUNTRY_CODES && !isIsraeliNumber && !addedByAdmin && !isLidFormat &&
                ((phoneNumber.startsWith('1') && phoneNumber.length === 11) || // US/Canada format
                 (phoneNumber.startsWith('+1') && phoneNumber.length === 12) || // US/Canada with +
                 (phoneNumber.startsWith('6') && phoneNumber.length >= 10 && phoneNumber.length <= 12) || // Southeast Asia
                 (phoneNumber.startsWith('+6') && phoneNumber.length >= 11 && phoneNumber.length <= 13))) { // Southeast Asia with +
                
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
                    advancedLogger.logPermissionError('kick_restricted_country_code', groupId, error);
                }
            } else if (addedByAdmin && config.FEATURES.RESTRICT_COUNTRY_CODES && !isIsraeliNumber && !isLidFormat &&
                      ((phoneNumber.startsWith('1') && phoneNumber.length === 11) || 
                       (phoneNumber.startsWith('6') && phoneNumber.length >= 10 && phoneNumber.length <= 12))) {
                console.log(`⚠️ Restricted country code user ${participantId} allowed to join - added by admin`);
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
    
    // Check for single instance
    const canStart = await SingleInstance.acquire();
    if (!canStart) {
        console.error('\n❌ Cannot start: Another instance is already running!');
        console.log('\nPossible solutions:');
        console.log('1. Stop the other instance (pm2 stop commguard)');
        console.log('2. Delete .commguard.lock if the other instance crashed');
        console.log('3. Use ./fix-multiple-connections.sh to manage instances');
        process.exit(1);
    }
    
    // Check auth state
    await SingleInstance.checkAuth();
    
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
    
    // Don't exit on connection-related errors, including error 515
    if (err.message?.includes('Connection Closed') || 
        err.message?.includes('Stream Errored') ||
        err.message?.includes('515') ||
        err.message?.includes('stream:error') ||
        err.message?.includes('decrypt')) {
        console.log(`[${getTimestamp()}] 🔄 Connection error detected, bot will attempt to reconnect...`);
        
        // Log 515 errors specifically for monitoring
        if (err.message?.includes('515') || err.message?.includes('stream:error')) {
            console.log(`[${getTimestamp()}] 🚨 Error 515 handled gracefully in uncaught exception`);
        }
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
            errorMessage.includes('515') ||
            errorMessage.includes('stream:error') ||
            errorMessage.includes('conflict') ||
            errorMessage.includes('replaced') ||
            errorMessage.includes('precondition')) {
            console.log(`[${getTimestamp()}] 🔄 Connection issue detected, will handle gracefully...`);
            
            // Log 515 errors specifically for monitoring
            if (errorMessage.includes('515') || errorMessage.includes('stream:error')) {
                console.log(`[${getTimestamp()}] 🚨 Error 515 handled gracefully in promise rejection`);
            }
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

// Start the application with restart limiting
async function startWithRestartLimit() {
    try {
        // Record restart attempt
        const restartCount = await restartLimiter.recordRestart('Bot startup');

        // Check if emergency stop needed
        if (restartLimiter.shouldEmergencyStop()) {
            console.error(`[${getTimestamp()}] 🚨 EMERGENCY STOP: Too many restarts (${restartCount})`);
            console.error('Manual intervention required. Check logs and fix underlying issues.');
            process.exit(1);
        }

        // Check if restart limit exceeded
        if (restartLimiter.isRestartLimitExceeded()) {
            console.error(`[${getTimestamp()}] ⚠️ RESTART LIMIT EXCEEDED: ${restartCount}/10 today`);
            console.error('Continuing but monitoring closely...');
        }

        // Start main application
        await main();

    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Startup failed:`, error.message);

        // Record restart failure
        await restartLimiter.recordRestart(`Startup failure: ${error.message}`);

        // Check if we should stop trying
        if (restartLimiter.shouldEmergencyStop()) {
            console.error(`[${getTimestamp()}] 🚨 Too many failed starts. Stopping.`);
            process.exit(1);
        }

        throw error;
    }
}

startWithRestartLimit();