# Deployment Instructions - Bullywatch Production Fixes

## Commit: ce4bae5 - CRITICAL FIX: Bullywatch production bugs

### Summary
Fixed three critical production bugs in the bullywatch system:
1. Sentiment Analysis API error (400 - unsupported parameter)
2. Nano Pre-Filter JSON parse error
3. Missing Hebrew slang "לכסח" (to beat up) in threat detection

### Deployment Steps

#### 1. Connect to Production Server
```bash
ssh root@209.38.231.184
```

#### 2. Navigate to Bot Directory
```bash
cd /root/CommGuard/
```

#### 3. Pull Latest Changes
```bash
git pull origin main
```

#### 4. Verify Changes
```bash
# Check commit message
git log -1 --pretty=format:"%h - %s%n%b"

# Verify files changed
git show --name-only
```

Expected files:
- `services/sentimentAnalysisService.js`
- `services/bullywatch/nanoPreFilterService.js`
- `services/bullywatch/lexiconService.js`
- `tests/testBullywatchFixes.js`

#### 5. Run Tests (Optional but Recommended)
```bash
node tests/testBullywatchFixes.js
```

Expected output:
```
████████████████████████████████████████████████████████████
BULLYWATCH PRODUCTION FIXES - TEST SUITE
████████████████████████████████████████████████████████████

...

Total: 8/8 tests passed
```

#### 6. Restart Bot with PM2
```bash
pm2 restart commguard
```

#### 7. Monitor Logs (Critical - Watch for Errors)
```bash
pm2 logs commguard --lines 50
```

**What to watch for:**
- ✅ No "Unsupported parameter: 'response_format'" errors
- ✅ No "Unexpected end of JSON input" errors in nanoPreFilterService
- ✅ Messages with "לכסח" now triggering high alerts (score 18+)

#### 8. Test Live Detection (If Possible)
Send test messages to a #bullywatch-enabled group:
```
Test 1: "אני הולך לכסח אותך מחר!"
Expected: High alert (score 18+), category: direct_threat

Test 2: "חתיכת חרה"
Expected: High alert (score 16+), category: sexual_harassment
```

#### 9. Verify System Status
```bash
# Check bot status
pm2 status

# Check memory usage (should be under 400MB)
free -h

# Check disk space
df -h
```

### Rollback Instructions (If Needed)

If issues occur after deployment:

```bash
# Stop the bot
pm2 stop commguard

# Rollback to previous commit
git reset --hard 549a7e5

# Restart bot
pm2 restart commguard

# Verify rollback
git log -1 --oneline
```

### Expected Behavior After Deployment

#### Fix 1: Sentiment Analysis API
- **Before**: 400 error "Unsupported parameter: 'response_format'"
- **After**: Successful GPT-5 API calls with JSON responses
- **Monitor**: Logs should show "✅ Successfully parsed GPT response"

#### Fix 2: Nano Pre-Filter JSON Parsing
- **Before**: "Unexpected end of JSON input" crash
- **After**: Graceful handling of invalid JSON, returns ambiguous verdict
- **Monitor**: Logs should show "[NANO] JSON parse error:" followed by fallback to ambiguous

#### Fix 3: Lexicon - "לכסח" Detection
- **Before**: "אני הולך לכסח אותך מחר!" → Score 9 (SAFE) ❌
- **After**: "אני הולך לכסח אותך מחר!" → Score 18+ (HIGH ALERT) ✅
- **Monitor**: Logs should show "Matched: לכסח/כסח/מכסח (to beat up)"

### Monitoring Checklist (First 24 Hours)

- [ ] No API errors in pm2 logs
- [ ] No JSON parse crashes
- [ ] "לכסח" threats being detected
- [ ] Memory usage stable (under 400MB)
- [ ] No unexpected restarts
- [ ] Alert accuracy improved (fewer false negatives)

### Support Contacts

If issues arise:
- Check logs: `pm2 logs commguard`
- Check status: `pm2 status`
- Emergency rollback: See rollback instructions above

### Notes

- All changes are backward compatible
- No database migrations required
- No config changes required
- No dependencies added
- No API key changes required

### Success Criteria

✅ Bot running without errors
✅ Sentiment analysis API calls succeeding
✅ Nano pre-filter handling invalid JSON gracefully
✅ "לכסח" and variations detected as high-severity threats
✅ Memory usage stable
✅ No increase in false positives

---

**Deployment Date**: _____________
**Deployed By**: _____________
**Issues Encountered**: _____________
**Resolution**: _____________
