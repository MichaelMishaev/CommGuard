// Load environment variables from .env file
require('dotenv').config();

const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, delay } = require('baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { logger, getTimestamp, advancedLogger } = require('./utils/logger');
const permissionChecker = require('./utils/permissionChecker');
const config = require('./config');
const SingleInstance = require('./single-instance');
const { handleSessionError, shouldSkipUser, clearProblematicUsers, STARTUP_TIMEOUT, checkStickerCommand } = require('./utils/sessionManager');
const stealthUtils = require('./utils/stealthUtils');
const restartLimiter = require('./utils/restartLimiter');
const crashLoopGuard = require('./utils/crashLoopGuard'); // NEW: Crash loop detection (5-min window)
const { trackRestart } = require('./utils/restartTracker');
const memoryMonitor = require('./utils/memoryMonitor');
const memoryLeakDetector = require('./utils/memoryLeakDetector');
const { queueScan } = require('./services/scanQueueService');
const { startScanWorker } = require('./services/blacklistScanWorker');
const { extractPhoneNumber } = require('./utils/lidDecoder');

// Conditionally load Firebase services only if enabled
let blacklistService, whitelistService, muteService, unblacklistRequestService;

// Group admin management system
const groupAdminCache = new Map(); // Memory cache for speed
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache
const DB_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour DB updates

// Track recent bot promotions to avoid mass-scanning on member list sync
const recentPromotions = new Map(); // groupId -> timestamp
const PROMOTION_SYNC_WINDOW = 10000; // 10 seconds after promotion

// Startup phase management for session optimization
let isStartupPhase = true;

// Debug: Log archived chats every 30 seconds
setInterval(() => {
    if (typeof archivedChats !== 'undefined' && archivedChats.size > 0) {
        console.log(`[ARCHIVED-STATUS] Currently tracking ${archivedChats.size} archived chats:`);
        for (const chatId of archivedChats) {
            console.log(`   - ${chatId}`);
        }
    }
}, 30000);

// Track archived chats to skip message processing
const archivedChats = new Set();
let startupTimer = null;

// Track if startup notification was already sent in this process (to avoid duplicate notifications on reconnect)
let startupNotificationSent = false;
const PROCESS_START_PID = process.pid; // Store PID at process start

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
    console.log(`[${getTimestamp()}] ⏰ Startup timer fired - isStartupPhase was: ${isStartupPhase}`);
    if (isStartupPhase) {
        isStartupPhase = false;
        try {
            clearProblematicUsers();
        } catch (e) {
            console.error('Error in clearProblematicUsers:', e);
        }
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
                    let metadata = null; // Define outside try block to avoid scope issues in catch
                    try {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Spread out API calls
                        metadata = await sock.groupMetadata(groupId);
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
// Load PostgreSQL-based services (NO FIREBASE)
console.log(`[${getTimestamp()}] 📊 Using PostgreSQL for all services (Firebase removed)`);

const blacklistModule = require('./services/blacklistService.postgres');
const whitelistModule = require('./services/whitelistService');
const muteModule = require('./services/muteService');

blacklistService = {
    loadBlacklistCache: blacklistModule.loadBlacklistCache,
    isBlacklisted: blacklistModule.isBlacklisted,
    addToBlacklist: blacklistModule.addToBlacklist,
    removeFromBlacklist: blacklistModule.removeFromBlacklist,
    getAllBlacklisted: blacklistModule.getAllBlacklisted
};

// Whitelist and Mute services (keep using existing implementation for now)
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

// Unblacklist request service - Firebase removed, disabled for now
unblacklistRequestService = {
    loadRequestCache: async () => { console.log(`[${getTimestamp()}] 📋 Unblacklist requests disabled (Firebase removed)`); },
    canMakeRequest: async () => ({ canRequest: false, reason: 'Firebase removed' }),
    createRequest: async () => false,
    processAdminResponse: async () => false,
    getPendingRequests: async () => []
};

const CommandHandler = require('./services/commandHandler');
const { clearSessionErrors, mightContainInviteLink, extractMessageText } = require('./utils/sessionManager');
const { sendKickAlert, sendSecurityAlert, sendBlacklistRejoinAlert } = require('./utils/alertService');
const { robustKick } = require('./utils/kickHelper');
const { decodeLIDToPhone } = require('./utils/jidUtils');
const { storePendingRequest, getPendingRequest, removePendingRequest } = require('./utils/blacklistPendingRequests');

// Initialize Database (PostgreSQL + Redis)
const { initDatabase } = require('./database/connection');
const { initRedis } = require('./services/redisService');
const { incrementViolation, getViolations, blacklistUser, getUserByPhone, upsertGroup } = require('./database/groupService');
const { cacheBlacklistedUser, removeFromBlacklistCache } = require('./services/redisService');

// Initialize databases if URLs are provided
if (process.env.DATABASE_URL) {
    console.log(`[${getTimestamp()}] 📊 Initializing PostgreSQL connection...`);
    initDatabase(process.env.DATABASE_URL);
} else {
    console.log(`[${getTimestamp()}] ⚠️  DATABASE_URL not found - database features disabled`);
}

if (process.env.REDIS_URL) {
    console.log(`[${getTimestamp()}] 📦 Initializing Redis connection...`);
    initRedis(process.env.REDIS_URL);
} else {
    console.log(`[${getTimestamp()}] ⚠️  REDIS_URL not found - Redis caching disabled`);
}

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

    // Initialize sentiment analysis service (GPT-5 mini)
    try {
        const sentimentAnalysisService = require('./services/sentimentAnalysisService');
        await sentimentAnalysisService.initialize();
        console.log('✅ Sentiment analysis service initialized (GPT-4.1-nano)');
    } catch (error) {
        console.warn('⚠️ Failed to initialize sentiment analysis service:', error.message);
    }

    // Initialize Bullywatch v2.0 Anti-Bullying System
    try {
        const bullywatch = require('./services/bullywatch');
        await bullywatch.initialize();
        const status = bullywatch.getStatus();
        console.log(`✅ Bullywatch v2.0 initialized (Monitor Mode: ${status.monitorMode ? 'ON' : 'OFF'}, GPT: ${status.gptEnabled ? 'ON' : 'OFF'})`);
    } catch (error) {
        console.warn('⚠️ Failed to initialize Bullywatch:', error.message);
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

    // Track archived chats
    sock.ev.on('chats.upsert', (chats) => {
        for (const chat of chats) {
            if (chat.archived) {
                archivedChats.add(chat.id);
                console.log(`[📦] Chat archived: ${chat.id}`);
            }
        }
    });

    sock.ev.on('chats.update', (updates) => {
        for (const update of updates) {
            if (update.archived === true) {
                archivedChats.add(update.id);
                console.log(`[📦] Chat archived: ${update.id}`);
            } else if (update.archived === false) {
                archivedChats.delete(update.id);
                console.log(`[📦] Chat unarchived: ${update.id}`);
            }
        }
    });
    
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

            console.error(`\n${'='.repeat(80)}`);
            console.error(`[${getTimestamp()}] ❌ CONNECTION CLOSED`);
            console.error(`${'='.repeat(80)}`);
            console.error(`📊 Status Code: ${disconnectReason}`);
            console.error(`💬 Error Message: ${errorMessage}`);
            console.error(`🔄 Reconnect Attempt: ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
            console.error(`⚠️  Error 515 Count: ${error515Count}/${MAX_515_ERRORS}`);
            console.error(`⏰ Timestamp: ${new Date().toISOString()}`);
            console.error(`${'='.repeat(80)}\n`);
            
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
            
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[${getTimestamp()}] ✅ BOT CONNECTED SUCCESSFULLY!`);
            console.log(`${'='.repeat(80)}`);
            console.log(`🆔 Bot ID: ${sock.user.id}`);
            console.log(`👤 Bot Name: ${sock.user.name}`);
            console.log(`📱 Platform: ${sock.user.platform || 'Unknown'}`);
            console.log(`📞 Bot Phone: ${sock.user.id.split(':')[0].split('@')[0]}`);
            console.log(`🔄 Reconnect Attempts: ${reconnectAttempts}`);
            console.log(`⏰ Connected At: ${new Date().toISOString()}`);

            // Log timestamp filtering info
            const cutoffTime = new Date(BOT_START_TIME - MESSAGE_GRACE_PERIOD);
            console.log(`⏭️  Ignoring messages older than: ${cutoffTime.toLocaleString()}`);
            console.log(`⚡ This will skip message backlog from while bot was down`);
            console.log(`${'='.repeat(80)}\n`);

            // Notify admin of successful connection with restart count
            // DISABLED: This was causing the bot to hang during startup
            // The main startup notification below includes restart tracking info
            // try {
            //     const restartStats = restartLimiter.getStats();
            //     await restartLimiter.notifyAdmin(sock, restartStats.todayCount, 'Connection successful');
            // } catch (notifyError) {
            //     console.log('Could not notify admin of connection:', notifyError.message);
            // }
            
            // Store bot phone for later use
            const botPhone = sock.user.id.split(':')[0].split('@')[0];
            sock.botPhone = botPhone;
            console.log(`Bot Phone: ${botPhone}`);

            // CRITICAL: Auto-register all groups in database on startup
            // This ensures #bullywatch and other commands work for all groups
            if (process.env.DATABASE_URL) {
                console.log(`\n📊 Auto-registering groups in database...`);
                try {
                    const allGroups = await sock.groupFetchAllParticipating();
                    const groupList = Object.values(allGroups);
                    console.log(`   Found ${groupList.length} groups to register`);

                    for (const group of groupList) {
                        try {
                            await upsertGroup(group);
                        } catch (err) {
                            console.error(`   ⚠️ Failed to register group ${group.subject}:`, err.message);
                        }
                    }
                    console.log(`✅ Group auto-registration completed\n`);
                } catch (error) {
                    console.error(`⚠️ Failed to auto-register groups (non-critical):`, error.message);
                }
            }

            console.log(`\n🛡️ CommGuard Bot (Baileys Edition) is now protecting your groups!`);
            console.log(`🔧 Enhanced session error recovery active`);
            console.log(`⚡ Fast startup mode enabled (${STARTUP_TIMEOUT / 1000}s)`);

            // 🚨 CRASH LOOP GUARD: Send alert if crash loop was detected
            const crashLoopStatus = crashLoopGuard.checkForCrashLoop();
            if (crashLoopStatus.shouldAlert) {
                console.log(`⚠️ Sending crash loop alert to admin...`);
                setTimeout(async () => {
                    try {
                        await crashLoopGuard.sendAlertToAdmin(
                            sock,
                            config.ALERT_PHONE + '@s.whatsapp.net',
                            crashLoopStatus
                        );
                    } catch (error) {
                        console.error('Failed to send crash loop alert:', error.message);
                    }
                }, 5000); // Wait 5 seconds after connection to avoid startup hang
            }
            
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
                    
                    // DISABLED: This was blocking ALL @lid users (most modern WhatsApp users)
                    // which prevented the bot from receiving invite links and other messages!
                    // The bot now processes all messages normally.
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

            // Track restart reason BEFORE sending startup notification
            let restartInfo, restartReasons, timeSinceLast;
            try {
                restartInfo = trackRestart();
                restartReasons = restartInfo.possibleReasons.join(', ');
                timeSinceLast = restartInfo.timeSinceLastStartFormatted || 'First start';

                // Check memory health at startup
                const memoryHealth = memoryMonitor.getSafeStartupRecommendation();

                // LOG RESTART INFO TO PRODUCTION CONSOLE
                console.log(`\n${'='.repeat(80)}`);
                console.log(`[${getTimestamp()}] 🔄 BOT RESTART DETECTED`);
                console.log(`${'='.repeat(80)}`);
                console.log(`📊 Restart Reasons: ${restartReasons}`);
                console.log(`⏱️  Time since last restart: ${timeSinceLast}`);
                console.log(`🆔 Process ID: ${restartInfo.pid}`);
                console.log(`💾 Memory Usage: ${(restartInfo.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
                if (restartInfo.lastProcess) {
                    console.log(`📈 Previous Memory: ${(restartInfo.lastProcess.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`⏰ Previous PID: ${restartInfo.lastProcess.pid}`);
                }
                if (restartInfo.gitPullTime) {
                    const gitPullDate = new Date(restartInfo.gitPullTime);
                    console.log(`🚀 Last Git Pull: ${gitPullDate.toLocaleString('en-GB')}`);
                }

                // Display memory health
                console.log(`${'='.repeat(80)}`);
                console.log(memoryHealth.message);
                const memStats = memoryMonitor.getMemoryStats();
                console.log(memoryMonitor.formatMemoryStats(memStats));
                console.log(`${'='.repeat(80)}\n`);
                console.log(`📁 Restart log: restart_history.jsonl`);
                console.log(`${'='.repeat(80)}\n`);
            } catch (restartTrackingError) {
                console.error(`[${getTimestamp()}] ❌ RESTART TRACKING ERROR:`, restartTrackingError.message);
                console.error(`   Stack: ${restartTrackingError.stack}`);
                // Set defaults if tracking fails
                restartReasons = 'Unknown - tracking failed';
                timeSinceLast = 'Unknown';
            }

            // Send startup notification ONLY on actual process restart, not on reconnection
            // This prevents spam notifications when the bot reconnects after a WhatsApp disconnect
            const isActualProcessStart = !startupNotificationSent;

            if (isActualProcessStart) {
                try {
                    const adminId = config.ADMIN_PHONE + '@s.whatsapp.net';
                    const memStats = memoryMonitor.getMemoryStats();
                    const memHealth = memoryMonitor.getMemoryHealth(memStats);
                    const statusMessage = `🟢 CommGuard Bot Started\n\n` +
                                        `✅ Bot is now online and monitoring groups\n` +
                                        `🔧 Enhanced session error recovery enabled\n` +
                                        `⚡ Fast startup mode active\n` +
                                        `📊 Connection stable after ${reconnectAttempts} attempts\n` +
                                        `🔄 Restart Reason: ${restartReasons}\n` +
                                        `⏱️ Time since last: ${timeSinceLast}\n\n` +
                                        `${memHealth.emoji} *Memory Status:*\n` +
                                        `System: ${memStats.system.usedGB}GB / ${memStats.system.totalGB}GB (${memStats.system.usedPercent}%)\n` +
                                        `Bot: ${memStats.process.rssMB}MB\n\n` +
                                        `⏰ Time: ${getTimestamp()}`;

                    console.log(`[${getTimestamp()}] 📱 Sending startup notification to admin...`);

                    // Use stealth mode for startup notification if enabled
                    if (config.FEATURES.STEALTH_MODE) {
                        await stealthUtils.sendHumanLikeMessage(sock, adminId, { text: statusMessage });
                    } else {
                        await sock.sendMessage(adminId, { text: statusMessage });
                    }

                    startupNotificationSent = true; // Mark as sent to prevent duplicates on reconnect
                    console.log(`[${getTimestamp()}] ✅ Startup notification sent successfully`);
                } catch (err) {
                    console.error(`[${getTimestamp()}] ❌ Failed to send startup notification:`, err.message);
                    console.error(`   Stack: ${err.stack}`);
                }
            } else {
                console.log(`[${getTimestamp()}] 🔄 Reconnected successfully (skipping duplicate startup notification)`);
            }

            // Start memory monitoring and leak detection (only on first connection in this process)
            if (isActualProcessStart) {
                const adminId = config.ADMIN_PHONE + '@s.whatsapp.net';
                console.log(`[${getTimestamp()}] 🔍 Starting memory monitoring systems...`);

                // Set up admin notifier for memory alerts
                memoryMonitor.setAdminNotifier(async (sock, message) => {
                    try {
                        await sock.sendMessage(adminId, { text: message });
                    } catch (err) {
                        console.error(`[${getTimestamp()}] Failed to send memory alert:`, err.message);
                    }
                });

                // Start monitoring
                memoryMonitor.startMonitoring(sock);

                // Start leak detection with alert callback
                memoryLeakDetector.startMonitoring(async (analysis, snapshot) => {
                    try {
                        const alertMessage = `🚨 *MEMORY LEAK DETECTED*\n\n` +
                            `${analysis.message}\n\n` +
                            `Current heap: ${snapshot.heapUsedMB}MB\n` +
                            `Growth pattern: ${analysis.consecutiveGrowth} consecutive increases\n\n` +
                            `⚠️ Consider restarting the bot to prevent crashes.`;

                        await sock.sendMessage(adminId, { text: alertMessage });
                    } catch (err) {
                        console.error(`[${getTimestamp()}] Failed to send leak alert:`, err.message);
                    }
                });

                console.log(`[${getTimestamp()}] ✅ Memory monitoring systems started`);
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
        // DEBUG: Log EVERY message received (including fromMe)
        console.log(`[MSG-UPSERT] Received ${messages.length} messages, type: ${type}`);
        for (const m of messages) {
            const txt = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
            const fromMe = m.key.fromMe ? 'SELF' : 'OTHER';
            console.log(`[MSG-UPSERT] [${fromMe}] ${m.key.remoteJid?.substring(0,20)} | Text: ${txt?.substring(0,30) || '[no text]'} | type: ${type}`);
            if (txt) {
                console.log(`[RAW-MSG] From: ${m.key.remoteJid?.substring(0,20)} | Text: ${txt.substring(0,30)}`);
            }
        }
        // Only process new messages
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            try {
                // Skip old messages from before bot startup (much faster than session error handling)
                if (shouldIgnoreOldMessage(msg)) {
                    continue;
                }

                // Skip messages from archived chats
                if (archivedChats.has(msg.key.remoteJid)) {
                    const txt = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                    console.log(`[ARCHIVED-SKIP] Skipping message from archived group: ${msg.key.remoteJid}`);
                    if (txt.includes('#')) {
                        console.log(`[ARCHIVED-SKIP] ⚠️ COMMAND SKIPPED: ${txt}`);
                    }
                    continue; // Ignore archived groups
                }
                
                const userId = msg.key.participant || msg.key.remoteJid;
                
                // Skip @lid users ONLY if they have session errors during startup
                // Note: NOT blocking all @lid users - that blocks everyone in modern WhatsApp
                // if (isStartupPhase && shouldSkipUser(userId, true)) {
                //     continue;
                // }
                
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
        console.log(`\n[${getTimestamp()}] 🔔 GROUP PARTICIPANTS UPDATE`);
        console.log(`   Group: ${id}`);
        console.log(`   Action: ${action}`);
        console.log(`   Participants: ${JSON.stringify(participants)}`);
        console.log(`   Author: ${author || 'unknown'}`);

        // Handle bot being promoted to admin
        if (action === 'promote') {
            const botJid = sock.user.id;
            const botPhone = sock.user.id.split(':')[0].split('@')[0];

            // Check if bot was promoted
            const botPromoted = participants.some(p => {
                return p === botJid ||
                       String(p?.id || p).includes(botPhone) ||
                       String(p?.id || p).startsWith(botPhone);
            });

            if (botPromoted) {
                console.log(`   ✅ Bot promoted to admin in ${id}`);
                // Track this promotion with timestamp
                recentPromotions.set(id, Date.now());

                // Clean up old promotion records after sync window
                setTimeout(() => {
                    recentPromotions.delete(id);
                }, PROMOTION_SYNC_WINDOW);

                // Queue blacklist scan after 30 second delay
                setTimeout(async () => {
                    try {
                        const groupMetadata = await sock.groupMetadata(id);
                        const adminList = groupMetadata.participants
                            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                            .map(p => p.id.split('@')[0].split(':')[0]);

                        const memberCount = groupMetadata.participants.length;

                        console.log(`[${getTimestamp()}] 📋 Queueing scan for ${groupMetadata.subject} (${memberCount} members)`);
                        await queueScan(id, memberCount, adminList);
                    } catch (error) {
                        console.error(`[${getTimestamp()}] ❌ Failed to queue scan:`, error.message);
                    }
                }, 30000); // 30 second delay
            }
        }

        if (action === 'add') {
            // Check if this is a mass-sync event after bot promotion
            const lastPromotion = recentPromotions.get(id);
            const isMassSync = lastPromotion && (Date.now() - lastPromotion < PROMOTION_SYNC_WINDOW);

            if (isMassSync && participants.length > 50) {
                console.log(`   ⏭️  Skipping mass-sync event (${participants.length} users) after recent bot promotion`);
                return; // Don't process member list sync as new joins
            }

            // Check if the bot itself was added to the group
            const botJid = sock.user.id;
            const botPhone = sock.user.id.split(':')[0].split('@')[0];
            console.log(`   Bot ID: ${botJid}, Bot Phone: ${botPhone}`);

            // Check for bot using multiple matching patterns (handles LID format)
            const botAddedToGroup = participants.some(p => {
                return p === botJid ||
                       String(p?.id || p).includes(botPhone) ||
                       String(p?.id || p).startsWith(botPhone);
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

    // Start blacklist scan worker
    startScanWorker(sock);
    console.log(`[${getTimestamp()}] 🚀 Blacklist scan worker started`);

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
    // TEMP DEBUG: Log every message's key info
    const debugSender = msg.key.participant || msg.key.remoteJid;
    const debugGroup = msg.key.remoteJid;
    const debugText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (debugText.includes('#')) {
        console.log(`[COMMAND-DEBUG] Message with # detected!`);
        console.log(`   Sender: ${debugSender}`);
        console.log(`   Group: ${debugGroup}`);
        console.log(`   Text: ${debugText.substring(0, 50)}`);
        console.log(`   Full msg keys: ${Object.keys(msg.message || {}).join(', ')}`);
    }
    // Check if it's a group or private message
    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    const isPrivate = msg.key.remoteJid.endsWith('@s.whatsapp.net') || msg.key.remoteJid.endsWith('@lid');

    // Skip if not from group or private chat
    if (!isGroup && !isPrivate) return;
    
    // Skip if from self (but allow # commands from self for admin control)
    if (msg.key.fromMe) {
        const selfText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!selfText.startsWith('#')) {
            return; // Skip non-command messages from self
        }
        console.log(`[SELF-CMD] Processing command from self: ${selfText.substring(0, 20)}`);
    }
    
    // Skip if no message content
    if (!msg.message) return;
    
    // Extract message text with improved handling
    let messageText = extractMessageText(msg);
    
    // ULTRA DEBUG: Check what extractMessageText returned
    const rawText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (rawText.includes('#')) {
        console.log(`[EXTRACT-DEBUG] Raw text: "${rawText}"`);
        console.log(`[EXTRACT-DEBUG] Extracted: "${messageText}"`);
        console.log(`[EXTRACT-DEBUG] fromMe: ${msg.key.fromMe}`);
    }

    // Debug logging for #kick commands specifically
    if (msg.message?.extendedTextMessage?.text && msg.message.extendedTextMessage.text.includes('#kick')) {
        console.log(`[${getTimestamp()}] 🔍 DEBUG: Found #kick in extendedTextMessage`);
        console.log(`   Text: "${msg.message.extendedTextMessage.text}"`);
        console.log(`   Has contextInfo: ${!!msg.message.extendedTextMessage.contextInfo}`);
        console.log(`   messageText extracted: "${messageText}"`);
    }

    // Check for sticker/reaction commands (always check if it's a sticker/reaction)
    let stickerCommand = { isCommand: false };
    const hasSticker = msg.message?.stickerMessage;
    const hasReaction = msg.message?.reactionMessage;
    const hasEffectiveText = messageText && messageText.trim().length > 0;

    if (!hasEffectiveText || hasSticker || hasReaction) {
        stickerCommand = checkStickerCommand(msg);
        console.log(`[${getTimestamp()}] 🔍 Sticker command check result:`, stickerCommand);
        console.log(`   Has sticker: ${!!hasSticker}, Has reaction: ${!!hasReaction}, messageText: "${messageText}", hasEffectiveText: ${hasEffectiveText}`);
    }

    // Skip if no text AND no sticker command AND no invite link potential
    if (!messageText && (!stickerCommand || !stickerCommand.isCommand) && !mightContainInviteLink(msg)) {
        // Additional debug for messages that look like they should have text
        if (msg.message?.extendedTextMessage) {
            console.log(`[${getTimestamp()}] ⚠️ WARNING: ExtendedTextMessage but no text extracted!`);
            console.log(`   Message keys: ${Object.keys(msg.message)}`);
            console.log(`   ExtendedText keys: ${Object.keys(msg.message.extendedTextMessage)}`);
        }
        console.log(`[${getTimestamp()}] ⚠️ Skipping message - no text, no sticker command, and no potential invite link detected`);
        return;
    }
    
    // Clear session errors on successful message
    const senderId = msg.key.participant || msg.key.remoteJid;
    if (messageText) {
        clearSessionErrors(senderId);
    }

    const chatId = msg.key.remoteJid;

    // Store recent messages for context (BEFORE bullying check)
    // This allows GPT to see conversation history for better accuracy
    if (isGroup && messageText && messageText.trim().length > 0) {
        try {
            const CONFIG = require('./services/sentimentAnalysisConfig');
            const { getRedis } = require('./services/redisService');
            const redis = getRedis();

            // Store message with metadata
            const messageData = JSON.stringify({
                sender: msg.pushName || 'Unknown',
                senderJid: msg.key.participant || msg.key.remoteJid,
                text: messageText,
                timestamp: msg.messageTimestamp * 1000
            });

            // Store in Redis list (keep last N messages per group)
            const contextKey = `${CONFIG.REDIS_KEY_CONTEXT}:${chatId}`;
            await redis.lpush(contextKey, messageData);
            await redis.ltrim(contextKey, 0, CONFIG.CONTEXT_WINDOW_SIZE - 1); // Keep last 5 messages (0-4)
            await redis.expire(contextKey, CONFIG.CONTEXT_TTL_SECONDS); // Expire after 5 minutes
        } catch (error) {
            console.error(`[${getTimestamp()}] ⚠️  Failed to store message context:`, error.message);
            // Non-critical - continue processing
        }
    }

    // Bullywatch v2.0 Anti-Bullying System (ONLY for groups with monitoring enabled OR #bullywatch tag)
    if (isGroup && messageText && messageText.trim().length > 0) {
        try {
            console.log(`[${getTimestamp()}] 🔍 BULLYWATCH: Checking if analysis needed for message: "${messageText.substring(0, 30)}..."`);

            // Get group metadata for bullywatch
            const groupMetadata = await sock.groupMetadata(chatId).catch(() => null);
            const groupSubject = groupMetadata?.subject || '';
            console.log(`[${getTimestamp()}] 🔍 BULLYWATCH: Group subject: "${groupSubject}"`);

            // Check if monitoring is enabled via database OR #bullywatch tag
            const groupService = require('./database/groupService');
            const isDatabaseEnabled = await groupService.isBullyingMonitoringEnabled(chatId);
            console.log(`[${getTimestamp()}] 🔍 BULLYWATCH: isDatabaseEnabled = ${isDatabaseEnabled}`);

            const bullywatch = require('./services/bullywatch');
            const hasHashtagEnabled = bullywatch.isGroupEnabled(chatId, groupSubject);
            console.log(`[${getTimestamp()}] 🔍 BULLYWATCH: hasHashtagEnabled = ${hasHashtagEnabled}`);

            if (isDatabaseEnabled || hasHashtagEnabled) {
                console.log(`[${getTimestamp()}] ✅ BULLYWATCH: Analysis starting...`);
                // Use new Bullywatch v2.0 system
                const sender = msg.key.participant || msg.key.remoteJid;
                const senderPhone = extractPhoneNumber(sender); // Handle both regular and LID format
                const messageId = msg.key.id;

                // Prepare message object for bullywatch
                const messageObj = {
                    text: messageText,
                    senderId: sender,
                    senderPhone,
                    senderName: msg.pushName || senderPhone,
                    timestamp: msg.messageTimestamp * 1000,
                    messageId,
                    originalMessage: msg
                };

                // Prepare metadata
                const metadata = {
                    groupSubject,
                    groupSize: groupMetadata?.participants?.length || 0,
                    groupId: chatId
                };

                // Analyze with Bullywatch v2.0 (multi-layer analysis)
                const result = await bullywatch.analyzeMessage(messageObj, chatId, metadata);

                if (result.analyzed && result.action.alertAdmin) {
                    // Get class name for alert
                    const groupService = require('./database/groupService');
                    const className = await groupService.getGroupClassName(chatId);

                    // Try to get group invite link
                    let groupLink = '';
                    try {
                        const inviteCode = await sock.groupInviteCode(chatId);
                        groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                    } catch (err) {
                        // If can't get invite code, use group JID (fallback)
                        groupLink = `Group JID: ${chatId}`;
                    }

                    // Log detection with v2.0 details
                    console.log(`\n[${getTimestamp()}] 🚨 BULLYWATCH v2.0 ALERT:`);
                    console.log(`   Group: ${groupSubject} (${chatId})`);
                    console.log(`   Class: ${className || 'Not set'}`);
                    console.log(`   Sender: ${senderPhone} (${msg.pushName})`);
                    console.log(`   Score: ${result.score} (${result.severity})`);
                    console.log(`   Categories: ${result.details.categories?.join(', ') || 'None'}`);
                    console.log(`   Action: ${result.action.description}`);

                    // Prepare alert message for admin
                    const isSelfHarm = result.details.categories?.includes('self_harm');
                    const alertHeader = isSelfHarm ?
                        `🚨🆘 *SELF-HARM ALERT* 🆘🚨\n*IMMEDIATE INTERVENTION REQUIRED*\n\n` :
                        `🚨 *BULLYWATCH v2.0 DETECTION* 🚨\n\n`;

                    const alertText = alertHeader +
                        `*Group:* ${groupSubject}\n` +
                        `📚 *Class:* ${className || 'Not set'}\n` +
                        `🔗 *Group Link:* ${groupLink}\n` +
                        `*Sender:* ${senderPhone} (${msg.pushName})\n` +
                        `*Score:* ${result.score} - *${result.severity}*\n` +
                        `*Categories:* ${result.details.categories?.join(', ') || 'None'}\n` +
                        `*Lexicon Hits:* ${result.details.lexiconHits?.length || 0}\n` +
                        `*Message:* "${messageText}"\n\n` +
                        `*Action:* ${result.action.description}\n` +
                        `*Monitor Mode:* ${bullywatch.getStatus().monitorMode ? 'ON (no auto-action)' : 'OFF'}\n\n` +
                        `${result.details.gptAnalysis ? `*GPT Analysis:* ${result.details.gptAnalysis.reasoning || 'N/A'}\n` : ''}` +
                        `${isSelfHarm ? `⚠️ *CRITICAL:* Self-harm detected - do NOT delete message. Contact school counselor/parents IMMEDIATELY.\n\n` : ''}` +
                        `---\n` +
                        `*Actions:*\n` +
                        `• Reply with 'd' to delete this message\n` +
                        `• Send #bullywatch off to disable monitoring\n` +
                        `• Or ignore this message`;

                    // Save to database BEFORE sending alert (for delete functionality)
                    try {
                        const offensiveMessageService = require('./database/offensiveMessageService');
                        await offensiveMessageService.saveOffensiveMessage({
                            messageId: msg.key.id,
                            whatsappGroupId: chatId,
                            groupName: groupSubject,
                            senderPhone: senderPhone,
                            senderName: msg.pushName || 'Unknown',
                            senderJid: sender,
                            messageText: messageText,
                            matchedWords: result.details.lexiconHits || [],
                            gptAnalysis: result.details.gptAnalysis ? {
                                analyzed: true,
                                severity: result.severity,
                                confidence: result.details.gptAnalysis.confidence || null,
                                category: result.details.categories?.join(', ') || null,
                                explanation: result.details.gptAnalysis.reasoning || null,
                                emotionalImpact: result.details.gptAnalysis.emotionalImpact || null,
                                recommendation: result.details.gptAnalysis.recommendation || null,
                                cost: result.details.gptAnalysis.cost || null
                            } : null
                        });
                        console.log(`   💾 Saved to database (ID: ${msg.key.id})`);
                    } catch (dbError) {
                        console.error(`   ⚠️  Failed to save to database:`, dbError.message);
                        // Continue with alert even if DB save fails
                    }

                    // Send alert to admin
                    const adminJid = config.ADMIN_PHONE + '@s.whatsapp.net';
                    const sentMessage = await sock.sendMessage(adminJid, {
                        text: alertText,
                        mentions: [sender]
                    });

                    // Store Redis mapping of alert message ID → original message ID (for delete functionality)
                    if (sentMessage && sentMessage.key && sentMessage.key.id && msg.key.id) {
                        try {
                            const { getRedis } = require('./services/redisService');
                            const SENTIMENT_CONFIG = require('./services/sentimentAnalysisConfig');
                            const redis = getRedis();

                            // Store mapping for 24 hours (messages older than this can't be deleted)
                            await redis.setex(
                                `${SENTIMENT_CONFIG.REDIS_KEY_ALERT_MAP}:${sentMessage.key.id}`,
                                SENTIMENT_CONFIG.ALERT_MAPPING_TTL_SECONDS,
                                msg.key.id
                            );

                            console.log(`   🔗 Stored alert mapping: ${sentMessage.key.id} → ${msg.key.id}`);
                        } catch (redisError) {
                            console.error(`   ⚠️  Failed to store alert mapping:`, redisError.message);
                            // Non-critical error - delete will still work if message is recent
                        }
                    }

                    // If NOT in monitor mode and action requires deletion, delete message
                    if (!bullywatch.getStatus().monitorMode && result.action.deleteMessage) {
                        try {
                            await sock.sendMessage(chatId, { delete: msg.key });
                            console.log(`   ✅ Message deleted (auto-action enabled)`);
                        } catch (deleteError) {
                            console.error(`   ❌ Failed to delete message:`, deleteError.message);
                        }
                    }
                } else {
                    console.log(`[${getTimestamp()}] ℹ️  BULLYWATCH: No action needed (analyzed=${result.analyzed}, alertAdmin=${result.action?.alertAdmin})`);
                }
            } else {
                console.log(`[${getTimestamp()}] ⏭️  BULLYWATCH: Skipping - monitoring NOT enabled for this group`);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Bullywatch v2.0 error:`, error.message);
            console.error(`[${getTimestamp()}] ❌ Error stack:`, error.stack);
            // Continue processing even if monitoring fails
        }
    }

    // Handle private message commands from admin
    if (isPrivate) {
        const senderPhone = extractPhoneNumber(senderId); // Handle both regular and LID format

        // Log all private messages to console
        console.log(`\n[${getTimestamp()}] 📱 Private Message Received:`);
        console.log(`   From: ${senderPhone} (${senderId})`);
        console.log(`   Text: ${messageText || '[No text content]'}`);
        console.log(`   Message Type: ${Object.keys(msg.message || {}).join(', ')}`);

        // Check if it's admin (handle both regular and LID format)
        const isAdmin = senderPhone === config.ALERT_PHONE ||
                       senderPhone === config.ADMIN_PHONE ||
                       senderPhone === config.ADMIN_LID ||
                       senderId.includes(config.ALERT_PHONE) ||
                       senderId.includes(config.ADMIN_PHONE) ||
                       senderId.includes(config.ADMIN_LID);
        
        console.log(`   Is Admin: ${isAdmin ? '✅ Yes' : '❌ No'}`);

        // Handle delete offensive message (reply with 'd' to bullying alert)
        if (isAdmin && messageText && messageText.toLowerCase().trim() === 'd') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedStanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const quotedRemoteJid = msg.message?.extendedTextMessage?.contextInfo?.remoteJid;

            if (quotedMsg && quotedStanzaId) {
                try {
                    const offensiveMessageService = require('./database/offensiveMessageService');
                    const { getRedis } = require('./services/redisService');

                    // The quotedStanzaId is the ALERT message ID sent to admin
                    // We need to look up the ORIGINAL message ID from Redis mapping
                    let originalMessageId = null;

                    try {
                        const SENTIMENT_CONFIG = require('./services/sentimentAnalysisConfig');
                        const redis = getRedis();
                        originalMessageId = await redis.get(`${SENTIMENT_CONFIG.REDIS_KEY_ALERT_MAP}:${quotedStanzaId}`);

                        if (originalMessageId) {
                            console.log(`[${getTimestamp()}] 🔗 Found mapping: ${quotedStanzaId} → ${originalMessageId}`);
                        } else {
                            console.log(`[${getTimestamp()}] ⚠️  No Redis mapping found for alert ${quotedStanzaId}`);
                        }
                    } catch (redisError) {
                        console.error(`[${getTimestamp()}] ⚠️  Redis lookup failed:`, redisError.message);
                    }

                    // Use the original message ID if found, otherwise try the quoted ID (fallback)
                    const messageIdToDelete = originalMessageId || quotedStanzaId;

                    // Get message from database to find group and verify it exists
                    const offensive = await offensiveMessageService.getOffensiveMessage(messageIdToDelete);

                    if (offensive) {
                        // Delete the message from the group using the ORIGINAL message ID
                        const groupId = offensive.whatsapp_group_id;
                        const messageKey = {
                            remoteJid: groupId,
                            id: messageIdToDelete,  // Use original message ID
                            participant: offensive.sender_jid || undefined  // Use actual sender's JID from database
                        };

                        console.log(`[${getTimestamp()}] 🗑️  Deleting message from group ${groupId}`);
                        console.log(`[${getTimestamp()}] 📋 Message ID: ${messageIdToDelete}`);
                        console.log(`[${getTimestamp()}] 👤 Participant: ${offensive.sender_jid}`);

                        await sock.sendMessage(groupId, { delete: messageKey });

                        // Mark as deleted in database
                        await offensiveMessageService.markMessageAsDeleted(messageIdToDelete);

                        await sock.sendMessage(chatId, {
                            text: `✅ Offensive message deleted from "${offensive.group_name}"\n\n` +
                                  `📱 User: ${offensive.sender_name}\n` +
                                  `📞 Phone: ${offensive.sender_phone}\n` +
                                  `💬 Message: "${offensive.message_text.substring(0, 100)}..."`
                        });

                        console.log(`[${getTimestamp()}] 🗑️  Admin deleted offensive message: ${messageIdToDelete}`);
                        return;
                    } else {
                        await sock.sendMessage(chatId, {
                            text: '❌ Message not found in database. It may have been already deleted or is too old.\n\n' +
                                  `🔍 Debug: Tried to find message ID: ${messageIdToDelete}`
                        });
                        return;
                    }
                } catch (error) {
                    console.error(`[${getTimestamp()}] ❌ Failed to delete offensive message:`, error.message);
                    await sock.sendMessage(chatId, {
                        text: `❌ Failed to delete message: ${error.message}`
                    });
                    return;
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ Please reply with "d" to a bullying alert message to delete the offensive content.'
                });
                return;
            }
        }

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
        } else if (isAdmin) {
            // Check if this is a reply to bot's blacklist question
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

            if (quotedMessage && quotedMsgId) {
                console.log(`   Reply Detected - Quoted Message ID: ${quotedMsgId}`);

                // Check if admin replied with action choice (1, 2, 3, or 0)
                if (messageText === '1' || messageText === '2' || messageText === '3' || messageText === '0') {
                    const pendingRequest = getPendingRequest(quotedMsgId);

                    if (pendingRequest) {
                        console.log(`   Found Pending Request for: ${pendingRequest.phoneNumber}`);
                        console.log(`   Action chosen: ${messageText}`);

                        const adminPhone = config.ALERT_PHONE; // Your phone number for global ban

                        // Import global ban helper
                        const { removeUserFromAllAdminGroups, formatGlobalBanReport } = require('./utils/globalBanHelper');

                        switch (messageText) {
                            case '1': {
                                // Blacklist Only (prevent rejoin)
                                console.log(`   Action: Blacklist Only`);
                                try {
                                    await blacklistUser(pendingRequest.phoneNumber, `Admin approved - ${pendingRequest.reason}`);
                                    await cacheBlacklistedUser(pendingRequest.phoneNumber);

                                    await sock.sendMessage(chatId, {
                                        text: `✅ User +${pendingRequest.phoneNumber} has been blacklisted.\n\n` +
                                              `📋 Action: Blacklist Only\n` +
                                              `🚫 User cannot rejoin any group\n` +
                                              `ℹ️ Violation: ${pendingRequest.reason}`
                                    });

                                    console.log(`✅ Blacklisted user: ${pendingRequest.phoneNumber}`);
                                } catch (error) {
                                    console.error(`❌ Failed to blacklist user:`, error.message);
                                    await sock.sendMessage(chatId, {
                                        text: `❌ Failed to blacklist user: ${error.message}`
                                    });
                                }
                                break;
                            }

                            case '2': {
                                // Global Ban Only (kick from all admin groups)
                                console.log(`   Action: Global Ban Only`);
                                try {
                                    await sock.sendMessage(chatId, {
                                        text: `🌍 Starting Global Ban for +${pendingRequest.phoneNumber}...\n\n` +
                                              `⏳ This may take a moment...`
                                    });

                                    const report = await removeUserFromAllAdminGroups(
                                        sock,
                                        pendingRequest.userId,
                                        adminPhone
                                    );

                                    const reportMessage = formatGlobalBanReport(report);
                                    await sock.sendMessage(chatId, { text: reportMessage });

                                    console.log(`✅ Global ban completed for: ${pendingRequest.phoneNumber}`);
                                } catch (error) {
                                    console.error(`❌ Failed global ban:`, error.message);
                                    await sock.sendMessage(chatId, {
                                        text: `❌ Global Ban failed: ${error.message}`
                                    });
                                }
                                break;
                            }

                            case '3': {
                                // Blacklist + Global Ban (BOTH!)
                                console.log(`   Action: Blacklist + Global Ban`);
                                try {
                                    // Step 1: Blacklist
                                    await blacklistUser(pendingRequest.phoneNumber, `Admin approved - ${pendingRequest.reason} (Global Ban)`);
                                    await cacheBlacklistedUser(pendingRequest.phoneNumber);

                                    await sock.sendMessage(chatId, {
                                        text: `🌍 *Full Protection Activated*\n\n` +
                                              `✅ User +${pendingRequest.phoneNumber} blacklisted\n` +
                                              `⏳ Starting global ban across all your groups...`
                                    });

                                    // Step 2: Global Ban
                                    const report = await removeUserFromAllAdminGroups(
                                        sock,
                                        pendingRequest.userId,
                                        adminPhone
                                    );

                                    const reportMessage = formatGlobalBanReport(report);
                                    await sock.sendMessage(chatId, { text: reportMessage });

                                    console.log(`✅ Blacklist + Global ban completed for: ${pendingRequest.phoneNumber}`);
                                } catch (error) {
                                    console.error(`❌ Failed blacklist + global ban:`, error.message);
                                    await sock.sendMessage(chatId, {
                                        text: `❌ Operation failed: ${error.message}`
                                    });
                                }
                                break;
                            }

                            case '0': {
                                // Ignore (do nothing)
                                console.log(`   Action: Ignore`);
                                await sock.sendMessage(chatId, {
                                    text: `⏭️ Ignored action for +${pendingRequest.phoneNumber}\n\n` +
                                          `ℹ️ No changes made.`
                                });
                                console.log(`⏭️ Admin ignored action for: ${pendingRequest.phoneNumber}`);
                                break;
                            }
                        }

                        removePendingRequest(quotedMsgId);
                        return;
                    } else {
                        console.log(`   No pending request found for message ID: ${quotedMsgId}`);
                    }
                }

                // Check if admin replied "#ub" (unblacklist)
                if (messageText === '#ub' || messageText.startsWith('#ub ')) {
                    console.log(`   Unblacklist Request via Reply`);

                    const pendingRequest = getPendingRequest(quotedMsgId);

                    if (pendingRequest) {
                        console.log(`   Unblacklisting: ${pendingRequest.phoneNumber}`);

                        try {
                            const { unblacklistUser } = require('./database/groupService');
                            await unblacklistUser(pendingRequest.phoneNumber);
                            await removeFromBlacklistCache(pendingRequest.phoneNumber);

                            await sock.sendMessage(chatId, {
                                text: `✅ User +${pendingRequest.phoneNumber} has been removed from blacklist.`
                            });

                            console.log(`✅ Unblacklisted user: ${pendingRequest.phoneNumber}`);
                        } catch (error) {
                            console.error(`❌ Failed to unblacklist user:`, error.message);
                            await sock.sendMessage(chatId, {
                                text: `❌ Failed to unblacklist user: ${error.message}`
                            });
                        }

                        removePendingRequest(quotedMsgId);
                        return;
                    } else {
                        // Try to extract phone number from quoted message text
                        const quotedText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || '';
                        const phoneMatch = quotedText.match(/\+?(\d{10,15})/);

                        if (phoneMatch) {
                            const phoneNumber = phoneMatch[1];
                            console.log(`   Extracted phone from quoted message: ${phoneNumber}`);

                            try {
                                const { unblacklistUser } = require('./database/groupService');
                                await unblacklistUser(phoneNumber);
                                await removeFromBlacklistCache(phoneNumber);

                                await sock.sendMessage(chatId, {
                                    text: `✅ User +${phoneNumber} has been removed from blacklist.`
                                });

                                console.log(`✅ Unblacklisted user: ${phoneNumber}`);
                            } catch (error) {
                                console.error(`❌ Failed to unblacklist user:`, error.message);
                                await sock.sendMessage(chatId, {
                                    text: `❌ Failed to unblacklist user: ${error.message}`
                                });
                            }
                            return;
                        }
                    }
                }
            }

            // Handle legacy admin approval patterns (yes/no userId)
            if (messageText && (messageText.startsWith('yes ') || messageText.startsWith('no '))) {
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
    const userIsMuted = await muteService.isMuted(senderId);
    console.log(`[${getTimestamp()}] 🔍 MUTE DEBUG - senderId: ${senderId}, isMuted: ${userIsMuted}, isAdmin: ${isAdmin}`);

    if (userIsMuted && !isAdmin) {
        console.log(`[${getTimestamp()}] 🔇 ATTEMPTING TO DELETE MESSAGE FROM MUTED USER`);
        try {
            await sock.sendMessage(groupId, { delete: msg.key });
            const msgCount = await muteService.incrementMutedMessageCount(senderId);
            console.log(`[${getTimestamp()}] 🔇 ✅ SUCCESS: Deleted message from muted user (${msgCount} messages deleted)`);
            
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
                        userId: senderId,
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
            console.error(`[${getTimestamp()}] ❌ MUTE ERROR: Failed to delete muted user message:`, error.message);
            console.error(`[${getTimestamp()}] ❌ Error details:`, {
                name: error.name,
                message: error.message,
                stack: error.stack?.split('\n')[0]
            });
        }
        return;
    } else if (userIsMuted && isAdmin) {
        console.log(`[${getTimestamp()}] ⚠️ MUTE SKIP: User is muted but is an admin - allowing message`);
    }

    // Debug check for any text containing #kick
    if (messageText && messageText.includes('#kick')) {
        console.log(`[${getTimestamp()}] 🎯 DEBUG: Found #kick in messageText at command check`);
        console.log(`   Full text: "${messageText}"`);
        console.log(`   Starts with #: ${messageText.startsWith('#')}`);
        console.log(`   Will enter command block: ${messageText.startsWith('#')}`);
    }

    // Handle commands (text-based or sticker-based, only for admins, except #help)
    let command = null, args = null, commandSource = 'none';

    if (messageText && messageText.startsWith('#')) {
        // Regular text-based command
        const parts = messageText.trim().split(/\s+/);
        command = parts[0];
        args = parts.slice(1);
        commandSource = 'text';
    } else if (stickerCommand && stickerCommand.isCommand && isAdmin) {
        // Sticker-based command (only for admins)
        if (stickerCommand.type === 'sticker_reply') {
            // Sticker reply = #kick command
            command = '#kick';
            args = [];
            commandSource = 'sticker_reply';

            // Create a fake message text for the command handler
            messageText = '#kick';

            console.log(`[${getTimestamp()}] 🎯 STICKER COMMAND DETECTED!`);
            console.log(`   Sticker type: ${stickerCommand.type}`);
            console.log(`   Target participant: ${stickerCommand.participant}`);
            console.log(`   Target stanzaId: ${stickerCommand.stanzaId}`);
        } else if (stickerCommand.type === 'reaction_kick') {
            // Reaction-based kick
            command = '#kick';
            args = [];
            commandSource = 'reaction';
            messageText = '#kick';
        }
    }

    if (command) {
        // Log group commands to console
        const senderPhone = senderId.split('@')[0];
        console.log(`\n[${getTimestamp()}] 👥 Group Command Received:`);
        console.log(`   Group: ${groupId}`);
        console.log(`   From: ${senderPhone} (${senderId})`);
        console.log(`   Command: ${command}`);
        console.log(`   Args: ${args || '[none]'}`);
        console.log(`   Source: ${commandSource}`);
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

        // Require admin for all other commands (allow fromMe for bot's own WhatsApp Web)
        if (!isAdmin && !msg.key.fromMe) {
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

        // For sticker commands, modify the message object to include context info
        let modifiedMsg = msg;
        if (commandSource === 'sticker_reply' && stickerCommand.contextInfo) {
            console.log(`[${getTimestamp()}] 🔧 Modifying message for sticker command...`);

            // Create a modified message that looks like an extendedTextMessage with context
            modifiedMsg = {
                ...msg,
                message: {
                    extendedTextMessage: {
                        text: '#kick',
                        contextInfo: {
                            participant: stickerCommand.participant,
                            stanzaId: stickerCommand.stanzaId,
                            quotedMessage: {} // Minimal quoted message structure
                        }
                    }
                }
            };

            console.log(`   Modified message contextInfo:`, modifiedMsg.message.extendedTextMessage.contextInfo);
        }

        const handled = await commandHandler.handleCommand(modifiedMsg, command, args, isAdmin, isSuperAdmin);
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

        // Extract user information
        const userPhone = senderId.split('@')[0];
        const isLidFormat = senderId.endsWith('@lid');
        const isIsraeliUser = userPhone.startsWith('972');

        console.log(`[${getTimestamp()}] 📊 Processing invite link violation: ${userPhone} - Israeli: ${isIsraeliUser}, LID: ${isLidFormat}`);

        // Increment violation count in database
        try {
            const violations = await incrementViolation(userPhone, 'invite_link');
            console.log(`[${getTimestamp()}] 📊 Violation recorded - Total violations:`, violations);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to record violation:`, error.message);
        }

        // Kick the user (only if bot has permission)
        if (permissions.canKickUsers) {
            try {
                await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                console.log('✅ Kicked user for invite link:', senderId);
                kickCooldown.set(senderId, Date.now());

                // Get user violations
                const violations = await getViolations(userPhone);

                // Try to decode LID to real phone number
                let phoneDisplay = userPhone;
                if (isLidFormat) {
                    const decoded = await decodeLIDToPhone(sock, senderId);
                    phoneDisplay = decoded || `${userPhone} (LID - Encrypted ID)`;
                }

                // Send alert with NEW format (ask admin to blacklist)
                const alertResult = await sendKickAlert(sock, {
                    userPhone: phoneDisplay,
                    userId: senderId,
                    groupName: groupMetadata.subject,
                    groupId: groupId,
                    reason: 'invite_link',
                    spamLink: matches.join(', '),
                    violations: violations
                });

                // Store pending blacklist request with groupId
                if (alertResult && alertResult.key) {
                    storePendingRequest(alertResult.key.id, phoneDisplay, senderId, 'invite_link', groupId);
                    console.log(`[${getTimestamp()}] 📋 Stored pending blacklist request for: ${phoneDisplay}`);
                }

            } catch (kickError) {
                console.error('❌ Failed to kick user:', kickError.message);
                advancedLogger.logPermissionError('kick_invite_spam_user', groupId, kickError);
            }
        } else {
            console.log(`⚠️ Cannot kick user - bot lacks kick permission in ${groupId}`);
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

        // CRITICAL: Auto-register group in database (if not already registered)
        // This ensures #bullywatch and other commands work for ALL groups
        if (process.env.DATABASE_URL) {
            try {
                await upsertGroup(groupMetadata);
            } catch (error) {
                console.error(`[${getTimestamp()}] ⚠️ Failed to auto-register group (non-critical):`, error.message);
                // Non-critical error - continue with participant processing
            }
        }

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
        for (const _participant of participants) {
            const participantId = typeof _participant === "string" ? _participant : (_participant?.id || String(_participant));
            const isLidFormat = participantId.endsWith('@lid');

            // Extract phone number - prioritize phoneNumber field for LID format users
            let phoneNumber = participantId.split('@')[0];
            if (typeof _participant === 'object' && _participant?.phoneNumber) {
                // Extract real phone from phoneNumber field (format: "972527332312@s.whatsapp.net")
                phoneNumber = _participant.phoneNumber.split('@')[0];
                console.log(`📞 Extracted real phone from LID participant: ${phoneNumber}`);
            }

            console.log(`👥 New participant: ${phoneNumber} (LID: ${isLidFormat}, length: ${phoneNumber.length})`);
            
            // Check if user is whitelisted first
            if (await whitelistService.isWhitelisted(participantId)) {
                console.log(`✅ Whitelisted user joined: ${participantId}`);
                continue; // Skip all checks for whitelisted users
            }
            
            // Check if user is blacklisted (PostgreSQL only)
            let isBlacklisted = false;
            let violations = {};

            console.log(`🔍 Blacklist check for: ${phoneNumber}`);

            // Check PostgreSQL database
            if (process.env.DATABASE_URL) {
                try {
                    const user = await getUserByPhone(phoneNumber);
                    if (user) {
                        isBlacklisted = user.is_blacklisted;
                        violations = user.violations || {};
                        console.log(`   Database blacklist: ${isBlacklisted}`);
                        console.log(`   Violations: ${JSON.stringify(violations)}`);
                    } else {
                        console.log(`   Database: User not found`);
                    }
                } catch (error) {
                    console.error('❌ Failed to check database blacklist:', error.message);
                }
            }

            console.log(`   FINAL BLACKLIST STATUS: ${isBlacklisted}`);

            if (!addedByAdmin && isBlacklisted) {
                console.log(`🚫 Blacklisted user detected: ${participantId} - ATTEMPTING TO KICK`);

                try {
                    // Remove the blacklisted user
                    await sock.groupParticipantsUpdate(groupId, [participantId], 'remove');
                    console.log('✅ Kicked blacklisted user on rejoin');

                    // Send NEW alert format with #ub option
                    const alertResult = await sendBlacklistRejoinAlert(sock, {
                        userPhone: phoneNumber,
                        userId: participantId,
                        groupName: groupMetadata.subject,
                        groupId: groupId,
                        violations: violations
                    });

                    // Store pending request for #ub command
                    if (alertResult && alertResult.key) {
                        storePendingRequest(alertResult.key.id, phoneNumber, participantId, 'blacklist_rejoin');
                        console.log(`[${getTimestamp()}] 📋 Stored pending unblacklist request for: ${phoneNumber}`);
                    }

                } catch (error) {
                    advancedLogger.logPermissionError('kick_blacklisted_user', groupId, error);
                }
                continue; // Skip further checks for this user
            } else if (addedByAdmin && isBlacklisted) {
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

                    // Try to decode LID to real phone number
                    let phoneDisplay = phoneNumber;
                    if (isLidFormat) {
                        const decoded = await decodeLIDToPhone(sock, participantId);
                        phoneDisplay = decoded || `${phoneNumber} (LID - Encrypted ID)`;
                    }

                    const alert = `🚨 *Restricted Country Code Auto-Kick*\n\n` +
                                `📍 Group: ${groupMetadata.subject}\n` +
                                `🔗 Group Link: ${groupLink}\n` +
                                `👤 User: ${participantId}\n` +
                                `📞 Phone: ${phoneDisplay}\n` +
                                `🌍 Reason: Country code starts with +${phoneNumber.charAt(0)}\n` +
                                `⏰ Time: ${getTimestamp()}\n\n` +
                                `To whitelist this user, use:\n` +
                                `#whitelist ${phoneDisplay}`;
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
        // 🚨 CRASH LOOP GUARD: Check for emergency stop flag first
        crashLoopGuard.checkEmergencyStopFlag();

        // 🚨 CRASH LOOP GUARD: Record restart and check for rapid restart pattern (5-min window)
        crashLoopGuard.recordRestart('Bot startup');
        const crashLoopStatus = crashLoopGuard.checkForCrashLoop();

        if (crashLoopStatus.shouldEmergencyStop) {
            console.error(`[${getTimestamp()}] 🚨 CRASH LOOP DETECTED: ${crashLoopStatus.restartCount} restarts in ${crashLoopStatus.timeWindowMinutes} minutes`);
            crashLoopGuard.emergencyStop('Too many rapid restarts - likely crash loop');
        }

        if (crashLoopStatus.shouldAlert) {
            console.error(`[${getTimestamp()}] ⚠️ CRASH LOOP WARNING: ${crashLoopStatus.restartCount} restarts in ${crashLoopStatus.timeWindowMinutes} minutes`);
            // Alert will be sent once bot connects to WhatsApp
        }

        // Record restart attempt (24-hour window for daily tracking)
        const restartCount = await restartLimiter.recordRestart('Bot startup');

        // Check if emergency stop needed (24-hour limit)
        if (restartLimiter.shouldEmergencyStop()) {
            console.error(`[${getTimestamp()}] 🚨 EMERGENCY STOP: Too many restarts (${restartCount})`);
            console.error('Manual intervention required. Check logs and fix underlying issues.');
            process.exit(1);
        }

        // Check if restart limit exceeded (24-hour limit)
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