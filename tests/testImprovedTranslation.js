/**
 * Test Improved Auto-Translation Feature
 * Tests strict Hebrew detection and global toggle functionality
 */

const { getTimestamp } = require('../utils/logger');

console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║      🌐 Testing Improved Auto-Translation Feature      ║`);
console.log(`║                                                        ║`);
console.log(`║   Strict detection + Global on/off toggle             ║`);
console.log(`╚════════════════════════════════════════════════════════╝`);
console.log('');

console.log('Running improved auto-translation tests...');
console.log('');
console.log(`[${getTimestamp()}] 🧪 Testing improved translation features`);
console.log('');

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

/**
 * Test strict Hebrew detection logic
 */
function testStrictHebrewDetection() {
    console.log(`1️⃣ Testing strict Hebrew detection...`);
    testsRun++;
    
    try {
        // Import the function from index.js by reading and evaluating it
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        // Extract the isTextAllNonHebrew function
        const functionMatch = indexContent.match(/function isTextAllNonHebrew\(text\) \{[\s\S]*?\n\}/);
        if (!functionMatch) {
            console.log(`   ❌ isTextAllNonHebrew function not found`);
            testsFailed++;
            return;
        }
        
        // Create test function
        eval(functionMatch[0]);
        
        const testCases = [
            // Should translate (ALL non-Hebrew)
            { text: "Hello world", shouldTranslate: true, description: "Pure English" },
            { text: "Bonjour tout le monde", shouldTranslate: true, description: "Pure French" },
            { text: "How are you today?", shouldTranslate: true, description: "English with punctuation" },
            { text: "Good morning everyone!", shouldTranslate: true, description: "English with exclamation" },
            { text: "123 hello world", shouldTranslate: true, description: "Numbers + English" },
            
            // Should NOT translate (contains Hebrew or mixed)
            { text: "שלום עולם", shouldTranslate: false, description: "Pure Hebrew" },
            { text: "Hello שלום", shouldTranslate: false, description: "Mixed Hebrew-English" },
            { text: "שלום world", shouldTranslate: false, description: "Hebrew-English mix" },
            { text: "Good morning ברכות", shouldTranslate: false, description: "English-Hebrew mix" },
            { text: "יום טוב everyone", shouldTranslate: false, description: "Hebrew-English mix" },
            { text: "123 שלום", shouldTranslate: false, description: "Numbers + Hebrew" },
            
            // Edge cases
            { text: "", shouldTranslate: false, description: "Empty string" },
            { text: "   ", shouldTranslate: false, description: "Only spaces" },
            { text: "123", shouldTranslate: false, description: "Only numbers" },
            { text: "!!!", shouldTranslate: false, description: "Only punctuation" },
            { text: "Hi", shouldTranslate: true, description: "Very short English" }
        ];
        
        let passed = 0;
        let failed = 0;
        
        testCases.forEach(test => {
            const result = isTextAllNonHebrew(test.text);
            if (result === test.shouldTranslate) {
                passed++;
                console.log(`   ✅ "${test.text}" → ${result} (${test.description})`);
            } else {
                failed++;
                console.log(`   ❌ "${test.text}" → Expected: ${test.shouldTranslate}, Got: ${result} (${test.description})`);
            }
        });
        
        if (failed === 0) {
            console.log(`   ✅ Strict Hebrew detection working perfectly (${passed}/${testCases.length})`);
            testsPassed++;
        } else {
            console.log(`   ❌ Strict Hebrew detection issues: ${passed}/${testCases.length} passed`);
            testsFailed++;
        }
    } catch (error) {
        console.log(`   ❌ Error testing strict Hebrew detection:`, error.message);
        testsFailed++;
    }
}

/**
 * Test global toggle configuration
 */
function testGlobalToggleConfig() {
    console.log(`2️⃣ Testing global toggle configuration...`);
    testsRun++;
    
    try {
        const config = require('../config');
        
        const hasAutoTranslationFeature = config.FEATURES && typeof config.FEATURES.AUTO_TRANSLATION === 'boolean';
        const defaultValue = config.FEATURES.AUTO_TRANSLATION;
        
        if (hasAutoTranslationFeature) {
            console.log(`   ✅ AUTO_TRANSLATION config found`);
            console.log(`   ✅ Default value: ${defaultValue}`);
            console.log(`   ✅ Type: ${typeof config.FEATURES.AUTO_TRANSLATION}`);
            testsPassed++;
        } else {
            console.log(`   ❌ AUTO_TRANSLATION config missing or wrong type`);
            testsFailed++;
        }
    } catch (error) {
        console.log(`   ❌ Error testing config:`, error.message);
        testsFailed++;
    }
}

/**
 * Test toggle commands integration
 */
function testToggleCommandsIntegration() {
    console.log(`3️⃣ Testing toggle commands integration...`);
    testsRun++;
    
    try {
        const fs = require('fs');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        const hasAutotranslateCase = commandHandlerContent.includes("case '#autotranslate':");
        const hasTranslationCase = commandHandlerContent.includes("case '#translation':");
        const hasToggleHandler = commandHandlerContent.includes('handleTranslationToggle');
        const hasToggleFunction = commandHandlerContent.includes('async handleTranslationToggle(msg, args, isAdmin)');
        const hasOnOffLogic = commandHandlerContent.includes("command === 'on'") && commandHandlerContent.includes("command === 'off'");
        const hasStatusLogic = commandHandlerContent.includes("command === 'status'");
        
        if (hasAutotranslateCase && hasTranslationCase && hasToggleHandler && hasToggleFunction && hasOnOffLogic && hasStatusLogic) {
            console.log(`   ✅ Toggle commands integration complete`);
            console.log(`   - #autotranslate case: ✅`);
            console.log(`   - #translation case: ✅`);
            console.log(`   - Handler function: ✅`);
            console.log(`   - On/Off logic: ✅`);
            console.log(`   - Status logic: ✅`);
            testsPassed++;
        } else {
            console.log(`   ❌ Toggle commands integration incomplete`);
            console.log(`   - #autotranslate case: ${hasAutotranslateCase ? '✅' : '❌'}`);
            console.log(`   - #translation case: ${hasTranslationCase ? '✅' : '❌'}`);
            console.log(`   - Handler function: ${hasToggleFunction ? '✅' : '❌'}`);
            console.log(`   - On/Off logic: ${hasOnOffLogic ? '✅' : '❌'}`);
            console.log(`   - Status logic: ${hasStatusLogic ? '✅' : '❌'}`);
            testsFailed++;
        }
    } catch (error) {
        console.log(`   ❌ Error testing toggle commands:`, error.message);
        testsFailed++;
    }
}

