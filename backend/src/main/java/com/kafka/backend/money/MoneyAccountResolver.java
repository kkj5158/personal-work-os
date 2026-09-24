package com.kafka.backend.money;

import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** The registry MUST already be owner-scoped. No global suffix lookup is performed. */
public final class MoneyAccountResolver {
    public record Resolution(MoneyAccount account,String reason) {public boolean resolved(){return account!=null;}}
    public Resolution resolve(List<MoneyAccount> accounts,String provider,String hint){
        if(hint==null||hint.isBlank())return new Resolution(null,"MISSING_HINT");
        var product=BankParserSupport.PRODUCT.matcher(hint);
        boolean hasProduct=product.matches();
        String suffix=hasProduct?product.group(2):null,name=hasProduct?product.group(1):null;
        var matches=accounts.stream().filter(a->!a.archived()&&Objects.equals(a.provider(),provider))
            .filter(a->hasProduct?Objects.equals(suffix,a.suffix()):hint.equals(a.maskedReference())).toList();
        // Product corroboration may disambiguate a suffix collision, but an arbitrary display label cannot reject a unique suffix.
        if(matches.size()>1&&hasProduct){
            var productMatches=matches.stream().filter(a->a.displayName().equals(name)||a.displayName().equals(hint)).toList();
            if(productMatches.size()==1)return new Resolution(productMatches.getFirst(),"PROVIDER_SUFFIX_PRODUCT");
        }
        return matches.size()==1?new Resolution(matches.getFirst(),hasProduct?"PROVIDER_SUFFIX":"PROVIDER_MASKED_REFERENCE"):
            new Resolution(null,matches.isEmpty()?"UNKNOWN_ACCOUNT":"AMBIGUOUS_ACCOUNT");
    }
}
