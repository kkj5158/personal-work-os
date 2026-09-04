# Personal Work OS — Agent Validation Policy

## Principle

Validation should be proportional to risk.

Use the smallest validation set that provides reasonable confidence.

Do not run broad regression suites solely for ceremony.

---

## Low Risk

Examples:

- isolated UI styling
- copy changes
- simple component behavior
- local state changes
- small bug fixes with no persistence or contract impact

Typical validation:

- inspect affected code
- targeted type/lint check when useful
- targeted test when available
- focused browser/manual smoke test

Full frontend/backend builds are not automatically required.

---

## Medium Risk

Examples:

- business-rule changes
- API contract changes
- persistence behavior
- state-model changes
- functionality shared across Day/Week/Month views
- safe additive migrations

Typical validation:

- relevant automated tests
- affected module build/type check
- focused integration test
- browser QA of changed behavior
- nearby regression checks where propagation is plausible

---

## High Risk

Examples:

- authentication/authorization
- destructive migrations
- production data transformation
- broad shared-domain changes
- operations with credible data-loss risk

Use broader validation.

Apply the stop conditions defined in:

`agent/OPERATING_POLICY.md`

and:

`agent/PRODUCTION_POLICY.md`

---

## Failure Handling

When validation fails:

1. Investigate failures plausibly caused by the current change.
2. Fix failures caused by the current task.
3. Do not automatically repair unrelated pre-existing failures.
4. Record unrelated failures briefly when they do not invalidate the task.
5. Expand validation only when evidence suggests broader impact.

---

## Post-Integration Validation

If merging into the latest `dev` materially changes the effective code,
rerun the smallest relevant validation set.

Do not automatically repeat the complete feature QA if the merge was clean
and unrelated.

---

## Production Smoke Testing

After an approved deployment, perform focused smoke testing.

At minimum confirm:

- application availability
- authentication/access where relevant
- the changed behavior
- critical nearby behavior likely to be affected

Do not perform a full service-wide regression after every minor deployment.

Production permission and deployment workflow are defined by:

`agent/PRODUCTION_POLICY.md`