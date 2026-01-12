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

        // GPT Sentiment Analysis (only if words matched)
        try {
            const analysis = await sentimentAnalysisService.analyzeMessage(
                messageText,
                matchedWords,
                senderName,
                groupName
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

        const adminJid = `${this.adminPhone}@s.whatsapp.net`;

        try {
            // Send as quoted reply to original message (so admin can reply with 'd' to delete)
            const quotedMessage = originalMessage ? { quoted: originalMessage } : {};

            const sentMessage = await sock.sendMessage(adminJid, {
                text: alertMessage
            }, quotedMessage);

            // Store mapping of alert message ID → original message ID for delete functionality
            // This allows admin to reply 'd' to the alert to delete the original offensive message
            if (sentMessage && sentMessage.key && sentMessage.key.id && messageId) {
                try {
                    const { getRedis } = require('./redisService');
                    const redis = getRedis();

                    // Store mapping for 24 hours (messages older than this can't be deleted)
                    await redis.setex(
                        `alert_to_original:${sentMessage.key.id}`,
                        86400,
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
