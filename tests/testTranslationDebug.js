/**
 * Debug Translation Service Issues
 * Comprehensive diagnosis of translation problems
 */

require('dotenv').config();
const { getTimestamp } = require('../utils/logger');

console.log(`╔═══════════════════════════════════════════════════════════╗`);
console.log(`║              🔍 Translation Service Diagnosis               ║`);
console.log(`║                                                           ║`);
console.log(`║        Debug why translation is not working              ║`);
console.log(`╚═══════════════════════════════════════════════════════════╝`);
console.log('');

console.log(`[${getTimestamp()}] 🔍 Starting translation diagnosis...`);
console.log('');

async function diagnoseTranslation() {
    console.log('1️⃣ Environment Check...');
    
    // Check API key
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    console.log(`   API Key: ${apiKey ? '✅ Found (' + apiKey.length + ' chars)' : '❌ Missing'}`);
    console.log(`   API Key Preview: ${apiKey ? apiKey.substring(0, 20) + '...' : 'N/A'}`);
    
    // Check dotenv
    console.log(`   Dotenv loaded: ✅ Yes`);
    
    console.log('');
    console.log('2️⃣ Service Loading Check...');
    
    try {
        const { translationService } = require('../services/translationService');
        console.log('   ✅ Translation service imported successfully');
        
        // Check initialization
        await translationService.initialize();
        console.log('   ✅ Translation service initialized');
        
    } catch (error) {
        console.log(`   ❌ Failed to load/initialize translation service:`);
        console.log(`      Error: ${error.message}`);
        console.log(`      Stack: ${error.stack}`);
        return;
    }
    
    console.log('');
    console.log('3️⃣ Basic Translation Test...');
    
    try {
        const { translationService } = require('../services/translationService');
        
        console.log('   Testing: "Hello world" → Hebrew');
        const result1 = await translationService.translateText('Hello world', 'he');
        console.log(`   ✅ Result: "${result1.translatedText}" (${result1.detectedLanguage} → ${result1.targetLanguage})`);
        
        console.log('   Testing: "שלום עולם" → English');
        const result2 = await translationService.translateText('שלום עולם', 'en');
        console.log(`   ✅ Result: "${result2.translatedText}" (${result2.detectedLanguage} → ${result2.targetLanguage})`);
        
    } catch (error) {
        console.log(`   ❌ Translation test failed:`);
        console.log(`      Error: ${error.message}`);
        console.log(`      Stack: ${error.stack}`);
        
        if (error.message.includes('API key')) {
            console.log(`   💡 Suggestion: Check API key validity and permissions`);
        }
        if (error.message.includes('quota')) {
            console.log(`   💡 Suggestion: Check API quota and billing`);
        }
        if (error.message.includes('network')) {
            console.log(`   💡 Suggestion: Check network connectivity`);
        }
        return;
    }
    
    console.log('');
    console.log('4️⃣ Command Handler Test...');
    
    try {
        const CommandHandler = require('../services/commandHandler');
        
        // Mock socket
        const mockMessages = [];
        const mockSock = {
            sendMessage: async (jid, message) => {
                mockMessages.push({ jid, text: message.text });
                return { key: { id: 'mock_' + Date.now() } };
            }
        };
        
        const handler = new CommandHandler(mockSock);
        
        // Create mock message for #translate command
        const mockMsg = {
            key: {
                id: 'test_translate_001',
                remoteJid: '123456789@s.whatsapp.net',
                participant: '972555123456@s.whatsapp.net'
            },
            message: {
                conversation: '#translate Hello world'
            }
        };
        
        console.log('   Testing #translate command handling...');
        const result = await handler.handleTranslate(mockMsg, ['Hello', 'world'], true);
        
        console.log(`   ✅ Command handled: ${result}`);
        console.log(`   📤 Messages sent: ${mockMessages.length}`);
        
        if (mockMessages.length > 0) {
            console.log(`   📝 Response: "${mockMessages[0].text.substring(0, 100)}..."`);
        }
        
    } catch (error) {
        console.log(`   ❌ Command handler test failed:`);
        console.log(`      Error: ${error.message}`);
        console.log(`      Stack: ${error.stack}`);
        return;
    }
    
    console.log('');
    console.log('5️⃣ Rate Limiting Test...');
    
    try {
        const { translationService } = require('../services/translationService');
        
        const testUserId = 'test_user_debug';
        console.log('   Testing rate limiting for user:', testUserId);
        
        // This should not throw error for new user
        translationService.checkRateLimit(testUserId);
        console.log('   ✅ Rate limiting check passed');
        
    } catch (error) {
        if (error.message.includes('rate limit')) {
            console.log(`   ✅ Rate limiting working: ${error.message}`);
        } else {
            console.log(`   ❌ Rate limiting test failed: ${error.message}`);
            return;
        }
    }
    
    console.log('');
    console.log('6️⃣ Auto-Translation Test...');
    
    try {
        const config = require('../config');
        console.log(`   Auto-translation enabled: ${config.FEATURES.AUTO_TRANSLATION ? '✅ Yes' : '❌ No'}`);
        
        // Test Hebrew detection
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        if (indexContent.includes('isTextAllNonHebrew')) {
            console.log('   ✅ Hebrew detection function found');
        } else {
            console.log('   ❌ Hebrew detection function missing');
        }
        
        if (indexContent.includes('config.FEATURES.AUTO_TRANSLATION')) {
            console.log('   ✅ Auto-translation config check found');
        } else {
            console.log('   ❌ Auto-translation config check missing');
        }
        
    } catch (error) {
        console.log(`   ❌ Auto-translation test failed: ${error.message}`);
    }
    
    console.log('');
    console.log(`╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║                    🎯 DIAGNOSIS COMPLETE                      ║`);
    console.log(`╠═══════════════════════════════════════════════════════════════╣`);
    console.log(`║  If all tests passed above, translation should work!         ║`);
    console.log(`║                                                               ║`);
    console.log(`║  🚀 Commands to test in WhatsApp:                           ║`);
    console.log(`║  • #translate Hello world                                    ║`);
    console.log(`║  • #translate he Good morning                               ║`);
    console.log(`║  • #langs                                                    ║`);
    console.log(`║  • #autotranslate status                                     ║`);
    console.log(`║  • Reply to English message → Should auto-translate         ║`);
    console.log(`║                                                               ║`);
    console.log(`║  🔧 If still not working on production:                     ║`);
    console.log(`║  1. Check .env file exists on server                        ║`);
    console.log(`║  2. Run: npm install dotenv                                 ║`);
    console.log(`║  3. Restart bot: pm2 restart commguard                      ║`);
    console.log(`║  4. Check logs: pm2 logs commguard --lines 20               ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝`);
}

diagnoseTranslation().catch(console.error);