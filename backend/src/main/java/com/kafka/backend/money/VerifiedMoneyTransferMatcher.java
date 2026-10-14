package com.kafka.backend.money;

import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Symmetric owner-account evidence graph; complete unique evidence posts without a timer. */
public final class VerifiedMoneyTransferMatcher implements MoneyTransferMatcher {
    public static final Duration WAIT=Duration.ofSeconds(10), POST_WINDOW=Duration.ofSeconds(10), PROVIDER_WINDOW=Duration.ofSeconds(90), TRANSFER_WINDOW=Duration.ofSeconds(60);
    private final Clock clock;
    private final Duration observationWindow, transferWindow;
    private final MoneyAccountResolver resolver=new MoneyAccountResolver();
    public VerifiedMoneyTransferMatcher(){this(Clock.systemUTC());}
    public VerifiedMoneyTransferMatcher(Clock clock){this(clock,WAIT,TRANSFER_WINDOW);}
    public VerifiedMoneyTransferMatcher(Clock clock,Duration observationWindow,Duration transferWindow){
        if(observationWindow.isNegative()||transferWindow.isNegative()||transferWindow.isZero()||transferWindow.compareTo(PROVIDER_WINDOW)>0)throw new IllegalArgumentException("Transfer window must be positive and at most 90 seconds");
        this.clock=clock;this.observationWindow=observationWindow;this.transferWindow=transferWindow;
    }
    record Resolved(ParseAttempt attempt,MoneyAccount from,MoneyAccount to){
        ParsedCandidate c(){return attempt.candidate();}
        MoneyAccount own(){return c().direction()==Direction.OUT?from:to;}
    }
    static TransactionSource source(ParseAttempt a,SourceRelationship role,String reason){
        var evidence=new LinkedHashMap<String,Object>();
        evidence.put("matcherVersion","2.0.0");evidence.put("rule",reason);
        evidence.put("parserVersion",a.parserVersion());
        if(a.candidate().timeSource()!=null)evidence.put("timeSource",a.candidate().timeSource().name());
        if(a.candidate().postedAt()!=null)evidence.put("postedAt",a.candidate().postedAt().toString());
        if(a.candidate().direction()!=null)evidence.put("direction",a.candidate().direction().name());
        if(a.candidate().occurredAt()!=null)evidence.put("occurredAt",a.candidate().occurredAt().toString());
        if(a.candidate().counterpartyText()!=null)evidence.put("counterpartyText",a.candidate().counterpartyText());
        if(a.candidate().sourceAccountHint()!=null)evidence.put("sourceAccountHint",a.candidate().sourceAccountHint());
        if(a.candidate().destinationAccountHint()!=null)evidence.put("destinationAccountHint",a.candidate().destinationAccountHint());
        if(a.candidate().providerOccurredAt()!=null)evidence.put("providerOccurredAt",a.candidate().providerOccurredAt().toString());
        if(a.candidate().postBalance()!=null)evidence.put("postBalance",a.candidate().postBalance());
        return new TransactionSource(a.rawEventId(),a.id(),role,evidence);
    }
    static String counterpart(String s){return s==null?"":s.replaceFirst("^신한오픈","").replaceAll("(?U)\\s+","");}
    private boolean mature(ParseAttempt a){return !clock.instant().isBefore(a.createdAt().plus(observationWindow));}
    static boolean close(ParsedCandidate a,ParsedCandidate b){
        return close(a,b,TRANSFER_WINDOW);
    }
    static boolean close(ParsedCandidate a,ParsedCandidate b,Duration window){return a!=null&&b!=null&&a.occurredAt()!=null&&b.occurredAt()!=null&&Duration.between(a.occurredAt(),b.occurredAt()).abs().compareTo(window)<=0;}
    static boolean unresolvedOpposite(ParsedCandidate a,ParsedCandidate b){
        return unresolvedOpposite(a,b,TRANSFER_WINDOW);
    }
    static boolean unresolvedOpposite(ParsedCandidate a,ParsedCandidate b,Duration window){
        // The matching boundary is not proof of externality. Retain the bounded
        // 90-second evidence neighborhood for unresolved opposite observations.
        Duration evidenceNeighborhood=window.compareTo(PROVIDER_WINDOW)>0?window:PROVIDER_WINDOW;
        return a!=null&&b!=null&&a.direction()!=null&&b.direction()!=null&&a.direction()!=b.direction()
            &&a.amount()!=null&&b.amount()!=null&&a.amount().compareTo(b.amount())==0&&Objects.equals(MoneyOrdinaryAdmission.currency(a),MoneyOrdinaryAdmission.currency(b))
            &&!MoneyOrdinaryAdmission.explicitExternal(a)&&!MoneyOrdinaryAdmission.explicitExternal(b)
            &&!MoneyOrdinaryAdmission.numericOtherSide(a)&&!MoneyOrdinaryAdmission.numericOtherSide(b)&&close(a,b,evidenceNeighborhood);
    }
    private boolean unresolvedOwnedOpposite(ParsedCandidate a,ParsedCandidate b,List<MoneyAccount> accounts){
        if(!MoneyOrdinaryAdmission.domestic(b)||b.direction()==null||a.direction()==b.direction()||b.amount()==null||a.amount().compareTo(b.amount())!=0
            ||!Objects.equals(MoneyOrdinaryAdmission.currency(a),MoneyOrdinaryAdmission.currency(b))||a.postedAt()==null||b.postedAt()==null
            ||Duration.between(a.postedAt(),b.postedAt()).abs().compareTo(Duration.ofSeconds(MoneyReviewService.PAIR_WINDOW_SECONDS))>0)return false;
        String ownHint=b.direction()==Direction.OUT?b.sourceAccountHint():b.destinationAccountHint();
        // Ownership failure is a hard financial conflict, even when the eligible side
        // has merchant wording. Reuse the bounded existing review neighborhood.
        return !resolver.resolve(accounts,b.provider(),ownHint).resolved();
    }
    static String pairEvidence(Resolved a,Resolved b){
        return pairEvidence(a,b,TRANSFER_WINDOW);
    }
    private static String pairEvidence(Resolved a,Resolved b,Duration window){
        if(a.c().amount()==null||b.c().amount()==null||a.c().direction()==null||b.c().direction()==null||a.own()==null||b.own()==null
            ||a.c().direction()==b.c().direction()||a.own().id().equals(b.own().id())
            ||a.c().amount().compareTo(b.c().amount())!=0||!close(a.c(),b.c(),window)
            ||!Objects.equals(MoneyOrdinaryAdmission.currency(a.c()),MoneyOrdinaryAdmission.currency(b.c()))
            ||MoneyOrdinaryAdmission.explicitExternal(a.c())||MoneyOrdinaryAdmission.explicitExternal(b.c())
            ||MoneyOrdinaryAdmission.dedicated(a.c())||MoneyOrdinaryAdmission.dedicated(b.c()))return null;
        if((a.c().direction()==Direction.OUT?a.to:a.from)==null&&MoneyOrdinaryAdmission.numericOtherSide(a.c())
            ||(b.c().direction()==Direction.OUT?b.to:b.from)==null&&MoneyOrdinaryAdmission.numericOtherSide(b.c()))return null;
        String ac=counterpart(a.c().counterpartyText()),bc=counterpart(b.c().counterpartyText());
        boolean android=a.c().timeSource()==TimeSource.ANDROID_POSTED_AT||b.c().timeSource()==TimeSource.ANDROID_POSTED_AT;
        boolean nearbyDelivery=a.c().postedAt()!=null&&b.c().postedAt()!=null&&Duration.between(a.c().postedAt(),b.c().postedAt()).abs().compareTo(POST_WINDOW)<=0;
        if(!ac.isBlank()&&ac.equals(bc)&&(!android||nearbyDelivery))return nearbyDelivery?"SAME_COUNTERPARTY_CLOSE_DELIVERY_AND_OWNED_ACCOUNTS":"SAME_COUNTERPARTY_AND_OWNED_ACCOUNTS";
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
        // Android-only time is a declared parser fallback. It cannot support a relaxed-text
        // pair by itself; preserve corroborated counterpart and dedicated savings paths above.
        if(android)return null;
        if(MoneyOrdinaryAdmission.special(a.c())||MoneyOrdinaryAdmission.special(b.c()))return null;
        if(ac.isBlank()||bc.isBlank())return null;
        return "UNIQUE_VERIFIED_OWNED_ACCOUNTS";
    }
    private static int evidenceStrength(String reason){return switch(reason){
        case "UNIQUE_VERIFIED_OWNED_ACCOUNTS"->1;
        case "SAME_COUNTERPARTY_AND_OWNED_ACCOUNTS"->2;
        case "SAME_COUNTERPARTY_CLOSE_DELIVERY_AND_OWNED_ACCOUNTS"->3;
        default->4;
    };}
    static Proposal review(ParseAttempt a,String reason){return new Proposal(Disposition.REVIEW_REQUIRED,null,null,
        List.of(source(a,SourceRelationship.PRIMARY,reason)),Map.of("reason",reason));}
    static Proposal transfer(Resolved out,Resolved in,String reason){
        var sources=out==in?List.of(source(out.attempt,SourceRelationship.PRIMARY,reason)):
            List.of(source(out.attempt,SourceRelationship.PRIMARY,reason),source(in.attempt,SourceRelationship.PRIMARY,reason));
        var tx=new TransactionInput(TransactionType.TRANSFER,out.from.id(),in.to.id(),out.c().amount(),"KRW",
            out.c().occurredAt(),null,sources);
        return new Proposal(Disposition.PROPOSED_TRANSFER,tx,null,sources,Map.of("rule",reason));
    }
    // Transport keys are capture identity, not bank movement identity. Reject every member
    // of an indistinguishable component before creating any single-route or paired proposal.
    static boolean indistinguishable(ParsedCandidate a,ParsedCandidate b){
        return a!=null&&b!=null&&a.amount()!=null&&b.amount()!=null&&a.parseStatus()==ParseStatus.PARSED&&b.parseStatus()==ParseStatus.PARSED
            &&Objects.equals(a.provider(),b.provider())&&a.direction()==b.direction()
            &&a.amount().compareTo(b.amount())==0&&Objects.equals(a.sourceAccountHint(),b.sourceAccountHint())
            &&Objects.equals(a.destinationAccountHint(),b.destinationAccountHint())
            &&Objects.equals(a.counterpartyText(),b.counterpartyText())&&Objects.equals(a.notificationSubtype(),b.notificationSubtype())
            &&Objects.equals(a.occurredAt(),b.occurredAt())&&Objects.equals(a.postedAt(),b.postedAt())
            &&Objects.equals(a.postBalance(),b.postBalance());
    }
    /** Bank minute, route, amount and unchanged balance can describe one recaptured ordinary movement. */
    static boolean sameOrdinaryMovement(ParsedCandidate a,ParsedCandidate b){
        return MoneyOrdinaryAdmission.ordinary(a)&&MoneyOrdinaryAdmission.ordinary(b)&&a.postedAt()!=null&&b.postedAt()!=null
            &&Duration.between(a.postedAt(),b.postedAt()).abs().compareTo(POST_WINDOW)<=0
            &&Objects.equals(a.provider(),b.provider())&&a.direction()==b.direction()&&a.amount().compareTo(b.amount())==0
            &&Objects.equals(a.sourceAccountHint(),b.sourceAccountHint())&&Objects.equals(a.destinationAccountHint(),b.destinationAccountHint())
            &&Objects.equals(a.counterpartyText(),b.counterpartyText())&&a.providerOccurredAt()!=null&&a.providerOccurredAt().equals(b.providerOccurredAt())
            &&a.postBalance()!=null&&b.postBalance()!=null&&a.postBalance().compareTo(b.postBalance())==0;
    }
    static boolean distinctBalanceFlow(MoneyTransaction previous,Proposal next){
        var tx=next.transaction();
        for(var prior:previous.sources())for(var current:next.sources()){
            var a=prior.evidence();var b=current.evidence();
            if(prior.relationship()!=SourceRelationship.PRIMARY||current.relationship()!=SourceRelationship.PRIMARY
                ||!Objects.equals(a.get("direction"),b.get("direction"))||a.get("postBalance")==null||b.get("postBalance")==null
                ||a.get("postedAt")==null||b.get("postedAt")==null||!Objects.equals(a.get("timeSource"),b.get("timeSource")))continue;
            try{
                Instant before=Instant.parse(a.get("postedAt").toString()),after=Instant.parse(b.get("postedAt").toString());
                if(!before.isBefore(after)||previous.occurredAt().isAfter(tx.occurredAt()))continue;
                if(previous.occurredAt().equals(tx.occurredAt())&&!"PROVIDER_MINUTE".equals(b.get("timeSource")))continue;
                var oldBalance=new java.math.BigDecimal(a.get("postBalance").toString());var newBalance=new java.math.BigDecimal(b.get("postBalance").toString());
                var expected="OUT".equals(b.get("direction"))?oldBalance.subtract(tx.amount()):oldBalance.add(tx.amount());
                if(expected.compareTo(newBalance)==0)return true;
            }catch(RuntimeException ignored){/* Legacy/partial evidence cannot prove distinct movement. */}
        }
        return false;
    }
    @Override public List<Proposal> propose(Context context){
        List<Proposal> proposals=new ArrayList<>(); List<Resolved> singles=new ArrayList<>(), auxiliaries=new ArrayList<>();
        Set<UUID> posted=new HashSet<>();context.existingTransactions().forEach(t->t.sources().forEach(s->posted.add(s.rawEventId())));
        // Caller supplies latest attempts, but reject repeated/conflicting attempts rather than select arbitrarily.
        Map<UUID,Long> counts=new HashMap<>();context.attempts().forEach(a->counts.merge(a.rawEventId(),1L,Long::sum));
        Set<UUID> ambiguous=new HashSet<>();
        for(var a:context.attempts())for(var b:context.attempts())
            if(!a.rawEventId().equals(b.rawEventId())&&!posted.contains(a.rawEventId())&&!posted.contains(b.rawEventId())
                &&(indistinguishable(a.candidate(),b.candidate())||sameOrdinaryMovement(a.candidate(),b.candidate()))){ambiguous.add(a.rawEventId());ambiguous.add(b.rawEventId());}
        // An ambiguous bank-side duplicate makes its connected opposite side ambiguous too.
        // Do not strand that side as a seemingly independent external movement.
        boolean changed;do{changed=false;for(var a:context.attempts())for(var b:context.attempts()){
            if(!ambiguous.contains(a.rawEventId())||ambiguous.contains(b.rawEventId())||posted.contains(b.rawEventId())||a.candidate()==null||b.candidate()==null)continue;
            var ac=a.candidate();var bc=b.candidate();if(ac.occurredAt()==null||bc.occurredAt()==null||ac.direction()==null||bc.direction()==null)continue;
            var ar=new Resolved(a,resolver.resolve(context.accounts(),ac.provider(),ac.sourceAccountHint()).account(),resolver.resolve(context.accounts(),ac.provider(),ac.destinationAccountHint()).account());
            var br=new Resolved(b,resolver.resolve(context.accounts(),bc.provider(),bc.sourceAccountHint()).account(),resolver.resolve(context.accounts(),bc.provider(),bc.destinationAccountHint()).account());
            if(ar.own()!=null&&br.own()!=null&&pairEvidence(ar,br)!=null){ambiguous.add(b.rawEventId());changed=true;}
        }}while(changed);
        for(var a:context.attempts()){
            var c=a.candidate();if(posted.contains(a.rawEventId())||c==null||c.parseStatus()!=ParseStatus.PARSED)continue;
            if(c.timeSource()==null||c.occurredAt()==null||c.postedAt()==null||c.direction()==null||c.amount()==null||c.amount().signum()<=0){proposals.add(review(a,"MISSING_REQUIRED_FINANCIAL_FACTS"));continue;}
            if(!MoneyOrdinaryAdmission.domestic(c)||!"KRW".equals(MoneyOrdinaryAdmission.currency(c))){proposals.add(review(a,"UNSUPPORTED_CURRENCY_OR_SOURCE"));continue;}
            if(ambiguous.contains(a.rawEventId())){proposals.add(review(a,"INDISTINGUISHABLE_TRANSFER_EVIDENCE"));continue;}
            if(counts.get(a.rawEventId())!=1){proposals.add(review(a,"MULTIPLE_ATTEMPTS_SUPPLIED"));continue;}
            var from=resolver.resolve(context.accounts(),c.provider(),c.sourceAccountHint());
            var to=resolver.resolve(context.accounts(),c.provider(),c.destinationAccountHint());
            boolean ownResolved=c.direction()==Direction.OUT?from.resolved():to.resolved();
            String otherHint=c.direction()==Direction.OUT?c.destinationAccountHint():c.sourceAccountHint();
            boolean unknownExternal=ownResolved&&MoneyOrdinaryAdmission.ordinary(c)&&MoneyOrdinaryAdmission.externalHint(otherHint);
            if((c.sourceAccountHint()!=null&&!from.resolved()&&!(c.direction()==Direction.IN&&unknownExternal))||(c.destinationAccountHint()!=null&&!to.resolved()&&!(c.direction()==Direction.OUT&&unknownExternal))){
                proposals.add(review(a,"ACCOUNT_RESOLUTION_REQUIRED"));continue;}
            var r=new Resolved(a,from.account(),to.account());
            if("SAVINGS_SUCCESS".equals(c.notificationSubtype())){if(r.to==null)proposals.add(review(a,"MISSING_OWN_SIDE"));else auxiliaries.add(r);continue;}
            if(MoneyOrdinaryAdmission.dedicated(c)){proposals.add(review(a,"DEDICATED_FINANCIAL_OPERATION_REQUIRED"));continue;}
            if(from.resolved()&&to.resolved()){
                if(from.account().id().equals(to.account().id()))proposals.add(review(a,"SAME_ACCOUNT_ROUTE"));
                else proposals.add(transfer(r,r,"EXPLICIT_SINGLE_RAW_ROUTE"));
                continue;
            }
            if(r.own()==null){proposals.add(review(a,"MISSING_OWN_SIDE"));continue;}singles.add(r);
        }
        Map<Resolved,List<Resolved>> edges=new LinkedHashMap<>();
        for(var a:singles){
            var candidates=singles.stream().filter(b->a!=b&&pairEvidence(a,b,transferWindow)!=null).toList();
            // Counterpart agreement corroborates identity when simultaneous equal amounts compete.
            // Keep the complete candidate graph, then prefer stronger evidence symmetrically.
            int strongest=candidates.stream().mapToInt(b->evidenceStrength(pairEvidence(a,b,transferWindow))).max().orElse(0);
            edges.put(a,candidates.stream().filter(b->evidenceStrength(pairEvidence(a,b,transferWindow))==strongest).toList());
        }
        Set<UUID> used=new HashSet<>();
        for(var a:singles){
            if(used.contains(a.attempt.rawEventId()))continue;
            var matches=edges.get(a);
            if(matches.size()==1&&edges.get(matches.getFirst()).size()==1&&edges.get(matches.getFirst()).contains(a)){
                var b=matches.getFirst();
                var out=a.c().direction()==Direction.OUT?a:b;var in=out==a?b:a;
                proposals.add(transfer(out,in,pairEvidence(a,b)));used.add(a.attempt.rawEventId());used.add(b.attempt.rawEventId());
            }else if(!matches.isEmpty())proposals.add(review(a.attempt,"AMBIGUOUS_TRANSFER_PAIR"));
            else if(mature(a.attempt)) {
                String cp=a.c().counterpartyText();
                boolean ownershipConflict=context.attempts().stream().anyMatch(b->!a.attempt.rawEventId().equals(b.rawEventId())&&!posted.contains(b.rawEventId())&&unresolvedOwnedOpposite(a.c(),b.candidate(),context.accounts()));
                boolean conflicting=context.attempts().stream().anyMatch(b->!a.attempt.rawEventId().equals(b.rawEventId())&&!posted.contains(b.rawEventId())&&unresolvedOpposite(a.c(),b.candidate(),transferWindow));
                boolean external=MoneyOrdinaryAdmission.ordinary(a.c());
                if(external&&!conflicting&&!ownershipConflict){
                    var sources=List.of(source(a.attempt,SourceRelationship.PRIMARY,"VERIFIED_ORDINARY_AFTER_WAIT"));
                    proposals.add(new Proposal(Disposition.NO_MATCH,new TransactionInput(a.c().direction()==Direction.IN?TransactionType.INCOME:TransactionType.EXPENSE,
                        a.from==null?null:a.from.id(),a.to==null?null:a.to.id(),a.c().amount(),"KRW",a.c().occurredAt(),cp,sources),null,sources,Map.of()));
                }else proposals.add(review(a.attempt,ownershipConflict?"OPPOSITE_OWNER_ACCOUNT_UNRESOLVED":conflicting?"UNRESOLVED_TRANSFER_CANDIDATE":MoneyOrdinaryAdmission.special(a.c())?"DEDICATED_FINANCIAL_OPERATION_REQUIRED":MoneyOrdinaryAdmission.transferIntent(a.c())?"UNRESOLVED_TRANSFER_INTENT":"MISSING_ORDINARY_MOVEMENT_CONTEXT"));
            }
        }
        for(var a:auxiliaries){
            var matches=context.existingTransactions().stream().filter(t->t.type()==TransactionType.TRANSFER&&!t.excluded()&&t.mergedInto()==null&&"KRW".equals(t.currency())
                &&Objects.equals(t.toAccountId(),a.to.id())&&t.amount().compareTo(a.c().amount())==0
                &&Duration.between(t.occurredAt(),a.c().occurredAt()).abs().compareTo(POST_WINDOW)<=0)
                .filter(t->t.sources().stream().anyMatch(s->"EXPLICIT_SINGLE_RAW_ROUTE".equals(s.evidence().get("rule")))).toList();
            if(matches.size()==1){var sources=List.of(source(a.attempt,SourceRelationship.AUXILIARY,"EXACT_SAVINGS_SUCCESS"));
                proposals.add(new Proposal(Disposition.AUXILIARY,null,matches.getFirst().id(),sources,Map.of()));}
            else if(proposals.stream().anyMatch(p->p.transaction()!=null&&Objects.equals(p.transaction().toAccountId(),a.to.id())
                    &&p.transaction().amount().compareTo(a.c().amount())==0)){} // Revisit after the primary is committed.
            else if(mature(a.attempt))proposals.add(review(a.attempt,"AUXILIARY_PRIMARY_MISSING_OR_AMBIGUOUS"));
        }
        // New callback identities near an already-posted route are uncertain, never a second automatic fact.
        return proposals.stream().map(p->{
            var tx=p.transaction();if(tx==null)return p;
            var lateConflict=context.existingTransactions().stream().map(t->latePostedConflict(t,p,transferWindow)).filter(Objects::nonNull).findFirst();
            if(lateConflict.isPresent())return new Proposal(Disposition.REVIEW_REQUIRED,null,null,p.sources(),Map.of("reason",lateConflict.get()));
            boolean overlaps=context.existingTransactions().stream().anyMatch(t->t.type()==tx.type()&&Objects.equals(t.currency(),tx.currency())
                &&Objects.equals(t.fromAccountId(),tx.fromAccountId())&&Objects.equals(t.toAccountId(),tx.toAccountId())
                &&t.amount().compareTo(tx.amount())==0&&Duration.between(t.occurredAt(),tx.occurredAt()).abs().compareTo(PROVIDER_WINDOW)<=0
                &&(Objects.equals(t.counterpartyText(),tx.counterpartyText())||tx.type()==TransactionType.TRANSFER||sameBalanceIdentity(t,p))&&!distinctBalanceFlow(t,p));
            return overlaps?new Proposal(Disposition.REVIEW_REQUIRED,null,null,p.sources(),Map.of("reason","POSSIBLE_ALREADY_POSTED_ROUTE")):p;
        }).toList();
    }
    static boolean lateOpposite(MoneyTransaction previous,Proposal next){
        return "LATE_POSTED_TRANSFER_LINK_REQUIRED".equals(latePostedConflict(previous,next,TRANSFER_WINDOW));
    }
    private static Direction canonicalDirection(TransactionType type){return type==TransactionType.EXPENSE?Direction.OUT:type==TransactionType.INCOME?Direction.IN:null;}
    private static Direction direction(Map<String,Object> evidence,TransactionType type){
        String value=Objects.toString(evidence.get("direction"),"");return "OUT".equals(value)?Direction.OUT:"IN".equals(value)?Direction.IN:canonicalDirection(type);
    }
    private static boolean numericOtherSide(Map<String,Object> evidence,Direction direction){return direction!=null&&MoneyOrdinaryAdmission.externalHint(Objects.toString(evidence.get(direction==Direction.OUT?"destinationAccountHint":"sourceAccountHint"),null));}
    private static String latePostedConflict(MoneyTransaction previous,Proposal next,Duration window){
        Duration evidenceNeighborhood=window.compareTo(PROVIDER_WINDOW)>0?window:PROVIDER_WINDOW;
        var tx=next.transaction();if(tx==null||previous.type()==TransactionType.TRANSFER&&tx.type()==TransactionType.TRANSFER||!Objects.equals(previous.currency(),tx.currency())||previous.amount().compareTo(tx.amount())!=0
            ||Duration.between(previous.occurredAt(),tx.occurredAt()).abs().compareTo(evidenceNeighborhood)>0)return null;
        Direction oldDirection=canonicalDirection(previous.type());
        boolean legacyIdentity=previous.sources().isEmpty()||previous.sources().stream().noneMatch(s->s.relationship()==SourceRelationship.PRIMARY&&s.evidence().get("direction")!=null);
        for(var current:next.sources()){
            if(current.relationship()!=SourceRelationship.PRIMARY)continue;
            var b=current.evidence();Direction newDirection=direction(b,tx.type());if(newDirection==null)continue;
            UUID newOwn=newDirection==Direction.OUT?tx.fromAccountId():tx.toAccountId();if(newOwn==null)continue;
            // An ordinary posting may have an explicit numeric external route. That known
            // route cannot be reinterpreted as the owned counterpart of another fact.
            if(tx.type()!=TransactionType.TRANSFER&&numericOtherSide(b,newDirection))continue;
            if(oldDirection!=null&&previous.sources().stream().anyMatch(s->s.relationship()==SourceRelationship.PRIMARY&&numericOtherSide(s.evidence(),oldDirection)))continue;
            String cp=Objects.toString(b.get("counterpartyText"),tx.counterpartyText());
            if(previous.type()==TransactionType.TRANSFER){
                UUID transferSide=newDirection==Direction.OUT?previous.fromAccountId():previous.toAccountId();
                if(newOwn.equals(transferSide)&&!MoneyOrdinaryAdmission.explicitExternal(newDirection,cp)&&!distinctBalanceFlow(previous,next))return "LATE_POSTED_TRANSFER_SOURCE_OVERLAP";
            }else if(oldDirection!=null){
                UUID oldOwn=oldDirection==Direction.OUT?previous.fromAccountId():previous.toAccountId();if(oldOwn==null)continue;
                if(oldDirection!=newDirection&&!oldOwn.equals(newOwn)&&!MoneyOrdinaryAdmission.explicitExternal(oldDirection,previous.counterpartyText())&&!MoneyOrdinaryAdmission.explicitExternal(newDirection,cp))return "LATE_POSTED_TRANSFER_LINK_REQUIRED";
                // Owner-confirmed and legacy manual facts may lack parser identity. Preserve the
                // canonical decision and ask about a compatible same-side source overlap.
                if(legacyIdentity&&oldDirection==newDirection&&oldOwn.equals(newOwn)&&!distinctBalanceFlow(previous,next))return "POSSIBLE_ALREADY_POSTED_ROUTE";
            }
        }
        return null;
    }
    static boolean sameBalanceIdentity(MoneyTransaction previous,Proposal next){
        for(var prior:previous.sources())for(var current:next.sources()){
            if(prior.relationship()!=SourceRelationship.PRIMARY||current.relationship()!=SourceRelationship.PRIMARY)continue;
            var a=prior.evidence();var b=current.evidence();
            // V6 sources retained precision and balance; canonical occurredAt held their bank time.
            // Derive this read-only comparison only for declared provider time, never Android delivery.
            Object priorAt=a.get("providerOccurredAt");
            if(priorAt==null&&Set.of("PROVIDER_MINUTE","PROVIDER_SECOND").contains(Objects.toString(a.get("timeSource"),"")))priorAt=previous.occurredAt().toString();
            if(a.get("postBalance")==null||b.get("postBalance")==null||priorAt==null||b.get("providerOccurredAt")==null
                ||!Objects.equals(priorAt,b.get("providerOccurredAt"))||!Objects.equals(a.get("timeSource"),b.get("timeSource"))
                ||direction(a,previous.type())!=direction(b,next.transaction().type()))continue;
            try{if(new java.math.BigDecimal(a.get("postBalance").toString()).compareTo(new java.math.BigDecimal(b.get("postBalance").toString()))==0)return true;}catch(RuntimeException ignored){/* Partial legacy evidence does not establish identity. */}
        }
        return false;
    }
}
