# Claude Skills & Subagents for bCommGuard

This document explains how to use the custom Skills and Subagents created for the bCommGuard WhatsApp bot.

## What are Skills and Subagents?

### Skills 📚
**Skills** are reusable knowledge packages that teach Claude how to perform specific tasks. They provide:
- Step-by-step procedures
- Best practices and patterns
- Domain-specific knowledge
- Safety guidelines

Skills are **always available** in the current conversation and provide guidance without creating separate contexts.

### Subagents 🤖
**Subagents** are specialized AI agents that run in separate contexts with their own tools and skills. They are ideal for:
- Self-contained tasks
- Parallel execution
- Context isolation
- Specialized analysis

Subagents return a summary when complete, keeping your main context clean.

## Available Skills

### 1. whatsapp-bot-deployment 🚀
**Purpose**: Production deployment workflow for bCommGuard

**When to use**:
- Deploying code to production VPS
- Restarting the bot on the server
- Rolling back failed deployments
- Verifying deployment success

**Example usage**:
```
"Deploy the latest changes to production following the deployment skill"
"Use the whatsapp-bot-deployment skill to guide me through deploying this fix"
```

**Key features**:
- SSH connection details
- PM2 process management
- Git deployment workflow
- Memory protection verification
- Rollback procedures

---

### 2. bot-testing-workflow 🧪
**Purpose**: Comprehensive testing workflow for bCommGuard

**When to use**:
- Running test suites before deployment
- Validating new features
- Debugging failing tests
- Performance benchmarking

**Example usage**:
```
"Run the comprehensive test suite using the bot-testing-workflow"
"Test the new mute feature following the testing workflow skill"
```

**Key features**:
- Test suite organization
- Quick vs comprehensive tests
- Performance benchmarks
- Known issues tracking
- Test-driven development patterns

---

### 3. redis-bug-tracking 🐛
**Purpose**: Bug tracking system using Redis with # prefix

**When to use**:
- Finding pending bugs reported by users
- Marking bugs as fixed after implementation
- Generating bug fix reports
- Tracking bug history

**Example usage**:
```
"Find all pending bugs using the redis-bug-tracking skill"
"Mark bug #1 as fixed following the redis workflow"
"Show me the bug tracking report"
```

**Key features**:
- Find pending bugs (status: "pending")
- Mark bugs as fixed with commit hash
- Never work on fixed bugs
- Bug categorization and prioritization

---

### 4. firebase-data-management 🔥
**Purpose**: Firebase Firestore operations for user data

**When to use**:
- Managing blacklist/whitelist
- Querying user data
- Mute operations
- Data migration/export

**Example usage**:
```
"Add user to blacklist using firebase-data-management"
"Show me all whitelisted users following the Firebase skill"
```

**Key features**:
- Blacklist/whitelist operations
- Mute user management
- Service layer APIs
- Safety rules (never delete prod data)

---

### 5. bot-command-development 💻
**Purpose**: Patterns for adding new bot commands

**When to use**:
- Creating new # commands
- Following established patterns
- Understanding command flow
- Implementing best practices

**Example usage**:
```
"Add a new #stats command following bot-command-development"
"Show me how to create a group command using the development skill"
```

**Key features**:
- Command architecture
- Reply-based, timed, list patterns
- Admin verification
- Input validation
- Error handling

---

### 6. security-review 🛡️
**Purpose**: Security audit checklist and OWASP best practices

**When to use**:
- Security audits before deployment
- Reviewing code for vulnerabilities
- Implementing security features
- Responding to security incidents

**Example usage**:
```
"Perform a security review using the security-review skill"
"Check this code for injection vulnerabilities"
```

**Key features**:
- OWASP Top 10 checklist
- Input validation patterns
- Authentication/authorization
- Security testing procedures

---

## Agent Overview Matrix

