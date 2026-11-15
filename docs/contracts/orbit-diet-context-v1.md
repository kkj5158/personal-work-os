# ORBIT DIET Context V1 — API Contract

## Scope
Add one read-only ORBIT endpoint over the canonical DIET measurement facts. This is a data projection, **not** an ORBIT chatbot, diagnosis, or additional database.

## Endpoint
`GET /api/orbit/context/get_diet_context?from=YYYY-MM-DD&to=YYYY-MM-DD`

- When both dates are omitted: 14 calendar days including today, in Asia/Seoul.
- When specified: inclusive dates; both must be present; at most 31 days; no future dates.
- Invalid date or range returns HTTP 400 using the existing `InvalidRequestException` handler.
- In production, existing Supabase JWT authentication is required for `/api/**`.
- The owner identity comes from `CurrentUserProvider`, never from a request parameter.
- The only data source is active (`deleted_at is null`) rows in `diet_measurements` for that owner.

## JSON
`schemaVersion: 1`, `source: "diet_measurements"`, `period: {from,to,days,timezone}`, `hasData`, `metrics`, `readings`.

`metrics` contains four stable keys: `weight`, `glucose`, `bloodKetone`, `breathKetone`. Each has `unit`, `samples`, `recordedDays`, `first`, `last`, `change`, and `average`.
- `first` and `last` are `{date,measuredAt,value,slot}` or `null`.
- `change` is last minus first; `average` is the arithmetic average of measurements, rounded to 2 decimal places.
- If there are no observations, `first`, `last`, `change`, and `average` are **null**, never fabricated zeros.
- `readings` contains source facts with `date,measuredAt,metric,slot,value,unit` in chronological order.
- This response does not interpret health values or claim unrecorded days were compliant/non-compliant.

## Boundaries
- No database migrations, writes, external AI calls, or new secrets.
- No sensitive health data in logs, telemetry payloads, or documentation examples.
- The ChatGPT tool integration is separate and is not included in this endpoint change.
- Verify authentication/ownership isolation and a real JSON response in hosted-dev before production release.
