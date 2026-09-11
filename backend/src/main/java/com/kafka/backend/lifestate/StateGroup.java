package com.kafka.backend.lifestate;

/** Fixed V1 state vocabulary — locked product policy, not a clinical/diagnostic taxonomy. */
public enum StateGroup {
    LOW,
    HIGH,
    MIXED,
    UNCLEAR,
    STABLE
}
