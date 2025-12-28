---
project: llm_conclave
documentType: product-brief
created: 2025-12-27
status: complete
stepsCompleted:
  - step-01-init
  - step-02-vision
  - step-03-users
  - step-04-metrics
  - step-05-scope
  - step-06-risks
  - step-07-summary
inputDocuments:
  - README.md
  - CLAUDE.md
  - MIGRATION_GUIDE_V2.md
  - CLI_V2_PROGRESS.md
  - docs/PLANNED_FEATURES.md
  - docs/RESUME_FEATURE_DESIGN.md
userInput: "Feature: LLM Conclave as consultable tool for AI CLI applications (Claude Code, Aider, etc.) to get multi-agent perspectives on decisions"
---

# Product Brief: LLM Conclave as Consultable Tool for AI CLI Applications

**Project:** llm_conclave
**Created:** 2025-12-27
**Status:** In Progress
**Brief Type:** Feature Addition

---

## Initial Context

**User Request:** Transform LLM Conclave into a tool that AI CLI applications (like Claude Code, Aider, etc.) can invoke when they need multi-agent perspectives on complex decisions or brainstorming.

**Input Documents Analyzed:**
- README.md (693 lines) - Main project documentation
- CLAUDE.md (750 lines) - Development log and architecture notes
- MIGRATION_GUIDE_V2.md (496 lines) - CLI v2 migration guide
- CLI_V2_PROGRESS.md (469 lines) - Technical implementation details
- docs/PLANNED_FEATURES.md (957 lines) - Feature roadmap
- docs/RESUME_FEATURE_DESIGN.md (1042 lines) - Session persistence design

---


## Executive Summary

**LLM Conclave Consult Mode** transforms LLM Conclave from a standalone multi-agent collaboration tool into a **consultable intelligence service** that can be invoked mid-workflow to get multi-model perspectives on complex decisions.

**Building Philosophy:** This is being built to solve Benlamm's own daily pain - manually orchestrating discussions between Claude, GPT-4, and Gemini while coding. No business model, no market validation needed. Just: "I want this tool for myself."

**The Core Problem:** When working with AI assistants (like Claude Code), complex decisions arise - architectural choices, security trade-offs, design patterns. Single AI models hit reasoning limits. Getting multiple LLM perspectives requires manual copy/paste between tools or orchestrating shared document workflows - breaking flow state and wasting 15-30 minutes per decision.

**The Solution:** A fast (<15 seconds target), structured consultation capability that Claude Code (or the user directly) can invoke: "Consult the Conclave on this question." Multiple LLMs (Claude, GPT-4, Gemini) actually debate the issue, and return structured consensus with reasoning, dissent, and confidence scores.

**Key Insight:** True multi-model collaboration (different LLM architectures actually debating) produces dramatically better outputs than single-model "persona prompting." This has been validated through Benlamm's manual experimentation.

**Success Metric:** Benlamm uses this 5+ times per day and finds the multi-agent insights genuinely change his decisions for the better.

---

## Core Vision

### Problem Statement

**The Manual Multi-AI Orchestration Tax:**

When making complex technical decisions while coding, Benlamm (and developers like him) discover that single AI models hit reasoning limits. They resort to:

- **Copy/paste between tools:** Open Claude Code, ChatGPT, and Gemini in different tabs. Copy the question. Paste to each. Copy responses back. Compare manually.

- **Shared document workflows:** Create a document in the repository. Prompt AI #1 to write their analysis. Save. Prompt AI #2 to read and comment. Save. Prompt AI #3 to synthesize. Round and round, manually coordinating each step.

- **Context management burden:** Figure out what context each AI needs. Extract relevant files. Paste into each conversation. Lose context between sessions.

This works - multi-AI collaboration genuinely produces better decisions - but it's **exhausting and doesn't scale**. It takes 15-30 minutes per decision and completely breaks flow state.

### Problem Impact

**For Benlamm (Primary User):**
- Flow state destroyed every time a complex decision arises
- 15-30 minutes of manual orchestration per architectural/security choice
- Context gets lost between tools
- Knows multi-model reasoning is better, but can't sustain the manual overhead
- Settles for single-model recommendations when time-pressured

**Cumulative Cost:**
- 5-10 complex decisions per day = 1.5-3 hours of manual AI orchestration
- Poorer architectural decisions when skipping multi-model consultation
- Cognitive overhead tracking which AI said what
- Can't leverage this approach for smaller decisions (overhead too high)

### Why Existing Solutions Fall Short

**Current Approaches:**

1. **Persona Prompting (Single Model)**
   - "Act as a security expert, then as a pragmatist..."
   - **Limitation:** Same model, same training data, same blind spots. Just roleplaying different perspectives.

2. **Manual Multi-Tool Orchestration** (Current State)
   - Copy/paste between ChatGPT, Claude, Gemini
   - **Limitation:** Time-consuming, breaks flow, context management nightmare

3. **Shared Document Workflows** (Attempted)
   - AIs collaborate via files/emails in repository
   - **Limitation:** Requires constant manual prompting, async workflow, coordination overhead

4. **LLM Conclave (Current State)**
   - Already exists as standalone tool
   - **Limitation:** Designed for CLI invocation by humans, not mid-workflow consultation. Requires manual setup per conversation.

**The Gap:** No way to quickly invoke multi-agent consultation **mid-workflow** while already talking to Claude Code, without breaking flow state and manually orchestrating everything.

### Proposed Solution

**LLM Conclave Consult Mode:** A fast, structured consultation capability invoked directly from Claude Code conversations or CLI.

**How It Works:**

```bash
# Option 1: User invokes directly while working with Claude
$ llm-conclave consult "Should we use OAuth 2.0 or JWT tokens?"

# Option 2: Claude Code invokes on user's behalf (future)
User: "Help me design authentication"
Claude: "Let me consult the Conclave on this..."
[Claude invokes: llm-conclave consult --context [selected files] "OAuth vs JWT?"]

# Returns (< 15 seconds target):
{
  "consensus": "OAuth 2.0 with JWT access tokens for stateless auth",
  "confidence": 0.85,
  "recommendation": "Use OAuth 2.0 authorization flow with JWT access tokens...",
  "reasoning": {
    "security_expert": "OAuth 2.0 provides better security boundaries...",
    "architect": "JWT tokens enable stateless scaling...",
    "pragmatist": "Implementation complexity acceptable for long-term benefits..."
  },
  "concerns": ["Token refresh complexity", "Session management overhead"],
  "dissent": ["Pragmatist suggests simpler session-based auth for MVP stage"],
  "perspectives": [
    {"agent": "Security Expert", "model": "claude-sonnet-4.5", "opinion": "..."},
    {"agent": "Architect", "model": "gpt-4o", "opinion": "..."},
    {"agent": "Pragmatist", "model": "gemini-2.5-pro", "opinion": "..."}
  ],
  "cost": {"tokens": 12453, "usd": 0.042},
  "duration_ms": 14200
}
```

**MVP Scope (Build for Personal Use):**

1. **Fast Consultation** (< 15 seconds target)
   - Quick consensus mode optimized for decisions
   - Parallel agent execution where possible
   - Time-boxed discussion (2-3 rounds max)

2. **Structured Output** (JSON + Markdown)
   - Machine-readable JSON response
   - Confidence scores, reasoning chains, dissent tracking
   - Human-readable markdown summary
   - Transparent attribution (which model said what)

3. **Simple Invocation**
   - CLI command: `llm-conclave consult "question"`
   - Context: Manual for MVP (provide files/context explicitly)
   - No complex API - just stdin/stdout or simple JSON response

4. **True Multi-Model Collaboration**
   - Different LLM architectures (Claude, GPT-4, Gemini)
   - Genuine perspective diversity (not persona roleplay)
   - Reduces single-model bias and hallucination