/**
 * Test main logic integration
 */
function testMainLogicIntegration() {
    console.log(`4️⃣ Testing main logic integration...`);
    testsRun++;
    
    try {
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        const hasConfigCheck = indexContent.includes('config.FEATURES.AUTO_TRANSLATION &&');
        const hasStrictDetection = indexContent.includes('isTextAllNonHebrew(quotedText)');
        const hasHelperFunction = indexContent.includes('function isTextAllNonHebrew(text)');
        const hasWordSplitting = indexContent.includes('text.trim().split(/\\s+/)');
        const hasHebrewRegex = indexContent.includes('[\\u0590-\\u05FF]');
        
        if (hasConfigCheck && hasStrictDetection && hasHelperFunction && hasWordSplitting && hasHebrewRegex) {
            console.log(`   ✅ Main logic integration complete`);
            console.log(`   - Config check: ✅`);
            console.log(`   - Strict detection: ✅`);
            console.log(`   - Helper function: ✅`);
            console.log(`   - Word splitting: ✅`);
            console.log(`   - Hebrew regex: ✅`);
            testsPassed++;
        } else {
            console.log(`   ❌ Main logic integration incomplete`);
            console.log(`   - Config check: ${hasConfigCheck ? '✅' : '❌'}`);
            console.log(`   - Strict detection: ${hasStrictDetection ? '✅' : '❌'}`);
            console.log(`   - Helper function: ${hasHelperFunction ? '✅' : '❌'}`);
            console.log(`   - Word splitting: ${hasWordSplitting ? '✅' : '❌'}`);
            console.log(`   - Hebrew regex: ${hasHebrewRegex ? '✅' : '❌'}`);
            testsFailed++;
        }
    } catch (error) {
        console.log(`   ❌ Error testing main logic:`, error.message);
        testsFailed++;
    }
}

