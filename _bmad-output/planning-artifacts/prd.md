---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-complete
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-llm_conclave-2025-12-27.md
  - docs/PLANNED_FEATURES.md
  - docs/RESUME_FEATURE_DESIGN.md
  - _bmad-output/project-documentation/conditional-analysis.md
  - _bmad-output/project-documentation/dev-deploy-guides.md
  - _bmad-output/project-documentation/existing-docs.md
  - _bmad-output/project-documentation/integration-architecture.md
  - _bmad-output/project-documentation/project-structure.md
  - _bmad-output/project-documentation/source-tree-analysis.md
  - _bmad-output/project-documentation/technology-stack.md
documentCounts:
  briefCount: 1
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 9
workflowType: 'prd'
lastStep: 11
---

# Product Requirements Document - llm_conclave

**Author:** Benlamm
**Date:** 2025-12-28

## Executive Summary

LLM Conclave Consult Mode transforms LLM Conclave from a standalone multi-agent tool into a high-speed, consultable intelligence service. It is designed to be invoked mid-workflow by developers or other AI CLI applications (like Claude Code) to resolve complex architectural, security, and design decisions through multi-model debate. This feature eliminates the "Manual Multi-AI Orchestration Tax"—the 15-30 minute flow-breaking process of manually coordinating different LLMs—by delivering structured, high-reasoning consensus in under 15 seconds.

### What Makes This Special

What sets Consult Mode apart is **True Multi-Model Collaboration**. Unlike single-model "persona prompting" which is limited by the training data of one architecture, Consult Mode leverages the genuine diversity of Claude, GPT-4, and Gemini debating as peers. It prioritizes **Speed as a Feature** (< 15s target) and provides **Structured, Actionable Output** including confidence scores, reasoning chains, dissenting opinions, and transparent cost attribution, ensuring that the insights genuinely improve decision quality without breaking flow state.

## Project Classification

**Technical Type:** cli_tool
**Domain:** scientific (AI/LLM Orchestration)
**Complexity:** medium
**Project Context:** Brownfield - extending existing system

The project is classified as a **CLI Tool** within the **Scientific/AI domain**, reflecting its focus on multi-agent reasoning and decision modeling. The complexity is rated as **Medium** due to the technical challenges of parallel provider orchestration, time-boxed consensus synthesis, and the requirement for low-latency response times across multiple LLM infrastructures.

## Success Criteria

### User Success

Success is defined by the seamless preservation of "flow state." The user should feel that consulting multiple world-class AI models is as low-friction as a single local command. Winning looks like:
- **Zero Context-Switching:** 80%+ of consultations are invoked via CLI without leaving the development environment (e.g., Claude Code session).
- **Cognitive Relief:** The user trusts the Conclave to catch "blind spots" in architectural and security decisions that single-model reasoning would miss.
- **Habitual Integration:** The tool becomes a daily utility, used 5+ times per day for non-trivial decisions.

### Business Success

As a dogfooding-driven personal tool, business success is measured by the return on investment in development time versus manual orchestration savings:
- **Validation:** Successful 30-day trial proving the tool is indispensable for the primary user's (Benlamm) multi-project workflow.
- **Operational Efficiency:** Replacing 1.5–3 hours of weekly manual AI orchestration with automated consultations.
- **Foundation for Growth:** Establishing a robust enough core that the tool can be shared with a peer group or serve as a backend for future AI-integrated applications.

### Technical Success

- **Parallelism & Latency:** Successful concurrent orchestration of 3+ LLM providers (Anthropic, OpenAI, Google) with a median response time (p50) < 12 seconds.
- **Reliability:** A failure rate of < 2% across all API calls, including graceful handling of individual provider timeouts.
- **Cost Efficiency:** Maintaining an average cost per consultation of < $0.10 through optimized model selection and context management.
- **Structured Data:** Every consultation generates a valid, schema-compliant JSON artifact for logging and potential future automation.

### Measurable Outcomes

- **North Star:** 50%+ of consultations result in a changed or significantly improved technical decision.
- **Speed:** 90% of all queries completed in under 15 seconds.
- **Budget:** Monthly API spend for Consult Mode capped at $20–$25.

## Product Scope

### MVP - Minimum Viable Product

