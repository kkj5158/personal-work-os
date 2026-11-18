package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;

class MoneyNativeReplayParserTest {
 static String nativeJson(String provider,String rows,String opening,String closing){return "{\"formatVersion\":\"BANK_NATIVE_REPLAY_V1\",\"provider\":\""+provider+"\",\"sourceFileSha256\":\""+"a".repeat(64)+"\",\"accountSuffix\":\"123\",\"openingBalance\":"+opening+",\"closingBalance\":"+closing+",\"rows\":["+rows+"]}";}
 static String row(String hash,String at,String precision,int out,int in,int balance,int source){return "{\"rowHash\":\""+hash.repeat(64)+"\",\"occurredAt\":\""+at+"\",\"precision\":\""+precision+"\",\"outflow\":"+out+",\"inflow\":"+in+",\"balanceAfter\":"+balance+",\"sourceSheet\":0,\"sourceRow\":"+source+",\"description\":\"synthetic private source\"}";}
 MoneyStatementParser.Statement parse(String rows,String opening,String closing){return new MoneyNativeReplayParser().parse(nativeJson("KAKAO",rows,opening,closing).getBytes(StandardCharsets.UTF_8),"NATIVE_JSON","KAKAO");}
 @Test void nativeReplayPreservesZeroMoneyAndRequiresSeparateSourceAttestation(){var s=parse(row("b","2026-11-10T17:03:35Z","SECOND",0,0,-3000000,12),"-3000000","-3000000");assertThat(s.rows()).hasSize(1);assertThat(s.rows().getFirst().amount()).isZero();assertThat(s.rows().getFirst().nativeSourceRow()).isEqualTo(12);assertThat(s.verification()).isEqualTo("OWNER_ATTESTATION_REQUIRED");assertThat(s.originalSourceHash()).isEqualTo("a".repeat(64));}
 @Test void invalidCashChainAndDuplicateNativeIdentitiesFailClosed(){String newer=row("b","2026-11-11T00:00:00Z","SECOND",0,10,10,12),older=row("c","2026-11-10T00:00:00Z","SECOND",0,10,10,11);assertThatThrownBy(()->parse(newer+","+older,"0","10")).hasMessageContaining("CHAIN");assertThatThrownBy(()->parse(newer+","+newer,"0","10")).hasMessageContaining("LINEAGE");}
 @Test void dayPrecisionCannotCarryAnInventedBankSecond(){assertThatThrownBy(()->parse(row("b","2026-11-10T00:00:01Z","DAY",0,10,10,12),"0","10")).hasMessageContaining("DAY_PRECISION");var s=parse(row("b","2026-11-09T15:00:00Z","DAY",0,10,10,12),"0","10");assertThat(s.rows().getFirst().timePrecision()).isEqualTo("DAY");}
 @Test void bankHeaderAmountsMustEqualTheEntireNativeChain(){assertThatThrownBy(()->parse(row("b","2026-11-10T00:00:00Z","SECOND",0,10,10,12),"1","10")).hasMessageContaining("HEADER_BALANCE");}
}
