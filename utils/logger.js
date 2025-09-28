const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

// Create pino logger - simple configuration for now
const pinoLogger = pino({
  level: config.LOG_LEVEL || 'info'
});

// Helper function to get timestamp
function getTimestamp() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(',', '');
}

// Advanced logger class for error tracking and categorization
class AdvancedLogger {
    constructor() {
        this.logCounts = new Map(); // Track error frequency
        this.lastLogTime = new Map(); // Rate limiting
        this.RATE_LIMIT_MS = 60000; // 1 minute
        this.MAX_LOGS_PER_MINUTE = 5;

        // Error categorization
        this.ERROR_CATEGORIES = {
            SESSION: 'session_error',
            FIRESTORE: 'firestore_error',
            PERMISSIONS: 'permission_error',
            NETWORK: 'network_error',
            SYSTEM: 'system_error',
            VALIDATION: 'validation_error'
        };

        // Initialize log file
        this.initLogFile();
    }

    async initLogFile() {
        try {
            const logDir = path.join(__dirname, '..', 'logs');
            await fs.mkdir(logDir, { recursive: true });
            this.logFile = path.join(logDir, 'bot-errors.log');
        } catch (error) {
            console.error('Failed to initialize log file:', error);
        }
    }

    // Rate limiting for error logs
    shouldLog(errorKey) {
        const now = Date.now();
        const lastTime = this.lastLogTime.get(errorKey) || 0;
        const count = this.logCounts.get(errorKey) || 0;

        // Reset count if enough time has passed
        if (now - lastTime > this.RATE_LIMIT_MS) {
            this.logCounts.set(errorKey, 0);
            this.lastLogTime.set(errorKey, now);
            return true;
        }

        // Check if we've exceeded the rate limit
        if (count >= this.MAX_LOGS_PER_MINUTE) {
            return false;
        }

        this.logCounts.set(errorKey, count + 1);
        return true;
    }

    // Categorize and log session errors
    logSessionError(error, context = {}) {
        const errorKey = `session_${error.message?.substring(0, 50) || 'unknown'}`;

        if (!this.shouldLog(errorKey)) {
            return; // Rate limited
        }

        const logEntry = {
            timestamp: getTimestamp(),
            category: this.ERROR_CATEGORIES.SESSION,
            error: error.message,
            context: {
                userId: context.userId,
                groupId: context.groupId,
                messageId: context.messageId
            },
            count: this.logCounts.get(errorKey) || 1
        };

        console.warn(`[${logEntry.timestamp}] 🔐 SESSION ERROR: ${error.message}`);
        if (context.userId) console.warn(`   User: ${context.userId}`);
        if (context.groupId) console.warn(`   Group: ${context.groupId}`);
        if (logEntry.count > 1) console.warn(`   Count: ${logEntry.count} (rate limited)`);

        this.writeToFile(logEntry);
    }

    // Categorize and log Firestore errors
    logFirestoreError(error, operation, data = {}) {
        const errorKey = `firestore_${operation}`;

        if (!this.shouldLog(errorKey)) {
            return; // Rate limited
        }

        const logEntry = {
            timestamp: getTimestamp(),
            category: this.ERROR_CATEGORIES.FIRESTORE,
            operation: operation,
            error: error.message,
            undefinedFields: this.findUndefinedFields(data),
            count: this.logCounts.get(errorKey) || 1
        };

        console.error(`[${logEntry.timestamp}] 🔥 FIRESTORE ERROR: ${operation}`);
        console.error(`   Error: ${error.message}`);
        if (logEntry.undefinedFields.length > 0) {
            console.error(`   Undefined fields: ${logEntry.undefinedFields.join(', ')}`);
        }
        if (logEntry.count > 1) console.error(`   Count: ${logEntry.count} (rate limited)`);

        this.writeToFile(logEntry);
    }

    // Log permission errors
    logPermissionError(action, groupId, error) {
        const errorKey = `permission_${action}`;

        if (!this.shouldLog(errorKey)) {
            return; // Rate limited
        }

        const logEntry = {
            timestamp: getTimestamp(),
            category: this.ERROR_CATEGORIES.PERMISSIONS,
            action: action,
            groupId: groupId,
            error: error.message || error,
            count: this.logCounts.get(errorKey) || 1
        };

        console.error(`[${logEntry.timestamp}] 🚫 PERMISSION ERROR: ${action}`);
        console.error(`   Group: ${groupId}`);
        console.error(`   Error: ${error.message || error}`);
        if (logEntry.count > 1) console.error(`   Count: ${logEntry.count} (rate limited)`);

        this.writeToFile(logEntry);
    }

    // Find undefined fields in nested objects
    findUndefinedFields(obj, prefix = '') {
        const undefinedFields = [];

        if (obj === null || typeof obj !== 'object') {
            return undefinedFields;
        }

        for (const [key, value] of Object.entries(obj)) {
            const fieldPath = prefix ? `${prefix}.${key}` : key;

            if (value === undefined) {
                undefinedFields.push(fieldPath);
            } else if (typeof value === 'object' && value !== null) {
                undefinedFields.push(...this.findUndefinedFields(value, fieldPath));
            }
        }

        return undefinedFields;
    }

    // Sanitize data for Firestore (remove undefined values)
    sanitizeForFirestore(obj) {
        if (obj === null || obj === undefined) {
            return null;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeForFirestore(item));
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                sanitized[key] = this.sanitizeForFirestore(value);
            }
        }

        return sanitized;
    }

    // Write to log file
    async writeToFile(logEntry) {
        if (!this.logFile) return;

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.logFile, logLine);
        } catch (error) {
            // Don't log errors about logging to prevent infinite loops
        }
    }

    // Get error statistics
    getErrorStats() {
        const stats = {};
        for (const [key, count] of this.logCounts.entries()) {
            const [category] = key.split('_');
            stats[category] = (stats[category] || 0) + count;
        }
        return stats;
    }

    // Clear old logs
    clearOldLogs() {
        this.logCounts.clear();
        this.lastLogTime.clear();
        console.log(`[${getTimestamp()}] 🧹 Cleared old error logs`);
    }
}

// Create singleton instance
const advancedLogger = new AdvancedLogger();

module.exports = {
    logger: pinoLogger,
    getTimestamp,
    advancedLogger
};