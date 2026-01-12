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

## Available Subagents

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

### Example 1: Deploying a Bug Fix

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

### Example 5: Adding a New Feature

```markdown
**You**: Add a #stats command that shows group statistics

**Claude**:
1. [Uses bot-command-development skill] Shows command pattern
2. [Uses database-inspector subagent] Queries available statistics
3. [Implements command following patterns]
4. [Creates test file following bot-testing-workflow]
5. [Runs test-orchestrator to verify]
6. [Ready for deployment]
```

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

| Task | Command |
|------|---------|
| Deploy to prod | Use `whatsapp-bot-deployment` skill |
| Run tests | Use `bot-testing-workflow` skill or launch `test-orchestrator` |
| Find bugs | Use `redis-bug-tracking` skill |
| Check security | Launch `security-auditor` subagent |
| Analyze logs | Launch `log-analyzer` subagent |
| Check performance | Launch `performance-monitor` subagent |
| Query data | Launch `database-inspector` subagent |
| Add command | Use `bot-command-development` skill |

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
  "model": "haiku",
  "tools": ["Read", "Bash"],
  "skills": ["relevant-skill"],
  "prompt": "You are a specialist in..."
}
```

---

## Sources

This implementation is based on Anthropic's official documentation:

- [Agent Skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Create Custom Subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Equipping Agents for Real World with Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)

---

**Created**: 2026-01-12
**For**: bCommGuard WhatsApp Bot
**By**: Claude Code with Anthropic best practices
