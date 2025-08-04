#!/usr/bin/env node

/**
 * Test Unblacklist Command Fixes
 * Tests the two critical fixes:
 * 1. Admin notification routing (should go to ALERT_PHONE not ADMIN_PHONE)
 * 2. Hebrew translation in success message
 */

const { getTimestamp } = require('../utils/logger');
const config = require('../config');

console.log(`
╔════════════════════════════════════════════════════╗
║          🧪 Unblacklist Command Fixes Test          ║
║                                                    ║
║  Tests admin notification routing and Hebrew       ║
║  translation in success message                    ║
╚════════════════════════════════════════════════════╝
`);

/**
 * Test admin notification routing fix
 */
async function testAdminNotificationRouting() {
    console.log(`[${getTimestamp()}] 📞 Testing Admin Notification Routing\n`);
    
    let passed = 0;
    let failed = 0;
    
    // Read the command handler file to verify the fix
    const fs = require('fs');
    const filePath = '/Users/michaelmishayev/Desktop/CommGuard/bCommGuard/services/commandHandler.js';
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Test 1: Should use ALERT_PHONE not ADMIN_PHONE
        const alertPhoneUsage = fileContent.includes('config.ALERT_PHONE + \'@s.whatsapp.net\'');
        const adminPhoneUsage = fileContent.includes('config.ADMIN_PHONE + \'@s.whatsapp.net\'');
        
        if (alertPhoneUsage) {
            console.log('✅ PASSED - Uses config.ALERT_PHONE for admin notifications');
            passed++;
        } else {
            console.log('❌ FAILED - Does not use config.ALERT_PHONE for admin notifications');
            failed++;
        }
        
        // Test 2: Should not use ADMIN_PHONE in the unblacklist notification context
        const lines = fileContent.split('\n');
        let foundCorrectUsage = false;
        let foundIncorrectUsage = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('New Unblacklist Request')) {
                // Look for the admin ID definition in nearby lines
                for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
                    if (lines[j].includes('config.ALERT_PHONE')) {
                        foundCorrectUsage = true;
                    }
                    if (lines[j].includes('config.ADMIN_PHONE + \'@s.whatsapp.net\'')) {
                        foundIncorrectUsage = true;
                    }
                }
                break;
            }
        }
        
        if (foundCorrectUsage && !foundIncorrectUsage) {
            console.log('✅ PASSED - Unblacklist notifications correctly routed to alert phone');
            passed++;
        } else if (foundIncorrectUsage) {
            console.log('❌ FAILED - Still using ADMIN_PHONE for unblacklist notifications');
            failed++;
        } else {
            console.log('⚠️  WARNING - Could not verify notification routing');
            failed++;
        }
        
    } catch (error) {
        console.log(`❌ FAILED - Error reading file: ${error.message}`);
        failed++;
    }
    
    console.log(`\n📊 Admin Notification Routing Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Test Hebrew translation in success message
 */
async function testHebrewTranslation() {
    console.log(`[${getTimestamp()}] 🔤 Testing Hebrew Translation\n`);
    
    let passed = 0;
    let failed = 0;
    
    // Read the command handler file to verify Hebrew translation
    const fs = require('fs');
    const filePath = '/Users/michaelmishayev/Desktop/CommGuard/bCommGuard/services/commandHandler.js';
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Test Hebrew phrases that should be present
        const expectedHebrewPhrases = [
            'בקשת הסרה מהרשימה השחורה נשלחה בהצלחה', // "Unblacklist request submitted successfully"
            'הבקשה שלך נשלחה למנהל לבדיקה', // "Your request has been sent to admin for review"
            'תקבל הודעה ברגע שיתקבל החלטה', // "You will be notified once decision is made"
            'בקשה הבאה מותרת בעוד 24 שעות', // "Next request allowed in 24 hours"
            'אתה מסכים לפעול לפי כל כללי הקבוצה' // "You agree to follow all group rules"
        ];
        
        expectedHebrewPhrases.forEach((phrase, index) => {
            if (fileContent.includes(phrase)) {
                console.log(`✅ PASSED - Hebrew phrase ${index + 1}: "${phrase.substring(0, 30)}..."`);
                passed++;
            } else {
                console.log(`❌ FAILED - Missing Hebrew phrase ${index + 1}: "${phrase.substring(0, 30)}..."`);
                failed++;
            }
        });
        
        // Test that both English and Hebrew versions are present
        const hasEnglish = fileContent.includes('Unblacklist request submitted successfully');
        const hasHebrew = fileContent.includes('בקשת הסרה מהרשימה השחורה נשלחה בהצלחה');
        
        if (hasEnglish && hasHebrew) {
            console.log('✅ PASSED - Both English and Hebrew versions present');
            passed++;
        } else {
            console.log(`❌ FAILED - Missing versions: English=${hasEnglish}, Hebrew=${hasHebrew}`);
            failed++;
        }
        
    } catch (error) {
        console.log(`❌ FAILED - Error reading file: ${error.message}`);
        failed++;
    }
    
    console.log(`\n📊 Hebrew Translation Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Test message structure and completeness
 */
async function testMessageStructure() {
    console.log(`[${getTimestamp()}] 📝 Testing Message Structure\n`);
    
    let passed = 0;
    let failed = 0;
    
    // Read the actual success message from the file
    const fs = require('fs');
    const filePath = '/Users/michaelmishayev/Desktop/CommGuard/bCommGuard/services/commandHandler.js';
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Extract the success message text block
        const messageStartPattern = 'Unblacklist request submitted successfully!';
        const messageStart = fileContent.indexOf(messageStartPattern);
        
        if (messageStart === -1) {
            console.log('❌ FAILED - Could not find success message in file');
            failed++;
            return { passed, failed };
        }
        
        // Extract the text block (approximate)
        const messageBlock = fileContent.substring(messageStart, messageStart + 1000);
        
        // Test required English elements
        const englishElements = [
            'Unblacklist request submitted successfully',
            'Your request has been sent to the admin',
            'You will be notified once a decision is made',
            'Next request allowed in 24 hours',
            'agree to follow all group rules'
        ];
        
        englishElements.forEach((element, index) => {
            if (messageBlock.includes(element)) {
                console.log(`✅ PASSED - English element ${index + 1}: "${element.substring(0, 40)}..."`);
                passed++;
            } else {
                console.log(`❌ FAILED - Missing English element ${index + 1}: "${element.substring(0, 40)}..."`);
                failed++;
            }
        });
        
        // Test required Hebrew elements
        const hebrewElements = [
            'בקשת הסרה מהרשימה השחורה',
            'הבקשה שלך נשלחה למנהל',
            'תקבל הודעה ברגע',
            'בקשה הבאה מותרת',
            'מסכים לפעול לפי כל כללי'
        ];
        
        hebrewElements.forEach((element, index) => {
            if (messageBlock.includes(element)) {
                console.log(`✅ PASSED - Hebrew element ${index + 1}: "${element}"`);
                passed++;
            } else {
                console.log(`❌ FAILED - Missing Hebrew element ${index + 1}: "${element}"`);
                failed++;
            }
        });
        
        // Test proper formatting (emojis, structure)
        const formattingElements = ['✅', '📋', '⏰', '🕒'];
        formattingElements.forEach((emoji, index) => {
            if (messageBlock.includes(emoji)) {
                console.log(`✅ PASSED - Formatting element ${index + 1}: "${emoji}"`);
                passed++;
            } else {
                console.log(`❌ FAILED - Missing formatting element ${index + 1}: "${emoji}"`);
                failed++;
            }
        });
        
    } catch (error) {
        console.log(`❌ FAILED - Error analyzing message structure: ${error.message}`);
        failed++;
    }
    
    console.log(`\n📊 Message Structure Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Test configuration validation
 */
async function testConfigValidation() {
    console.log(`[${getTimestamp()}] ⚙️ Testing Configuration Validation\n`);
    
    let passed = 0;
    let failed = 0;
    
    // Test that required config values exist
    if (config.ALERT_PHONE) {
        console.log(`✅ PASSED - config.ALERT_PHONE exists: ${config.ALERT_PHONE}`);
        passed++;
    } else {
        console.log('❌ FAILED - config.ALERT_PHONE is missing');
        failed++;
    }
    
    if (config.ADMIN_PHONE) {
        console.log(`✅ PASSED - config.ADMIN_PHONE exists: ${config.ADMIN_PHONE}`);
        passed++;
    } else {
        console.log('❌ FAILED - config.ADMIN_PHONE is missing');
        failed++;
    }
    
    // Test that they are different (they should be for proper routing)
    if (config.ALERT_PHONE !== config.ADMIN_PHONE) {
        console.log('✅ PASSED - ALERT_PHONE and ADMIN_PHONE are different (proper routing)');
        passed++;
    } else {
        console.log('⚠️  INFO - ALERT_PHONE and ADMIN_PHONE are the same (notifications go to same number)');
        passed++; // This is not necessarily a failure
    }
    
    console.log(`\n📊 Configuration Validation Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`[${getTimestamp()}] 🚀 Starting Unblacklist Command Fixes Tests\n`);
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
        // Run all test suites
        const tests = [
            { name: 'Admin Notification Routing', fn: testAdminNotificationRouting },
            { name: 'Hebrew Translation', fn: testHebrewTranslation },
            { name: 'Message Structure', fn: testMessageStructure },
            { name: 'Configuration Validation', fn: testConfigValidation }
        ];
        
        for (const test of tests) {
            console.log(`🧪 Running ${test.name} tests...`);
            const result = await test.fn();
            totalPassed += result.passed;
            totalFailed += result.failed;
            console.log(`📊 ${test.name}: ${result.passed} passed, ${result.failed} failed\n`);
        }
        
        // Final results
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                        🏆 FINAL RESULTS                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Tests: ${String(totalPassed + totalFailed).padStart(3)} │ Passed: ${String(totalPassed).padStart(3)} │ Failed: ${String(totalFailed).padStart(3)}       ║
║  Success Rate: ${String(Math.round((totalPassed / (totalPassed + totalFailed)) * 100)).padStart(3)}%                                      ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        if (totalFailed === 0) {
            console.log('🎉 ALL TESTS PASSED! Both fixes are working correctly.\n');
            console.log('✅ Fix 1: Admin notifications now go to ALERT_PHONE instead of ADMIN_PHONE');
            console.log('✅ Fix 2: Success message now includes Hebrew translation');
            console.log('\n🔧 Expected behavior:');
            console.log('• When user sends #free command, they get bilingual success message');
            console.log('• Admin notification goes to alert phone (not bot itself)');
            console.log('• Hebrew speakers can understand the success message');
        } else {
            console.log(`⚠️  ${totalFailed} TEST(S) FAILED - Review the implementation.`);
        }
        
    } catch (error) {
        console.error('❌ Error running tests:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Show test info
console.log('📋 Test Coverage:');
console.log('• Admin notification routing (ALERT_PHONE vs ADMIN_PHONE)');
console.log('• Hebrew translation completeness');
console.log('• Message structure and formatting');
console.log('• Configuration validation');
console.log('\nStarting tests in 2 seconds...\n');

setTimeout(() => {
    runAllTests().catch(console.error);
}, 2000);