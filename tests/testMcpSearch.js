#!/usr/bin/env node

/**
 * Test MCP Search Integration
 * Tests the search service and MCP connectivity
 */

const searchService = require('../services/searchService');
const { getTimestamp } = require('../utils/logger');

async function testSearchService() {
    console.log(`[${getTimestamp()}] 🧪 Testing MCP Search Service\n`);
    
    console.log('1. Testing service initialization...');
    try {
        await searchService.initialize();
        console.log('   ✅ Service initialized');
        console.log(`   Connected: ${searchService.isConnected}`);
    } catch (error) {
        console.log('   ❌ Initialization failed:', error.message);
    }
    
    console.log('\n2. Testing rate limiting...');
    const testUserId = 'test-user-123';
    
    // Test rate limit
    for (let i = 1; i <= 6; i++) {
        const rateLimit = searchService.checkRateLimit(testUserId);
        if (rateLimit.allowed) {
            console.log(`   ✅ Request ${i}: Allowed`);
        } else {
            console.log(`   ❌ Request ${i}: Rate limited (wait ${rateLimit.remainingTime}s)`);
        }
    }
    
    console.log('\n3. Testing search functionality...');
    try {
        const query = 'WhatsApp security best practices';
        console.log(`   Searching for: "${query}"`);
        
        const results = await searchService.search(query);
        console.log(`   ✅ Search completed`);
        console.log(`   Results count: ${results.resultCount}`);
        console.log(`   Items returned: ${results.items.length}`);
        
        // Test formatting
        const formatted = searchService.formatSearchResults(results);
        console.log('\n   Formatted output:');
        console.log('   ' + formatted.split('\n').join('\n   '));
    } catch (error) {
        console.log('   ❌ Search failed:', error.message);
    }
    
    console.log('\n4. Testing link verification...');
    try {
        const testUrl = 'https://chat.whatsapp.com/ABC123';
        console.log(`   Verifying: ${testUrl}`);
        
        const verification = await searchService.verifyLink(testUrl);
        console.log(`   ✅ Verification completed`);
        console.log(`   Safe: ${verification.safe}`);
        console.log(`   Category: ${verification.category}`);
        console.log(`   Threats: ${verification.threats.join(', ') || 'None'}`);
    } catch (error) {
        console.log('   ❌ Verification failed:', error.message);
    }
    
    console.log('\n5. Testing cache functionality...');
    try {
        const query = 'WhatsApp security best practices'; // Same query as before
        console.log(`   Searching again for: "${query}"`);
        
        const startTime = Date.now();
        const results = await searchService.search(query);
        const duration = Date.now() - startTime;
        
        console.log(`   ✅ Search completed in ${duration}ms`);
        console.log(`   ${duration < 10 ? 'Cached' : 'Fresh'} results returned`);
    } catch (error) {
        console.log('   ❌ Cache test failed:', error.message);
    }
    
    console.log('\n6. Testing invite link search...');
    try {
        const groupName = 'Test Group';
        console.log(`   Searching for invite links for: "${groupName}"`);
        
        const results = await searchService.searchForInviteLinks(groupName);
        console.log(`   ✅ Invite link search completed`);
        console.log(`   Results: ${results.resultCount}`);
    } catch (error) {
        console.log('   ❌ Invite link search failed:', error.message);
    }
    
    console.log('\n7. Service statistics:');
    const stats = searchService.getStats();
    console.log(`   Connected: ${stats.connected}`);
    console.log(`   Cached searches: ${stats.cachedSearches}`);
    console.log(`   Rate limited users: ${stats.rateLimitedUsers}`);
    
    console.log(`\n[${getTimestamp()}] ✅ All tests completed!`);
}

// Mock command handler test
async function testCommandIntegration() {
    console.log(`\n[${getTimestamp()}] 🧪 Testing Command Integration\n`);
    
    // Mock message object
    const mockMsg = {
        key: {
            remoteJid: '123456@g.us',
            participant: '972555123456@s.whatsapp.net'
        }
    };
    
    // Mock sock object
    const mockSock = {
        sendMessage: async (jid, content) => {
            console.log(`📤 Message to ${jid}:`);
            console.log(`   ${content.text}`);
            console.log('');
            return { messageTimestamp: Date.now() };
        }
    };
    
    const CommandHandler = require('../services/commandHandler');
    const handler = new CommandHandler(mockSock);
    
    console.log('1. Testing #search command...');
    await handler.handleSearch(mockMsg, ['WhatsApp', 'bot', 'development'], true);
    
    console.log('2. Testing #verify command...');
    await handler.handleVerifyLink(mockMsg, ['https://chat.whatsapp.com/ABC123'], true);
    
    console.log('3. Testing rate limit...');
    for (let i = 0; i < 6; i++) {
        await handler.handleSearch(mockMsg, ['test', 'query'], true);
    }
}

// Run tests
async function runTests() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║       🔍 MCP Search Test Suite        ║');
    console.log('╚══════════════════════════════════════╝\n');
    
    await testSearchService();
    await testCommandIntegration();
    
    console.log('\n📋 Manual Testing Instructions:');
    console.log('1. Start bot with MCP: ./start-with-mcp.sh');
    console.log('2. In admin chat, test: #search WhatsApp security');
    console.log('3. Test link verify: #verify https://example.com');
    console.log('4. Test rate limiting by sending 6+ searches quickly');
    console.log('5. Check that non-admins cannot use search commands');
    
    console.log('\n💡 MCP Setup Requirements:');
    console.log('• Chrome/Chromium must be installed');
    console.log('• MCP CLI tools: npm install -g @modelcontextprotocol/cli');
    console.log('• Puppeteer server: npm install -g @modelcontextprotocol/server-puppeteer');
    console.log('• For Google Search API: Add API key to mcp.json');
    
    process.exit(0);
}

runTests();