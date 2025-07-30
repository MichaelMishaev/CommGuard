// QA Test for Bot Admin Detection
const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { getTimestamp } = require('../utils/logger');
const { isBotAdmin, getBotGroupStatus, debugBotId } = require('../utils/botAdminChecker');
const config = require('../config');

// Test results storage
const testResults = {
    passed: 0,
    failed: 0,
    details: []
};

// Log test result
function logTest(testName, passed, details) {
    if (passed) {
        testResults.passed++;
        console.log(`✅ ${testName}: PASSED`);
    } else {
        testResults.failed++;
        console.log(`❌ ${testName}: FAILED`);
    }
    testResults.details.push({ testName, passed, details, timestamp: getTimestamp() });
    if (details) console.log(`   Details: ${details}`);
}

async function runBotAdminQA() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  Bot Admin Detection QA Test                 ║
╚══════════════════════════════════════════════════════════════╝

${getTimestamp()} - QA Test Started
`);

    try {
        // Initialize connection
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
        });
        
        // Save credentials
        sock.ev.on('creds.update', saveCreds);
        
        // Wait for connection
        await new Promise((resolve, reject) => {
            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    reject(new Error('Connection closed'));
                } else if (connection === 'open') {
                    resolve();
                }
            });
            
            // Timeout after 30 seconds
            setTimeout(() => reject(new Error('Connection timeout')), 30000);
        });
        
        console.log(`\n✅ Bot connected successfully!`);
        console.log(`Bot ID: ${sock.user.id}`);
        console.log(`Bot Name: ${sock.user.name}\n`);
        
        // Test 1: Debug Bot ID formats
        console.log('📝 Test 1: Bot ID Format Detection');
        const botIdInfo = debugBotId(sock);
        logTest('Bot ID Detection', !!botIdInfo.fullId, `Bot ID: ${botIdInfo.fullId}`);
        
        // Test 2: Get all groups
        console.log('\n📝 Test 2: Fetching Groups');
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        logTest('Group Fetch', groupIds.length > 0, `Found ${groupIds.length} groups`);
        
        if (groupIds.length === 0) {
            console.log('⚠️ No groups found. Bot needs to be in at least one group.');
            await sock.end();
            return;
        }
        
        // Test 3: Check admin status in each group
        console.log('\n📝 Test 3: Admin Status Check in Each Group');
        let adminCount = 0;
        let nonAdminCount = 0;
        
        for (const groupId of groupIds.slice(0, 5)) { // Test first 5 groups
            const groupMetadata = groups[groupId];
            console.log(`\n🔍 Checking group: ${groupMetadata.subject}`);
            
            // Test bot admin status
            const isAdmin = await isBotAdmin(sock, groupId);
            if (isAdmin) {
                adminCount++;
                console.log(`   ✅ Bot IS ADMIN in this group`);
            } else {
                nonAdminCount++;
                console.log(`   ❌ Bot is NOT admin in this group`);
            }
            
            // Get detailed status
            const status = await getBotGroupStatus(sock, groupId);
            console.log(`   📊 Detailed status:`, {
                adminStatus: status.adminStatus,
                participantCount: status.participantCount,
                adminCount: status.adminCount
            });
        }
        
        logTest('Admin Detection', true, `Admin in ${adminCount} groups, not admin in ${nonAdminCount} groups`);
        
        // Test 4: Test participant lookup
        console.log('\n📝 Test 4: Participant Lookup Test');
        if (groupIds.length > 0) {
            const testGroupId = groupIds[0];
            const metadata = await sock.groupMetadata(testGroupId);
            const botId = sock.user.id;
            
            // Direct lookup
            const directLookup = metadata.participants.find(p => p.id === botId);
            logTest('Direct Bot Lookup', !!directLookup, directLookup ? `Found with admin: ${directLookup.admin}` : 'Not found');
            
            // Log all participant IDs for debugging
            console.log('\n📋 Sample participant IDs from first group:');
            metadata.participants.slice(0, 3).forEach(p => {
                console.log(`   - ${p.id} (admin: ${p.admin || 'false'})`);
            });
        }
        
        // Test 5: Test invite link permission
        console.log('\n📝 Test 5: Admin Action Capability Test');
        const adminGroups = [];
        for (const groupId of groupIds.slice(0, 3)) {
            const isAdmin = await isBotAdmin(sock, groupId);
            if (isAdmin) {
                adminGroups.push(groupId);
                try {
                    // Try to get invite code (requires admin)
                    const inviteCode = await sock.groupInviteCode(groupId);
                    logTest(`Invite Code Generation - ${groups[groupId].subject}`, true, `Code: ${inviteCode.substring(0, 5)}...`);
                } catch (error) {
                    logTest(`Invite Code Generation - ${groups[groupId].subject}`, false, error.message);
                }
            }
        }
        
        // Summary
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                        Test Summary                          ║
╚══════════════════════════════════════════════════════════════╝

✅ Passed: ${testResults.passed}
❌ Failed: ${testResults.failed}
📊 Total Tests: ${testResults.passed + testResults.failed}

🔍 Key Findings:
- Bot ID: ${sock.user.id}
- Groups checked: ${Math.min(groupIds.length, 5)}
- Admin in: ${adminCount} groups
- Not admin in: ${nonAdminCount} groups

${testResults.failed > 0 ? '⚠️ Some tests failed. Check details above.' : '✅ All tests passed!'}

${getTimestamp()} - QA Test Complete
`);
        
        // Disconnect
        await sock.end();
        
    } catch (error) {
        console.error('❌ QA Test Error:', error);
        logTest('QA Test Execution', false, error.message);
    }
}

// Run the QA test
console.log('Starting Bot Admin QA Test...');
console.log('This will check if bot admin detection is working correctly.\n');

runBotAdminQA().catch(console.error);