- **CLI Command:** `llm-conclave consult "question"` with explicit file context via `--context`.
- **Fixed Expert Trio:** A specialized panel consisting of a Security Expert, Architect, and Pragmatist using diverse models (Claude, GPT-4o, Gemini).
- **Fast Consensus Engine:** A time-boxed (2-round max) parallel execution orchestrator.
- **Automated Logging:** JSON-LD structured logs for every session.
- **Cost Dashboard:** A `consult-stats` command to track usage and spending.

### Growth Features (Post-MVP)

- **Resume & Continuation:** Ability to ask follow-up questions to previous consultations or resume interrupted sessions.
- **Template Library:** Pre-defined runbooks for common tasks (e.g., `code-review`, `security-audit`).
- **Rich Transcripts:** Exporting consultations to Markdown, HTML, or signed JSON artifacts.
- **Intelligent Context:** Basic relevance-based context pruning to save tokens.

### Vision (Future)

- **Native Claude Code Integration:** Deep integration allowing Claude Code to "call for help" from the Conclave automatically.
- **Web UI Dashboard:** A visual interface for browsing history, costs, and multi-model debate transcripts.
- **Embedding-backed RAG:** Full project memory allowing consultations over massive codebases without manual file selection.

## User Journeys

**Journey 1: Benlamm - Preserving the Flow State**
Benlamm is deep in a 4-hour coding session on "HomeBay," his SaaS auction platform. He hits a complex architectural fork: "Should I use OAuth 2.0 or JWT tokens for this microservice?" Usually, this means stopping, opening three browser tabs (Claude, ChatGPT, Gemini), and manually orchestrating a 20-minute debate. His flow state is shattered. 

Instead, he stays in his terminal and types `llm-conclave consult "OAuth vs JWT for microservice auth?" --context src/auth.ts`. Ten seconds later, a structured report appears. It highlights a security risk in JWT he hadn't considered, backed by a multi-model consensus. He makes the decision, enters the fix, and never leaves the terminal.

**Journey 2: Ari - The Heritage Scholar (Super OCR)**
Ari is digitizing a rare 18th-century Hebrew manuscript. The scans are grainy and the ink is faded; standard OCR tools fail completely. He faces a smudgey line that could mean two very different things. He provides the raw text fragment to the Conclave. 

The models debate: Claude identifies a biblical allusion, GPT-4o recognizes a common 1700s printing error, and Gemini cross-references the grammar with historical literature. They provide a high-confidence consensus on the correct spelling. Ari finishes a page in an hour instead of a day, transforming "unreadable" history into searchable data.

**Journey 3: The AI Assistant - Programmatic Consultation**
Claude Code is tasked with "Refactor the authentication module." It encounters a security trade-off it isn't authorized to decide on its own. It invokes `llm-conclave consult` as a tool. 

The Conclave returns a JSON-LD object. Claude Code parses the `consensus` and `recommendation` fields, understands the `reasoning` provided by the Architect and Security Expert agents, and implements the code changes with a comment: "Implemented per Conclave consensus (85% confidence)."

### Journey Requirements Summary