| Agent | Model | Speed | Cost | Primary Use Case |
|-------|-------|-------|------|------------------|
| 🧠 brainstorm | Sonnet | Medium | $$ | Ideation, architecture planning, decision support |
| 🚀 deploy | Sonnet | Medium | $$ | Production deployment, SSH, PM2, server mgmt |
| 🧪 qa-tester | Haiku | Fast | $ | Test execution, QA reports, validation |
| 👁️ code-reviewer | Sonnet | Medium | $$ | Code review, security, best practices |
| 🐛 bug-hunter | Sonnet | Medium | $$ | Debugging, root cause analysis, fixes |
| 📚 docs-generator | Sonnet | Medium | $$ | Documentation, API specs, guides |
| 🔌 api-designer | Sonnet | Medium | $$ | API design, OpenAPI specs, endpoints |
| 📊 log-analyzer | Haiku | Fast | $ | Log analysis, error patterns, monitoring |
| ⚡ performance-monitor | Sonnet | Medium | $$ | Performance metrics, memory, optimization |
| 🔒 security-auditor | Sonnet | Slow | $$$ | Security scans, OWASP, vulnerability testing |
| 🗄️ database-inspector | Haiku | Fast | $ | Database queries, data analysis, reports |
| 🎯 test-orchestrator | Haiku | Fast | $ | Test suite execution, parallel testing |

**Cost Legend**: $ = Cheap (Haiku), $$ = Moderate (Sonnet), $$$ = Expensive (Opus)

---

## Available Subagents

### 🧠 brainstorm - Creative Ideation & Planning
**Model**: Sonnet (creative thinking)

**Purpose**: Generate feature ideas, design architectures, evaluate alternatives, make technical decisions

**When to use**:
- Planning new features or major changes
- Evaluating multiple implementation approaches
- Architectural design decisions
- Risk analysis before implementation
- Generating creative solutions to problems

**How to invoke**:
```
"Launch brainstorm to design the architecture for user authentication"
"Use brainstorm subagent to evaluate options for implementing caching"
"Run brainstorm to help me decide between Redis and Memcached"
```

**What it returns**:
- Problem statement (rephrased clearly)
- 3-5 alternative solutions with pros/cons
- Effort and risk estimates (Low/Medium/High)
- Recommended approach with reasoning
- Concrete next steps

**Tools**: Read, Grep, Glob, WebSearch, WebFetch
**Skills**: bot-command-development, firebase-data-management, redis-bug-tracking

---

### 🚀 deploy - Deployment Automation Specialist
**Model**: Sonnet (deployment expertise)

**Purpose**: Handle production deployments, SSH connections, PM2 management, server monitoring

**When to use**:
- Deploying code to production (209.38.231.184)
- Restarting the bot service
- Rolling back failed deployments
- Server health checks
- Memory protection verification

**How to invoke**:
```
"Launch deploy to push the latest changes to production"
"Use deploy subagent to restart the bot on the server"
"Run deploy to verify memory protection is working"
```

**What it returns**:
- Pre-deployment health check results
- Deployment steps executed
- Post-deployment validation
- PM2 status and logs
- Rollback instructions (if needed)

**Tools**: Bash, Read, Grep, Glob, Edit
**Skills**: whatsapp-bot-deployment

**Critical context**: 960MB VPS, 400MB restart threshold, triple-layer memory protection

---

### 🧪 qa-tester - Quality Assurance Specialist
**Model**: Haiku (fast test execution)

**Purpose**: Execute test suites, generate test reports, validate functionality, perform regression testing

**When to use**:
- Running comprehensive test suites before deployment
- Validating bug fixes with tests
- Performance benchmarking (<0.1ms target)
- Regression testing after code changes
- Generating test coverage reports

**How to invoke**:
```
"Launch qa-tester to run the full test suite"
"Use qa-tester to validate the mute command fix"
"Run qa-tester to benchmark message processing performance"
```

**What it returns**:
- Test summary (pass/fail/skipped counts)
- Results by category (unit, integration, performance)
- Performance metrics vs targets
- Known issues status
- Specific failure details with reproduction steps
- Recommendations for fixes

**Tools**: Bash, Read, Grep, Glob
**Skills**: bot-testing-workflow

**Performance targets**: <0.1ms per message, 10,000+ msg/sec, <400MB memory

---

### 👁️ code-reviewer - Expert Code Reviewer
**Model**: Sonnet (thorough analysis)

**Purpose**: Review code quality, security vulnerabilities, performance issues, best practices, maintainability

**When to use**:
- Before merging pull requests
- After implementing new features
- Reviewing security-sensitive code
- Checking for performance regressions
- Learning best practices from feedback

**How to invoke**:
```
"Launch code-reviewer to review the new authentication code"
"Use code-reviewer to check this PR for security issues"
"Run code-reviewer on services/commandHandler.js"
```

