# POS STUDY — Education and Question-Authoring Policy V1.0

Date: 2026-11-22 (KST)
Status: **P01–P10 APPROVED BY OWNER; G01/G02 APPROVED FOR GOLDEN V2**
Application: existing POS STUDY V3.2 codebase, not a new model or engine.
Golden example revisions: **G01 targeted H1–H3 and G02 modelAnswer/H3 APPROVED**; exact contents and parent hash are frozen in `POS_STUDY_GOLDEN_DATASET_V2_APPROVED.json`. Semantic QA of V2 is **NOT RUN**; approval does not guarantee a future model verdict.

## Authority and precedence

The owner decides pedagogical policy and approves any changes to positive Golden examples. ChatGPT can propose drafts and explain conflicts. Codex implements the approved policy and performs evidence-based QA but must not change it independently. Code-level formatting rules may be repaired to match this policy, but meaningful pedagogical disagreements remain pending owner review. Previously published learning records and approvals are immutable without a separate authorized operation.

## P01 — Learning goal and difficulty

- Knowledge difficulty target: **3/5**.
- Overall higher-order reasoning goal: **4/5**. This is not a requirement that every MCQ individually be at 4/5.
- Favor clear Korean, practical application, explicit evidence, meaningful decisions and truthful uncertainty over inflated length or artificial puzzle complexity.

## P02 — Daily workbook shape

- Required portion: **five MCQs and one essay**, target **15 minutes**.
- Optional extension: **two case-analysis questions**, additional target **30 minutes**.
- Each question: **three progressive hints**.
- Daily workbook: **ten distinct optional follow-up/reflection questions**.
- Report estimated completion time separately from personally measured completion time; do not claim user timing without observation.

## P03 — MCQ cognitive distribution (Option B)

- 1 foundational concept-application MCQ: reasoning demand **2–3/5**.
- 2 cause-analysis MCQs: reasoning demand **3/5**.
- 2 advanced comparison/evidence-integration MCQs: reasoning demand **4/5**.
- Require one justified best option under the stated premises and decision criteria. Plausible distractors; do not accept an unsupported uniqueness claim. A single-clue shortcut is unacceptable for an advanced-reasoning slot but not an automatic reason to reject a basic application question that meets its assigned objective.
- Do not substitute verbose `reasoningMoves` text for actual learner effort. Provide a slot-specific rubric rather than a universal 4/5 gate.

## P04 — Essay assessment (Option B)

- Assess **concept understanding, evidence use, reasoning process and justified response design**. The model answer is an example, not the only acceptable phrasing.
- Credit substantively supported alternative or conditional conclusions where evidence is incomplete. An unanswered fact is UNKNOWN, not proof of a specific outcome; a generic "cannot tell" without the missing fact and a meaningful next verification is insufficient.
- Do not demand a particular source name, layout, wording or format unless that format is itself a necessary learning objective stated in the question.
- No numeric scoring weights have been approved; the earlier percentages were illustrative only.

## P05 — Progressive hints (Option B)

- H1: broad orientation/question; do not directly name the decisive missing datum, winning criterion or correct answer.
- H2: which evidence and trade-offs to compare; no one-sided endorsement of the correct option.
- H3: executable sequence/checklist for self-solving; do not hand over the finished reasoning, exact answer, option ID or a fill-in-the-answer phrase.
- The student may reveal one hint at a time. Preserve existing persisted hint-state semantics.
- Hints may become progressively useful; do not reject an otherwise valid hint merely because it includes legitimate, non-decisive guidance. Evaluate total leakage against the specific stem/options and intended difficulty level.

## P06 — Textbook evidence use (Option B)

- Bind questions to concept-complete source bundles: explanation, relevant examples, preconditions and scope, with exact material version/page/section/quote provenance. Code listings are valid evidence for code-reading objectives; they need surrounding context when conclusions depend on it.
- Hypothetical scenario facts are allowed if explicitly student-visible and consistent; distinguish them from claims of real source facts.
- A correct verbatim quotation alone does not prove an entire answer. Every decision-bearing claim in explanation/rubric must be supportable from student-visible facts plus authorized textbook principles.
- If the source cannot support the proposed objective, adapt the objective or select another authorized section before generation. Never invent source evidence or silently expand approved chapter bounds.

