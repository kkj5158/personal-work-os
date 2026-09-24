package com.kafka.backend.money;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.kafka.backend.money.MoneyTypes.*;

/** Pure proposal boundary: callers supply only one owner's observations and account registry.
 * A proposal never writes a ledger entry. Account ownership and source exclusivity are enforced
 * again when persisted. Supports two-sided, single-notification and auxiliary evidence alike.
 */
public interface MoneyTransferMatcher {
    enum Disposition { PROPOSED_TRANSFER, REVIEW_REQUIRED, NO_MATCH, AUXILIARY }
    record Context(List<MoneyAccount> accounts, List<ParseAttempt> attempts,
                   List<MoneyTransaction> existingTransactions) {}
    record Proposal(Disposition disposition, TransactionInput transaction, UUID existingTransactionId,
                    List<TransactionSource> sources, Map<String,Object> evidence) {}
    List<Proposal> propose(Context context);
}