**What it returns**:
- Overall assessment (Approve / Approve with Changes / Request Changes)
- Critical issues 🔴 (must fix)
- Warnings 🟡 (should fix)
- Suggestions 🔵 (nice to have)
- Positive highlights ✨
- Performance impact analysis
- Security checklist results
- Testing recommendations

**Review criteria**: Code quality (40%), Security (30%), Performance (20%), Testing (10%)

**Tools**: Read, Grep, Glob, Edit
**Skills**: security-review, bot-command-development

---

### 🐛 bug-hunter - Expert Bug Detective
**Model**: Sonnet (deep debugging)

**Purpose**: Investigate bugs, analyze stack traces, trace execution flows, identify root causes, provide targeted fixes

**When to use**:
- Debugging complex issues
- Investigating production crashes
- Tracing intermittent bugs
- Analyzing error patterns
- Finding root causes of failures

**How to invoke**:
```
"Launch bug-hunter to investigate the #mute command failure"
"Use bug-hunter to debug why messages aren't being deleted"
"Run bug-hunter to analyze the Error 515 pattern in logs"
```

**What it returns**:
- Bug reproduction steps
- Root cause analysis (file:line)
- Fix implementation (before/after code)
- Testing validation
- Prevention recommendations
- Redis bug tracking update (if applicable)

**Debugging methodology**: Reproduce → Isolate → Analyze → Fix → Verify

**Tools**: Read, Grep, Glob, Bash, Edit
**Skills**: redis-bug-tracking, bot-testing-workflow

**Known issues**: #mute command, #clear command, link sharing alert flow

---

### 📚 docs-generator - Documentation Specialist
**Model**: Sonnet (comprehensive writing)

**Purpose**: Generate technical documentation, API references, architecture diagrams, setup guides, user manuals

**When to use**:
- Documenting new features
- Creating API specifications
- Writing setup/deployment guides
- Generating command references
- Architecture documentation
- Updating existing docs after code changes

**How to invoke**:
```
"Launch docs-generator to create API documentation for the blacklist service"
"Use docs-generator to write a user guide for all bot commands"
"Run docs-generator to document the new #bullywatch feature"
```

**What it returns**:
- Structured markdown documentation
- Code examples (tested and working)
- API reference with request/response formats
- Architecture diagrams (Mermaid format)
- Setup/deployment guides
- FAQ and troubleshooting sections
- Changelog entries

**Documentation types**: Code docs, API docs, Architecture, User manuals, Developer guides

**Tools**: Read, Write, Edit, Grep, Glob
**Skills**: bot-command-development

---

### 🔌 api-designer - RESTful API Specialist
**Model**: Sonnet (API expertise)

**Purpose**: Design scalable APIs, define endpoints, create OpenAPI specs, plan data models, ensure best practices

**When to use**:
- Designing new API endpoints
- Creating OpenAPI/Swagger specifications
- Planning webhooks or real-time features
- Reviewing API architecture
- Versioning strategy planning
- Performance optimization for APIs

**How to invoke**:
```
"Launch api-designer to design a REST API for blacklist management"
"Use api-designer to create OpenAPI spec for bot commands"
"Run api-designer to design webhook events for user actions"
```

**What it returns**:
- RESTful endpoint designs
- OpenAPI 3.0 specifications
- Request/response format examples
- Authentication/authorization patterns
- Rate limiting strategies
- Performance optimization recommendations
- Security best practices
- Pagination and filtering designs

**Design principles**: Resource-oriented, proper HTTP methods, appropriate status codes, versioned

**Tools**: Read, Write, Edit, Grep, Glob, WebSearch
**Skills**: security-review

---

### 1. log-analyzer 📊
**Model**: Haiku (fast, cost-effective)

**Purpose**: Analyzes PM2 logs for patterns, errors, and performance

**When to use**:
- Investigating production issues
- Tracking error patterns
- Performance analysis
- Security incident detection

**How to invoke**:
```
"Use the log-analyzer subagent to analyze the last 100 PM2 log lines"
"Launch log-analyzer to find all Error 515 occurrences this week"
```

**What it returns**:
- Error summary with counts
- Performance metrics
- Security events
- Anomalies detected
- Actionable recommendations

---

### 2. performance-monitor ⚡
**Model**: Sonnet (complex analysis)

**Purpose**: Monitors memory, CPU, and message processing performance

**When to use**:
- Before deployment (verify performance)
- After deployment (check for regressions)
- Memory leak detection
- Optimization recommendations

