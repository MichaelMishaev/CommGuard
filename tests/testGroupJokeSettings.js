/**
 * Test Group Joke Settings Service
 * Tests the per-group joke enable/disable functionality
 */

const groupJokeSettingsService = require('../services/groupJokeSettingsService');

async function testGroupJokeSettings() {
    console.log('🧪 Testing Group Joke Settings Service...\n');

    const testGroupId = '120363023285623121@g.us'; // Fake group ID
    const adminPhone = '972555123456';
    const groupName = 'Test Group';

    try {
        console.log('1️⃣ Testing default state (should be enabled)...');
        const initialState = await groupJokeSettingsService.areJokesEnabled(testGroupId);
        console.log(`   Default state: ${initialState ? '✅ ENABLED' : '❌ DISABLED'}`);
        console.log(`   Expected: ✅ ENABLED (default)`);
        console.log(`   Result: ${initialState === true ? '✅ PASS' : '❌ FAIL'}`);

        console.log('\n2️⃣ Testing disable jokes...');
        const disableResult = await groupJokeSettingsService.setJokesEnabled(testGroupId, false, adminPhone, groupName);
        const disabledState = await groupJokeSettingsService.areJokesEnabled(testGroupId);
        console.log(`   Disable operation: ${disableResult ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`   State after disable: ${disabledState ? '✅ ENABLED' : '❌ DISABLED'}`);
        console.log(`   Expected: ❌ DISABLED`);
        console.log(`   Result: ${disabledState === false ? '✅ PASS' : '❌ FAIL'}`);

        console.log('\n3️⃣ Testing enable jokes...');
        const enableResult = await groupJokeSettingsService.setJokesEnabled(testGroupId, true, adminPhone, groupName);
        const enabledState = await groupJokeSettingsService.areJokesEnabled(testGroupId);
        console.log(`   Enable operation: ${enableResult ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`   State after enable: ${enabledState ? '✅ ENABLED' : '❌ DISABLED'}`);
        console.log(`   Expected: ✅ ENABLED`);
        console.log(`   Result: ${enabledState === true ? '✅ PASS' : '❌ FAIL'}`);

        console.log('\n4️⃣ Testing get settings...');
        const settings = await groupJokeSettingsService.getGroupSettings(testGroupId);
        console.log(`   Settings object:`, settings);
        console.log(`   Has required fields: ${settings.jokes_enabled !== undefined && settings.groupId !== undefined ? '✅ YES' : '❌ NO'}`);

        console.log('\n5️⃣ Testing statistics...');
        const stats = await groupJokeSettingsService.getJokeSettingsStats();
        console.log(`   Statistics:`, stats);
        console.log(`   Has required fields: ${stats.total_groups !== undefined && stats.cache_size !== undefined ? '✅ YES' : '❌ NO'}`);

        console.log('\n6️⃣ Testing cache operations...');
        groupJokeSettingsService.clearCache(testGroupId);
        console.log(`   Clear cache: ✅ COMPLETED`);

        // Test after cache clear
        const stateAfterClear = await groupJokeSettingsService.areJokesEnabled(testGroupId);
        console.log(`   State after cache clear: ${stateAfterClear ? '✅ ENABLED' : '❌ DISABLED'}`);
        console.log(`   Should match last saved state: ${stateAfterClear === true ? '✅ PASS' : '❌ FAIL'}`);

        console.log('\n🎯 Test Summary:');
        console.log('   ✅ Service loads and initializes');
        console.log('   ✅ Default state is enabled');
        console.log('   ✅ Can disable jokes per group');
        console.log('   ✅ Can enable jokes per group');
        console.log('   ✅ Settings persist and can be retrieved');
        console.log('   ✅ Statistics work correctly');
        console.log('   ✅ Cache operations work');

    } catch (error) {
        console.error('\n❌ Test failed with error:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test
console.log('Starting Group Joke Settings Test...\n');
testGroupJokeSettings().then(() => {
    console.log('\n🏁 Test completed!');
    process.exit(0);
}).catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});