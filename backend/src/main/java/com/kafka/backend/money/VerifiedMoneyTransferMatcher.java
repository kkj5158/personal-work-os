package com.kafka.backend.money;

import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Conservative, symmetric proposals. The wait horizon closes before selecting a unique pair. */
public final class VerifiedMoneyTransferMatcher implements MoneyTransferMatcher {
    public static final Duration WAIT=Duration.ofMinutes(2), POST_WINDOW=Duration.ofSeconds(10), PROVIDER_WINDOW=Duration.ofSeconds(90);
    private final Clock clock;
    private final MoneyAccountResolver resolver=new MoneyAccountResolver();
    public VerifiedMoneyTransferMatcher(){this(Clock.systemUTC());}
    public VerifiedMoneyTransferMatcher(Clock clock){this.clock=clock;}
    record Resolved(ParseAttempt attempt,MoneyAccount from,MoneyAccount to){
        ParsedCandidate c(){return attempt.candidate();}
        MoneyAccount own(){return c().direction()==Direction.OUT?from:to;}
    }
    static TransactionSource source(ParseAttempt a,SourceRelationship role,String reason){
        return new TransactionSource(a.rawEventId(),a.id(),role,Map.of("matcherVersion","1.1.0","rule",reason,
            "parserVersion",a.parserVersion(),"timeSource",a.candidate().timeSource().name()));
    }
    static String counterpart(String s){return s==null?"":s.replaceFirst("^신한오픈","").replaceAll("(?U)\\s+","");}
    private boolean mature(ParseAttempt a){return !clock.instant().isBefore(a.createdAt().plus(WAIT));}
    static boolean close(ParsedCandidate a,ParsedCandidate b){
        return a.postedAt()!=null&&b.postedAt()!=null&&Duration.between(a.postedAt(),b.postedAt()).abs().compareTo(POST_WINDOW)<=0
            &&Duration.between(a.occurredAt(),b.occurredAt()).abs().compareTo(PROVIDER_WINDOW)<=0;
    }
    static String pairEvidence(Resolved a,Resolved b){
        if(a.c().direction()==b.c().direction()||a.own().id().equals(b.own().id())
            ||a.c().amount().compareTo(b.c().amount())!=0||!close(a.c(),b.c()))return null;
        String ac=counterpart(a.c().counterpartyText()),bc=counterpart(b.c().counterpartyText());
        if(!ac.isBlank()&&ac.equals(bc))return "SAME_COUNTERPARTY_AND_OWNED_ACCOUNTS";
        var out=a.c().direction()==Direction.OUT?a:b;var in=a.c().direction()==Direction.IN?a:b;
        String cp=out.c().counterpartyText();
        if(MoneyProductService.savings(in.to.role())&&"SHINHAN".equals(in.to.provider())&&cp!=null
            &&(cp.contains("신한 상품입금")||cp.contains("정기적금")||cp.contains(in.to.displayName())))
            return "EXPLICIT_SAVINGS_PRODUCT_DEPOSIT";
        // Observed Shinhan savings IN has no counterpart. Require the owned hub -> savings product
        // topology, same provider minute, and <=1s Android delivery; competing graph edges still reject it.
        if("SHINHAN".equals(out.from.provider())&&"SHINHAN".equals(in.to.provider())
            &&out.from.role()==AccountRole.INCOME_HUB&&MoneyProductService.savings(in.to.role())
            &&in.c().destinationAccountHint().startsWith("정기적금(")&&in.c().counterpartyText()==null
            &&cp!=null&&!cp.isBlank()&&out.c().providerOccurredAt()!=null
            &&out.c().providerOccurredAt().equals(in.c().providerOccurredAt())
            &&Duration.between(out.c().postedAt(),in.c().postedAt()).abs().compareTo(Duration.ofSeconds(1))<=0)
            return "SHINHAN_SIMULTANEOUS_OWNED_SAVINGS_PAIR";
        return null;
    }
    static Proposal review(ParseAttempt a,String reason){return new Proposal(Disposition.REVIEW_REQUIRED,null,null,
        List.of(source(a,SourceRelationship.PRIMARY,reason)),Map.of("reason",reason));}
    static Proposal transfer(Resolved out,Resolved in,String reason){
        var sources=out==in?List.of(source(out.attempt,SourceRelationship.PRIMARY,reason)):
            List.of(source(out.attempt,SourceRelationship.PRIMARY,reason),source(in.attempt,SourceRelationship.PRIMARY,reason));
        var tx=new TransactionInput(TransactionType.TRANSFER,out.from.id(),in.to.id(),out.c().amount(),"KRW",
            out.c().occurredAt(),null,sources);
        return new Proposal(Disposition.PROPOSED_TRANSFER,tx,null,sources,Map.of("rule",reason));
    }
    @Override public List<Proposal> propose(Context context){
        List<Proposal> proposals=new ArrayList<>(); List<Resolved> singles=new ArrayList<>(), auxiliaries=new ArrayList<>();
        Set<UUID> posted=new HashSet<>();context.existingTransactions().forEach(t->t.sources().forEach(s->posted.add(s.rawEventId())));
        // Caller supplies latest attempts, but reject repeated/conflicting attempts rather than select arbitrarily.
        Map<UUID,Long> counts=new HashMap<>();context.attempts().forEach(a->counts.merge(a.rawEventId(),1L,Long::sum));
        for(var a:context.attempts()){
            var c=a.candidate();if(posted.contains(a.rawEventId())||c==null||c.parseStatus()!=ParseStatus.PARSED)continue;
            if(c.timeSource()==null||c.occurredAt()==null||c.postedAt()==null)continue;
            if(counts.get(a.rawEventId())!=1){proposals.add(review(a,"MULTIPLE_ATTEMPTS_SUPPLIED"));continue;}
            var from=resolver.resolve(context.accounts(),c.provider(),c.sourceAccountHint());
            var to=resolver.resolve(context.accounts(),c.provider(),c.destinationAccountHint());
            if((c.sourceAccountHint()!=null&&!from.resolved())||(c.destinationAccountHint()!=null&&!to.resolved())){
                proposals.add(review(a,"ACCOUNT_RESOLUTION_REQUIRED"));continue;}
            var r=new Resolved(a,from.account(),to.account());
            if("SAVINGS_SUCCESS".equals(c.notificationSubtype())){auxiliaries.add(r);continue;}
            if(from.resolved()&&to.resolved()){
                if(from.account().id().equals(to.account().id()))proposals.add(review(a,"SAME_ACCOUNT_ROUTE"));
                else if(mature(a))proposals.add(transfer(r,r,"EXPLICIT_SINGLE_RAW_ROUTE"));
                continue;
            }
            if(r.own()==null){proposals.add(review(a,"MISSING_OWN_SIDE"));continue;}singles.add(r);
        }
        Map<Resolved,List<Resolved>> edges=new LinkedHashMap<>();
        for(var a:singles)edges.put(a,singles.stream().filter(b->a!=b&&pairEvidence(a,b)!=null).toList());
        Set<UUID> used=new HashSet<>();
        for(var a:singles){
            if(used.contains(a.attempt.rawEventId())||!mature(a.attempt))continue;
            var matches=edges.get(a);
            if(matches.size()==1&&edges.get(matches.getFirst()).size()==1){
                var b=matches.getFirst();if(!mature(b.attempt))continue;
                var out=a.c().direction()==Direction.OUT?a:b;var in=out==a?b:a;
                proposals.add(transfer(out,in,pairEvidence(a,b)));used.add(a.attempt.rawEventId());used.add(b.attempt.rawEventId());
            }else if(!matches.isEmpty())proposals.add(review(a.attempt,"AMBIGUOUS_TRANSFER_PAIR"));
            else {
                // A populated counterparty alone does not prove it is external. Only explicit merchant/payroll wording qualifies.
                String cp=a.c().counterpartyText();
                boolean conflicting=singles.stream().anyMatch(b->a!=b&&a.c().direction()!=b.c().direction()
                    &&a.c().amount().compareTo(b.c().amount())==0&&close(a.c(),b.c()));
                boolean external=cp!=null&&(a.c().direction()==Direction.OUT?cp.startsWith("카드결제 "):cp.startsWith("급여 "));
                if(external&&!conflicting){
                    var sources=List.of(source(a.attempt,SourceRelationship.PRIMARY,"EXPLICIT_EXTERNAL_AFTER_WAIT"));
                    proposals.add(new Proposal(Disposition.NO_MATCH,new TransactionInput(a.c().direction()==Direction.IN?TransactionType.INCOME:TransactionType.EXPENSE,
                        a.from==null?null:a.from.id(),a.to==null?null:a.to.id(),a.c().amount(),"KRW",a.c().occurredAt(),cp,sources),null,sources,Map.of()));
                }else proposals.add(review(a.attempt,"UNMATCHED_OR_EXTERNAL_UNPROVEN"));
            }
        }
        for(var a:auxiliaries){
            if(!mature(a.attempt))continue;
            var matches=context.existingTransactions().stream().filter(t->t.type()==TransactionType.TRANSFER&&"KRW".equals(t.currency())
                &&Objects.equals(t.toAccountId(),a.to.id())&&t.amount().compareTo(a.c().amount())==0
                &&Duration.between(t.occurredAt(),a.c().occurredAt()).abs().compareTo(POST_WINDOW)<=0)
                .filter(t->t.sources().stream().anyMatch(s->"EXPLICIT_SINGLE_RAW_ROUTE".equals(s.evidence().get("rule")))).toList();
            if(matches.size()==1){var sources=List.of(source(a.attempt,SourceRelationship.AUXILIARY,"EXACT_SAVINGS_SUCCESS"));
                proposals.add(new Proposal(Disposition.AUXILIARY,null,matches.getFirst().id(),sources,Map.of()));}
            else if(proposals.stream().anyMatch(p->p.transaction()!=null&&Objects.equals(p.transaction().toAccountId(),a.to.id())
                    &&p.transaction().amount().compareTo(a.c().amount())==0)){} // Revisit after the primary is committed.
            else proposals.add(review(a.attempt,"AUXILIARY_PRIMARY_MISSING_OR_AMBIGUOUS"));
        }
        return proposals;
    }
}