**How to invoke**:
```
"Launch performance-monitor to check current memory usage"
"Use the performance-monitor subagent to analyze stress test results"
```

**What it returns**:
- Current resource usage
- Performance metrics vs targets
- Bottleneck identification
- Memory trend analysis
- Critical alerts (if memory > 350MB)

**Critical context**: Bot runs on 960MB server with 400MB auto-restart threshold

---

### 3. security-auditor 🔒
**Model**: Sonnet (thorough security analysis)

**Purpose**: Security vulnerability scanning and OWASP compliance

**When to use**:
- Before major releases
- After security-related changes
- Monthly security audits
- Penetration testing

**How to invoke**:
```
"Run security-auditor to scan for vulnerabilities"
"Use security-auditor to perform an OWASP Top 10 audit"
```

**What it returns**:
- Vulnerability list with severity
- CVSS scores
- Proof of concept exploits
- Specific remediation code
- Compliance assessment

**Uses**: security-review skill

---

### 4. database-inspector 🗄️
**Model**: Haiku (fast queries)

**Purpose**: PostgreSQL, Redis, and Firebase data exploration

**When to use**:
- Querying user/group statistics
- Analyzing data patterns
- Generating reports
- Data validation

**How to invoke**:
```
"Use database-inspector to show all blacklisted users"
"Launch database-inspector to generate a group statistics report"
```

**What it returns**:
- Query results
- Data analysis
- Statistics reports
- Pattern insights
- Recommendations

**Uses**: firebase-data-management, redis-bug-tracking skills

**Safety**: READ-ONLY by default, never deletes prod data

---

### 5. test-orchestrator 🎯
**Model**: Haiku (fast test execution)

**Purpose**: Runs test suites and generates comprehensive reports

**When to use**:
- Before deployment (full test suite)
- After bug fixes (verify fix)
- Performance benchmarking
- Coverage analysis

**How to invoke**:
```
"Run test-orchestrator to execute the full test suite"
"Use test-orchestrator to run all unit tests in parallel"
```

**What it returns**:
- Test results summary (pass/fail)
- Failed test details
- Performance metrics
- Coverage analysis
- Specific fix recommendations

**Uses**: bot-testing-workflow skill

---

## Usage Examples

### Example 1: Complete Feature Development Workflow

```markdown
**You**: Design and implement a new #stats command for group statistics

**Claude**:
1. 🧠 [Launches brainstorm] Designs feature architecture and data requirements
2. 🗄️ [Launches database-inspector] Analyzes available data and optimal queries
3. 📚 [Launches docs-generator] Creates command specification and API design
4. [Uses bot-command-development skill] Implements command following patterns
5. 👁️ [Launches code-reviewer] Reviews implementation for quality and security
6. 🧪 [Launches qa-tester] Runs comprehensive test suite
7. 🚀 [Launches deploy] Deploys to production with health checks
8. 📚 [Launches docs-generator] Updates user documentation
```

**Result**: Fully implemented, tested, reviewed, and documented feature deployed to production

---

### Example 2: Critical Bug Investigation & Fix

```markdown
**You**: The #mute command isn't working, investigate and fix it

**Claude**:
1. 🐛 [Launches bug-hunter] Analyzes code, logs, and identifies root cause
2. 📊 [Launches log-analyzer] Checks production logs for error patterns
3. 🐛 [Bug-hunter implements fix] Provides targeted code changes
4. 👁️ [Launches code-reviewer] Reviews fix for quality and edge cases
5. 🧪 [Launches qa-tester] Validates fix with comprehensive tests
6. [Uses redis-bug-tracking skill] Marks bug as fixed with commit hash
7. 🚀 [Launches deploy] Deploys fix to production
8. 📊 [Launches log-analyzer] Monitors production for 5 minutes post-deploy
```

**Result**: Bug identified, fixed, tested, deployed, and verified working in production

---

### Example 3: Production Deployment with Full Validation

```markdown
**You**: Deploy the latest changes to production

**Claude**:
1. 🧪 [Launches qa-tester] Runs full test suite locally (all tests pass)
2. ⚡ [Launches performance-monitor] Verifies memory usage and performance metrics
3. 🔒 [Launches security-auditor] Performs security scan (no critical issues)
4. 👁️ [Launches code-reviewer] Final code review of changes
5. 🚀 [Launches deploy] Executes deployment workflow
   - SSH to server (209.38.231.184)
   - Git pull origin main
   - npm install (if needed)
   - pm2 restart commguard
6. 📊 [Launches log-analyzer] Monitors logs for errors (2 min observation)
7. ⚡ [Launches performance-monitor] Validates post-deploy performance
```