5. **Cost Transparency**
   - Track and report token usage and costs per consultation
   - Optimize for cost/quality balance
   - User awareness of per-consultation expense

**Future Enhancements (After Dogfooding):**
- Intelligent context auto-selection (hybrid relevance scoring + hierarchical bundling)
- Claude Code native integration (API for programmatic invocation)
- Learning from past consultations (improve over time)
- Sub-15-second response times (aggressive optimization)

### Key Differentiators

**1. True Multi-Model Collaboration**
- Not just one AI playing different roles
- Actual different models (Claude, GPT-4, Gemini) with different training data and reasoning styles
- Genuine perspective diversity reduces blind spots
- Validated through Benlamm's manual experimentation: multi-model answers are measurably better

**2. Built on Proven Foundation**
- LLM Conclave already exists and works (orchestration engine proven)
- Supports 5 LLM providers (OpenAI, Anthropic, Google, xAI, Mistral)
- Tool support, streaming, session persistence already implemented
- Just needs "consult mode" interface layer

**3. Dogfooding-Driven Development**
- Built to solve creator's daily pain (will actually get used)
- Real-world validation from day one
- Iterative improvement based on actual usage patterns
- No premature optimization for hypothetical users

**4. Speed as a Feature**
- Target: < 15 seconds per consultation (vs 15-30 minutes manual)
- Makes multi-model consultation viable for smaller decisions
- Doesn't break flow state
- Parallel agent execution + time-boxed rounds

**5. Structured, Actionable Output**
- Consensus + confidence score (know how certain the answer is)
- Reasoning chains per perspective (understand the "why")
- Dissenting opinions (know what was debated)
- Cost transparency (understand the trade-off)

### Potential Innovation (Patent Consideration)

**Intelligent Context Auto-Selection (Future):**
"System and method for adaptive context selection in multi-agent AI consultation where invoking agent intelligently determines minimal sufficient context based on question classification and agent specialization."

**Approach:**
- Hybrid: Relevance scoring + hierarchical bundling + learning from past consultations
- Minimizes token waste while ensuring sufficient context
- Could be defensible IP if implementation is particularly effective

**Note:** Not building this for MVP. Focus first on basic consultation working well. Context selection can be manual initially.

---

## Target Users

### Primary User: Benlamm (The Multi-Project Juggler)

**Background & Context:**
- **Role:** Independent developer/consultant managing 12+ concurrent projects
- **Projects:** HomeBay (SaaS auction platform), Corporate Brain MVP, Friedlam (70 WordPress sites), Magic & Monsters (game with daughter), personal tools
- **Tech Stack:** Next.js 14, TypeScript, PostgreSQL, Redis, Railway, Vercel, WordPress on AWS LiteSpeed
- **Workflow Philosophy:** **Agent-first methodology** - defaults to specialized AI agents for all non-trivial work (proven 3.5x faster: 43 min vs 2.5 hours)

**Current Workflow with AI:**
- **Primary Tool:** Claude Code for coding assistance
- **Agent Usage Pattern:** Launches specialized agents (auction-cto, realtime-auction-ui-expert, CEO/CTO debate agents) for complex decisions
- **Parallel Execution:** When problems are independent, launches 3-4 agents simultaneously in a single message
- **Multi-AI Consultation (Manual):** For major decisions, manually orchestrates discussions between Claude, GPT-4, and Gemini via copy/paste between tools or shared documents in repository

**Problem Experience:**
- **Frequency:** 5-10 complex architectural/security decisions per day across multiple projects
- **Current Pain:** Spends 15-30 minutes manually orchestrating multi-AI discussions per decision (1.5-3 hours daily total)
- **Examples of Decisions:** Authentication system design, infrastructure decisions, multi-script coordination, production incident analysis, major technical decisions requiring CEO + CTO agent debate

**Quality Requirements:**
- Integration tests must pass 100% before work is complete
- Defensive programming with multiple validation layers
- Philosophy: Quality over speed - "don't skip validation to ship faster"

**Success Vision:**
1. Multi-AI consultation in < 15 seconds (vs 15-30 minutes manual)
2. Invoke without leaving Claude Code conversation (preserve flow state)
3. Genuine multi-model reasoning (actual Claude + GPT-4 + Gemini debating)
4. Structured output with consensus, confidence, reasoning chains, dissent
5. Cost transparency
6. Daily usage: 5+ times per day, becomes part of workflow

**Motivations:**
- Primary: Solving own daily pain through dogfooding
- Secondary: Making AI assistants genuinely smarter through collaboration
- Values: Agent-first methodology, quality over speed, parallel execution

### Secondary Users (Future Consideration)

**Other Developers (Post-Dogfooding):**
- Developers who discover multi-AI reasoning produces better results
- Would adopt if Benlamm validates it works

**AI Tool Developers (Long-Term Vision):**
- Claude Code, Aider, Cursor could integrate as consultable backend
- Not targeting for MVP - build for personal use first

### User Journey

**Core Usage Pattern:**
1. Working in Claude Code on complex feature
2. Decision point arises: "Should we use OAuth 2.0 or JWT tokens?"
3. Invoke Conclave: `llm-conclave consult "OAuth vs JWT?"`
4. Conclave runs (< 15 seconds): Claude Opus, GPT-4o, Gemini Pro debate
5. Review structured response: consensus, reasoning, dissent, confidence, cost
6. Make informed decision
7. Continue coding

**Success Moment ("Aha!"):**
- Multi-AI consultation reveals blind spot that single-model missed
- Response in < 15 seconds feels instant
- Uses it 3+ times in one day, becomes habitual

**Long-Term Integration:**
- 5-10 daily invocations across projects
- Validates value through own usage before sharing/productizing
- Tracks: question asked, whether answer was better, did it change decision

---

## Success Metrics & Measurement

### North Star Metric

**Primary Success Indicator:** Benlamm uses `llm-conclave consult` **5+ times per day** and finds the multi-agent insights **genuinely change his decisions for the better** at least 50% of the time.

**Why This Metric:**
- Daily usage proves it solves a real pain point (vs novelty that fades)
- 5+ times/day = habitual integration into workflow
- "Changed decision for the better" = qualitative value validation
- If creator doesn't use it, nobody else will

---

### MVP Success Criteria (First 30 Days)

**Usage Metrics:**
- ✅ **Invocations:** 5+ consultations per day (minimum 150 total in first month)
- ✅ **Retention:** Used on 20+ out of 30 days (67%+ daily active)
- ✅ **Context Switching Reduction:** Consultation count > (Claude Code sessions + ChatGPT sessions + Gemini sessions combined)
  - Proof it replaced manual multi-tool orchestration

**Performance Metrics:**
- ✅ **Speed:** 90%+ of consultations complete in < 15 seconds
  - Baseline: Manual orchestration = 15-30 minutes (60-120x improvement)
- ✅ **Response Quality:** No degradation vs manual multi-AI orchestration
  - Subjective assessment: "Are answers as good as manual consultation?"

**Cost Metrics:**
- ✅ **Per-Consultation Cost:** < $0.10 USD average (transparent, acceptable)
  - Monthly budget tolerance: ~$15-20 (150 consultations × $0.10)
- ✅ **Cost Transparency:** All consultations show token counts and costs
  - User can audit and optimize expensive queries

**Workflow Integration:**
- ✅ **Flow State Preservation:** 80%+ of consultations invoked without leaving Claude Code
  - Measured by: Used CLI command vs manually copying to other tools
- ✅ **Decision Quality Impact:** 50%+ of consultations changed or improved decision
  - Self-reported tracking: "Did this change my mind or reveal blind spot?"

---

### Key Performance Indicators (Ongoing)

**1. Adoption & Engagement**
- **Daily Active Usage:** Days per week with at least 1 consultation
- **Invocation Frequency:** Consultations per active day
- **Replacement Rate:** Ratio of consultations to manual multi-tool sessions

