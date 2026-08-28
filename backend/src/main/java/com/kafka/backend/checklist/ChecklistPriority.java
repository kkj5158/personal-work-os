package com.kafka.backend.checklist;

/**
 * CORE items are visually emphasized more strongly than SECONDARY ones, but
 * both use identical binary achievement semantics — there is no numeric
 * weighting difference between them anywhere in achievement calculation.
 */
public enum ChecklistPriority {
    CORE,
    SECONDARY
}
