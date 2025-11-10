// Stealth utilities for WhatsApp bot to avoid detection
// Based on research for human-like behavior patterns

const { delay } = require('@whiskeysockets/baileys');

class StealthUtils {
    constructor() {
        this.lastActionTime = new Map(); // Track last action per chat
        this.actionsPerHour = new Map(); // Track actions per hour per chat
        this.messageVariations = new Map(); // Store message variations

        // Configuration
        this.config = {
            // Typing simulation
            minTypingSpeed: 40, // words per minute (lower bound)
            maxTypingSpeed: 80, // words per minute (upper bound)
            maxTypingDuration: 8000, // max 8 seconds typing

            // Delays
            minActionDelay: 1500, // minimum delay before any action
            maxActionDelay: 4000, // maximum random delay
            betweenMessageDelay: 3000, // delay between consecutive messages

            // Rate limiting
            maxActionsPerHour: 20, // max actions per chat per hour
            maxActionsPerMinute: 3, // max actions per chat per minute

            // Human-like randomization
            presenceUpdateChance: 0.7, // 70% chance to update presence
            randomDelayVariation: 0.3, // 30% variation in delays
        };
    }

    // Calculate human-like typing delay based on text length
    calculateTypingDelay(text) {
        if (!text || typeof text !== 'string') return 0;

        const words = text.trim().split(/\s+/).length;
        const wpm = this.config.minTypingSpeed +
                   Math.random() * (this.config.maxTypingSpeed - this.config.minTypingSpeed);

        // Calculate base typing time
        const typingTime = (words / wpm) * 60 * 1000;

        // Add random variation (±30%)
        const variation = typingTime * this.config.randomDelayVariation;
        const finalTime = typingTime + (Math.random() - 0.5) * variation;

        // Ensure it's within bounds
        return Math.min(Math.max(finalTime, 500), this.config.maxTypingDuration);
    }

    // Generate random delay for actions
    randomDelay() {
        const base = this.config.minActionDelay;
        const range = this.config.maxActionDelay - this.config.minActionDelay;
        return base + Math.random() * range;
    }

    // Check if we should rate limit this action
    shouldRateLimit(chatId) {
        const now = Date.now();
        const hourKey = `${chatId}_${Math.floor(now / 3600000)}`;
        const minuteKey = `${chatId}_${Math.floor(now / 60000)}`;

        // Check hourly limit
        const hourlyActions = this.actionsPerHour.get(hourKey) || 0;
        if (hourlyActions >= this.config.maxActionsPerHour) {
            return { limited: true, reason: 'hourly_limit', waitTime: 3600000 };
        }

        // Check per-minute limit
        const minuteActions = this.actionsPerHour.get(minuteKey) || 0;
        if (minuteActions >= this.config.maxActionsPerMinute) {
            return { limited: true, reason: 'minute_limit', waitTime: 60000 };
        }

        // Check time since last action
        const lastAction = this.lastActionTime.get(chatId) || 0;
        const timeSinceLastAction = now - lastAction;
        if (timeSinceLastAction < this.config.betweenMessageDelay) {
            return {
                limited: true,
                reason: 'too_frequent',
                waitTime: this.config.betweenMessageDelay - timeSinceLastAction
            };
        }

        return { limited: false };
    }

    // Record an action for rate limiting
    recordAction(chatId) {
        const now = Date.now();
        const hourKey = `${chatId}_${Math.floor(now / 3600000)}`;
        const minuteKey = `${chatId}_${Math.floor(now / 60000)}`;

        this.actionsPerHour.set(hourKey, (this.actionsPerHour.get(hourKey) || 0) + 1);
        this.actionsPerHour.set(minuteKey, (this.actionsPerHour.get(minuteKey) || 0) + 1);
        this.lastActionTime.set(chatId, now);

        // Clean old entries (older than 2 hours)
        const cutoff = Math.floor((now - 7200000) / 3600000);
        for (const [key] of this.actionsPerHour) {
            if (key.includes('_') && parseInt(key.split('_')[1]) < cutoff) {
                this.actionsPerHour.delete(key);
            }
        }
    }