**2. Speed & Performance**
- **Response Time Distribution:**
  - p50 (median): Target < 10 seconds
  - p95: Target < 20 seconds
  - p99: Target < 30 seconds (outliers with complex context)
- **Time Savings:** Minutes saved vs manual orchestration
  - Baseline: 15-30 min manual → Target: < 15 sec automated = 60-120x improvement

**3. Quality & Value**
- **Decision Impact Rate:** % of consultations that changed/improved decision
  - Target: 50%+ (half the time, provides genuinely new insight)
- **Multi-Model Value:** % where dissent or different perspectives were valuable
  - Proves multi-model > single-model
- **Error/Hallucination Rate:** % of consultations with obviously wrong info
  - Target: < 5% (same as manual multi-AI orchestration)

**4. Cost Efficiency**
- **Average Cost per Consultation:** Token usage × pricing
  - Track by: question complexity, context size, models used
- **Cost per Valuable Insight:** Cost ÷ (decisions changed)
  - ROI metric: Is multi-model consultation worth the API cost?
- **Monthly Spend:** Total API costs for consult mode
  - Budget threshold: ~$15-20/month (acceptable for personal tool)

**5. Reliability & Trust**
- **Failure Rate:** % of consultations with errors/timeouts
  - Target: < 2% (highly reliable)
- **Consensus Confidence Accuracy:** Does confidence score correlate with decision quality?
  - Track: High-confidence answers should rarely be wrong
- **Transparent Attribution:** Can always trace which model said what
  - Qualitative: User trusts the output source

---

### Measurement Approach

**Automated Tracking (Built into Consult Mode):**

```bash
# Every consultation auto-logs to: ~/.llm-conclave/consult-logs/
# Format: JSON-LD structured log
{
  "timestamp": "2025-12-27T14:32:15Z",
  "consultation_id": "consult-abc123",
  "question": "Should we use OAuth 2.0 or JWT tokens?",
  "context_files": ["src/auth.ts", "docs/architecture.md"],
  "context_size_tokens": 3420,
  "agents": [
    {"name": "Security Expert", "model": "claude-sonnet-4.5"},
    {"name": "Architect", "model": "gpt-4o"},
    {"name": "Pragmatist", "model": "gemini-2.5-pro"}
  ],
  "duration_ms": 14200,
  "rounds": 2,
  "consensus": "OAuth 2.0 with JWT access tokens",
  "confidence": 0.85,
  "had_dissent": true,
  "cost_usd": 0.042,
  "tokens_used": {
    "input": 8234,
    "output": 4219,
    "total": 12453
  }
}
```

**Manual Quality Assessment (Weekly Review):**

```bash
# Weekly self-reflection script
$ llm-conclave consult-review --last-7-days

# Prompts for each consultation:
# 1. Did this consultation provide value? (yes/no/maybe)
# 2. Did it change your decision? (yes/no)
# 3. Was there a blind spot revealed? (yes/no)
# 4. Would you have gotten same answer from single AI? (yes/no/unsure)
# 5. Speed rating: (instant/acceptable/too-slow)
# 6. Cost rating: (worth-it/acceptable/too-expensive)

# Generates weekly report:
# - Total consultations: 42
# - Valuable: 34 (81%)
# - Changed decision: 23 (55%)
# - Blind spots found: 18 (43%)
# - Multi-model advantage: 29 (69%)
# - Speed satisfaction: 95%
# - Cost satisfaction: 88%
# - Total cost: $1.76 USD
```

**Dashboard View (CLI Command):**

```bash
$ llm-conclave consult-stats --month 2025-12

# OUTPUT:
┌─────────────────────────────────────────────────┐
│  LLM Conclave Consult Stats - December 2025    │
├─────────────────────────────────────────────────┤
│  Usage Metrics                                  │
│  • Total Consultations: 187                     │
│  • Active Days: 24/30 (80%)                     │
│  • Avg per Day: 7.8 consultations               │
│  • Peak Day: Dec 18 (14 consultations)          │
├─────────────────────────────────────────────────┤
│  Performance Metrics                            │
│  • Median Response Time: 11.2 seconds           │
│  • p95 Response Time: 18.4 seconds              │
│  • p99 Response Time: 27.1 seconds              │
│  • Failure Rate: 0.5% (1 timeout)               │
├─────────────────────────────────────────────────┤
│  Quality Metrics (Self-Reported)                │
│  • Decision Changed: 52% (97/187)               │
│  • Blind Spots Found: 44% (82/187)              │
│  • Multi-Model Advantage: 71% (133/187)         │
├─────────────────────────────────────────────────┤
│  Cost Metrics                                   │
│  • Total Cost: $18.34 USD                       │
│  • Avg per Consultation: $0.098                 │
│  • Cost per Changed Decision: $0.189            │
│  • Most Expensive: $0.24 (Dec 12, large context)│
├─────────────────────────────────────────────────┤
│  Top Question Types                             │
│  • Architecture Decisions: 42%                  │
│  • Security Trade-offs: 23%                     │
│  • Library/Tool Selection: 18%                  │
│  • Performance Optimization: 12%                │
│  • Other: 5%                                    │
└─────────────────────────────────────────────────┘

✅ SUCCESS: You used consult 5+ times per day on 80% of days!
💰 COST: Within budget ($18.34 / $20 monthly target)
⚡ SPEED: 95% under 15 seconds (excellent!)
🎯 VALUE: 52% changed decisions (above 50% target!)
```

---

### Red Flags (Abandon or Pivot Signals)

**If After 30 Days:**

1. **< 3 consultations per day average**
   - Signal: Not solving a real pain point
   - Action: Interview self - why not using? What's blocking adoption?

2. **< 25% decision change rate**
   - Signal: Not providing differentiated value vs single AI
   - Action: Verify multi-model collaboration is working. Are models genuinely debating?

3. **> 30 seconds average response time**
   - Signal: Too slow, breaks flow state
   - Action: Optimize parallel execution, time-box discussions, reduce context size

4. **> $30/month cost**
   - Signal: Not sustainable for personal tool
   - Action: Optimize token usage, use cheaper models for initial rounds, reduce context

5. **Used < 15 out of 30 days**
   - Signal: Not habitual, falling back to old workflow
   - Action: Identify friction points. Is invocation too complex? Forgetting it exists?

6. **Zero consultations where multi-model mattered**
   - Signal: Single-model would have been equally good
   - Action: Question core hypothesis. Maybe persona prompting is sufficient?

---

### Success Threshold (Go/No-Go Decision at 30 Days)

**GO (Build More Features):**
- ✅ Used 5+ times/day on 20+ days
- ✅ 40%+ decision change rate
- ✅ 90%+ responses < 15 seconds
- ✅ Cost < $25/month
- ✅ At least 5 instances where multi-model debate revealed blind spots

**PIVOT (Adjust Approach):**
- ⚠️ Used 3-5 times/day (moderate usage)
- ⚠️ 25-40% decision change rate (some value)
- ⚠️ Identify specific friction points and iterate

**NO-GO (Abandon):**
- ❌ Used < 3 times/day (no adoption)
- ❌ < 25% decision change rate (no differentiated value)
- ❌ User actively avoiding it

---

### Long-Term Success (6 Months)

**Qualitative Goals:**
1. **Habitual Integration:** Muscle memory to invoke for complex decisions
2. **Trust Built:** Confidence in multi-model recommendations
3. **Workflow Transformation:** Changed how architectural decisions are made
4. **Sharing Begins:** Confident enough to share with other developers

**Quantitative Targets:**
- 1000+ total consultations (5-6 per day sustained)
- 50%+ decision change rate maintained
- < 10 second median response time
- Cost optimized to < $15/month average

---

## Scope & MVP Definition

### In Scope for MVP (v1.0)

**Core Consultation Capability:**

1. **CLI Command Interface**
   ```bash
   llm-conclave consult [options] "question"
   ```
   - Simple invocation from command line
   - Works while in any directory
   - No complex setup required