**Result**: Safe, validated production deployment with comprehensive monitoring

---

### Example 4: Deploying a Bug Fix

```markdown
**You**: Fix the mute command issue and deploy to production

**Claude**:
1. [Reads code, identifies issue]
2. [Implements fix]
3. [Uses bot-testing-workflow skill] Runs tests
4. [Uses whatsapp-bot-deployment skill] Deploys to production
5. [Uses redis-bug-tracking skill] Marks bug as fixed
```

### Example 2: Security Audit

```markdown
**You**: Perform a full security audit before the release

**Claude**:
1. [Launches security-auditor subagent]
2. [Subagent runs vulnerability scans]
3. [Returns detailed security report]
4. [Shows critical issues requiring immediate fixes]
```

### Example 3: Performance Investigation

```markdown
**You**: The bot seems slow, investigate performance

**Claude**:
1. [Launches performance-monitor subagent]
2. [Checks current memory usage: 320MB]
3. [Analyzes message processing: 2.5ms avg - 25x slower than target]
4. [Identifies bottleneck: inefficient regex pattern]
5. [Recommends specific optimization]
```

### Example 4: Bug Fix Session

```markdown
**You**: Fix all pending # bugs

**Claude**:
1. [Uses redis-bug-tracking skill] Finds 3 pending bugs
2. [Shows bug list]
3. [Asks which to fix first]
4. [Fixes bugs one by one]
5. [Uses bot-testing-workflow] Tests each fix
6. [Uses redis-bug-tracking] Marks as fixed with commit hash
7. [Uses whatsapp-bot-deployment] Deploys fixes
```

### Example 5: Security Audit Before Major Release

```markdown
**You**: Perform a comprehensive security audit before v2.0 release

**Claude**:
1. 🔒 [Launches security-auditor] Full OWASP Top 10 scan
2. 👁️ [Launches code-reviewer] Reviews all code changes since v1.0
3. 🗄️ [Launches database-inspector] Validates data protection and privacy
4. 📚 [Launches docs-generator] Creates security documentation
5. [Generates security report with:
   - Vulnerability list (none critical found)
   - Remediation recommendations
   - Compliance checklist
   - Security best practices confirmation]
```

**Result**: Comprehensive security validation with actionable report

---

### Example 6: API Design for New Integration

```markdown
**You**: Design a REST API for external apps to query blacklist status

**Claude**:
1. 🧠 [Launches brainstorm] Evaluates API design approaches (REST vs GraphQL vs webhooks)
2. 🔌 [Launches api-designer] Creates RESTful API specification
   - Endpoints: GET/POST/DELETE /api/v1/blacklist
   - Authentication: API key in header
   - Rate limiting: 1000 req/hour
   - OpenAPI 3.0 spec generated
3. 🔒 [Launches security-auditor] Reviews API security (auth, input validation, CORS)
4. 📚 [Launches docs-generator] Creates API documentation with examples
5. 👁️ [Launches code-reviewer] Reviews implementation code
6. 🧪 [Launches qa-tester] Tests all endpoints with various scenarios
```

**Result**: Production-ready, secure, well-documented REST API

---

### Example 7: Performance Optimization Investigation

```markdown
**You**: The bot is using too much memory, optimize it

**Claude**:
1. ⚡ [Launches performance-monitor] Analyzes current memory usage (380MB - near 400MB threshold!)
2. 📊 [Launches log-analyzer] Checks for memory leak patterns in logs
3. 🐛 [Launches bug-hunter] Identifies memory leak in event listeners
4. 👁️ [Launches code-reviewer] Reviews fix for proper cleanup patterns
5. 🧪 [Launches qa-tester] Stress tests with 50,000 messages
6. ⚡ [Launches performance-monitor] Validates memory usage (now 95MB avg - 75% improvement!)
7. 🚀 [Launches deploy] Deploys optimization to production
```

**Result**: 75% memory reduction, bot stable well below 400MB threshold

---

### Example 8: Documentation Sprint

