# bCommGuard Deployment Checklist

**Purpose:** Prevent integration failures and ensure all deployed code is properly connected and tested.

**MANDATORY:** Complete ALL checkboxes before deploying to production.

---

## Phase 1: Pre-Deployment (Local Development)

### 1.1 Code Completeness
- [ ] All new services are implemented
- [ ] All new functions have been tested
- [ ] All TODOs in code are resolved or documented
- [ ] No `console.log` debug statements left in production code

### 1.2 Integration Verification
- [ ] New services are `require()`'d in appropriate files
- [ ] New services are actually **called** in the message flow
- [ ] Integration points are documented in code comments
- [ ] Verify no "NOT YET INTEGRATED" warnings in docs

### 1.3 Unit & Integration Tests
- [ ] All unit tests pass: `npm test`
- [ ] Integration tests pass: `node tests/testBullywatchIntegration.js`
- [ ] No test failures or warnings
- [ ] Test coverage > 80% for critical paths

### 1.4 Hebrew Pattern Testing (if applicable)
- [ ] All Hebrew patterns tested with `normalizeHebrew()` output
- [ ] Patterns use regular letter forms (כ not ך, מ not ם, etc.)
- [ ] Patterns use `\s*` for optional whitespace
- [ ] Each pattern tested with 5+ variations

### 1.5 Local Smoke Test
- [ ] Start bot locally: `npm start`
- [ ] Send test message to test group
- [ ] Verify new code executes (check console logs)
- [ ] Verify bot responds correctly
- [ ] Verify no errors in console

---

## Phase 2: Git Operations

### 2.1 Commit Message
- [ ] Commit message follows format: `TYPE: Description`
  - Types: `FEATURE`, `FIX`, `SECURITY`, `REFACTOR`, `DOCS`, `TEST`
- [ ] Description is clear and concise
- [ ] Mentions issue number (if applicable)
- [ ] Includes "Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

### 2.2 Code Review
- [ ] Review all changed files in `git diff`
- [ ] No accidental debug code or commented blocks
- [ ] No sensitive data (API keys, passwords)
- [ ] Formatting is consistent

### 2.3 Push to GitHub
- [ ] `git status` shows all changes staged
- [ ] `git push origin main` succeeds
- [ ] Verify commit appears on GitHub

---

## Phase 3: Production Deployment

### 3.1 Server Access
- [ ] Connect to server: `ssh root@209.38.231.184`
- [ ] Navigate to bot directory: `cd /root/CommGuard`
- [ ] Verify current bot status: `pm2 status`

### 3.2 Pull Latest Code
- [ ] Pull from GitHub: `git pull origin main`
- [ ] Verify latest commit: `git log -1`
- [ ] Commit hash matches GitHub

### 3.3 Environment Verification
- [ ] Check environment variables: `cat .env | grep -v PASSWORD`
- [ ] Verify DATABASE_URL is set
- [ ] Verify OPENAI_API_KEY is set (if needed)
- [ ] Verify ADMIN_PHONE is correct

### 3.4 Restart Bot
- [ ] Restart with PM2: `pm2 restart commguard`
- [ ] Wait 10 seconds for initialization
- [ ] Check status: `pm2 status` (should show "online")
- [ ] Check memory usage is normal (<400MB)

---

## Phase 4: Post-Deployment Verification

### 4.1 Log Monitoring
- [ ] View logs: `pm2 logs commguard --lines 100`
- [ ] No errors or warnings in startup
- [ ] Bullywatch initialization message appears (if applicable)
- [ ] All services initialized successfully

### 4.2 Live Testing
- [ ] Send test message to test group (120363377715487594@g.us)
- [ ] Verify bot processes message
- [ ] Check logs for expected behavior
- [ ] If bullywatch: Verify detection score logged

### 4.3 Critical Path Testing (if new features)
- [ ] Test each new feature manually
- [ ] Verify alerts are sent correctly
- [ ] Verify database updates (if applicable)
- [ ] Verify no false positives/negatives

