---
name: bot-testing-workflow
description: Comprehensive testing workflow for bCommGuard WhatsApp bot
tags: [testing, qa, verification, test-suite]
---

# Bot Testing Workflow Skill

This skill guides you through testing bCommGuard systematically before deployment.

## Test Suite Organization

### Quick Tests (< 1 minute)
```bash
node tests/quickTest.js              # Fast sanity check
node tests/testInviteDetection.js    # Regex pattern validation
```

### Comprehensive Tests (2-5 minutes)
```bash
npm test                             # Main test suite
node tests/comprehensiveQA.js        # Full QA workflow
node tests/fullBotQA.js             # Complete bot functionality
```

### Specialized Tests
```bash
# Command testing
node tests/testCommands.js
node tests/testPrivateCommands.js
node tests/testKickCommand.js

# Feature testing
node tests/testMuteFunctionality.js
node tests/testAlertService.js
node tests/testTranslationFeature.js
node tests/testJokeSystem.js

# Performance testing
node tests/stressTest.js
node tests/performanceTest.js
node tests/testMemoryMonitoring.js

# Integration testing
node tests/testMcpSearch.js
node tests/testSessionErrorHandling.js
```

## Standard Testing Workflow

### 1. Pre-Test Preparation
```bash
# Ensure dependencies are installed
npm install

# Check git status
git status

# Verify no uncommitted critical changes
git diff
```

### 2. Run Quick Validation
```bash
# Test invite link detection patterns
node tests/testInviteDetection.js

# Expected: All regex patterns should match correctly
```

### 3. Run Command Tests
```bash
# Test all bot commands
node tests/testCommands.js

# Verify private commands
node tests/testPrivateCommands.js
```

### 4. Run Feature Tests
```bash
# Test critical features
node tests/testMuteFunctionality.js
node tests/testAlertService.js
node tests/testKickCommand.js
```

### 5. Run Comprehensive QA
```bash
# Full system test
node tests/comprehensiveQA.js

# This tests:
# - All commands (admin & user)
# - Link detection & blacklisting
# - Country code restrictions
# - Mute functionality
# - Firebase integration
# - Error handling
```

### 6. Performance Validation
```bash
# Test under load
node tests/stressTest.js

# Expected metrics:
# - Message processing: < 0.1ms per message
# - Memory usage: < 400MB
# - No memory leaks over 10,000 messages
```

## Test Result Interpretation

### Success Indicators
- ✅ All tests pass without errors
- ✅ No unhandled promise rejections
- ✅ Memory usage stable
- ✅ All regex patterns match correctly
- ✅ Commands respond as expected

### Failure Indicators
- ❌ Test throws uncaught exceptions
- ❌ Memory usage grows continuously
- ❌ Commands fail to execute
- ❌ Regex patterns don't match
- ❌ Firebase connection errors (if enabled)

## Testing Known Issues

### Issue: #mute Command
- **Status**: Not working properly
- **Test**: `node tests/testMuteFunctionality.js`
- **Expected**: Currently fails - requires bot admin status fixes

### Issue: #clear Command
- **Status**: Does not delete messages
- **Test**: `node tests/debugMuteIssue.js`
- **Expected**: Currently fails - needs deep debugging

### Issue: Link Sharing Flow
- **Status**: Missing PHONE_ALERT with unblacklist option
- **Test**: `node tests/testInviteDetection.js`
- **Enhancement**: Should allow accidental blacklist removal

## Debug Testing

When a specific feature fails:

```bash
# Debug kick functionality
node tests/debugKick.js

# Debug Israeli number kicks
node tests/debugIsraeliKicks.js

# Debug bot admin status
node tests/qaTestBotAdmin.js

# Debug mute issues
node tests/debugMuteIssue.js
```

## Integration Testing

### Firebase Integration
```bash
# Test Firebase connection
node setupFirebase.js

# Test blacklist operations
node tests/testBlacklistDemo.js

# Test unblacklist requests
node tests/testUnblacklistCommand.js
```

### MCP Integration
```bash
# Test MCP search
node tests/testMcpSearch.js

# Expected: Web search functionality works
```

## Performance Benchmarks

### Expected Performance
- **Message Processing**: < 0.1ms per message
- **Memory Usage**: 50-100MB typical, max 400MB
- **Throughput**: 10,000+ messages/second
- **Link Detection**: Instant (< 1ms)
- **User Kick**: < 100ms

### Running Benchmarks
```bash
# Stress test
node tests/stressTest.js

# Performance test
node tests/performanceTest.js

# Memory monitoring
node tests/testMemoryMonitoring.js
```

## Test-Driven Development Pattern

When adding new features:

1. **Write test first**:
   ```bash
   # Create test file
   touch tests/testNewFeature.js
   ```

2. **Implement feature**:
   - Add code to appropriate service
   - Follow existing patterns

3. **Run test**:
   ```bash
   node tests/testNewFeature.js
   ```

4. **Run full test suite**:
   ```bash
   npm test
   node tests/comprehensiveQA.js
   ```

## CI/CD Testing (Future)

Recommended GitHub Actions workflow:

```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm test
      - run: node tests/comprehensiveQA.js
```

## Pre-Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally
- [ ] No console errors or warnings
- [ ] Memory usage < 400MB
- [ ] Performance benchmarks met
- [ ] Known issues documented
- [ ] Git committed and pushed
- [ ] Reviewed changes in CLAUDE.local.md

## Post-Test Actions

After testing:

1. **Document failures** in CLAUDE.local.md
2. **Create bug reports** with Redis bug tracking
3. **Update test suite** for new features
4. **Run tests again** after fixes

## Testing Philosophy

- **Test early, test often**
- **Never deploy without testing**
- **Automate repetitive tests**
- **Test real-world scenarios**
- **Monitor production behavior**