```markdown
**You**: Create comprehensive documentation for all bot commands

**Claude**:
1. 📚 [Launches docs-generator] Analyzes all commands in commandHandler.js
2. 🗄️ [Launches database-inspector] Queries command usage statistics
3. 📚 [Docs-generator creates:
   - Complete command reference (30+ commands)
   - Admin vs user command separation
   - Usage examples for each command
   - Error messages and troubleshooting
   - FAQ section
   - Architecture diagrams (Mermaid)
   - Setup guide for new admins]
4. 👁️ [Launches code-reviewer] Reviews docs for accuracy
```

**Result**: Production-ready user and admin documentation

---

### Example 9: Fix All Pending Bugs from Redis

```markdown
**You**: Fix all # bugs reported by users

**Claude**:
1. [Uses redis-bug-tracking skill] Queries Redis for pending bugs
   - Found 5 pending bugs
2. 🐛 [Launches bug-hunter for bug #1] "#bug - show only future events"
3. 👁️ [Launches code-reviewer] Reviews fix
4. 🧪 [Launches qa-tester] Tests fix
5. [Uses redis-bug-tracking] Marks bug #1 as fixed
6. [Repeats steps 2-5 for remaining bugs]
7. 🚀 [Launches deploy] Deploys all fixes together
8. [Uses redis-bug-tracking] Generates bug fix report with commit hashes
```

**Result**: All user-reported bugs fixed, tested, deployed, and tracked

## Combining Skills and Subagents

Skills and Subagents can work together:

### Pattern 1: Subagent Uses Skill
```
Subagent: performance-monitor
Uses skill: whatsapp-bot-deployment

→ Performance monitor uses deployment skill to understand
  production environment constraints
```

### Pattern 2: Skill Guides Subagent Invocation
```
Skill: bot-testing-workflow
Invokes subagent: test-orchestrator

→ Testing workflow skill tells you when to launch
  test-orchestrator for comprehensive testing
```

### Pattern 3: Sequential Subagents
```
1. Launch: log-analyzer
   → Identifies error patterns

2. Launch: database-inspector
   → Queries affected data

3. Use skill: bot-command-development
   → Implements fix following patterns

4. Launch: test-orchestrator
   → Verifies fix with tests
```

## When to Use What?

### Use a **Skill** when:
- ✅ You need procedural guidance
- ✅ Following a standard workflow
- ✅ Learning how to do something
- ✅ Checking best practices
- ✅ Keeping context in main conversation

### Use a **Subagent** when:
- ✅ Task produces verbose output you don't need in main context
- ✅ Task can run independently and return a summary
- ✅ Need specialized analysis (logs, performance, security)
- ✅ Want to parallelize work
- ✅ Need isolated tool access

## Best Practices

### 1. Start with Skills
If unsure, start with a skill. Skills provide guidance without consuming extra context.

### 2. Use Subagents for Analysis
For deep analysis (logs, security, performance), use subagents to keep main context clean.

### 3. Combine for Complex Tasks
Complex tasks often benefit from both:
- Skill for guidance
- Subagent for execution

### 4. Parallel Subagents
Launch multiple subagents in parallel for independent tasks:
```
"Launch log-analyzer and performance-monitor in parallel to check production health"
```

### 5. Reference Skills Explicitly
Mention skills by name to ensure they're used:
```
"Following the whatsapp-bot-deployment skill, deploy this fix"
```

## Tips for Effective Use

1. **Be Specific**: "Use redis-bug-tracking skill" vs "check for bugs"
2. **Name the Agent**: "Launch security-auditor" vs "check security"
3. **Set Context**: "Before deploying, use performance-monitor to verify memory usage"
4. **Expect Summaries**: Subagents return summaries, not full output
5. **Trust the Process**: Skills encode best practices from your codebase

## Quick Reference

### Quick Commands

| Task | Command | Agent Type |
|------|---------|------------|
| Plan architecture | Launch `brainstorm` | 🧠 Subagent |
| Deploy to prod | Launch `deploy` or use `whatsapp-bot-deployment` skill | 🚀 Subagent/Skill |
| Run tests | Launch `qa-tester` or use `bot-testing-workflow` skill | 🧪 Subagent/Skill |
| Review code | Launch `code-reviewer` | 👁️ Subagent |
| Debug issues | Launch `bug-hunter` | 🐛 Subagent |
| Write docs | Launch `docs-generator` | 📚 Subagent |
| Design API | Launch `api-designer` | 🔌 Subagent |
| Find bugs | Use `redis-bug-tracking` skill | 📝 Skill |
| Check security | Launch `security-auditor` | 🔒 Subagent |
| Analyze logs | Launch `log-analyzer` | 📊 Subagent |
| Check performance | Launch `performance-monitor` | ⚡ Subagent |
| Query data | Launch `database-inspector` | 🗄️ Subagent |
| Add command | Use `bot-command-development` skill | 💻 Skill |

