package com.kafka.backend.checklist;

/**
 * The explicit daily result for one (date, item) checklist entry.
 * {@code UNSET} means no result has been recorded yet — distinct from
 * {@code FAIL}, which is an explicit "did not follow this item" action.
 * Only {@code PASS} counts as completed anywhere in analytics.
 */
public enum ChecklistResult {
    UNSET,
    PASS,
    FAIL
}