## P07 — Golden Dataset governance (Option B)

- Preserve original positive and negative examples, original hashes and history unchanged.
- Current positive labels denote prior authoring-style approval, not guaranteed acceptance by all future evaluators. Semantic-review disagreements are evidence to inspect, not authority to overwrite user approval.
- Proposed revisions must show exact before/after stems, answer, hints, rubric, reasoning-level changes and the reviewer evidence. Only owner-approved revisions become Golden V2 positive exemplars; do not insert them as approved automatically.

## P08 — Quality-review authority (Option B)

- Deterministic validators enforce identity, schema, source binding, actual citations, number of hints/rubric/citations, owner/privacy/approval boundaries and exact versioning.
- Independent AI review tests groundedness, factual/conditional inference, distractor plausibility, actual reasoning demand by slot, ambiguity and hint leakage. A separate blind solver sees only student-visible evidence.
- Record item-level verdict, exact evidence, uncertainty, model and call metadata. Disputed evaluations go to owner review; do not lower quality gates to force success, nor automatically reject owner-approved style exemplars without surfacing a reasoned conflict.
- Prior approved examples must be reviewed under the same **relevant** slot objective and output contract; prevent scoring a single-choice learner as though the learner must submit an essay.

## P09 — Generation/retry and subscription usage (Option B)

- Remove **engine-owned aggregate campaign call/token stop limits**, but do not bypass actual Codex subscription quotas or auto-activate any paid API, purchase credits or alternate billing provider.
- Keep bounded **per-item** initial generation plus **two repairs** (three tries maximum) and protected accepted-item content. Do not reset item attempts or historical usage by creating a new job; use an explicit, audited follow-up if needed.
- Preserve request/receipt idempotency, no calls after server STOP, per-item evidence and usage ledger. Detect and stop repeat-no-progress cycles; report the blocker rather than infinite generation.
- An owner-authorized aggregate-limit removal does not waive per-item anti-loop safeguards.

## P10 — DEV, READY and publication (Option B)

- Code can be deployed to **feature-flagged, owner-scoped DEV** after security/regression/compatibility checks even if workbook quality is pending. No PROD deployment authorized by this policy.
- A question needs individual quality acceptance; a workbook is READY only when all **5+1+2** items and workbook-level composition, hints, citations and **10 follow-ups** pass.
- Only the owner can approve **that exact workbook ID and version** for publication. Any change to student-visible content or keys after approval requires a new reviewable version. No automatic publication, mailing or weekly scheduling.
- A private draft/PDF preview is not a published workbook; no real learner attempt or approval should be inferred from preview interactions.

## Required implementation boundaries

- Source of truth: the approved policy text and owner-approved, versioned Golden examples. Golden V2 content has owner approval. Current or future semantic-review disagreements must still be documented with evidence; they are not permission to change approved content or override a quality gate.
- Preserve existing V3.2 infrastructure and the already accepted three draft slots; do not rewrite earlier passing items merely to force a new score. Keep the old, consumed 40-call/966,552-token QA ledger intact.
- Never share raw copyrighted textbook text, private answer keys, original workbook candidate JSON, personal identifiers, tokens or credentials in GitHub or sanitized Drive evidence.
- Engineering acceptance, educational item acceptance, workbook READY, owner approval, and production release are distinct states.

## Implementation handoff and remaining verification

- G01: owner approved targeted H1–H3 revision; preserve the MCQ prompt, choices, answer B and all other fields.
- G02: owner approved targeted modelAnswer and H3 revision; preserve essay prompt, H1–H2 and other fields.
- The exact private item-level reviewer evidence should be inspected if accessible. The earlier 0/2 semantic result is historical, not a result for approved V2.
- Apply Policy V1.0 as the authoritative educational contract, and rerun V2 semantic validation without silently forcing PASS. If a conflict remains, record exact excerpts (privately), explain the conflict, and request a focused owner decision.
- Preserve the existing V3.2 accepted three draft items and the old 40-call / 966,552-token campaign ledger. A historical BLOCKED job is immutable; use explicitly linked continuation with preserved counters.
- Additional Golden breadth and numeric assessment weights remain **not approved**. No new pedagogical policy decisions are delegated to Codex.
