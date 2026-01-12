# Sentiment Analysis Deployment Guide

## Pre-Deployment Checklist

- [x] Code review completed
- [x] Critical security fixes applied (prompt injection, Redis paths)
- [x] Input sanitization implemented
- [x] API timeout added (15 seconds)
- [x] JSON parse error handling added
- [x] Test suite created
- [ ] OpenAI API key obtained
- [ ] Production .env updated
- [ ] Files deployed to server
- [ ] Bot restarted
- [ ] Functionality verified

## Step 1: Obtain OpenAI API Key

### Create OpenAI Account

1. Visit https://platform.openai.com/signup
2. Sign up with email/Google
3. Verify email address

### Generate API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Name it: "bCommGuard-Sentiment-Analysis"
4. Copy the key (starts with `sk-proj-...`)
5. **IMPORTANT:** Save it securely - you won't see it again!

### Add Billing

1. Go to https://platform.openai.com/account/billing
2. Add payment method
3. Set up prepaid credits: **$10** (sufficient for 10-30 days)
4. Optional: Set usage limits ($5/month recommended)

## Step 2: Update Production Environment

### SSH to Server

```bash
ssh root@209.38.231.184
cd /root/CommGuard
```

### Backup Current .env

```bash
cp .env .env.backup.$(date +%Y%m%d)
```

### Add OpenAI API Key

```bash
# Edit .env file
nano .env
```

Add this line:
```bash
# OpenAI API Key for sentiment analysis with GPT-5 mini
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

Save and exit (`Ctrl+X`, `Y`, `Enter`)

### Verify .env

```bash
cat .env | grep OPENAI_API_KEY
# Should show: OPENAI_API_KEY=sk-proj-...
```

## Step 3: Deploy Files

### From Local Machine

```bash
# Navigate to local project
cd /Users/michaelmishayev/Desktop/CommGuard/bCommGuard

# Deploy sentiment analysis service
scp services/sentimentAnalysisService.js root@209.38.231.184:/root/CommGuard/services/

# Deploy updated bullying monitoring service
scp services/bullyingMonitoringService.js root@209.38.231.184:/root/CommGuard/services/

# Deploy updated index.js
scp index.js root@209.38.231.184:/root/CommGuard/

# Deploy updated package.json
scp package.json root@209.38.231.184:/root/CommGuard/

# Deploy test file
scp tests/testSentimentAnalysis.js root@209.38.231.184:/root/CommGuard/tests/

# Deploy documentation
scp docs/SENTIMENT_ANALYSIS.md root@209.38.231.184:/root/CommGuard/docs/
scp docs/DEPLOYMENT_SENTIMENT_ANALYSIS.md root@209.38.231.184:/root/CommGuard/docs/
```

### Verify Upload

```bash
ssh root@209.38.231.184 "ls -lh /root/CommGuard/services/sentimentAnalysisService.js"
# Should show file size ~11-12KB
```

## Step 4: Install Dependencies

```bash
ssh root@209.38.231.184

cd /root/CommGuard

# Install OpenAI package
npm install openai@^4.104.0

# Verify installation
npm list openai
# Should show: openai@4.104.0
```

## Step 5: Test Before Restart

### Test OpenAI Connection

```bash
cd /root/CommGuard

# Create quick test
node -e "
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log('✅ OpenAI client initialized successfully');
"
```

Expected output:
```
✅ OpenAI client initialized successfully
```

### Run Full Test Suite (Optional)

```bash
node tests/testSentimentAnalysis.js
```

**WARNING:** This will consume ~$0.012 of budget (5 messages × $0.0024)

Skip if you want to preserve budget.

## Step 6: Restart Bot

### Check Current Status

```bash
pm2 status commguard-bot
```

### Restart

```bash
pm2 restart commguard-bot
```

### Monitor Startup

```bash
pm2 logs commguard-bot --lines 50
```

Expected output:
```
✅ Sentiment analysis service initialized (GPT-5 mini)
🧠 Sentiment Analysis Service initialized
📊 Model: gpt-5-mini
💰 Daily budget: $1.00
💵 Today spent: $0.0000 (0 messages)
```

### Verify No Errors

```bash
pm2 logs commguard-bot --err --lines 20
```

Should NOT see:
- ❌ Failed to initialize sentiment analysis
- ❌ OPENAI_API_KEY not found
- ❌ Redis error

## Step 7: Functional Testing

### Enable Monitoring in Test Group

1. Send to TestGroup via WhatsApp:
   ```
   #bullywatch on
   ```

2. Expected response:
   ```
   ✅ Bullying monitoring enabled for this group
   ```

### Send Test Message

1. In TestGroup, send:
   ```
   אתה אידיוט
   ```
   (Hebrew for "you're an idiot")

2. Check admin phone (0544345287) for alert

### Verify Alert Format

Expected alert should include:

```
🟡 BULLYING ALERT 🟡
📊 Severity: MILD
...
⚠️  Matched words (1): אידיוט

