package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
class VerifiedMoneyMatcherTest {
    final VerifiedMoneyTransferMatcher matcher=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC));
    List<MoneyTransferMatcher.Proposal> propose(List<MoneyRawNotification> raws){return matcher.propose(new MoneyTransferMatcher.Context(accounts(),raws.stream().map(VerifiedMoneyFixtures::attempt).toList(),List.of()));}
    @Test void allTenScenariosPreserveEighteenSourcesAndTwentySides(){
        var a=accounts();var raws=audit();var p=matcher.propose(new MoneyTransferMatcher.Context(a,raws.stream().map(VerifiedMoneyFixtures::attempt).toList(),List.of()));
        assertThat(p).hasSize(10).allMatch(x->x.disposition()==MoneyTransferMatcher.Disposition.PROPOSED_TRANSFER);
        int[][] routes={{1,0},{0,1},{1,2},{2,3},{3,0},{0,3},{4,3},{3,4},{2,0},{0,5}};
        for(var route:routes)assertThat(p).anyMatch(x->x.transaction().fromAccountId().equals(a.get(route[0]).id())&&x.transaction().toAccountId().equals(a.get(route[1]).id()));
        assertThat(p.stream().flatMap(x->x.sources().stream()).map(TransactionSource::rawEventId)).containsExactlyInAnyOrderElementsOf(raws.stream().map(MoneyRawNotification::id).toList());
    }
    @Test void collisionUnknownArchivedAndProviderIsolation(){
        var resolver=new MoneyAccountResolver();var accounts=new ArrayList<>(accounts());
        assertThat(resolver.resolve(accounts,"KAKAO","입출금통장(8557)").resolved()).isTrue();
        accounts.add(account("KAKAO","Other",AccountRole.SPENDING,null,"8557"));
        assertThat(resolver.resolve(accounts,"KAKAO","Unknown(8557)").reason()).isEqualTo("AMBIGUOUS_ACCOUNT");
        assertThat(resolver.resolve(accounts,"KAKAO","입출금통장(8557)").resolved()).isTrue();
        assertThat(resolver.resolve(accounts,"IBK","급여통장(1228)").resolved()).isFalse();
        assertThat(resolver.resolve(List.of(),"KAKAO","입출금통장(8557)").resolved()).isFalse();
        assertThat(resolver.resolve(accounts,"KAKAO","입출금통장(9999)").resolved()).isFalse();
        var a=accounts.get(3);var archived=new MoneyAccount(a.id(),a.provider(),a.displayName(),a.role(),a.maskedReference(),a.suffix(),true,a.version());
        assertThat(resolver.resolve(List.of(archived),"KAKAO","입출금통장(8557)").resolved()).isFalse();
    }
    @Test void amountAndTimeWithoutCounterpartyEvidenceCannotMatch(){
        var a=side("IBK",Direction.OUT,1000,"16:54:36",null,"<A>");var b=side("SHINHAN",Direction.IN,1000,"16:54:39","급여통장(1228)","<B>");
        assertThat(propose(List.of(a,b))).allMatch(p->p.disposition()==MoneyTransferMatcher.Disposition.REVIEW_REQUIRED);
    }
    @Test void simultaneousDistinctPairsMatchOnlyTheirCounterpartEvidence(){
        var raws=List.of(side("IBK",Direction.OUT,1000,"16:54:36",null,"<A>"),side("SHINHAN",Direction.IN,1000,"16:54:39","급여통장(1228)","<A>"),
            side("WOORI",Direction.OUT,1000,"16:54:36",null,"<B>"),side("KAKAO",Direction.IN,1000,"16:54:39","입출금통장(8557)","<B>"));
        assertThat(propose(raws)).hasSize(2).allMatch(p->p.transaction()!=null);
        var ambiguous=List.of(raws.getFirst(),raws.get(1),side("KAKAO",Direction.IN,1000,"16:54:39","입출금통장(8557)","<A>"));
        assertThat(propose(ambiguous)).hasSize(3).allMatch(p->p.transaction()==null);
    }
    @Test void timeBoundaryReverseAndMissingComplement(){
        var out=side("IBK",Direction.OUT,1000,"16:54:36",null,"<OWNER>");
        var boundary=side("SHINHAN",Direction.IN,1000,"16:54:46","급여통장(1228)","<OWNER>");
        assertThat(propose(List.of(out,boundary))).hasSize(1).allMatch(p->p.transaction()!=null);
        var late=side("SHINHAN",Direction.IN,1000,"16:54:46.001","급여통장(1228)","<OWNER>");
        assertThat(propose(List.of(out,late))).allMatch(p->p.transaction()==null);
        assertThat(propose(List.of(out))).singleElement().satisfies(p->assertThat(p.disposition()).isEqualTo(MoneyTransferMatcher.Disposition.REVIEW_REQUIRED));
        var recent=attempt(out);var waiting=new ParseAttempt(recent.id(),recent.rawEventId(),recent.parserKey(),recent.parserVersion(),recent.status(),null,recent.candidate(),NOW.minusSeconds(119));
        assertThat(matcher.propose(new MoneyTransferMatcher.Context(accounts(),List.of(waiting),List.of()))).isEmpty();
    }
    @Test void externalFallbackOnlyAfterWaitAndExplicitEvidence(){
        var out=side("IBK",Direction.OUT,5800,"16:54:36",null,"카드결제 <MERCHANT>");
        assertThat(propose(List.of(out))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
        var in=side("SHINHAN",Direction.IN,1000,"16:54:36","급여통장(1228)","급여 <EMPLOYER>");
        assertThat(propose(List.of(in))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.INCOME));
    }
    @Test void shinhanSavingsRuleRejectsLooseTimingAndCompetingSavings(){
        var out=side("SHINHAN",Direction.OUT,1000,"17:00:15.186","급여통장(1228)","<OWNER>");
        var late=side("SHINHAN",Direction.IN,1000,"17:00:16.187","정기적금(6017)","");
        assertThat(propose(List.of(out,late))).allMatch(p->p.transaction()==null);
        var in=side("SHINHAN",Direction.IN,1000,"17:00:15.203","정기적금(6017)","");
        var duplicate=side("SHINHAN",Direction.IN,1000,"17:00:15.204","정기적금(6017)","");
        assertThat(propose(List.of(out,in,duplicate))).allMatch(p->p.transaction()==null);
    }
    @Test void wrongAmountAndSameOwnedAccountNeverTransfer(){
        var out=side("SHINHAN",Direction.OUT,1000,"16:54:36","급여통장(1228)","<OWNER>");
        var in=side("SHINHAN",Direction.IN,1000,"16:54:37","급여통장(1228)","<OWNER>");
        assertThat(propose(List.of(out,in))).allMatch(p->p.transaction()==null);
        var other=side("IBK",Direction.IN,1001,"16:54:37",null,"<OWNER>");
        assertThat(propose(List.of(out,other))).allMatch(p->p.transaction()==null);
    }
    @Test void catalogIbkToShinhanSavingsUsesExplicitProductEvidence(){
        var out=side("IBK",Direction.OUT,1000,"14:30:05",null,"신한 상품입금");
        var in=side("SHINHAN",Direction.IN,1000,"14:30:06","정기적금(6017)","");
        assertThat(propose(List.of(out,in))).singleElement().satisfies(p->{assertThat(p.transaction().type()).isEqualTo(TransactionType.TRANSFER);
            assertThat(p.evidence().get("rule")).isEqualTo("EXPLICIT_SAVINGS_PRODUCT_DEPOSIT");});
    }
    @Test void auxiliaryOnlyLinksExactExplicitRouteOnce(){
        var accounts=accounts();var raw=raw("KAKAO","출금 1,000원","입출금통장(8557) → 자유적금(4851) 잔액 9,000원",NOW.minusSeconds(300));
        var tx=matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(attempt(raw)),List.of())).getFirst().transaction();
        var existing=new MoneyTransaction(UUID.randomUUID(),tx.type(),tx.fromAccountId(),tx.toAccountId(),tx.amount(),tx.currency(),tx.occurredAt(),null,tx.sources());
        var aux=attempt(raw("KAKAO","적금 입금 성공","자유적금(4851)에 1,000원이 입금되었어요!",NOW.minusSeconds(299)));
        var p=matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(aux),List.of(existing)));
        assertThat(p).singleElement().satisfies(x->{assertThat(x.disposition()).isEqualTo(MoneyTransferMatcher.Disposition.AUXILIARY);assertThat(x.transaction()).isNull();});
        var competing=new MoneyTransaction(UUID.randomUUID(),tx.type(),tx.fromAccountId(),tx.toAccountId(),tx.amount(),tx.currency(),tx.occurredAt(),null,tx.sources());
        assertThat(matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(aux),List.of(existing,competing))))
            .singleElement().satisfies(x->assertThat(x.disposition()).isEqualTo(MoneyTransferMatcher.Disposition.REVIEW_REQUIRED));
        var linked=new MoneyTransaction(existing.id(),tx.type(),tx.fromAccountId(),tx.toAccountId(),tx.amount(),tx.currency(),tx.occurredAt(),null,
            java.util.stream.Stream.concat(tx.sources().stream(),p.getFirst().sources().stream()).toList());
        assertThat(matcher.propose(new MoneyTransferMatcher.Context(accounts,List.of(aux),List.of(linked)))).isEmpty();
    }
}