### Agent Selection Guide

**When you need to...**

🧠 **Make decisions or plan** → brainstorm
- "Should we use Redis or PostgreSQL for this?"
- "Design the architecture for user authentication"
- "Evaluate pros/cons of implementing caching"

🚀 **Deploy or manage server** → deploy
- "Deploy latest changes to production"
- "Restart the bot on the server"
- "Check server memory and health"

🧪 **Test functionality** → qa-tester
- "Run the full test suite"
- "Validate this bug fix works"
- "Benchmark performance"

👁️ **Review code quality** → code-reviewer
- "Review this PR for security issues"
- "Check if my code follows best practices"
- "Analyze performance impact of changes"

🐛 **Fix bugs or debug** → bug-hunter
- "Why isn't the #mute command working?"
- "Debug the Error 515 pattern"
- "Find root cause of message deletion failure"

📚 **Create documentation** → docs-generator
- "Document all bot commands"
- "Create API reference for blacklist service"
- "Write setup guide for new developers"

🔌 **Design APIs** → api-designer
- "Design REST API for external integrations"
- "Create OpenAPI spec for webhook events"
- "Plan versioning strategy"

📊 **Analyze logs** → log-analyzer
- "Check production logs for errors"
- "Find patterns in crash logs"
- "Analyze last 100 log lines"

⚡ **Check performance** → performance-monitor
- "Is memory usage under 400MB?"
- "How fast are messages being processed?"
- "Find performance bottlenecks"

🔒 **Security audit** → security-auditor
- "Scan for OWASP Top 10 vulnerabilities"
- "Check for SQL injection risks"
- "Perform security audit before release"

🗄️ **Query databases** → database-inspector
- "Show all blacklisted users"
- "Generate group statistics report"
- "Check bug tracking data"

---

## Advanced: Creating Your Own

### Adding a New Skill

1. Create directory: `.claude/skills/my-skill/`
2. Create `SKILL.md` with YAML frontmatter:
```markdown
---
name: my-skill
description: What this skill does
tags: [tag1, tag2]
---

# My Skill

[Your procedural knowledge here]
```

### Adding a New Subagent

1. Create directory: `.claude/agents/my-agent/`
2. Create `agent.json`:
```json
{
  "name": "my-agent",
  "description": "What this agent does",
  "instructions": "You are a specialist in... [detailed instructions]",
  "model": "haiku",
  "tools": ["Read", "Bash"],
  "skills": ["relevant-skill"]
}
```

**Model selection guide**:
- **Haiku**: Fast, cheap, good for search/analysis/testing (log-analyzer, qa-tester, database-inspector, test-orchestrator)
- **Sonnet**: Balanced, best for complex tasks (brainstorm, deploy, code-reviewer, bug-hunter, docs-generator, api-designer, performance-monitor, security-auditor)
- **Opus**: Slow, expensive, only for extremely complex reasoning (rarely needed)

**Tool selection**:
- **Read/Write/Edit**: File operations
- **Grep/Glob**: Code search
- **Bash**: Terminal commands, deployment
- **WebSearch/WebFetch**: External research

### Agent Design Best Practices (from Anthropic)

1. **Single Responsibility**: Each agent should have one clear purpose
2. **Clear Instructions**: Provide detailed guidance in the `instructions` field
3. **Appropriate Model**: Match complexity to model (Haiku for speed, Sonnet for quality)
4. **Minimal Tools**: Only grant tools the agent actually needs
5. **Skill Reuse**: Reference existing skills for domain knowledge
6. **Context Awareness**: Include project-specific constraints (e.g., 960MB server memory)
7. **Output Format**: Define expected output structure
8. **Safety Rules**: Include safety guidelines (no delete prod data, etc.)

### Example: Complete Agent Configuration

