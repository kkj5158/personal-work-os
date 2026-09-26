package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
import static org.assertj.core.api.Assertions.*;
class MoneyImmediateMatcherTest {
 @Test void uniqueComplementPostsImmediatelyAndRepeatedSourceCannotPostAgain(){
  var accounts=accounts();var now=Instant.now();var out=attempt(audit().get(0));var in=attempt(audit().get(1));out=new ParseAttempt(out.id(),out.rawEventId(),out.parserKey(),out.parserVersion(),out.status(),null,out.candidate(),now);in=new ParseAttempt(in.id(),in.rawEventId(),in.parserKey(),in.parserVersion(),in.status(),null,in.candidate(),now);
  var matcher=new VerifiedMoneyTransferMatcher(Clock.fixed(now,ZoneOffset.UTC));assertThat(matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(out),List.of()))).isEmpty();var result=matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(out,in),List.of()));assertThat(result).hasSize(1);var tx=result.getFirst().transaction();assertThat(tx).isNotNull();var posted=new MoneyTransaction(UUID.randomUUID(),tx.type(),tx.fromAccountId(),tx.toAccountId(),tx.amount(),tx.currency(),tx.occurredAt(),null,tx.sources());assertThat(matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(out,in),List.of(posted)))).isEmpty();
 }
 @Test void competingEvidenceRemainsAmbiguousWithoutWaiting(){var rows=audit();var out=attempt(rows.get(0));var in=attempt(rows.get(1));var extra=attempt(side("SHINHAN",Direction.IN,10000,"16:54:39.624","급여통장(1228)","<OWNER>"));var proposals=new VerifiedMoneyTransferMatcher().propose(new MoneyTransferMatcher.Context(accounts(),List.of(out,in,extra),List.of()));assertThat(proposals).hasSize(3).allMatch(p->p.transaction()==null);}
}
