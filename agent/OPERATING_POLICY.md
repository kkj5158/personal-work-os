# Personal Work OS — Agent Operating Policy

## Project Context

Personal Work OS is a single-owner personal project.

This is not a multi-team enterprise system.

Optimize for:

- fast iteration
- low token usage
- practical correctness
- reversible incremental changes
- autonomous execution
- minimal unnecessary ceremony

Small, reversible mistakes are acceptable when they can be detected and corrected quickly.

Do not add unnecessary process, abstraction, validation, documentation,
repository exploration, or confirmation solely for defensive completeness.

Preserve strong safeguards for operations involving credible risk of:

- production data loss
- irreversible changes
- destructive schema/data operations
- security or authorization failures
- secret exposure
- migration conflicts
- destruction of existing user work

Normal reversible implementation uncertainty is not a reason to stop.

---

## Execution Style

Prefer execution over narration.

For normal tasks:

1. Inspect the current Git state.
2. Read only relevant documentation.
3. Inspect the smallest relevant code surface.
4. Implement the requested behavior.
5. Run risk-appropriate validation.
6. Commit/integrate according to Git policy.
7. Deploy when deployment is part of the approved task.
8. Report the result concisely.

Do not repeatedly restate the task or plan.

Do not narrate routine searches, file reads, or test commands.

Provide intermediate reports only when:

- a meaningful milestone is reached,
- the task is blocked,
- a genuine user decision is required,
- or the user explicitly requests progress reporting.

---

## Repository Exploration

Use narrow, evidence-driven exploration.

Prefer:

- `rg`
- filename search
- symbol/reference search
- known domain entry points

over broad repository scans.

Open only files likely to participate in the requested behavior.

Expand investigation only when the initial evidence is insufficient.

Do not repeatedly reread unchanged files or documentation within the same session.

Reuse information already verified during the current session.

---

## Documentation Strategy

`/docs` contains service and product knowledge.

Read only documents relevant to the current task.

Do not automatically read all documentation before every task.

Historical files under `/docs/iterations` should only be consulted when
current canonical documents are insufficient.

Update durable documentation only when a change alters:

- product policy
- architecture
- API/domain contract
- persistence/schema behavior
- production environment behavior

Do not create documentation updates for routine implementation details,
temporary debugging, styling-only changes, or obvious bug fixes that simply
restore already documented behavior.

---

## Autonomous Decisions

Resolve ordinary implementation details autonomously.

Do not ask the user to reconfirm:

- requirements explicitly stated in the current task
- decisions already defined by canonical documentation
- reversible technical implementation details
- normal deployment already included in the requested task

Ask only when the decision represents a meaningful new product policy or
a genuine stop condition.

---

## Genuine Stop Conditions

Stop and ask the user when there is:

- a direct conflict between confirmed product policies
- credible production data-loss risk
- an irreversible or destructive migration
- an unexpected Flyway migration version collision
- a meaningful security/authorization problem
- a Git conflict that would require discarding existing user work
- a rollback that may destroy newer user data
- a destructive production operation outside the approved task
- a new meaningful user-visible product decision not covered by existing policy
- ambiguity where a wrong choice would create substantial irreversible work

Normal reversible implementation uncertainty is not a stop condition.

Normal production deployment is not a stop condition when deployment was
explicitly approved as part of the task.

---

## Efficiency Principle

Spend additional time, tokens, and validation effort only when the expected
reduction in meaningful risk justifies the cost.

Prefer the smallest reasonable action that moves the task forward safely.