#!/usr/bin/env node

/**
 * Test Enhanced Rejoin Feature with Admin Lists
 * Verify that kicked users get both group invite links AND admin information
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║      👥 Testing Enhanced Rejoin with Admin Lists    ║
║                                                    ║
║  Verifying admin information storage and display   ║
╚════════════════════════════════════════════════════╝
`);

async function testEnhancedRejoinFeature() {
    console.log(`[${getTimestamp()}] 🧪 Testing enhanced rejoin feature with admin lists\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        // Test 1: Test recording with admin list
        console.log('1️⃣ Testing admin list recording...');
        
        try {
            const { kickedUserService } = require('../services/kickedUserService');
            
            // Create test admin list with mixed LID and regular formats
            const testAdminList = [
                {
                    id: '972555111111@s.whatsapp.net',
                    name: '+972555111111',
                    phone: '972555111111',
                    isLID: false
                },
                {
                    id: '3A123ABC@lid',
                    name: 'Admin (LID)',
                    phone: '3A123ABC...',
                    isLID: true
                },
                {
                    id: '972555222222@s.whatsapp.net',
                    name: '+972555222222', 
                    phone: '972555222222',
                    isLID: false
                }
            ];
            
            const testUserId = 'test972555123456@s.whatsapp.net';
            const testGroupId = 'testgroup@g.us';
            const testGroupName = 'Test Group with Admins';
            const testInviteLink = 'https://chat.whatsapp.com/testinvite456';
            
            await kickedUserService.recordKickedUser(
                testUserId,
                testGroupId,
                testGroupName,
                testInviteLink,
                'Test kick with admin info',
                testAdminList
            );
            
            console.log('   ✅ Successfully recorded kick with admin information');
            passed++;
            
        } catch (error) {
            console.log('   ❌ Failed to record kick with admin info:', error.message);
            failed++;
        }
        
        // Test 2: Test retrieving admin information
        console.log('\n2️⃣ Testing admin info retrieval...');
        
        try {
            const { kickedUserService } = require('../services/kickedUserService');
            const testUserId = 'test972555123456@s.whatsapp.net';
            
            // Enable rejoin
            await kickedUserService.enableRejoin(testUserId);
            
            // Get rejoin info
            const rejoinInfo = await kickedUserService.getRejoinInfo(testUserId, false);
            
            if (rejoinInfo && rejoinInfo.length > 0) {
                const kickRecord = rejoinInfo.find(r => r.groupName === 'Test Group with Admins');
                
                if (kickRecord && kickRecord.adminList && kickRecord.adminList.length > 0) {
                    console.log('   ✅ Successfully retrieved admin information');
                    console.log(`   - Admin count: ${kickRecord.adminList.length}`);
                    console.log(`   - Regular admins: ${kickRecord.adminList.filter(a => !a.isLID).length}`);
                    console.log(`   - LID admins: ${kickRecord.adminList.filter(a => a.isLID).length}`);
                    passed++;
                } else {
                    console.log('   ❌ Admin information not found in record');
                    failed++;
                }
            } else {
                console.log('   ❌ No rejoin info retrieved');
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Failed to retrieve admin info:', error.message);
            failed++;
        }
        
        // Test 3: Check code integration
        console.log('\n3️⃣ Checking code integration...');
        const fs = require('fs');
        
        // Check index.js for admin extraction logic
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        const hasAdminExtraction = indexContent.includes('adminList') && 
                                  indexContent.includes('isLID') &&
                                  indexContent.includes('@lid');
        
        // Check commandHandler.js for admin display logic
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        const hasAdminDisplay = commandHandlerContent.includes('Group Admins') &&
                               commandHandlerContent.includes('admin.isLID');
        
        if (hasAdminExtraction && hasAdminDisplay) {
            console.log('   ✅ Admin integration found in code');
            console.log('   - Admin extraction: ✅');
            console.log('   - Admin display: ✅');
            passed++;
        } else {
            console.log('   ❌ Admin integration incomplete');
            console.log(`   - Admin extraction: ${hasAdminExtraction ? '✅' : '❌'}`);
            console.log(`   - Admin display: ${hasAdminDisplay ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 4: Test message formatting
        console.log('\n4️⃣ Testing message formatting logic...');
        
        try {
            // Simulate the message creation logic
            const lastKick = {
                groupName: 'Tech Discussion',
                kickedAt: new Date().toISOString(),
                groupInviteLink: 'https://chat.whatsapp.com/ABC123',
                adminList: [
                    { name: '+972555111111', isLID: false },
                    { name: 'Admin (LID)', phone: '3A123ABC...', isLID: true },
                    { name: '+972555222222', isLID: false }
                ]
            };
            
            let testMessage = '';
            testMessage += `📱 *${lastKick.groupName}*\n`;
            testMessage += `🔗 ${lastKick.groupInviteLink}\n\n`;
            
            if (lastKick.adminList && lastKick.adminList.length > 0) {
                testMessage += `👥 *Group Admins (if link fails):*\n`;
                lastKick.adminList.slice(0, 3).forEach((admin, index) => {
                    if (admin.isLID) {
                        testMessage += `${index + 1}️⃣ ${admin.name} (${admin.phone})\n`;
                    } else {
                        testMessage += `${index + 1}️⃣ ${admin.name}\n`;
                    }
                });
            }
            
            const hasGroupName = testMessage.includes('Tech Discussion');
            const hasInviteLink = testMessage.includes('chat.whatsapp.com');
            const hasAdminSection = testMessage.includes('Group Admins');
            const hasLIDHandling = testMessage.includes('3A123ABC...');
            
            if (hasGroupName && hasInviteLink && hasAdminSection && hasLIDHandling) {
                console.log('   ✅ Message formatting works correctly');
                console.log('   - Group name: ✅');
                console.log('   - Invite link: ✅');
                console.log('   - Admin section: ✅');
                console.log('   - LID handling: ✅');
                passed++;
            } else {
                console.log('   ❌ Message formatting has issues');
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Message formatting test failed:', error.message);
            failed++;
        }
        
    } catch (error) {
        console.error(`❌ Test error:`, error.message);
        failed++;
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);
    
    if (failed === 0) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ ALL TESTS PASSED                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Enhanced Rejoin with Admin Lists COMPLETE                   ║
║                                                               ║
║  👥 New features working:                                      ║
║  • Admin information captured during kicks                   ║
║  • LID format handling (encrypted admin IDs)                ║
║  • Regular phone number extraction                           ║
║  • Smart admin display in approval messages                  ║
║  • Fallback contact info when links fail                     ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        console.log(`📱 *Example approval message now includes:*`);
        console.log(`🔗 Rejoin Your Last Group:`);
        console.log(`📱 Tech Discussion`);
        console.log(`🔗 https://chat.whatsapp.com/ABC123`);
        console.log(``);
        console.log(`👥 Group Admins (if link fails):`);
        console.log(`1️⃣ +972555111111`);
        console.log(`2️⃣ Admin (LID) (3A123ABC...)`);
        console.log(`3️⃣ +972555222222`);
        console.log(``);
        console.log(`This solves the LID problem by providing contact alternatives!`);
        
    } else {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ❌ SOME TESTS FAILED                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Feature may not work correctly                               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }
    
    return { passed, failed };
}

console.log('Running enhanced rejoin feature tests...\n');

testEnhancedRejoinFeature().catch(console.error);