2. **Fast Multi-Model Consultation**
   - 3 agents (Security Expert, Architect, Pragmatist) with different models
   - Quick consensus mode optimized for speed (< 15 seconds target)
   - Time-boxed discussion (2-3 rounds max)
   - Parallel agent execution where possible

3. **Manual Context Provision**
   ```bash
   # Explicit file context
   llm-conclave consult --context src/auth.ts,docs/architecture.md "OAuth vs JWT?"

   # Project context (existing functionality)
   llm-conclave consult --project . "Review authentication approach"

   # Stdin piping
   cat design-doc.md | llm-conclave consult "What are the security risks?"
   ```

4. **Structured Output (Dual Format)**
   - **JSON Response:**
     ```json
     {
       "consensus": "OAuth 2.0 with JWT access tokens",
       "confidence": 0.85,
       "recommendation": "Full explanation...",
       "reasoning": {
         "security_expert": "...",
         "architect": "...",
         "pragmatist": "..."
       },
       "concerns": ["concern1", "concern2"],
       "dissent": ["dissenting view"],
       "perspectives": [
         {"agent": "name", "model": "model", "opinion": "..."}
       ],
       "cost": {"tokens": 12453, "usd": 0.042},
       "duration_ms": 14200
     }
     ```

   - **Markdown Summary:**
     ```markdown
     ## Consultation Summary

     **Question:** Should we use OAuth 2.0 or JWT tokens?
     **Consensus:** OAuth 2.0 with JWT access tokens
     **Confidence:** 85%

     ### Recommendation
     [Full explanation]

     ### Agent Perspectives
     **Security Expert (Claude Sonnet 4.5):** ...
     **Architect (GPT-4o):** ...
     **Pragmatist (Gemini 2.5 Pro):** ...

     ### Concerns Raised
     - Token refresh complexity
     - Session management overhead

     ### Dissenting Views
     - Pragmatist suggests simpler session-based auth for MVP stage

     ---
     Cost: $0.042 | Duration: 14.2s | Tokens: 12,453
     ```

5. **Automatic Logging & Tracking**
   - All consultations logged to `~/.llm-conclave/consult-logs/`
   - JSON-LD structured format
   - Enables future analytics and review

6. **Basic Stats Dashboard**
   ```bash
   llm-conclave consult-stats [--month YYYY-MM] [--week] [--all-time]
   ```
   - Shows usage, performance, cost metrics
   - No manual quality tracking yet (add in v1.1)

7. **Integration with Existing LLM Conclave**
   - Reuses existing provider infrastructure (OpenAI, Anthropic, Google, xAI, Mistral)
   - Reuses existing project context analysis
   - Reuses existing tool support
   - Reuses existing session management
   - Just adds new "consult mode" orchestrator

---

### Explicitly Out of Scope for MVP

**Not Building (Yet):**

1. **Intelligent Context Auto-Selection**
   - ❌ Automatic file relevance detection
   - ❌ Smart context pruning/summarization
   - ❌ Learning from past consultations
   - **Why defer:** Complex to implement, manual context works for MVP
   - **When to add:** After 100+ consultations, analyze what context was actually useful

2. **Claude Code Native Integration**
   - ❌ Claude Code can invoke via API
   - ❌ Tool definition for Claude to use
   - ❌ Embedded in Claude Code workflow
   - **Why defer:** Need to validate CLI works first
   - **When to add:** After 30 days of successful CLI usage

3. **Advanced Quality Tracking**
   - ❌ Manual weekly review tool (`llm-conclave consult-review`)
   - ❌ "Did this change your decision?" prompts
   - ❌ Quality assessment dashboard
   - **Why defer:** Focus on getting basic consultation working
   - **When to add:** v1.1 (week 2-3 after MVP)

4. **Custom Persona Configuration**
   - ❌ User-defined expert roles
   - ❌ Custom agent prompts
   - ❌ Flexible agent combinations
   - **Why defer:** MVP uses 3 fixed personas (proven combo)
   - **When to add:** After validating core value, if different personas needed

5. **Streaming Output**
   - ❌ Real-time agent responses as they come in
   - ❌ Progressive consensus building
   - **Why defer:** Adds complexity, < 15s is fast enough
   - **When to add:** If response time exceeds 20-30 seconds consistently

6. **Web UI Dashboard**
   - ❌ Visual analytics interface
   - ❌ Consultation history browser
   - ❌ Interactive exploration
   - **Why defer:** CLI-first for personal tool
   - **When to add:** Post v2.0, if sharing with others

7. **Multi-Turn Follow-Up**
   - ❌ "Why did you recommend that?"
   - ❌ "What if we prioritize cost over security?"
   - ❌ Contextual follow-up questions
   - **Why defer:** Scope creep, one-shot consultations sufficient for MVP
   - **When to add:** If >30% of consultations need follow-up clarification

8. **Advanced Cost Optimization**
   - ❌ Automatic model downgrading for simple questions
   - ❌ Context summarization to reduce tokens
   - ❌ Caching of common contexts
   - **Why defer:** Optimize for speed first, then cost
   - **When to add:** If monthly costs exceed $30

9. **Consultation Templates**
   - ❌ Pre-defined question templates
   - ❌ Domain-specific consultation types (security audit, architecture review, etc.)
   - **Why defer:** Generic consultation is more flexible for MVP
   - **When to add:** After 100+ consultations, identify common patterns

10. **Multi-Workspace Support**
    - ❌ Different agent configs per project
    - ❌ Workspace-specific personas
    - **Why defer:** Single user, consistent needs across projects
    - **When to add:** If different projects need radically different agent setups

---

### MVP Feature Breakdown (Must-Have vs Nice-to-Have)

**Must-Have (Blocking MVP):**
- ✅ CLI command: `llm-conclave consult "question"`
- ✅ Manual context via `--context` flag
- ✅ 3 fixed agents (Security Expert, Architect, Pragmatist)
- ✅ Fast execution (< 20 seconds, target < 15)
- ✅ Structured JSON output
- ✅ Markdown summary
- ✅ Automatic logging
- ✅ Cost tracking per consultation
- ✅ Basic stats command
- ✅ Consensus + confidence scoring
- ✅ Dissent tracking

**Nice-to-Have (Include if Time Allows):**
- ⭐ Stdin piping support (`cat file | llm-conclave consult`)
- ⭐ Output format flag (`--format json` vs `--format markdown`)
- ⭐ Verbose mode (`--verbose`) showing full agent conversation
- ⭐ Agent selection flag (`--agents security,architect,qa`)
- ⭐ Quick mode (`--quick`) for faster but shallower consultation (1 round only)

**Defer to v1.1:**
- 📅 Manual quality review tool
- 📅 Weekly reflection prompts
- 📅 Question type classification
- 📅 Consultation search/filter

---

### Technical Dependencies

**Existing Infrastructure (Already Built):**
- ✅ 5 LLM provider integrations (OpenAI, Anthropic, Google, xAI, Mistral)
- ✅ Tool support system
- ✅ Project context analysis
- ✅ Session management
- ✅ ConfigCascade system
- ✅ PersonaSystem with 10 personas
- ✅ ModeDetector for task classification

**New Components Needed:**
1. **ConsultOrchestrator** (`src/orchestration/ConsultOrchestrator.ts`)
   - Fast consensus mode variant
   - Time-boxed discussions (2-3 rounds)
   - Parallel agent execution
   - Consensus synthesis with confidence scoring
   - Dissent tracking

2. **ConsultLogger** (`src/utils/ConsultLogger.ts`)
   - Structured logging to `~/.llm-conclave/consult-logs/`
   - JSON-LD format
   - Auto-rotation (monthly archives)

3. **ConsultStats** (`src/commands/consult-stats.ts`)
   - Read logs and compute metrics
   - Display dashboard
   - Time-range filtering