```json
{
  "name": "example-agent",
  "description": "🔍 Short emoji description for UI (max 120 chars)",
  "instructions": "You are an expert in [domain].\n\n## Core Responsibilities\n1. [Primary task]\n2. [Secondary task]\n\n## Process\n### Step 1: [First step]\n- [Details]\n\n### Step 2: [Second step]\n- [Details]\n\n## Output Format\nAlways structure responses as:\n```\n[Define expected output structure]\n```\n\n## Context for bCommGuard\n- [Project-specific constraints]\n- [Performance targets]\n- [Safety rules]\n\n## Best Practices\n- ✅ [Do this]\n- ❌ [Avoid this]",
  "model": "sonnet",
  "tools": [
    "Read",
    "Grep",
    "Glob",
    "Bash"
  ],
  "skills": [
    "relevant-skill-1",
    "relevant-skill-2"
  ]
}
```

---

## Parallel Agent Execution

For maximum efficiency, you can launch multiple independent agents in parallel:

```markdown
**You**: Prepare for production deployment

**Claude**: Launching 3 agents in parallel:
1. 🧪 qa-tester → Running test suite
2. 🔒 security-auditor → Security scan
3. ⚡ performance-monitor → Performance validation

[All complete after 90 seconds]
✅ All tests passed
✅ No security issues found
✅ Performance within targets
🚀 Ready to deploy!
```

**When to use parallel agents**:
- ✅ Independent tasks (testing + security + performance)
- ✅ Data gathering from multiple sources
- ✅ Time-sensitive operations
- ❌ Sequential dependencies (deploy must wait for tests)

---

## Cost Optimization Tips

**Agent costs** (per invocation, approximate):

| Agent | Model | Typical Cost | When to Use |
|-------|-------|--------------|-------------|
| 🗄️ database-inspector | Haiku | $0.01 | Frequent data queries |
| 📊 log-analyzer | Haiku | $0.02 | Regular log analysis |
| 🧪 qa-tester | Haiku | $0.03 | Every deployment |
| 🎯 test-orchestrator | Haiku | $0.03 | Test runs |
| ⚡ performance-monitor | Sonnet | $0.10 | Before/after deploys |
| 🧠 brainstorm | Sonnet | $0.12 | Major decisions |
| 👁️ code-reviewer | Sonnet | $0.15 | Every PR |
| 🐛 bug-hunter | Sonnet | $0.15 | Complex bugs |
| 🚀 deploy | Sonnet | $0.10 | Every deployment |
| 📚 docs-generator | Sonnet | $0.20 | New features |
| 🔌 api-designer | Sonnet | $0.18 | API design |
| 🔒 security-auditor | Sonnet | $0.25 | Major releases |

**Cost-saving strategies**:
1. Use Haiku agents (log-analyzer, qa-tester) for frequent operations
2. Use Sonnet agents (code-reviewer, bug-hunter) for quality-critical tasks
3. Launch parallel agents for independent tasks (saves time, same cost)
4. Combine skills + agents (skills are free, agents when needed)

---

## Sources

This implementation is based on Anthropic's official documentation:

- [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK on GitHub](https://github.com/anthropics/claude-agent-sdk-python)
- [Claude Agent SDK npm Package](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Equipping Agents for Real World with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Complete Guide to Building Agents](https://nader.substack.com/p/the-complete-guide-to-building-agents)
- [Claude Agent SDK Tutorial - DataCamp](https://www.datacamp.com/tutorial/how-to-use-claude-agent-sdk)
- [Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)

---

**Created**: 2026-01-12
**Updated**: 2026-01-13 (Added 7 new specialized agents)
**Total Agents**: 12 (5 original + 7 new)
**Total Skills**: 6
**For**: bCommGuard WhatsApp Bot
**By**: Claude Code with Anthropic best practices

---

## Summary

You now have **12 specialized agents** covering the entire development lifecycle:

**Planning & Design** (3 agents):
- 🧠 brainstorm - Ideation and architecture
- 🔌 api-designer - API design and specs
- 📚 docs-generator - Documentation

**Development & Quality** (3 agents):
- 👁️ code-reviewer - Code quality and security
- 🐛 bug-hunter - Debugging and fixes
- 🧪 qa-tester - Testing and validation

**Operations & Monitoring** (3 agents):
- 🚀 deploy - Deployment automation
- 📊 log-analyzer - Log analysis
- ⚡ performance-monitor - Performance metrics

**Infrastructure & Security** (3 agents):
- 🔒 security-auditor - Security scanning
- 🗄️ database-inspector - Data queries
- 🎯 test-orchestrator - Test execution

Use them together for complete workflows, or individually for focused tasks. All follow Anthropic's best practices for agent design and execution.
