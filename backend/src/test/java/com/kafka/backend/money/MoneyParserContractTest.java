package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

class MoneyParserContractTest {
    static List<MoneyFixtures.Fixture> fixtures() throws Exception {return MoneyFixtures.all();}
    @ParameterizedTest @MethodSource("fixtures")
    void sanitizedDocumentShapesNormalizeWithoutGuessingProviderTime(MoneyFixtures.Fixture fixture) {
        var raw=MoneyFixtures.raw(fixture);
        var parser=MoneyFixtures.parser(fixture.provider());
        assertThat(parser.supports(raw)).isTrue();
        var candidate=parser.parse(raw);
        assertThat(candidate.rawEventId()).isEqualTo(raw.id());
        assertThat(candidate.provider()).isEqualTo(fixture.provider());
        assertThat(candidate.direction()).isEqualTo(fixture.direction());
        assertThat(candidate.amount()).isEqualByComparingTo(fixture.amount());
        assertThat(candidate.postBalance()).isEqualTo(fixture.balance());
        assertThat(candidate.providerTimeText()).isEqualTo(fixture.time());
        assertThat(candidate.occurredAt()).isNull();
        assertThat(candidate.accountSuffixHints()).containsExactlyElementsOf(fixture.suffixes());
        assertThat(candidate.parseStatus()).isEqualTo(ParseStatus.REVIEW_REQUIRED);
    }
    @Test void namesAreDataAndSameBankSidesRemainAvailableToFutureMatcher() throws Exception {
        var fixture=fixtures().stream().filter(f->f.key().equals("kakao-favorite-out")).findFirst().orElseThrow();
        var candidate=MoneyFixtures.parser("KAKAO").parse(MoneyFixtures.raw(fixture));
        assertThat(candidate.sourceAccountHint()).isEqualTo("입출금통장(8557)");
        assertThat(candidate.destinationAccountHint()).isEqualTo("최애적금(7530)");
        var original=fixtures().getFirst();
        var changed=new MoneyFixtures.Fixture(original.key(),original.provider(),original.title(),
                original.text().replace("<OWNER>","<COUNTERPARTY>"),original.direction(),original.amount(),original.balance(),original.time(),original.suffixes());
        assertThat(MoneyFixtures.parser("SHINHAN").parse(MoneyFixtures.raw(changed)).amount()).isEqualByComparingTo("2000");
    }
    @Test void matcherBoundaryCanDescribeAuxiliaryLinkWithoutCreatingASecondTransaction() {
        UUID existing=UUID.randomUUID(),raw=UUID.randomUUID();
        MoneyTransferMatcher matcher=context->List.of(new MoneyTransferMatcher.Proposal(MoneyTransferMatcher.Disposition.AUXILIARY,
                null,existing,List.of(new TransactionSource(raw,null,SourceRelationship.AUXILIARY,Map.of("reason","savings-success"))),Map.of()));
        var result=matcher.propose(new MoneyTransferMatcher.Context(List.of(),List.of(),List.of())).getFirst();
        assertThat(result.transaction()).isNull();
        assertThat(result.existingTransactionId()).isEqualTo(existing);
        assertThat(result.sources()).extracting(TransactionSource::rawEventId).containsExactly(raw);
    }
}
