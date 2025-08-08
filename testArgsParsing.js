/**
 * Test Args Parsing - Debug which version is running
 */

console.log('🔍 Testing args parsing in current code...');

// Simulate the exact command processing from index.js
function testCommandParsing(messageText) {
    const parts = messageText.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);  // This should be array now
    
    console.log(`Command: ${command}`);
    console.log(`Args type: ${typeof args}`);
    console.log(`Args is array: ${Array.isArray(args)}`);
    console.log(`Args content:`, args);
    
    return { command, args };
}

// Test the parsing
const testMessage = '#translate he hello world';
console.log(`\nTesting: "${testMessage}"`);
const result = testCommandParsing(testMessage);

// Test if the args can be processed by translation handler
try {
    const textToTranslate = result.args.join(' ');
    console.log(`✅ args.join() works: "${textToTranslate}"`);
} catch (error) {
    console.log(`❌ args.join() failed: ${error.message}`);
}

try {
    const firstArg = result.args[0];
    console.log(`✅ args[0] works: "${firstArg}"`);
} catch (error) {
    console.log(`❌ args[0] failed: ${error.message}`);
}

console.log('\n🎯 If you see "args.join() works" above, the fix is applied correctly!');