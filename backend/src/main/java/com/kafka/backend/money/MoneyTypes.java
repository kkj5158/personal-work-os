package com.kafka.backend.money;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class MoneyTypes {
    private MoneyTypes() {}
    public enum AccountRole { INCOME_HUB, SPENDING, FIXED_SPENDING, SAVINGS_GATEWAY, SAVINGS, PURPOSE_SAVINGS, PURPOSE_INSTALLMENT, CASH }
    public enum ProcessingState { RECEIVED, PARSED, REVIEW_REQUIRED, PROCESSED, FAILED }
    public enum ParseStatus { PARSED, REVIEW_REQUIRED }
    public enum Direction { IN, OUT }
    public enum TransactionType { INCOME, TRANSFER, EXPENSE, REFUND }
    public enum SourceRelationship { PRIMARY, AUXILIARY }

    public record AccountInput(String provider, String displayName, AccountRole role,
                               String maskedReference, String suffix, String emoji, String imageData, UUID fundingAccountId) {
        public AccountInput(String provider,String displayName,AccountRole role,String maskedReference,String suffix) {
            this(provider,displayName,role,maskedReference,suffix,null,null,null);
        }
    }
    public record AccountUpdate(Long expectedVersion, AccountInput account) {}
    public record ArchiveAccount(Long expectedVersion, Boolean archived) {}
    public record MoneyAccount(UUID id, String provider, String displayName, AccountRole role,
                               String maskedReference, String suffix, boolean archived, long version,
                               String emoji, String imageData, UUID fundingAccountId) {
        public MoneyAccount(UUID id,String provider,String displayName,AccountRole role,String maskedReference,String suffix,boolean archived,long version) {
            this(id,provider,displayName,role,maskedReference,suffix,archived,version,null,null,null);
        }
    }
    public record MoneyRawNotification(UUID id, String sourcePackage, String notificationKey, String deviceId,
                                       String title, String text, String bigText, Instant postedAt, Instant receivedAt,
                                       Map<String,Object> rawPayload, String dedupeKey, ProcessingState state,
                                       long processingVersion, String processingReason) {
        public MoneyRawNotification(UUID id,String sourcePackage,String notificationKey,String deviceId,String title,
                String text,String bigText,Instant postedAt,Instant receivedAt,Map<String,Object> rawPayload,
                String dedupeKey,ProcessingState state,long processingVersion) {
            this(id,sourcePackage,notificationKey,deviceId,title,text,bigText,postedAt,receivedAt,rawPayload,dedupeKey,state,processingVersion,null);
        }
    }
    public record IngestResult(boolean created, MoneyRawNotification notification) {}

    public enum TimeSource { PROVIDER_MINUTE, PROVIDER_SECOND, ANDROID_POSTED_AT }
    /** occurredAt is the lower bound at the stated precision, never an invented precise bank time. */
    public record ParsedCandidate(UUID rawEventId, String provider, Direction direction, BigDecimal amount,
                                  Instant occurredAt, String providerTimeText, String sourceAccountHint,
                                  String destinationAccountHint, List<String> accountSuffixHints,
                                  String counterpartyText, BigDecimal postBalance, String notificationSubtype,
                                  ParseStatus parseStatus, Instant postedAt, Instant providerOccurredAt,
                                  TimeSource timeSource, String parserVersion, Map<String,Object> evidence) {
        // Backwards compatible with Batch 1 persisted candidates and server extensions.
        public ParsedCandidate(UUID rawEventId, String provider, Direction direction, BigDecimal amount,
                Instant occurredAt, String providerTimeText, String sourceAccountHint, String destinationAccountHint,
                List<String> accountSuffixHints, String counterpartyText, BigDecimal postBalance,
                String notificationSubtype, ParseStatus parseStatus) {
            this(rawEventId,provider,direction,amount,occurredAt,providerTimeText,sourceAccountHint,
                    destinationAccountHint,accountSuffixHints,counterpartyText,postBalance,notificationSubtype,
                    parseStatus,null,null,null,null,Map.of());
        }
    }
    public record ParseAttempt(UUID id, UUID rawEventId, String parserKey, String parserVersion,
                               String status, String failureCode, ParsedCandidate candidate, Instant createdAt) {}
    public record TransactionSource(UUID rawEventId, UUID parseAttemptId, SourceRelationship relationship,
                                    Map<String,Object> evidence) {}
    public record TransactionInput(TransactionType type, UUID fromAccountId, UUID toAccountId, BigDecimal amount,
                                   String currency, Instant occurredAt, String counterpartyText,
                                   List<TransactionSource> sources) {}
    public record MoneyTransaction(UUID id, TransactionType type, UUID fromAccountId, UUID toAccountId,
                                   BigDecimal amount, String currency, Instant occurredAt, String counterpartyText,
                                   List<TransactionSource> sources, UUID categoryId, String memo, boolean excluded,
                                   long version, boolean manual, UUID refundOf, UUID mergedInto) {
        public MoneyTransaction(UUID id,TransactionType type,UUID from,UUID to,BigDecimal amount,String currency,Instant at,String cp,List<TransactionSource> sources) {
            this(id,type,from,to,amount,currency,at,cp,sources,null,null,false,0,false,null,null);
        }
    }
}