4. **Consult Command** (`src/commands/consult.ts`)
   - CLI interface
   - Context loading
   - Output formatting
   - Error handling

**External Dependencies:**
- None (all existing)

---

### Implementation Phases

**Phase 1: Core Consultation (Week 1)**
- Build ConsultOrchestrator
- Implement fast consensus mode
- Add CLI command
- Manual context via `--context` flag
- JSON + Markdown output
- Basic logging

**Phase 2: Stats & Tracking (Week 1-2)**
- Build ConsultLogger
- Implement consult-stats command
- Dashboard display
- Cost tracking

**Phase 3: Polish & Optimization (Week 2)**
- Performance optimization (< 15s target)
- Error handling
- Verbose mode
- Documentation

**Phase 4: Dogfooding & Iteration (Week 2-4)**
- Daily usage by Benlamm
- Identify friction points
- Quick fixes and improvements
- Prepare for v1.1 enhancements

---

### Constraints & Considerations

**Performance Constraints:**
- **Hard Target:** 90% of consultations < 15 seconds
- **Acceptable:** p95 < 20 seconds
- **Problem Threshold:** p50 > 15 seconds = investigate and optimize

**Cost Constraints:**
- **Budget:** < $0.10 per consultation average
- **Monthly Cap:** ~$20 (personal tool budget)
- **Red Flag:** > $30/month = optimize or reconsider

**Quality Constraints:**
- **Baseline:** Must match quality of manual multi-AI orchestration
- **No Degradation:** Can't sacrifice quality for speed
- **Trust Requirement:** Must be confident enough to make decisions based on output

**Technical Constraints:**
- **Existing Infrastructure:** Must reuse LLM Conclave components
- **Backward Compatibility:** Don't break existing modes (consensus, orchestrated, iterative)
- **API Stability:** Provider APIs may change or have rate limits

**Usage Constraints:**
- **Single User:** Optimized for Benlamm's workflow (not multi-tenant)
- **CLI-First:** Terminal-based tool (not web/GUI)
- **Context Management:** User responsible for providing relevant context (no magic auto-detection in MVP)

---

### Success Criteria Recap (What "Done" Looks Like)

**Technical Completion:**
- ✅ `llm-conclave consult "question"` works end-to-end
- ✅ Returns structured JSON + Markdown
- ✅ Logs all consultations automatically
- ✅ `llm-conclave consult-stats` shows dashboard
- ✅ 90%+ responses < 20 seconds
- ✅ No breaking changes to existing modes
- ✅ Documentation updated (README, examples)

**User Acceptance:**
- ✅ Benlamm can invoke from anywhere while working with Claude Code
- ✅ Output is actionable (can make decisions from it)
- ✅ Fast enough not to break flow state
- ✅ Cost is transparent and acceptable
- ✅ Used 3+ times in first week of availability

**Validation Milestones:**
- **Day 1:** First successful consultation end-to-end
- **Day 3:** 10 consultations completed, identify pain points
- **Week 1:** 20+ consultations, first stats review
- **Week 2:** 50+ consultations, assess value (decision change rate)
- **Day 30:** Go/No-Go decision based on metrics

---

## Risks & Mitigations

### High-Priority Risks

#### Risk 1: Performance - Too Slow (Response Time > 20 seconds)

**Likelihood:** Medium (40%)
**Impact:** High (kills adoption - breaks flow state)

**Description:**
Multi-agent consultation with 3 LLMs across multiple providers could easily exceed 15-second target. Network latency, sequential API calls, and multi-round discussions compound. If median response time is > 20 seconds, tool becomes too disruptive to use mid-workflow.

**Early Warning Signs:**
- First 10 consultations averaging > 15 seconds
- p50 response time > 12 seconds in week 1
- User manually timing and feeling frustrated
- Reverting to manual multi-tool orchestration because "it's not that much slower"

**Mitigation Strategies:**

1. **Parallel Agent Execution (Pre-Implementation)**
   - Execute all agent initial responses in parallel (not sequential)
   - Use Promise.all() for first round
   - Expected: 3x speedup (3 sequential calls → 1 parallel batch)

2. **Time-Box Discussion Rounds (Design Decision)**
   - Hard limit: 2 rounds max for MVP
   - Quick mode: 1 round only (--quick flag)
   - Prevents infinite back-and-forth

3. **Optimize Context Size (Implementation)**
   - Limit project context to 5000 tokens max
   - Provide explicit context guidance in CLI help
   - Warn user if context > 10k tokens

4. **Use Faster Models Where Possible (Configuration)**
   - Default to GPT-4o (fast), Gemini 2.0 Flash (fastest), Claude Sonnet 4.5 (balanced)
   - Reserve Opus/Pro models for complex consultations only
   - Add --fast flag that uses all flash/turbo models

5. **Streaming Response Processing (Future Optimization)**
   - If MVP proves valuable but slow, add streaming in v1.1
   - Process agent responses as they arrive
   - Start consensus synthesis before all agents finish

**Fallback Plan:**
- If p50 > 20s after optimization: Add async mode (--async flag)
- Returns consultation ID immediately, emails/notifies when complete
- Not ideal but better than blocking for 30+ seconds

---

#### Risk 2: Cost - Exceeds Budget (> $30/month)

**Likelihood:** Medium (35%)
**Impact:** Medium (sustainable at 2-3x budget, but limits usage)

**Description:**
Multi-model consultation costs 3-5x more than single-model queries. If consultations average > $0.15 or usage exceeds 10/day, monthly costs could hit $45-60. For personal tool, unsustainable beyond ~$30/month.

**Early Warning Signs:**
- First consultation costs > $0.15
- Week 1 costs project to > $25/month
- User actively limiting usage to control costs
- Avoiding consultations for smaller decisions

**Mitigation Strategies:**

1. **Cost Monitoring & Alerts (Built-In)**
   - Real-time cost display per consultation
   - Weekly cost summary notifications
   - Alert if on track for > $25/month
   - `llm-conclave consult-stats --cost` command

2. **Optimize Model Selection (Configuration)**
   - Use GPT-4o Mini for initial rounds (10x cheaper)
   - Only use premium models (Opus, GPT-4o full) for final consensus
   - Gemini 2.0 Flash as free/cheap option
   - Expected: 40-60% cost reduction

