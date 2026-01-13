// services/bullyingMonitoringService.js
// Bullying detection and monitoring service

const { ALL_OFFENSIVE_WORDS } = require('./offensiveWordsDatabase');
const { decodeLIDToPhone } = require('../utils/jidUtils');
const offensiveMessageService = require('../database/offensiveMessageService');
const { getTimestamp } = require('../utils/logger');
const sentimentAnalysisService = require('./sentimentAnalysisService');

class BullyingMonitoringService {
    constructor() {
        this.adminPhone = '972544345287';
        console.log(`[${getTimestamp()}] 🛡️  Bullying Monitoring Service initialized`);
        console.log(`[${getTimestamp()}] 📊 Monitoring ${ALL_OFFENSIVE_WORDS.length} offensive words`);
    }

    /**
     * Check if message is discussing fictional content (movies, books, games, etc.)
     * These contexts should be excluded from bullying detection
     * @param {string} messageText - Message to check
     * @returns {boolean} True if discussing fictional content
     */
    isFictionalContext(messageText) {
        if (!messageText || typeof messageText !== 'string') {
            return false;
        }

        const lowerText = messageText.toLowerCase();

        // Hebrew keywords for fictional content
        const hebrewKeywords = [
            'סרט', 'הסרט', 'סרטים',           // movie, the movie, movies
            'ספר', 'הספר', 'ספרים',           // book, the book, books
            'משחק', 'המשחק', 'משחקים',        // game, the game, games
            'סדרה', 'הסדרה', 'סדרות',         // series, the series
            'תוכנית', 'התוכנית',              // program, the program
            'דמות', 'הדמות', 'דמויות',        // character, the character, characters
            'גיבור', 'הגיבור', 'גיבורים',     // hero, the hero, heroes
            'נבל', 'הנבל',                    // villain, the villain
            'שחקן', 'השחקן', 'שחקנים',        // actor, the actor, actors
            'במאי', 'הבמאי',                  // director, the director
            'עלילה', 'העלילה',                // plot, the plot
            'פרק', 'הפרק', 'פרקים',           // episode, the episode, episodes
            'עונה', 'העונה',                  // season, the season
            'אנימה', 'האנימה',                // anime, the anime
            'קומיקס', 'הקומיקס'               // comics, the comics
        ];

        // English keywords for fictional content
        const englishKeywords = [
            'movie', 'film', 'the movie', 'the film',
            'book', 'the book', 'novel', 'the novel',
            'game', 'the game', 'video game',
            'series', 'tv series', 'tv show', 'show',
            'character', 'the character', 'main character',
            'protagonist', 'antagonist', 'villain',
            'actor', 'actress', 'director',
            'plot', 'storyline', 'episode', 'season',
            'anime', 'manga', 'comic', 'comics'
        ];

        // Check for any fictional content keywords
        const allKeywords = [...hebrewKeywords, ...englishKeywords];

        for (const keyword of allKeywords) {
            if (lowerText.includes(keyword)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if message contains offensive content
     * @param {string} messageText - Message to analyze
     * @returns {object} { isOffensive: boolean, matchedWords: string[], severity: string }
     */
    checkMessage(messageText) {
        if (!messageText || typeof messageText !== 'string') {
            return {
                isOffensive: false,
                matchedWords: [],
                severity: 'none'
            };
        }

        // NOTE: Removed aggressive pre-filter for fictional content
        // Reason: Caused false negatives like "ראיתי סרט, ואתה בן זונה" (targeting real person)
        // GPT is smart enough to distinguish fictional vs real context
        // Trade-off: Small cost increase (~$0.0006/message) for 100% accuracy

        // Normalize text: lowercase, remove nikud (Hebrew vowel points)
        const normalizedText = messageText.toLowerCase()
            .replace(/['\u0591-\u05C7]/g, ''); // Remove Hebrew nikud/diacritics

        const matchedWords = [];

        for (const word of ALL_OFFENSIVE_WORDS) {
            const normalizedWord = word.toLowerCase();

            // Create word boundary regex
            // For Hebrew: match the word anywhere in the text
            // For English: require word boundaries
            const isHebrew = /[\u0590-\u05FF]/.test(word);

            let regex;
            if (isHebrew) {
                // Hebrew: match word as substring (Hebrew doesn't have clear word boundaries)
                regex = new RegExp(this.escapeRegex(normalizedWord), 'i');
            } else {
                // English: require word boundaries
                regex = new RegExp(`\\b${this.escapeRegex(normalizedWord)}\\b`, 'i');
            }

            if (regex.test(normalizedText)) {
                matchedWords.push(word);
            }
        }

        // Determine severity based on number of matches
        let severity = 'none';
        if (matchedWords.length >= 3) {
            severity = 'severe';
        } else if (matchedWords.length >= 2) {
            severity = 'moderate';
        } else if (matchedWords.length >= 1) {
            severity = 'mild';
        }

        return {
            isOffensive: matchedWords.length > 0,
            matchedWords,
            severity
        };
    }

    /**
     * Escape special regex characters
     * @param {string} string - String to escape
     * @returns {string} Escaped string
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Send alert to admin about offensive content
     * @param {object} sock - WhatsApp socket
     * @param {object} alertData - Alert information
     * @returns {Promise<boolean>} Success status
     */
    async sendAlert(sock, alertData) {
        const {
            groupName,
            groupId,
            senderPhone,
            senderName,
            senderJid,
            messageText,
            matchedWords,
            timestamp,
            severity,
            messageId,
            originalMessage
        } = alertData;

        // Extract real phone number (decode LID if needed)
        let realPhone = senderPhone;
        if (senderJid && senderJid.includes('@lid')) {
            try {
                const decoded = await decodeLIDToPhone(sock, senderJid);
                if (decoded) {
                    realPhone = decoded;
                }
            } catch (error) {
                console.error(`[${getTimestamp()}] ⚠️  Failed to decode LID:`, error.message);
            }
        }

        // Format severity icon
        const severityIcons = {
            severe: '🔴',
            moderate: '🟡',
            mild: '🟢'
        };
        const severityIcon = severityIcons[severity] || '⚠️';

        // Format base alert message
        let alertMessage = `${severityIcon} *BULLYING ALERT* ${severityIcon}\n\n` +
            `📊 Severity: ${severity.toUpperCase()}\n` +
            `👥 Group: ${groupName}\n` +
            `📱 User: ${senderName || 'Unknown'}\n` +
            `📞 Phone: ${realPhone}\n` +
            `⏰ Time: ${new Date(timestamp).toLocaleString('he-IL', {
                timeZone: 'Asia/Jerusalem',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(',', '')}\n\n` +
            `💬 Message:\n"${messageText}"\n\n` +
            `⚠️  Matched words (${matchedWords.length}): ${matchedWords.join(', ')}`;

        // Store GPT analysis for database saving
        let gptAnalysisData = null;

        // Retrieve conversation context (last 5 messages) for better accuracy
        let conversationContext = [];
        try {
            const CONFIG = require('./sentimentAnalysisConfig');
            const { getRedis } = require('./redisService');
            const redis = getRedis();
            const contextKey = `${CONFIG.REDIS_KEY_CONTEXT}:${groupId}`;

            // Get last 5 messages (excluding current one)
            const contextData = await redis.lrange(contextKey, 1, 5);

            // Parse and VALIDATE context messages (SECURITY: prevent injection)
            conversationContext = contextData.map(data => {
                try {
                    const parsed = JSON.parse(data);

                    // SECURITY: Validate structure and types
                    if (!parsed || typeof parsed !== 'object') {
                        console.warn(`[${getTimestamp()}] ⚠️  Invalid context: not an object`);
                        return null;
                    }

                    if (!parsed.sender || typeof parsed.sender !== 'string') {
                        console.warn(`[${getTimestamp()}] ⚠️  Invalid context: missing/invalid sender`);
                        return null;
                    }

                    if (!parsed.text || typeof parsed.text !== 'string') {
                        console.warn(`[${getTimestamp()}] ⚠️  Invalid context: missing/invalid text`);
                        return null;
                    }

                    if (!parsed.timestamp || typeof parsed.timestamp !== 'number') {
                        console.warn(`[${getTimestamp()}] ⚠️  Invalid context: missing/invalid timestamp`);
                        return null;
                    }

                    // SECURITY: Validate timestamp is recent (prevent old/fake data)
                    const age = Date.now() - parsed.timestamp;
                    if (age < 0 || age > 3600000) { // Max 1 hour old
                        console.warn(`[${getTimestamp()}] ⚠️  Invalid context: timestamp out of range (${Math.floor(age / 1000)}s old)`);
                        return null;
                    }

                    // SECURITY: Validate text length (prevent abuse)
                    if (parsed.text.length > 1000) {
                        console.warn(`[${getTimestamp()}] ⚠️  Invalid context: text too long (${parsed.text.length} chars)`);
                        return null;
                    }

                    return parsed;
                } catch (e) {
                    console.warn(`[${getTimestamp()}] ⚠️  Failed to parse context message:`, e.message);
                    return null;
                }
            }).filter(Boolean);

            if (conversationContext.length > 0) {
                console.log(`[${getTimestamp()}] 💬 Retrieved ${conversationContext.length} validated context messages for GPT analysis`);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ⚠️  Failed to retrieve context:`, error.message);
            // Continue without context (graceful degradation)
        }

        // GPT Sentiment Analysis (with conversation context)
        try {
            const analysis = await sentimentAnalysisService.analyzeMessage(
                messageText,
                matchedWords,
                senderName,
                groupName,
                conversationContext // Pass last 5 messages for context
            );

            if (analysis.analyzed) {
                // Store for database
                gptAnalysisData = {
                    analyzed: true,
                    severity: analysis.severity,
                    confidence: analysis.confidence,
                    category: analysis.category,
                    explanation: analysis.explanation,
                    emotionalImpact: analysis.emotionalImpact,
                    recommendation: analysis.recommendation,
                    cost: analysis.cost
                };

                // Add GPT analysis to alert
                const confidenceEmoji = analysis.confidence >= 80 ? '🔴' :
                                       analysis.confidence >= 60 ? '🟡' : '🟢';

                alertMessage += `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🧠 *AI SENTIMENT ANALYSIS*\n` +
                    `${confidenceEmoji} Confidence: ${analysis.confidence}%\n` +
                    `📊 Category: ${analysis.category.replace(/_/g, ' ')}\n` +
                    `💭 Analysis: ${analysis.explanation}\n` +
                    `💔 Impact: ${analysis.emotionalImpact}\n` +
                    `⚡ Recommendation: ${analysis.recommendation.replace(/_/g, ' ').toUpperCase()}\n\n` +
                    `💰 Cost: $${analysis.cost.toFixed(6)} | Budget: $${analysis.budgetInfo.remaining.toFixed(4)} left`;

            } else if (analysis.reason === 'Daily budget reached') {
                // Send budget exhausted alert
                await sentimentAnalysisService.sendBudgetAlert(sock);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ⚠️  GPT analysis failed:`, error.message);
            // Continue with basic alert
        }

        // Add action options
        alertMessage += `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Actions:\n` +
            `• Reply with 'd' to delete this message\n` +
            `• Reply with #kick to remove user\n` +
            `• Send #bullywatch off to disable monitoring\n` +
            `• Or ignore this message`;

        // Save to database
        try {
            await offensiveMessageService.saveOffensiveMessage({
                messageId,
                whatsappGroupId: groupId,
                groupName,
                senderPhone: realPhone,
                senderName,
                senderJid,
                messageText,
                matchedWords,
                gptAnalysis: gptAnalysisData
            });
        } catch (error) {
            console.error(`[${getTimestamp()}] ⚠️  Failed to save offensive message to DB:`, error.message);
            // Continue with alert even if DB save fails
        }

        // ALWAYS send to main admin (0544345287)
        const mainAdminJid = `${this.adminPhone}@s.whatsapp.net`;

        // Get additional alert recipients for this group
        let additionalRecipients = [];
        try {
            const groupService = require('../database/groupService');
            additionalRecipients = await groupService.getAlertRecipients(groupId);
        } catch (error) {
            console.error(`[${getTimestamp()}] ⚠️  Failed to get alert recipients:`, error.message);
            // Continue with main admin only
        }

        // Build list of all recipients (main admin + group-specific)
        const allRecipients = [mainAdminJid];
        for (const phone of additionalRecipients) {
            allRecipients.push(`${phone}@s.whatsapp.net`);
        }

        console.log(`[${getTimestamp()}] 📤 Sending alert to ${allRecipients.length} recipient(s)`);
        if (additionalRecipients.length > 0) {
            console.log(`[${getTimestamp()}] ➕ Additional recipients: ${additionalRecipients.join(', ')}`);
        }

        try {
            // Send as quoted reply to original message (so admin can reply with 'd' to delete)
            const quotedMessage = originalMessage ? { quoted: originalMessage } : {};

            // Send to main admin first (keep reference for delete mapping)
            const sentMessage = await sock.sendMessage(mainAdminJid, {
                text: alertMessage
            }, quotedMessage);

            // Send to additional recipients (if any)
            for (const recipientJid of allRecipients.slice(1)) {
                try {
                    await sock.sendMessage(recipientJid, {
                        text: alertMessage
                    }, quotedMessage);
                    console.log(`[${getTimestamp()}] ✅ Alert sent to additional recipient: ${recipientJid.split('@')[0]}`);
                } catch (recipientError) {
                    console.error(`[${getTimestamp()}] ❌ Failed to send to ${recipientJid}:`, recipientError.message);
                    // Continue with other recipients
                }
            }

            // Store mapping of alert message ID → original message ID for delete functionality
            // This allows admin to reply 'd' to the alert to delete the original offensive message
            if (sentMessage && sentMessage.key && sentMessage.key.id && messageId) {
                try {
                    const { getRedis } = require('./redisService');
                    const redis = getRedis();

                    // Store mapping for 24 hours (messages older than this can't be deleted)
                    await redis.setex(
                        `${CONFIG.REDIS_KEY_ALERT_MAP}:${sentMessage.key.id}`,
                        CONFIG.ALERT_MAPPING_TTL_SECONDS,
                        messageId
                    );

                    console.log(`[${getTimestamp()}] 🔗 Stored alert mapping: ${sentMessage.key.id} → ${messageId}`);
                } catch (redisError) {
                    console.error(`[${getTimestamp()}] ⚠️  Failed to store alert mapping:`, redisError.message);
                    // Non-critical error - delete will still work if message is recent
                }
            }

            console.log(`[${getTimestamp()}] ✅ Bullying alert sent to admin for ${groupName}`);
            console.log(`[${getTimestamp()}] 📊 Severity: ${severity}, Matched: ${matchedWords.length} words`);
            console.log(`[${getTimestamp()}] 📞 Real phone: ${realPhone}`);

            // BULLYWATCH: Store flagged message for admin feedback
            try {
                const flaggedMessageData = {
                    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp,
                    groupName,
                    groupId,
                    senderName: senderName || 'Unknown',
                    senderPhone: realPhone,
                    messageText,
                    matchedWords,
                    severity,
                    verdict: null, // Will be set by admin feedback
                    feedbackTimestamp: null
                };

                try {
                    const { getRedis, isRedisConnected } = require('./redisService');

                    if (isRedisConnected()) {
                        const redis = getRedis();

                        // Store in Redis list (LPUSH = newest first)
                        await redis.lpush('bullywatch:flagged', JSON.stringify(flaggedMessageData));

                        // Keep only last 100 flagged messages (prevent memory bloat)
                        await redis.ltrim('bullywatch:flagged', 0, 99);

                        console.log(`[${getTimestamp()}] 💾 Flagged message stored in Redis for feedback: ${flaggedMessageData.id}`);
                    }
                } catch (redisError) {
                    console.log(`[${getTimestamp()}] ⚠️  Redis unavailable, using in-memory fallback for flagged messages`);
                    // Fallback to in-memory storage
                    if (!global.bullywatchFlagged) global.bullywatchFlagged = [];
                    global.bullywatchFlagged.push(flaggedMessageData);

                    // Keep only last 100 (prevent memory bloat)
                    if (global.bullywatchFlagged.length > 100) {
                        global.bullywatchFlagged = global.bullywatchFlagged.slice(-100);
                    }

                    console.log(`[${getTimestamp()}] 💾 Flagged message stored in memory for feedback: ${flaggedMessageData.id}`);
                }
            } catch (storageError) {
                console.error(`[${getTimestamp()}] ⚠️  Failed to store flagged message:`, storageError.message);
                // Non-critical error - alert still sent
            }

            return true;
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to send bullying alert:`, error.message);
            return false;
        }
    }

    /**
     * Log offensive content detection (for audit purposes)
     * @param {object} data - Detection data
     */
    logDetection(data) {
        const { groupName, senderPhone, matchedWords, severity } = data;

        console.log(`[${getTimestamp()}] 🚨 OFFENSIVE CONTENT DETECTED`);
        console.log(`   Group: ${groupName}`);
        console.log(`   User: ${senderPhone}`);
        console.log(`   Severity: ${severity}`);
        console.log(`   Matched: ${matchedWords.length} words (${matchedWords.join(', ')})`);
    }

    /**
     * Get monitoring statistics
     * @returns {object} Service statistics
     */
    getStats() {
        return {
            totalWords: ALL_OFFENSIVE_WORDS.length,
            adminPhone: this.adminPhone,
            enabled: true
        };
    }
}

// Export singleton instance
module.exports = new BullyingMonitoringService();