### 4.4 Regression Testing
- [ ] Test existing features still work:
  - [ ] #help command responds
  - [ ] Invite link detection works
  - [ ] Blacklist/whitelist commands work
  - [ ] Mute/unmute works
- [ ] No breaking changes to existing functionality

---

## Phase 5: Monitoring (First 24 Hours)

### 5.1 Continuous Monitoring
- [ ] Check logs every 2 hours for first 6 hours
- [ ] Monitor memory usage: `pm2 monit`
- [ ] Watch for error spikes
- [ ] Review alert messages sent to admin

### 5.2 Database Verification (if applicable)
- [ ] SSH to Railway/database server
- [ ] Check row counts: `SELECT COUNT(*) FROM groups;`
- [ ] Verify new columns exist (if schema changed)
- [ ] Check for orphaned data

### 5.3 User Feedback
- [ ] Monitor admin phone for unusual alerts
- [ ] Check for user complaints in groups
- [ ] Review false positive rate
- [ ] Adjust thresholds if needed

---

## Phase 6: Monitor Mode (For AI/ML Features)

### 6.1 Initial Deployment
- [ ] Monitor mode is ON (`BULLYWATCH_MONITOR_MODE = true`)
- [ ] No auto-deletions enabled
- [ ] Alerts are being logged
- [ ] Data collection working

### 6.2 Data Validation Period (2-4 weeks)
- [ ] Collect at least 100+ flagged messages
- [ ] Review all alerts manually
- [ ] Calculate metrics:
  - [ ] Precision (true positives / (true positives + false positives))
  - [ ] Recall (true positives / (true positives + false negatives))
  - [ ] F1 Score (2 * (precision * recall) / (precision + recall))
- [ ] Target: Precision > 92%, Recall > 88%, F1 > 90%

### 6.3 Tuning Phase
- [ ] Adjust thresholds based on data
- [ ] Update patterns for missed cases
- [ ] Add new patterns for emerging slang
- [ ] Re-test with validation set

### 6.4 Production Enablement
- [ ] Only after validation metrics achieved
- [ ] Gradually enable auto-actions (start with 1 group)
- [ ] Monitor for 1 week before full rollout
- [ ] Keep monitor mode logs for 30 days

---

## Emergency Rollback Procedure

If critical issues found post-deployment:

1. **Immediate Rollback:**
   ```bash
   ssh root@209.38.231.184
   cd /root/CommGuard
   git log --oneline -5  # Find previous commit
   git reset --hard <previous-commit-hash>
   pm2 restart commguard
   ```

2. **Verify Rollback:**
   - Check logs for normal operation
   - Test basic functionality
   - Notify stakeholders

3. **Investigation:**
   - Document what went wrong
   - Update this checklist with new checks
   - Fix issues in development
   - Re-deploy following full checklist

---

## Special Cases

### New Bullywatch Patterns
- [ ] Test with `normalizeHebrew()` output
- [ ] Use regular letter forms (not finals)
- [ ] Include verb variations (infinitive, future, present)
- [ ] Test with real messages from users

### Database Migrations
- [ ] Backup database before migration
- [ ] Test migration on local copy first
- [ ] Have rollback SQL ready
- [ ] Verify data integrity after migration

### API Integration Changes
- [ ] Test API calls with real endpoints
- [ ] Verify rate limiting works
- [ ] Check error handling
- [ ] Monitor API costs

### Security Updates
- [ ] Review OWASP Top 10 checklist
- [ ] Verify no new vulnerabilities
- [ ] Test authentication/authorization
- [ ] Check for exposed secrets

---

## Sign-Off

**Deployment Date:** _______________

**Deployed By:** _______________

**Commit Hash:** _______________

**All Checks Completed:** ☐ YES ☐ NO

**Production Status:** ☐ DEPLOYED ☐ ROLLBACK REQUIRED

**Notes:**
```
[Space for deployment notes, issues found, or special considerations]
```

---

**Version:** 1.0
**Last Updated:** January 12, 2026
**Maintained By:** Development Team
