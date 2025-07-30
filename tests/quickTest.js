// Quick automated test for basic bot functionality

const config = require('../config');
const { loadBlacklistCache } = require('../services/blacklistService');
const { loadWhitelistCache } = require('../services/whitelistService');
const { loadMutedUsers } = require('../services/muteService');
const CommandHandler = require('../services/commandHandler');

console.log(`
╔════════════════════════════════════════════╗
║       🚀 Quick Bot Functionality Test      ║
╚════════════════════════════════════════════╝
`);

async function runQuickTests() {
    let passed = 0;
    let total = 0;

    console.log('1️⃣ Testing Configuration...');
    total++;
    try {
        console.log(`   📞 Admin Phone: ${config.ADMIN_PHONE}`);
        console.log(`   📞 Alert Phone: ${config.ALERT_PHONE}`);
        console.log(`   ⏰ Kick Cooldown: ${config.KICK_COOLDOWN}ms`);
        console.log(`   🔗 Invite Pattern: ${config.PATTERNS.INVITE_LINK}`);
        console.log('   ✅ Configuration loaded successfully');
        passed++;
    } catch (error) {
        console.log('   ❌ Configuration failed:', error.message);
    }

    console.log('\n2️⃣ Testing Service Loading...');
    total++;
    try {
        await loadBlacklistCache();
        await loadWhitelistCache(); 
        await loadMutedUsers();
        console.log('   ✅ All services loaded successfully');
        passed++;
    } catch (error) {
        console.log('   ❌ Service loading failed:', error.message);
    }

    console.log('\n3️⃣ Testing Command Handler...');
    total++;
    try {
        // Mock socket object
        const mockSock = {
            sendMessage: async () => ({ status: 'success' }),
            user: { id: '972555020829:82@s.whatsapp.net' },
            groupMetadata: async () => ({
                participants: [
                    { id: '972555020829@s.whatsapp.net', admin: 'admin' }
                ]
            })
        };
        
        const commandHandler = new CommandHandler(mockSock);
        console.log('   ✅ Command handler initialized');
        passed++;
    } catch (error) {
        console.log('   ❌ Command handler failed:', error.message);
    }

    console.log('\n4️⃣ Testing Invite Link Detection...');
    total++;
    try {
        const testLinks = [
            'https://chat.whatsapp.com/ABC123',
            'https://whatsapp.com/chat/XYZ789',
            'Join: https://chat.whatsapp.com/TEST123'
        ];
        
        let detected = 0;
        for (const link of testLinks) {
            const matches = link.match(config.PATTERNS.INVITE_LINK);
            if (matches && matches.length > 0) {
                detected++;
            }
        }
        
        if (detected === testLinks.length) {
            console.log(`   ✅ Detected ${detected}/${testLinks.length} invite links`);
            passed++;
        } else {
            console.log(`   ❌ Only detected ${detected}/${testLinks.length} invite links`);
        }
    } catch (error) {
        console.log('   ❌ Invite detection failed:', error.message);
    }

    console.log('\n5️⃣ Testing Phone Number Validation...');
    total++;
    try {
        const validNumbers = ['972555123456', '1234567890', '44123456789'];
        const invalidNumbers = ['123', 'abc123', ''];
        
        let validCount = 0;
        let invalidCount = 0;
        
        for (const num of validNumbers) {
            if (num.match(config.PATTERNS.PHONE_NUMBER)) {
                validCount++;
            }
        }
        
        for (const num of invalidNumbers) {
            if (!num.match(config.PATTERNS.PHONE_NUMBER)) {
                invalidCount++;
            }
        }
        
        if (validCount === validNumbers.length && invalidCount === invalidNumbers.length) {
            console.log('   ✅ Phone validation working correctly');
            passed++;
        } else {
            console.log(`   ❌ Phone validation failed: ${validCount}/${validNumbers.length} valid, ${invalidCount}/${invalidNumbers.length} invalid`);
        }
    } catch (error) {
        console.log('   ❌ Phone validation failed:', error.message);
    }

    console.log('\n6️⃣ Testing Memory Usage...');
    total++;
    try {
        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        console.log(`   💾 Heap Used: ${memMB} MB`);
        console.log(`   💾 RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
        
        if (memMB < 200) {
            console.log('   ✅ Memory usage within acceptable limits');
            passed++;
        } else {
            console.log('   ⚠️ Memory usage high (>200MB)');
        }
    } catch (error) {
        console.log('   ❌ Memory test failed:', error.message);
    }

    // Results
    console.log(`\n╔════════════════════════════════════════════╗`);
    console.log(`║                📊 TEST RESULTS              ║`);
    console.log(`╚════════════════════════════════════════════╝`);
    console.log(`\n🎯 Tests Passed: ${passed}/${total}`);
    console.log(`📊 Success Rate: ${Math.round((passed/total)*100)}%`);
    
    if (passed === total) {
        console.log('\n✅ ALL TESTS PASSED! Bot is ready for live testing.');
        console.log('\n📋 Next Steps:');
        console.log('   1. Start the bot: npm start');
        console.log('   2. Follow LIVE_QA_TESTING.md guide');
        console.log('   3. Test in WhatsApp group environment');
        console.log('   4. Monitor for 24+ hours in production');
    } else {
        console.log('\n❌ Some tests failed. Please review issues before proceeding.');
        console.log('\n🔧 Troubleshooting:');
        console.log('   • Check Firebase configuration');
        console.log('   • Verify all dependencies installed');
        console.log('   • Review error messages above');
    }

    console.log('\n🚀 Quick test completed!\n');
}

// Run the tests
runQuickTests().catch(console.error);