/**
 * Test help text updates
 */
function testHelpTextUpdates() {
    console.log(`5️⃣ Testing help text updates...`);
    testsRun++;
    
    try {
        const fs = require('fs');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        const hasAutotranslateHelp = commandHandlerContent.includes('#autotranslate <on/off/status>');
        const hasGlobalToggleExample = commandHandlerContent.includes('#autotranslate off');
        const hasControlExample = commandHandlerContent.includes('Control auto-translate');
        
        if (hasAutotranslateHelp && hasGlobalToggleExample && hasControlExample) {
            console.log(`   ✅ Help text updates complete`);
            console.log(`   - Command help: ✅`);
            console.log(`   - Global toggle example: ✅`);
            console.log(`   - Control example: ✅`);
            testsPassed++;
        } else {
            console.log(`   ❌ Help text updates incomplete`);
            console.log(`   - Command help: ${hasAutotranslateHelp ? '✅' : '❌'}`);
            console.log(`   - Global toggle example: ${hasGlobalToggleExample ? '✅' : '❌'}`);
            console.log(`   - Control example: ${hasControlExample ? '✅' : '❌'}`);
            testsFailed++;
        }
    } catch (error) {
        console.log(`   ❌ Error testing help text:`, error.message);
        testsFailed++;
    }
}

// Run all tests
async function runAllTests() {
    testStrictHebrewDetection();
    testGlobalToggleConfig();
    testToggleCommandsIntegration();
    testMainLogicIntegration();
    testHelpTextUpdates();
    
    console.log('');
    console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('');
    
    if (testsFailed === 0) {
        console.log(`╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║                    ✅ ALL TESTS PASSED                        ║`);
        console.log(`╠═══════════════════════════════════════════════════════════════╣`);
        console.log(`║  Improved Auto-Translation Feature COMPLETE                  ║`);
        console.log(`║                                                               ║`);
        console.log(`║  🌐 Enhanced Features:                                        ║`);
        console.log(`║  • Strict Hebrew detection (ALL words must be non-Hebrew)   ║`);
        console.log(`║  • Global on/off toggle for entire bot                      ║`);
        console.log(`║  • Admin commands: #autotranslate on/off/status             ║`);
        console.log(`║  • Mixed Hebrew/non-Hebrew messages ignored                  ║`);
        console.log(`║  • Smart word-level analysis with punctuation handling      ║`);
        console.log(`║  • Configuration-based feature toggle                       ║`);
        console.log(`║  • Enhanced help documentation                              ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝`);
        console.log('');        
        console.log(`📋 *Detection Logic:*`);
        console.log(`✅ "Hello everyone" → Will translate (pure English)`);
        console.log(`✅ "Bonjour tout le monde" → Will translate (pure French)`);
        console.log(`❌ "Hello שלום" → Will NOT translate (mixed languages)`);
        console.log(`❌ "Good morning ברכות" → Will NOT translate (mixed languages)`);
        console.log('');
        console.log(`⚙️ *Admin Commands:*`);
        console.log(`• #autotranslate on → Enable for entire bot`);
        console.log(`• #autotranslate off → Disable for entire bot`);
        console.log(`• #autotranslate status → Check current status`);
        
    } else {
        console.log(`╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║                    ❌ SOME TESTS FAILED                       ║`);
        console.log(`╠═══════════════════════════════════════════════════════════════╣`);
        console.log(`║  Please review the failed tests above                        ║`);
        console.log(`║  Tests passed: ${testsPassed}/${testsRun}                                             ║`);
        console.log(`║  Tests failed: ${testsFailed}                                             ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝`);
    }
}

runAllTests().catch(console.error);