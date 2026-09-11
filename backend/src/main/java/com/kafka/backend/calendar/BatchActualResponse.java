package com.kafka.backend.calendar;

import java.util.List;

/** {@code committed=false} means every item in {@code results} was
 *  validated only — nothing was persisted; fix the invalid rows and
 *  resubmit. {@code committed=true} means every item was created. */
public record BatchActualResponse(boolean committed, List<BatchActualItemResult> results) {
}
