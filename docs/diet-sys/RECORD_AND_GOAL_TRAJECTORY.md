# Record and goal trajectory contract

Numeric and Checklist sections each own their day/week/month period, date, and CORE/SECONDARY/OPTIONAL filters. A change in one section never changes the other.

Checklist saves update the local cell immediately. Writes to different cells run independently; writes to the same cell preserve click order. A failed latest write restores the last confirmed value and reports an error. Checklist saves do not reload the full dataset or disable other cells.

`DailyCheck.state` supports `SUCCESS`, `FAILURE`, `MISSING` (no result), and `UNRECORDED` (기록 못함). The latter is explicitly selected individually or for selected visible cells. Statistics expose a separate `unrecorded` count and exclude those cells from both the missing count and success-rate denominator, including when missing entries are otherwise included. All-excluded periods have no rate.

`DELETE /api/diet/items/{id}` continues to set `active=false`: checks and challenge memberships remain. The Record management UI confirms this action and permits reactivation through editing.

`WeightGoal` adds nullable `baselineDate` and `baselineWeight`. Both are supplied together; weight is positive and targetDate must follow baselineDate. V41 leaves existing goals without invented baselines. Their horizontal reference levels remain, but planned trajectories are skipped until configured.

Each valid goal has an independent planned trajectory from (baselineDate, baselineWeight) to (targetDate, targetWeight), linearly interpolated in UTC date time. It is clipped to that interval, never extrapolated or fitted to actual measurements. The same shared chart is used by Home and Progress. Existing visibility controls apply by goal kind. Actual weights, moving averages, daily entered target values, and plan series stay distinct.