━━━━━━━━━━━━━━━━━━━━━
🧠 AI SENTIMENT ANALYSIS
🟡 Confidence: 85%
📊 Category: direct insult
💭 Analysis: [GPT explanation]
💔 Impact: [emotional impact]
⚡ Recommendation: [action]
💰 Cost: $0.000024 | Budget: $0.999976 left
```

### If Alert Received ✅

**SUCCESS!** Sentiment analysis is working correctly.

### If No GPT Section ❌

Check logs:
```bash
pm2 logs commguard-bot | grep -E "Sentiment|GPT|⚠️"
```

Common issues:
- Invalid API key
- OpenAI API error
- Budget already reached
- Service not initialized

## Step 8: Monitor Performance

### First Hour

```bash
# Watch logs in real-time
pm2 logs commguard-bot --lines 100

# Look for:
# 🧠 Analyzing message with GPT-5 mini...
# ✅ Analysis complete - Cost: $0.000024 | Total: $0.000024
```

### Check Budget Usage

```bash
# SSH to server
ssh root@209.38.231.184

# Check Redis
redis-cli -u $REDIS_URL
> GET sentiment_costs:$(date +%Y-%m-%d)
```

Example output:
```json
{
  "spent": 0.0245,
  "count": 10,
  "alertSent": false,
  "lastUpdated": "2026-01-12T15:30:00.000Z"
}
```

### First Day Metrics

- **Messages analyzed:** Should match detection count
- **Total cost:** Typically $0.05-$0.15
- **Average cost:** ~$0.0024 per message
- **Errors:** Should be 0

## Step 9: Long-Term Monitoring

### Daily Checks

```bash
# SSH and check costs
ssh root@209.38.231.184
redis-cli -u $REDIS_URL GET sentiment_costs:$(date +%Y-%m-%d)
```

### Weekly Review

1. **Cost Analysis**
   - Total weekly spend
   - Messages analyzed
   - Cost per message
   - Budget alerts received

2. **Performance Review**
   - API timeout count
   - JSON parse errors
   - Detection accuracy
   - False positive rate

3. **Capacity Planning**
   - If consistently hitting $1 limit → increase budget
   - If using <$0.20/day → consider analyzing more messages
   - Monitor OpenAI API response times

### Monthly Tasks

1. Review OpenAI billing dashboard
2. Check for pricing changes
3. Update documentation if needed
4. Evaluate detection effectiveness
5. Consider improvements (caching, rate limits)

## Rollback Procedure

### If Issues Occur

1. **Disable sentiment analysis without restart:**
   ```bash
   # Rename API key to disable service
   ssh root@209.38.231.184
   cd /root/CommGuard
   sed -i 's/OPENAI_API_KEY=/OPENAI_API_KEY_DISABLED=/' .env
   pm2 restart commguard-bot
   ```

2. **Restore previous version:**
   ```bash
   # Restore backed up files
   ssh root@209.38.231.184
   cd /root/CommGuard

   # If you created backups before deployment
   cp services/sentimentAnalysisService.js.backup services/sentimentAnalysisService.js
   cp services/bullyingMonitoringService.js.backup services/bullyingMonitoringService.js
   cp index.js.backup index.js

   pm2 restart commguard-bot
   ```

3. **Verify basic detection still works:**
   - Send message with offensive word
   - Should receive alert (without GPT section)

## Cost Optimization Tips

### Reduce Costs

1. **Lower daily budget:**
   ```javascript
   // In sentimentAnalysisService.js
   this.dailyBudget = 0.50; // Reduce to $0.50/day
   ```

2. **Increase threshold:**
   - Only analyze MODERATE and SEVERE detections
   - Skip MILD (single word matches)

3. **Add per-group limits:**
   - Limit to N analyses per hour per group
   - Prevents spam in high-traffic groups

4. **Implement caching:**
   - Cache identical messages (same text)
   - Avoid re-analyzing spam

### Increase Coverage

1. **Raise daily budget:**
   ```javascript
   this.dailyBudget = 2.00; // $2/day
   ```

2. **Analyze all messages (not just matched):**
   - Catches subtle bullying without trigger words
   - Significantly increases cost

## Troubleshooting

### Error: "Failed to initialize Sentiment Analysis"

**Possible Causes:**
- Missing OPENAI_API_KEY in .env
- Invalid API key format
- OpenAI account not set up

**Fix:**
```bash
# Verify .env
cat .env | grep OPENAI_API_KEY

# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Should return JSON with model list
```

### Error: "Daily budget reached" (First Hour)

**Cause:** Previous day's data loaded from Redis

**Fix:**
```bash
# Clear Redis cache
redis-cli -u $REDIS_URL
> DEL sentiment_costs:2026-01-12
> EXIT

# Restart bot
pm2 restart commguard-bot
```

### Error: "OpenAI API timeout after 15 seconds"

**Cause:** OpenAI API slow or unavailable

**Impact:** That specific message won't get GPT analysis

**Fix:** None needed - automatic fallback to word-based detection

### No Errors But No GPT Section in Alerts

**Debugging Steps:**

1. Check if service initialized:
   ```bash
   pm2 logs commguard-bot | grep "Sentiment Analysis Service initialized"
   ```

2. Check if analysis attempted:
   ```bash
   pm2 logs commguard-bot | grep "Analyzing message with GPT"
   ```

3. Check for errors:
   ```bash
   pm2 logs commguard-bot --err | grep -E "Sentiment|GPT"
   ```

4. Verify API key:
   ```bash
   ssh root@209.38.231.184
   echo $OPENAI_API_KEY  # Should start with sk-proj-
   ```

## Security Checklist

- [ ] API key stored in .env (not hardcoded)
- [ ] .env file not committed to git (.gitignore)
- [ ] Input sanitization active
- [ ] 15-second timeout configured
- [ ] Budget cap enforced
- [ ] Redis persistence working
- [ ] Error handling tested
- [ ] No sensitive data logged

## Performance Benchmarks

### Expected Performance

- **Word Detection:** <1ms
- **GPT Analysis:** 1-3 seconds
- **Total Alert:** 1.5-3.5 seconds
- **Memory Usage:** +5-10MB
- **CPU Usage:** Negligible (async)

### Load Testing

For high-traffic groups (100+ messages/hour):

```bash
# Test concurrent analysis (requires budget)
for i in {1..10}; do
  echo "Test $i" &
  node tests/testSentimentAnalysis.js &
done
wait
```

Monitor for:
- Race conditions in budget tracking
- API rate limits
- Memory leaks

## Post-Deployment

### Week 1 Tasks

- [ ] Monitor daily costs
- [ ] Verify alerts working correctly
- [ ] Check for any errors in logs
- [ ] Gather user feedback
- [ ] Adjust budget if needed

### Month 1 Tasks

- [ ] Review total costs
- [ ] Analyze detection accuracy
- [ ] Evaluate false positive rate
- [ ] Consider enhancements
- [ ] Update documentation

## Success Criteria

✅ **Deployment Successful If:**

1. Bot starts without errors
2. Sentiment service initializes correctly
3. Test message triggers GPT analysis
4. Alert includes GPT section with valid analysis
5. Budget tracking works (Redis persistence)
6. No crashes or memory leaks after 24 hours
7. Costs within expected range ($0.05-$0.15/day)

## Support

**Issues During Deployment:**
- Check `/root/CommGuard/docs/SENTIMENT_ANALYSIS.md`
- Review logs: `pm2 logs commguard-bot`
- Contact: 0544345287

**OpenAI API Issues:**
- OpenAI Status: https://status.openai.com/
- API Documentation: https://platform.openai.com/docs
- Support: https://help.openai.com/

---

**Deployment Date:** _______________
**Deployed By:** _______________
**OpenAI API Key ID:** _______________
**Initial Budget:** $1.00/day
**Status:** [ ] Success [ ] Issues [ ] Rolled Back