- **High-Speed Execution:** < 15s response time to support developer flow.
- **Specialized Personas:** Ability to load linguistic or historical experts for "Super OCR" tasks.
- **Machine-Readable Output:** JSON-LD support for programmatic invocation by AI agents.
- **Context Injection:** Robust flag support for passing files and snippets into the consultation.
- **Consensus Logic:** Differentiated consensus modes (e.g., "Fast" for dev vs. "Accurate" for scholarly work).

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. True Multi-Model Consensus (Architectural Diversity)**
The system challenges the standard "persona prompting" pattern by utilizing genuinely different LLM architectures (e.g., Anthropic's Claude, OpenAI's GPT-4, Google's Gemini) to debate the same problem. This leverages the unique training biases and reasoning strengths of each foundation model to reduce hallucinations and uncover blind spots that a single model architecture might miss.

**2. High-Frequency Intelligence (Speed as a Feature)**
By targeting a sub-15-second response time for multi-agent consensus, the tool redefines multi-agent systems from "background batch processes" to "interactive thought partners." This enables a new workflow where developers can "consult" a committee of experts without breaking their cognitive flow state.

**3. The "Super OCR" Pattern (Linguistic Disambiguation)**
Applying multi-model consensus to the domain of optical character recognition and historical text reconstruction. Instead of visual pattern matching alone, the system uses semantic, historical, and grammatical consensus to disambiguate unclear text, effectively "reading" illegible documents through context.

### Market Context & Competitive Landscape

Currently, the market is bifurcated between:
- **Fast Single-Model Tools:** (ChatGPT, Claude.ai) Excellent speed but limited to one reasoning perspective.
- **Slow Multi-Agent Frameworks:** (AutoGen, LangChain) Powerful but typically slow, complex, and designed for autonomous task execution rather than rapid consultation.

**llm_conclave** occupies a novel "Rapid Consultation" niche: faster than frameworks, but deeper than single-model chats.

### Validation Approach

**Qualitative "Aha!" Metrics:**
For the MVP, validation is user-centric:
- Does the user accept the consensus recommendation over their initial intuition?
- Does the "Super OCR" output provide a readable text where standard tools failed?

**Future Benchmarking:**
Post-MVP, a formal benchmarking suite will be developed to quantitatively measure:
- Decision quality improvement (blind testing against single-model outputs).
- Linguistic accuracy rates on standardized historical datasets.

### Risk Mitigation

**Consensus Latency Risk:**
If network latency prevents sub-15s consensus, the fallback is a "Fastest Responder" mode where the first high-quality answer is presented while others stream in, or a "Tiered Consensus" where faster models provide an initial take.

**Cost/Value Mismatch:**
If the cost of 3x inference doesn't yield 3x value for simple queries, the mitigation is user education on "when to consult" vs "when to ask," and potentially auto-downgrading to cheaper models for simpler prompts.

## CLI Tool Specific Requirements

### Project-Type Overview

llm_conclave is a command-line utility designed for both interactive human use and programmatic invocation by AI agents. As a CLI tool, its primary value lies in speed, reliability, and the ability to integrate seamlessly into a terminal-based development workflow without requiring a GUI.

### Technical Architecture Considerations

#### Command Structure & Interface
- **Primary Command:** `llm-conclave consult <question>`
- **Flags:**
  - `--context <files>`: Explicitly provide file paths for analysis.
  - `--mode <explore|converge>`: Select between idea generation (Divergent) and precision consensus (Convergent).
  - `--verbose`: Display full agent-to-agent reasoning chains.
  - `--format <json|markdown>`: Toggle between human-readable and machine-readable output.

#### Output Formats & Scripting Support
- **Human-Readable:** Default output is a clean, formatted Markdown summary with ANSI color support for different agent perspectives.
- **Machine-Readable:** A `--format json` flag will provide a valid JSON-LD object, allowing tools like Claude Code or `jq` to parse the consensus, confidence score, and specific recommendations for downstream automation.

#### Configuration & Environment
- **API Key Management:** Uses the existing `.env` and `ConfigCascade` system to manage keys across 5+ providers.
- **Shell Integration:** Designed to work within any standard terminal (bash, zsh, fish) and support stdin piping (e.g., `cat doc.md | llm-conclave consult "summary"`).

### Implementation Considerations

- **Dual-Mode Orchestration:** The `ConsultOrchestrator` will support two distinct operational modes:
    1.  **Explore Mode (Divergent):** Uses "Yes, And..." prompts and a "Librarian" synthesis to maximize solution surface area.
    2.  **Converge Mode (Convergent):** Uses "No, Because..." adversarial prompts and an "Arbitrator" synthesis to drill down to a single truth.
- **Interactive Debate Protocol:** Regardless of mode, the system enforces a 4-step pipeline:
    1.  **Independent Analysis:** Parallel generation of initial positions.
    2.  **Synthesis Round:** Shared context creation.
    3.  **Cross-Examination:** Agents explicitly critique or build upon peer outputs.
    4.  **Final Verdict:** Synthesis of the debate into a final JSON artifact.
- **Quality Tracking:** The JSON output will explicitly track "Value Added by Debate" (e.g., did an agent change their mind? did a new insight emerge?).
- **Logging:** All consultations must be logged to a local file (`~/.llm-conclave/consult-logs/`) for future auditing and the `consult-stats` dashboard.

## Functional Requirements

### Consultation Orchestration (The Core Engine)
- **FR1:** The system can execute a multi-round consultation between 3+ distinct LLM agents.
- **FR2:** The system can run agents in parallel for the initial analysis phase to minimize total latency.
- **FR3:** The system can synthesize the output of all agents into a unified "Debate Context."
- **FR4:** The system can force agents to critique peer outputs based on specific adversarial or constructive prompts.
- **FR5:** The system can operate in a **Convergent Mode** (`converge`) that uses "No, Because..." prompts to drill down to a single definitive answer.
- **FR6:** The system can operate in an **Exploration Mode** (`explore`) that uses "Yes, And..." prompts to preserve and catalog a diverse menu of ideas.
- **FR7:** The system can dynamically terminate a consultation once a user-defined confidence threshold is met or a maximum round limit is reached.
- **FR8:** The system can track and report "Value Added by Debate" by comparing agent positions across rounds.

### CLI Interface & Interaction
- **FR9:** Users can invoke a consultation via a single CLI command (`consult`).
- **FR10:** Users can provide explicit file or text context using a command-line flag (`--context`).
- **FR11:** Users can select the operational mode (`explore` or `converge`) via a command-line flag.
- **FR12:** The system can stream the progress of the multi-agent debate to the terminal in real-time.
- **FR13:** Users can specify the desired output format (`markdown` or `json`) via a command-line flag.
- **FR14:** The system can accept input via standard input (stdin) piping.

### Data & Output Handling
- **FR15:** The system can generate a human-readable Markdown summary including agent perspectives and consensus results.
- **FR16:** The system can generate a machine-readable JSON-LD object containing all consultation metadata.
- **FR17:** The system can log all consultation sessions (inputs, rounds, results, costs) to a local file system.
- **FR18:** The system can calculate and display the total token usage and USD cost for each consultation.
- **FR19:** The system can identify and highlight dissenting opinions in the final consensus report.

### Persona & Context Management
- **FR20:** The system can load specialized expert personas (e.g., Security Expert, Hebrew Linguist) based on task classification.
- **FR21:** The system can detect when a user is working on a "Brownfield" project and automatically biased its reasoning toward existing project documentation.
- **FR22:** The system can persist session state to allow for future "Resume & Continuation" features (Post-MVP).

### Analytics & Reporting
- **FR23:** Users can view a dashboard of usage, performance, and cost analytics via a CLI command (`consult-stats`).
- **FR24:** The system can report confidence scores for consensus results to indicate certainty level.

## Non-Functional Requirements

### Performance & User Control
- **NFR1 (Soft Timeouts):** The system shall not enforce absolute hard timeouts. Instead, it will use a **60-second Interactive Pulse**. If a round exceeds 60 seconds, the system must ask the user: *"Still waiting on [Agent Name]. Continue waiting? [Y/n]"*.
- **NFR2 (Latency Visibility):** The system must provide real-time feedback on which agent is currently processing to prevent the terminal from appearing "hung."

### Reliability & Resilience
- **NFR3 (Smart Provider Substitution):** In the event of a provider failure (e.g., API timeout or 5xx error), the system must not fail the consultation. Instead, it must offer the user a substitution: *"Gemini is unavailable. Switch to xAI (Grok) for this agent? [Y/n/Fail]"*.
- **NFR4 (Session Persistence):** The system must save intermediate "Partial Consensus" artifacts. If the user eventually kills a long-running session, they should still be able to access the completed work from earlier rounds.

### Security & Privacy
- **NFR5 (Local Context Scrubbing):** The CLI shall implement a regex-based **Sensitive Data Filter** to detect and mask common patterns (API keys, passwords, SECRET_KEY) in the `--context` before transmission to external providers.
- **NFR6 (Auditability):** Every consultation log must include the exact **Prompt Version** used for each debate phase to ensure that changes in reasoning quality can be traced back to prompt engineering.

### Cost Management
- **NFR7 (Informed Consent):** For large contexts (>10k tokens), the system must provide a pre-flight cost estimate. The system will **not** block execution based on cost, but will wait for user confirmation: *"Estimated cost is $0.45. Proceed? [Y/n]"*.
- **NFR8 (Token Efficiency):** The system must support **Token-Efficient Debate**. In the debate rounds (Phase 2 & 3), agents should receive condensed summaries of peer outputs rather than full verbatim histories unless the user explicitly requests `--verbose`.

### Testability
- **NFR9 (Ground Truth Benchmarking):** The system must include a `benchmark` mode that allows it to run against "Known Good" historical transcriptions (Super OCR) to calculate and report accuracy metrics.