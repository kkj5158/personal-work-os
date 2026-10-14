package com.kafka.backend.money;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Standalone sanitized corpus. Run unchanged with baseline and final backend classpaths.
 * javac -cp <backend runtime classpath> -d <output> AdmissionCorpus.java
 * java -cp <output>;<backend runtime classpath> com.kafka.backend.money.AdmissionCorpus
 * Durations measure the in-memory matcher only, never ingestion/UI/SQL latency. */
public final class AdmissionCorpus {
 static final Instant NOW=Instant.parse("2026-10-14T00:00:00Z"), AT=NOW.minusSeconds(300);
 static final List<MoneyAccount> ACCOUNTS=List.of(
  new MoneyAccount(UUID.nameUUIDFromBytes("synthetic-ibk".getBytes()),"IBK","Synthetic spending",AccountRole.SPENDING,"975-******-01-014",null,false,0),
  new MoneyAccount(UUID.nameUUIDFromBytes("synthetic-shinhan".getBytes()),"SHINHAN","급여통장",AccountRole.INCOME_HUB,null,"1228",false,0));
 record Scenario(String label,List<ParseAttempt> attempts,List<MoneyTransaction> existing,int ordinaryExpected,int transferExpected){}
 static ParseAttempt side(String key,String bank,Direction direction,String cp,int seconds,int balance){
  UUID raw=UUID.nameUUIDFromBytes(("raw-"+key).getBytes()),parse=UUID.nameUUIDFromBytes(("parse-"+key).getBytes());
  String own=bank.equals("IBK")?"975-******-01-014":"급여통장(1228)";
  var c=new ParsedCandidate(raw,bank,direction,new BigDecimal("1000"),AT.plusSeconds(seconds),"10/14 08:55:00",
   direction==Direction.OUT?own:null,direction==Direction.IN?own:null,List.of(),cp,new BigDecimal(balance),"ACCOUNT_ACTIVITY",ParseStatus.PARSED,
   AT.plusSeconds(seconds),AT.plusSeconds(seconds),TimeSource.PROVIDER_SECOND,"1.0.0",Map.of("shape","VERIFIED_PUSH_V1","currency","KRW"));
  return new ParseAttempt(parse,raw,bank.toLowerCase()+"-push","1.0.0","PARSED",null,c,NOW.minusSeconds(300));
 }
 static Scenario single(String label,String bank,Direction direction,String cp){return new Scenario(label,List.of(side(label,bank,direction,cp,0,50000)),List.of(),1,0);}
 static List<Scenario> corpus(){
  var result=new ArrayList<Scenario>();
  result.add(single("payroll_without_prefix","SHINHAN",Direction.IN,"합성 회사"));
  result.add(single("coupang_settlement","SHINHAN",Direction.IN,"쿠팡 풀필먼트 정산"));
  result.add(single("freelance_settlement","SHINHAN",Direction.IN,"프리랜서 합성 정산"));
  result.add(single("unfamiliar_external_income","SHINHAN",Direction.IN,"합성 외부지급인"));
  result.add(single("unfamiliar_merchant","IBK",Direction.OUT,"처음방문한가게"));
  result.add(single("known_payroll_control","SHINHAN",Direction.IN,"급여 합성회사"));
  result.add(single("known_merchant_control","IBK",Direction.OUT,"합성 카페"));
  for(int seconds:List.of(5,10,30,59,61))result.add(new Scenario("different_counterpart_transfer_"+seconds,
   List.of(side("out-"+seconds,"IBK",Direction.OUT,"보낸사람표시",0,50000),side("in-"+seconds,"SHINHAN",Direction.IN,"받는사람표시",seconds,50000)),List.of(),seconds>60?2:0,seconds<=60?1:0));
  result.add(new Scenario("unrelated_external_equal_amount",List.of(side("unrelated-out","IBK",Direction.OUT,"합성 카페",0,50000),side("unrelated-in","SHINHAN",Direction.IN,"급여 합성회사",5,50000)),List.of(),2,0));
  result.add(new Scenario("recaptured_identical_movement",List.of(side("duplicate-one","SHINHAN",Direction.IN,"급여 합성회사",0,50000),side("duplicate-two","SHINHAN",Direction.IN,"급여 합성회사",0,50000)),List.of(),0,0));
  result.add(new Scenario("independent_equal_amount_payments",List.of(side("payment-one","SHINHAN",Direction.IN,"급여 합성회사",0,50000),side("payment-two","SHINHAN",Direction.IN,"급여 합성회사",5,51000)),List.of(),2,0));
  result.add(new Scenario("competing_transfer_graph",List.of(side("ambiguous-out","IBK",Direction.OUT,"내계좌",0,50000),side("ambiguous-one","SHINHAN",Direction.IN,"다른표시",5,50000),side("ambiguous-two","SHINHAN",Direction.IN,"세번째표시",10,51000)),List.of(),0,0));
  return result;
 }
 static double percentile(long[] durations,double fraction){Arrays.sort(durations);return durations[(int)Math.ceil(fraction*durations.length)-1]/1000.0;}
 public static void main(String[] args){
  var matcher=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC));var scenarios=corpus();
  int ordinary=0,transfer=0,review=0,expectedOrdinary=0,expectedTransfer=0,falseTransfers=0,falseDuplicateSuppressions=0,duplicateCanonicalProposals=0;
  var timings=new long[scenarios.size()*100];int sample=0;
  System.out.println("{\"measurement\":\"in_memory_matcher_only\",\"scenarios\":[");
  for(int i=0;i<scenarios.size();i++){
   var s=scenarios.get(i);var context=new MoneyTransferMatcher.Context(ACCOUNTS,s.attempts(),s.existing());
   List<MoneyTransferMatcher.Proposal> proposals=List.of();
   for(int run=0;run<100;run++){long start=System.nanoTime();proposals=matcher.propose(context);timings[sample++]=System.nanoTime()-start;}
   int o=0,t=0,r=0;var sourceUses=new HashMap<UUID,Integer>();
   for(var p:proposals){if(p.transaction()!=null){if(p.transaction().type()==TransactionType.TRANSFER)t++;else o++;for(var source:p.sources())sourceUses.merge(source.rawEventId(),1,Integer::sum);}else if(p.disposition()==MoneyTransferMatcher.Disposition.REVIEW_REQUIRED)r++;}
   duplicateCanonicalProposals+=(int)sourceUses.values().stream().filter(n->n>1).count();
   ordinary+=o;transfer+=t;review+=r;expectedOrdinary+=s.ordinaryExpected();expectedTransfer+=s.transferExpected();
   if(s.transferExpected()==0)falseTransfers+=t;
   if(s.label().equals("independent_equal_amount_payments"))falseDuplicateSuppressions+=Math.max(0,2-o);
   System.out.printf(Locale.ROOT,"{\"label\":\"%s\",\"ordinary\":%d,\"transfer\":%d,\"reviewSources\":%d}%s%n",s.label(),o,t,r,i+1<scenarios.size()?",":"");
  }
  double avg=Arrays.stream(timings).average().orElse(0)/1000.0;
  System.out.printf(Locale.ROOT,
   "],\"summary\":{\"ordinaryProposals\":%d,\"ordinaryExpected\":%d,\"ordinaryAdmissionRate\":%.5f,\"transferProposals\":%d,\"transferExpected\":%d,\"transferMatchRate\":%.5f,\"reviewSources\":%d,\"falseTransfers\":%d,\"falseDuplicateSuppressions\":%d,\"duplicateCanonicalProposals\":%d,\"matcherSamples\":%d,\"matcherAverageMicros\":%.3f,\"matcherP50Micros\":%.3f,\"matcherP95Micros\":%.3f,\"matcherP99Micros\":%.3f}}%n",
   ordinary,expectedOrdinary,(double)ordinary/expectedOrdinary,transfer,expectedTransfer,(double)transfer/expectedTransfer,review,falseTransfers,falseDuplicateSuppressions,duplicateCanonicalProposals,timings.length,avg,percentile(timings,0.5),percentile(timings,0.95),percentile(timings,0.99));
 }
}
