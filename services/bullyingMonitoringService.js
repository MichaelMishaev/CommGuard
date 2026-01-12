// services/bullyingMonitoringService.js
// Bullying detection and monitoring service

const { ALL_OFFENSIVE_WORDS } = require('./offensiveWordsDatabase');
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
            messageText,
            matchedWords,
            timestamp,
            severity
        } = alertData;

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
            `📞 Phone: ${senderPhone}\n` +
            `⏰ Time: ${new Date(timestamp).toLocaleString('he-IL', {
                timeZone: 'Asia/Jerusalem',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })}\n\n` +
            `💬 Message:\n"${messageText}"\n\n` +
            `⚠️  Matched words (${matchedWords.length}): ${matchedWords.join(', ')}`;

        // GPT Sentiment Analysis (only if words matched)
        try {
            const analysis = await sentimentAnalysisService.analyzeMessage(
                messageText,
                matchedWords,
                senderName,
                groupName
            );

            if (analysis.analyzed) {
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
                // Check if we need to send budget alert
                await sentimentAnalysisService.sendBudgetAlert(sock);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ⚠️  GPT analysis failed:`, error.message);
            // Continue with basic alert
        }

        // Add action options
        alertMessage += `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Actions:\n` +
            `• Reply with #kick to remove user\n` +
            `• Send #bullywatch off to disable monitoring\n` +
            `• Or ignore this message`;

        const adminJid = `${this.adminPhone}@s.whatsapp.net`;

        try {
            await sock.sendMessage(adminJid, {
                text: alertMessage
            });

            console.log(`[${getTimestamp()}] ✅ Bullying alert sent to admin for ${groupName}`);
            console.log(`[${getTimestamp()}] 📊 Severity: ${severity}, Matched: ${matchedWords.length} words`);

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