    // Send a message with human-like behavior
    async sendHumanLikeMessage(sock, chatId, message, options = {}) {
        // Check rate limiting
        const rateCheck = this.shouldRateLimit(chatId);
        if (rateCheck.limited) {
            console.log(`🚫 Rate limited for ${chatId}: ${rateCheck.reason}, waiting ${rateCheck.waitTime}ms`);
            if (options.skipIfRateLimited) {
                return { success: false, reason: 'rate_limited' };
            }
            await delay(rateCheck.waitTime);
        }

        try {
            // Random initial delay
            await delay(this.randomDelay());

            // Update presence to "composing" if configured
            if (Math.random() < this.config.presenceUpdateChance) {
                try {
                    await sock.sendPresenceUpdate('composing', chatId);
                } catch (e) {
                    // Ignore presence errors
                }
            }

            // Calculate and apply typing delay
            const text = message.text || message.caption || '';
            if (text) {
                const typingDelay = this.calculateTypingDelay(text);
                await delay(typingDelay);
            }

            // Send the message
            const result = await sock.sendMessage(chatId, message);

            // Update presence to "paused" after a short delay
            if (Math.random() < this.config.presenceUpdateChance) {
                setTimeout(async () => {
                    try {
                        await sock.sendPresenceUpdate('paused', chatId);
                    } catch (e) {
                        // Ignore presence errors
                    }
                }, 500 + Math.random() * 1000);
            }

            // Record the action
            this.recordAction(chatId);

            return { success: true, result };

        } catch (error) {
            console.error('Failed to send human-like message:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Delete a message with human-like delay
    async deleteMessageHumanLike(sock, chatId, messageKey, options = {}) {
        // Check rate limiting
        const rateCheck = this.shouldRateLimit(chatId);
        if (rateCheck.limited && !options.urgent) {
            console.log(`🚫 Delete rate limited for ${chatId}: ${rateCheck.reason}`);
            if (options.skipIfRateLimited) {
                return { success: false, reason: 'rate_limited' };
            }
            await delay(Math.min(rateCheck.waitTime, 5000)); // Max 5 sec wait for deletes
        }

        try {
            // Random delay before deletion (shorter for urgent actions)
            const deleteDelay = options.urgent ?
                (500 + Math.random() * 1000) : // 0.5-1.5s for urgent
                this.randomDelay(); // Full random delay for non-urgent

            await delay(deleteDelay);

            // Delete the message
            const deleteResult = await sock.sendMessage(chatId, { delete: messageKey });

            // Verify deletion attempt
            if (!deleteResult || deleteResult.status !== 200) {
                console.warn(`⚠️ Delete message API response uncertain: ${JSON.stringify(deleteResult)}`);
            }

            // Record the action
            this.recordAction(chatId);

            return { success: true, apiResult: deleteResult };

        } catch (error) {
            console.error('Failed to delete message:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Add message variation to make responses less robotic
    addMessageVariation(key, variations) {
        if (!Array.isArray(variations) || variations.length === 0) return;
        this.messageVariations.set(key, variations);
    }

    // Get a random variation of a message
    getMessageVariation(key, fallback = '') {
        const variations = this.messageVariations.get(key);
        if (!variations || variations.length === 0) return fallback;

        const randomIndex = Math.floor(Math.random() * variations.length);
        return variations[randomIndex];
    }

    // Initialize default message variations
    initializeDefaultVariations() {
        // Hebrew variations for common bot responses
        this.addMessageVariation('admin_only_hebrew', [
            'מה אני עובד אצלך?!',
            'רק למנהלים אפשר להשתמש בזה',
            'אין לך הרשאות לפקודה הזו',
            'הפקודה הזו מיועדת למנהלים בלבד',
            'אתה לא מנהל... אז לא'
        ]);

        this.addMessageVariation('unknown_command', [
            '❌ Unknown command. Use #help to see available commands.',
            '❓ I don\'t understand that command. Try #help',
            '🤔 Command not recognized. Use #help for available options',
            '❌ Invalid command. Type #help to see what I can do'
        ]);

        this.addMessageVariation('help_blocked_group', [
            '❌ Unknown command.',
            '❓ Command not found.',
            '🤔 Invalid command.',
            '❌ Not recognized.'
        ]);
    }

    // Get stats for monitoring
    getStats() {
        const now = Date.now();
        const currentHour = Math.floor(now / 3600000);
        const currentMinute = Math.floor(now / 60000);

        let totalHourlyActions = 0;
        let totalMinuteActions = 0;

        for (const [key, count] of this.actionsPerHour) {
            if (key.includes(`_${currentHour}`)) {
                totalHourlyActions += count;
            }
            if (key.includes(`_${currentMinute}`)) {
                totalMinuteActions += count;
            }
        }

        return {
            totalHourlyActions,
            totalMinuteActions,
            trackedChats: this.lastActionTime.size,
            messageVariations: this.messageVariations.size
        };
    }
}

// Export a singleton instance
module.exports = new StealthUtils();