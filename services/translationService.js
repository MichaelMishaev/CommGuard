/**
 * Translation Service
 * Handles Google Translate API integration for text translation
 * Support for multiple languages with auto-detection
 */

const https = require('https');
const { getTimestamp } = require('../utils/logger');

class TranslationService {
    constructor() {
        this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || 'your-translate-api-key';
        this.baseUrl = 'https://translation.googleapis.com/language/translate/v2';
        this.initialized = false;
        this.rateLimiter = {
            requests: [],
            maxRequests: 10, // 10 translations per minute
            windowMs: 60 * 1000 // 1 minute
        };
    }

    /**
     * Initialize the translation service
     */
    async initialize() {
        if (this.initialized) return true;
        
        try {
            // Check if API key is configured
            if (!this.apiKey || this.apiKey === 'your-translate-api-key') {
                console.log(`[${getTimestamp()}] ⚠️  Translation service: API key not configured`);
                return false;
            }
            
            console.log(`[${getTimestamp()}] 🔤 Translation service initialized`);
            this.initialized = true;
            return true;
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Translation service initialization failed:`, error.message);
            return false;
        }
    }

    /**
     * Check rate limiting
     */
    checkRateLimit(userId) {
        const now = Date.now();
        
        // Clean old requests
        this.rateLimiter.requests = this.rateLimiter.requests.filter(
            req => now - req.timestamp < this.rateLimiter.windowMs
        );
        
        // Count requests from this user
        const userRequests = this.rateLimiter.requests.filter(req => req.userId === userId);
        
        if (userRequests.length >= this.rateLimiter.maxRequests) {
            const oldestRequest = Math.min(...userRequests.map(req => req.timestamp));
            const timeLeft = Math.ceil((oldestRequest + this.rateLimiter.windowMs - now) / 1000);
            throw new Error(`Rate limit exceeded. Try again in ${timeLeft} seconds.`);
        }
        
        // Add current request
        this.rateLimiter.requests.push({
            userId,
            timestamp: now
        });
        
        return true;
    }

    /**
     * Translate text using Google Translate API
     */
    async translateText(text, targetLang = 'en', sourceLang = null, userId = 'system') {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.initialized) {
            throw new Error('Translation service not available. API key not configured.');
        }
        
        // Check rate limiting
        this.checkRateLimit(userId);
        
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                q: text,
                target: targetLang,
                source: sourceLang, // null for auto-detection
                format: 'text'
            });
            
            const options = {
                hostname: 'translation.googleapis.com',
                path: `/language/translate/v2?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        
                        if (response.error) {
                            reject(new Error(response.error.message));
                            return;
                        }
                        
                        const translation = response.data.translations[0];
                        const result = {
                            originalText: text,
                            translatedText: translation.translatedText,
                            detectedLanguage: translation.detectedSourceLanguage || sourceLang,
                            targetLanguage: targetLang
                        };
                        
                        resolve(result);
                    } catch (error) {
                        reject(new Error('Failed to parse translation response'));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Translation request failed: ${error.message}`));
            });
            
            req.write(postData);
            req.end();
        });
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages() {
        return {
            'en': 'English',
            'he': 'Hebrew',
            'ar': 'Arabic',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese (Simplified)',
            'zh-TW': 'Chinese (Traditional)',
            'hi': 'Hindi',
            'tr': 'Turkish',
            'pl': 'Polish',
            'nl': 'Dutch',
            'sv': 'Swedish',
            'da': 'Danish',
            'no': 'Norwegian',
            'fi': 'Finnish'
        };
    }

    /**
     * Parse language code from user input
     */
    parseLanguageCode(input) {
        const languages = this.getSupportedLanguages();
        const inputLower = input.toLowerCase();
        
        // Direct language code match
        if (languages[inputLower]) {
            return inputLower;
        }
        
        // Language name match
        for (const [code, name] of Object.entries(languages)) {
            if (name.toLowerCase().includes(inputLower)) {
                return code;
            }
        }
        
        // Common aliases
        const aliases = {
            'hebrew': 'he',
            'עברית': 'he',
            'english': 'en',
            'אנגלית': 'en',
            'arabic': 'ar',
            'ערבית': 'ar',
            'spanish': 'es',
            'ספרדית': 'es',
            'french': 'fr',
            'צרפתית': 'fr',
            'german': 'de',
            'גרמנית': 'de',
            'russian': 'ru',
            'רוסית': 'ru',
            'chinese': 'zh',
            'סינית': 'zh'
        };
        
        return aliases[inputLower] || null;
    }
}

// Export singleton instance
const translationService = new TranslationService();
module.exports = { translationService };