3. **Context Optimization (Usage Pattern)**
   - Provide minimal context (don't dump entire codebase)
   - Use --project flag sparingly (auto-context is token-heavy)
   - Encourage explicit --context with 1-3 relevant files only

4. **Caching Strategy (Future Enhancement)**
   - Cache common project contexts (reuse across consultations)
   - Deduplicate repeated context in same session
   - Provider-level prompt caching (Claude, Gemini support this)

5. **Tiered Consultation (Design Pattern)**
   - Quick consultations: 2 agents, 1 round, cheap models (< $0.05)
   - Standard: 3 agents, 2 rounds, mixed models (< $0.10)
   - Deep: 4+ agents, 3 rounds, premium models (< $0.25)
   - Add --tier flag or auto-detect from question complexity

**Fallback Plan:**
- If costs consistently > $30/month: Negotiate with self on value
- Options: Reduce usage (3-4/day vs 5-10), use cheaper models, optimize context
- Ultimate fallback: Budget increase to $50/month if genuinely valuable

---

#### Risk 3: Adoption - Won't Actually Use It

**Likelihood:** Medium-High (45%)
**Impact:** Critical (complete failure if unused)

**Description:**
"Build it and they will come" doesn't work even for personal tools. Risk that tool is novelty for first week, then forgotten. Falls back to manual multi-tool orchestration due to muscle memory, friction in invocation, or lack of perceived value.

**Early Warning Signs:**
- Week 1: < 10 total consultations
- Week 2: Usage declining (5/day → 2/day)
- Opening ChatGPT/Claude manually instead of using consult
- Tool exists but never reaches for it instinctively
- Making decisions without consulting when it would be valuable

**Mitigation Strategies:**

1. **Deliberate Habit Formation (Personal Discipline)**
   - Set explicit trigger: "When architectural decision arises → llm-conclave consult"
   - Add reminder alias in shell: `alias decide='llm-conclave consult'`
   - Track "missed opportunities" (times I should have consulted but didn't)
   - Week 1 goal: Force 3+ consultations even if not natural

2. **Reduce Invocation Friction (UX Optimization)**
   - Ultra-short command: Consider `conc` alias globally
   - Stdin piping: `cat design.md | conc "review this"`
   - Smart defaults: Minimal flags required
   - Shell completion for common question patterns

3. **Make Value Visible (Feedback Loop)**
   - Each consultation ends with mini-summary: "This cost $0.08, saved 20 minutes"
   - Weekly stats email/notification: "You consulted 23 times, changed 12 decisions"
   - Track and celebrate instances where multi-model caught blind spots
   - Build confidence that it's genuinely better than single-model

4. **Strategic Positioning (Mental Model)**
   - Frame as "executive board consultation" (not just another AI query)
   - Reserved for important decisions (not trivial questions)
   - Makes it feel valuable/special, not just "yet another AI tool"

5. **Integration into Workflow (Context Placement)**
   - Add to common workflows: "Before finalizing architecture, consult"
   - Keep terminal window open with command pre-typed
   - Consider shell prompt integration (shows if consultation available)

**Fallback Plan:**
- If usage < 3/day by week 3: Honest retrospective
- Questions: Why not using? What's blocking? Is problem real?
- Options: Pivot to different interface (web UI?), simplify further, or abandon

---

#### Risk 4: Quality - No Better Than Single Model

**Likelihood:** Low-Medium (25%)
**Impact:** High (invalidates core hypothesis)

**Description:**
Core hypothesis: Multi-model consultation produces better decisions than single-model. If Benlamm finds that GPT-4o alone would have given equally good answers 80%+ of the time, multi-model orchestration isn't worth the cost/complexity.

**Early Warning Signs:**
- Most consultations: All agents agree immediately (no debate value)
- Dissenting opinions don't add insight (just contrarian for sake of it)
- Manual comparison: ChatGPT alone gives same recommendation
- Never experience "aha!" moment where multi-model caught blind spot
- Confidence scores consistently high (95%+) = no genuine uncertainty

**Mitigation Strategies:**

1. **Diverse Model Selection (Architecture Decision)**
   - Use models with genuinely different training (Claude, GPT, Gemini)
   - Different architectures = different reasoning patterns
   - Avoid using multiple OpenAI models (too similar)

2. **Persona Specialization (System Prompts)**
   - Security Expert: Focus on threat modeling, vulnerabilities
   - Architect: Focus on scalability, maintainability, patterns
   - Pragmatist: Focus on implementation complexity, time-to-ship
   - Distinct perspectives, not generic "review this"

3. **Encourage Dissent (Orchestrator Design)**
   - System prompt: "If you disagree with other agents, explain why"
   - Judge actively asks: "What are the risks? What could go wrong?"
   - Don't force false consensus

4. **Quality Tracking (Measurement)**
   - Explicit tracking: "Would single model have been equally good?"
   - If yes > 70% of time, re-evaluate approach
   - Identify question types where multi-model matters vs doesn't

5. **Compare Against Baseline (Validation)**
   - First 10 consultations: Also ask ChatGPT alone
   - Compare quality subjectively
   - If no meaningful difference, pivot strategy

**Fallback Plan:**
- If multi-model doesn't add value: Pivot to "rapid expert consultation"
- Still useful if faster than manual (< 15s vs 5 minutes typing to ChatGPT)
- Or: Persona prompting with single model (cheaper, equally effective)

---

### Medium-Priority Risks

#### Risk 5: Technical - API Rate Limits / Provider Issues

**Likelihood:** Medium (30%)
**Impact:** Medium (temporary blocking, user frustration)

**Description:**
Using 3 different LLM providers simultaneously increases surface area for API issues. Rate limits, outages, authentication errors, model deprecations. One provider down = partial consultation failure.

**Early Warning Signs:**
- 429 rate limit errors from any provider
- Timeouts or 5xx errors
- Model unavailable errors
- Inconsistent response times (some providers slow)

**Mitigation Strategies:**

1. **Graceful Degradation (Error Handling)**
   - If one agent fails, continue with remaining 2
   - Clearly indicate in output: "Note: Security Expert unavailable"
   - Confidence score reflects missing perspective

2. **Retry Logic with Backoff (Implementation)**
   - Exponential backoff for rate limits
   - 3 retry attempts before failing
   - Timeout: 30 seconds per agent

3. **Provider Rotation (Flexibility)**
   - If provider consistently failing, swap to alternative
   - Example: Security Expert could use Claude OR GPT-4o
   - Dynamic fallback configuration

4. **Rate Limit Awareness (Monitoring)**
   - Track API usage across providers
   - Stay well below known rate limits
   - For personal use, unlikely to hit limits (< 100 calls/day)

5. **Offline Mode / Caching (Future)**
   - Cache responses for identical questions + context
   - Provide cached answer with "previously consulted" note

**Fallback Plan:**
- Maintain list of current API keys/status
- Quick config to disable problematic provider
- Emergency mode: Single-model consultation if all providers degraded

---

#### Risk 6: Context Management - Wrong Context Provided

**Likelihood:** Medium-High (40%)
**Impact:** Low-Medium (poor recommendations, but user will notice)

**Description:**
Manual context provision means user responsible for including relevant files/info. Risk of providing too much (wasted tokens, slow), too little (uninformed recommendations), or wrong context (misleading answers).

**Early Warning Signs:**
- Agent responses: "I don't have enough context to answer this"
- Irrelevant recommendations (clearly didn't understand the problem)
- User frustration: "How was I supposed to know to include that file?"
- Repeated re-consultations with expanded context

**Mitigation Strategies:**

1. **Smart Context Guidance (CLI Help)**
   - Examples of good context provision
   - Suggest: "Include 1-3 most relevant files, or use --project sparingly"
   - Warning if context > 10k tokens

2. **Context Templates (Future Feature)**
   - For common question types, suggest context
   - "Architecture decision? Include: architecture.md, related src files"
   - "Security review? Include: auth files, API endpoints"

3. **Minimal Context First (Best Practice)**
   - Start with minimal context
   - If agents say "need more info," re-run with expanded context
   - Better than over-including

4. **Project Context Intelligence (Existing Feature)**
   - `--project .` flag analyzes entire project
   - Useful for broad questions
   - Trade-off: More tokens, slower, but comprehensive

5. **Learn from Usage (Post-MVP)**
   - After 50+ consultations, analyze: What context was actually useful?
   - Build heuristics: Question type → Recommended context
   - Could auto-suggest context in v1.2

**Fallback Plan:**
- If context issues frequent: Add context analysis step
- Before consulting, agent pre-checks: "Is this enough context?"
- Interactive mode: "What additional context would help?"

---

#### Risk 7: Output Overload - Too Much Information

**Likelihood:** Low-Medium (30%)
**Impact:** Low (annoying but not blocking)

**Description:**
Multi-agent responses could be verbose (3 agents × 500 words each = 1500 words). Wall of text defeats purpose of quick consultation. User wants actionable consensus, not essay.

**Early Warning Signs:**
- Consultation output > 2000 words
- User skipping to "consensus" section without reading perspectives
- Time to parse output > time saved vs manual consultation
- Feedback: "Just tell me what to do"

**Mitigation Strategies:**

1. **Structured Output Format (Design)**
   - Lead with consensus + confidence (TL;DR)
   - Collapsible agent perspectives (can expand if interested)
   - Highlight key points (bold/bullets)

2. **Concise System Prompts (Prompt Engineering)**
   - Instruct agents: "Be concise. 2-3 paragraphs max."
   - Focus on actionable recommendations, not background
   - Avoid repetition between agents

3. **Output Modes (CLI Flags)**
   - `--format brief`: Consensus + concerns only (200 words)
   - `--format standard`: Include agent perspectives (500 words)
   - `--format verbose`: Full conversation history (unlimited)
   - Default: standard

4. **Judge Synthesis (Orchestrator)**
   - Judge actively synthesizes, not just concatenates
   - Removes redundancy
   - Highlights where agents disagree (not where they agree)

5. **Progressive Disclosure (UX)**
   - Terminal output: Brief summary
   - Full details saved to file: `~/.llm-conclave/consult-logs/[id].md`
   - User can review later if needed

**Fallback Plan:**
- If output consistently too verbose: Aggressive prompt tuning
- Add token limits per agent response
- Focus on "executive summary" format

---

### Low-Priority Risks (Acknowledge but Don't Over-Optimize)

#### Risk 8: Security - API Keys Exposure

**Likelihood:** Low (10%)
**Impact:** High (if exposed, but unlikely for personal tool)

**Mitigation:** Use environment variables, never commit keys, existing best practices already in place.

---

#### Risk 9: Maintenance - Keeping Up with Provider Changes

**Likelihood:** Medium (40%)
**Impact:** Low (annoying, but fixable)

**Mitigation:** Provider abstraction already exists in LLM Conclave. Model updates/deprecations handled through ProviderFactory. Monitor provider release notes quarterly.

---

#### Risk 10: Feature Creep - Building Too Much

**Likelihood:** High (60%)
**Impact:** Low (delays MVP, but not fatal)

**Mitigation:** Strict MVP scope documented above. No features beyond consult command until 30-day validation complete. Resist urge to add "just one more thing."

---

### Risk Summary Matrix

| Risk | Likelihood | Impact | Priority | Mitigation Complexity |
|------|------------|--------|----------|----------------------|
| Too Slow (> 20s) | Medium | High | **P0** | Medium (parallel execution, time-boxing) |
| Exceeds Budget | Medium | Medium | **P0** | Low (cost monitoring, model optimization) |
| Won't Use It | Medium-High | Critical | **P0** | High (requires discipline + UX) |
| No Better Than Single Model | Low-Medium | High | **P1** | Medium (diverse models, quality tracking) |
| API Rate Limits | Medium | Medium | **P2** | Low (error handling, retries) |
| Wrong Context | Medium-High | Low-Medium | **P2** | Low (guidance, best practices) |
| Output Overload | Low-Medium | Low | **P3** | Low (formatting, concise prompts) |
| API Keys Exposure | Low | High | **P3** | Low (existing best practices) |
| Provider Changes | Medium | Low | **P4** | Low (abstraction layer exists) |
| Feature Creep | High | Low | **P4** | Low (discipline, scope adherence) |

---

### Risk Response Strategy

**Pre-Launch (Before First Consultation):**
- ✅ Implement parallel agent execution (mitigate performance risk)
- ✅ Add cost tracking to every consultation (mitigate budget risk)
- ✅ Set up habit formation triggers (mitigate adoption risk)
- ✅ Use diverse model selection (mitigate quality risk)

**Week 1 (First 10 Consultations):**
- Monitor: Response times, costs, actual usage frequency
- Quick pivot: If any P0 risk materializes, address immediately
- Validate: Quality - compare against single-model baseline

**Week 2-4 (Ongoing):**
- Track metrics continuously
- Weekly review: Are risks materializing? New risks emerging?
- Adjust: If medium-priority risks become blocking, reprioritize

**Day 30 (Go/No-Go):**
- Evaluate: Did high-priority risks kill the project?
- Decision: GO if P0 risks mitigated, NO-GO if adoption/quality failed

---

## Summary & Next Steps

### Executive Summary

**What We're Building:**
LLM Conclave Consult Mode - a fast (< 15 second) multi-model consultation capability that provides structured expert opinions from Claude, GPT-4, and Gemini through a simple CLI command.

**Core Value Proposition:**
Transform 15-30 minutes of manual multi-AI orchestration into a < 15 second automated consultation that preserves flow state and provides genuine multi-model perspective diversity.

**Success Definition:**
Daily usage (5+ consultations/day) with 50%+ decision change rate, proving that multi-model consultation genuinely improves decision quality compared to single-model approaches.

**Key Innovation:**
True multi-model collaboration (different LLM architectures actually debating) rather than persona prompting within a single model, built on proven LLM Conclave infrastructure.

---

### MVP Scope Summary

**In Scope (Must Build):**
1. CLI command: `llm-conclave consult "question"`
2. 3 fixed agents (Security Expert, Architect, Pragmatist) with diverse models
3. Fast execution (< 15s target, < 20s acceptable)
4. Manual context provision (--context flag, --project flag, stdin)
5. Structured JSON + Markdown output
6. Automatic logging (JSON-LD format)
7. Basic stats dashboard (`llm-conclave consult-stats`)
8. Cost tracking and transparency

**Explicitly Out of Scope (Defer):**
- Intelligent context auto-selection
- Claude Code native integration
- Advanced quality tracking/review tool
- Custom persona configuration
- Streaming output
- Web UI
- Multi-turn follow-up
- Advanced cost optimization

**Timeline:** 2 weeks implementation + 2 weeks dogfooding = 30-day validation cycle

---

### Key Metrics Recap

**North Star:** 5+ daily consultations with 50%+ decision change rate

**MVP Success Criteria (30 Days):**
- Usage: 150+ consultations across 20+ days
- Performance: 90%+ responses < 15 seconds
- Cost: < $0.10/consultation (< $20/month)
- Quality: 50%+ consultations changed/improved decisions

**Go/No-Go Decision:**
- GO: 5+ times/day on 20+ days, 40%+ decision change, < 15s, < $25/month
- PIVOT: 3-5 times/day, identify friction and iterate
- NO-GO: < 3 times/day, < 25% decision change (abandon)

---

### Critical Success Factors

**Must Get Right:**
1. **Performance** - Parallel agent execution, time-boxed rounds, fast models
2. **Cost** - Real-time monitoring, cheap models for initial rounds, context optimization
3. **Adoption** - Habit formation triggers, ultra-low friction invocation, visible value
4. **Quality** - Diverse models, specialized personas, dissent encouragement

**Early Warning System:**
- Week 1: < 10 consultations = adoption problem
- Week 1: p50 > 15s = performance problem
- Week 1: Average cost > $0.15 = budget problem
- Week 2: Usage declining = value problem

---

### Technical Foundation

**Existing Infrastructure (Reuse):**
- 5 LLM provider integrations (OpenAI, Anthropic, Google, xAI, Mistral)
- Tool support system
- Project context analysis
- Session management
- ConfigCascade system
- PersonaSystem with 10 personas

**New Components (Build):**
1. ConsultOrchestrator - Fast consensus mode with parallel execution
2. ConsultLogger - Structured logging to ~/.llm-conclave/consult-logs/
3. ConsultStats - Dashboard command for metrics
4. Consult Command - CLI interface

**Implementation Complexity:** Medium
- Phase 1 (Core): ConsultOrchestrator + CLI command (3-5 days)
- Phase 2 (Tracking): Logger + Stats (2-3 days)
- Phase 3 (Polish): Optimization + error handling (2-3 days)
- Phase 4 (Dogfooding): Daily usage + iteration (2 weeks)

---

### Top Risks & Mitigations

**P0 Risks (Must Mitigate Before Launch):**

1. **Too Slow (> 20s)** - 40% likelihood
   - Mitigation: Parallel execution, time-boxed rounds, fast models
   - Fallback: Async mode if needed

2. **Exceeds Budget (> $30/month)** - 35% likelihood
   - Mitigation: Cost monitoring, cheap models, context optimization
   - Fallback: Reduce usage or increase budget if valuable

3. **Won't Use It** - 45% likelihood (highest risk)
   - Mitigation: Habit formation, ultra-low friction, visible value
   - Fallback: Honest retrospective, pivot or abandon

4. **No Better Than Single Model** - 25% likelihood
   - Mitigation: Diverse models, specialized personas, quality tracking
   - Fallback: Pivot to "rapid consultation" or abandon

**Risk Management Strategy:**
- Pre-launch: Implement P0 mitigations
- Week 1: Monitor closely, quick pivots
- Day 30: Go/No-Go based on metrics

---

### Next Steps & Deliverables

**Immediate Next Steps (Planning Phase):**

1. **Architecture Design** ✅ NEXT
   - Detail ConsultOrchestrator architecture
   - Define agent execution flow (parallel, rounds, synthesis)
   - Specify output format schemas (JSON + Markdown)
   - Design logging structure
   - Error handling strategy

2. **Technical Specification**
   - API signatures for new components
   - Integration points with existing systems
   - Data models and types
   - Configuration schema

3. **Implementation Plan**
   - Break down into tasks/subtasks
   - Identify dependencies
   - Estimate effort per component
   - Define testing strategy

**Implementation Phase (Week 1-2):**

1. **Core Consultation (Days 1-5)**
   - Build ConsultOrchestrator
   - Implement consult command
   - Add parallel agent execution
   - JSON + Markdown output
   - Basic error handling

2. **Tracking & Metrics (Days 6-8)**
   - Build ConsultLogger
   - Implement consult-stats command
   - Dashboard display
   - Cost tracking

3. **Polish & Documentation (Days 9-10)**
   - Performance optimization
   - Error handling improvements
   - CLI help text
   - README updates
   - Usage examples

**Validation Phase (Week 3-4):**

1. **Daily Dogfooding**
   - Use for all architectural decisions
   - Track usage, performance, costs
   - Note friction points and value moments
   - Compare against manual multi-AI orchestration

2. **Weekly Reviews**
   - Week 3: First stats review (20+ consultations)
   - Week 4: Quality assessment (decision change rate)
   - Iterate on pain points

3. **Day 30 Decision**
   - Evaluate against success criteria
   - GO / PIVOT / NO-GO decision
   - If GO: Plan v1.1 enhancements

---

### Open Questions & Decisions Needed

**Technical Decisions:**

1. **Judge Model Selection**
   - Option A: Use existing judge logic (GPT-4o)
   - Option B: Dedicated consensus model (Claude Opus for synthesis quality)
   - **Recommendation:** Start with GPT-4o (fast), upgrade if synthesis quality lacking

2. **Confidence Scoring Algorithm**
   - Option A: Simple agreement percentage (3/3 agree = 100%, 2/3 = 67%)
   - Option B: Semantic similarity analysis
   - **Recommendation:** Start simple (Option A), enhance if needed

3. **Context Token Limit**
   - Option A: Hard limit at 5k tokens (fast, cheap)
   - Option B: Soft limit at 10k with warning (flexible)
   - **Recommendation:** Option B (warn but allow)

**UX Decisions:**

1. **Default Output Format**
   - Option A: JSON only (machine-readable)
   - Option B: Markdown only (human-readable)
   - Option C: Both (Markdown to stdout, JSON to log)
   - **Recommendation:** Option C (best of both)

2. **Stats Dashboard Default View**
   - Option A: All-time stats
   - Option B: Current month only
   - Option C: Last 30 days
   - **Recommendation:** Option C (rolling 30-day window)

3. **Alias/Shortcut**
   - Option A: No built-in alias (user decides)
   - Option B: Suggest `conc` alias in docs
   - Option C: Auto-create `conc` alias during setup
   - **Recommendation:** Option B (suggest, don't force)

**Scope Decisions:**

1. **Include Verbose Mode in MVP?**
   - Shows full agent conversation, not just synthesis
   - Adds ~1 day development time
   - **Decision Needed:** Nice-to-have, include if time allows

2. **Include Quick Mode in MVP?**
   - Single round consultation for faster response
   - Adds ~0.5 day development time
   - **Decision Needed:** Nice-to-have, include if time allows

3. **Include Stdin Piping in MVP?**
   - `cat file | llm-conclave consult "question"`
   - Adds ~0.5 day development time
   - **Decision Needed:** Nice-to-have, include if time allows

---

### Dependencies & Prerequisites

**Before Starting Implementation:**
- ✅ LLM Conclave v2 CLI infrastructure complete
- ✅ All 5 providers operational (OpenAI, Anthropic, Google, xAI, Mistral)
- ✅ PersonaSystem with 10 personas
- ✅ Project context analysis working
- ✅ API keys configured for all providers

**External Dependencies:**
- None (all dependencies already in place)

**Blocker Check:**
- ✅ No known blockers
- ✅ Ready to proceed to architecture phase

---

### Success Validation Framework

**Day 1 Checkpoint:**
- ✅ First consultation completes end-to-end
- ✅ Structured output (JSON + Markdown) generated
- ✅ Logging works (file created in ~/.llm-conclave/consult-logs/)
- ✅ Cost tracking displays correctly

**Week 1 Checkpoint:**
- ✅ 20+ consultations completed
- ✅ p50 response time < 15s (performance target met)
- ✅ Average cost < $0.12 (within budget trajectory)
- ✅ Used on 5+ days (adoption starting)
- ✅ `consult-stats` command shows meaningful data

**Week 2 Checkpoint:**
- ✅ 50+ consultations completed
- ✅ Self-assessment: 40%+ consultations changed decisions
- ✅ At least 3 instances where multi-model caught blind spots
- ✅ Usage feels habitual (reaching for it instinctively)

**Day 30 Go/No-Go:**
- ✅ 150+ consultations across 20+ days
- ✅ 50%+ decision change rate
- ✅ 90%+ responses < 15 seconds
- ✅ Cost < $25/month
- ✅ 5+ consultations per active day
- **DECISION:** GO (continue to v1.1) / PIVOT (adjust) / NO-GO (abandon)

---

### Project Readiness Assessment

**✅ READY TO PROCEED TO ARCHITECTURE PHASE**

**Confidence Level:** High

**Rationale:**
1. **Problem Validated:** Benlamm experiences 15-30 min manual orchestration pain daily
2. **Solution Feasible:** Building on proven LLM Conclave infrastructure
3. **Metrics Defined:** Clear success criteria and Go/No-Go thresholds
4. **Risks Identified:** 10 risks with mitigation strategies
5. **Scope Clear:** MVP feature set well-defined, out-of-scope explicit
6. **Timeline Realistic:** 2 weeks implementation + 2 weeks dogfooding
7. **No Blockers:** All dependencies in place

**Next Document:** Architecture Specification
- Detail ConsultOrchestrator design
- Define agent execution flow
- Specify output schemas
- Design logging/stats system
- Integration architecture

---

## Document Metadata

**Status:** ✅ COMPLETE (Ready for Architecture Phase)

**Created:** 2025-12-27

**Steps Completed:**
1. ✅ Initialization & Context Analysis
2. ✅ Vision & Problem Statement
3. ✅ Target Users & Journey
4. ✅ Success Metrics & Measurement
5. ✅ Scope & MVP Definition
6. ✅ Risks & Mitigations
7. ✅ Summary & Next Steps

**Total Length:** ~1,300 lines

**Key Decisions Made:**
- MVP scope: Consult command + 3 agents + fast execution + logging/stats
- Success metric: 5+ daily consultations with 50%+ decision change
- Timeline: 30-day validation cycle (2 weeks build + 2 weeks dogfood)
- Top risks: Adoption (45%), performance (40%), cost (35%), quality (25%)
- Next phase: Architecture design

**Approval Status:** Awaiting user confirmation to proceed to architecture

---

**END OF PRODUCT BRIEF**

---
