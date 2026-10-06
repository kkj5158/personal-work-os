package com.kafka.backend.money;

/** Explicit links override legacy descriptor/alias identities, including an explicit unlink. */
final class MoneyMerchantResolution {
 private MoneyMerchantResolution(){}
 static String join(String link){return " left join lateral (select candidate.* from (select m.*,count(*) over() as matches from money_ai_merchants m where m.user_id=t.user_id and (m.id="+link+".merchant_id or "+link+".transaction_id is null and (lower(m.descriptor)=lower(t.counterparty_text) or exists(select 1 from jsonb_array_elements_text(m.aliases) a where lower(a)=lower(t.counterparty_text))))) candidate where matches=1) mi on true ";}
}
