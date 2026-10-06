package com.kafka.backend.money;
import java.text.Normalizer;
import java.util.*;

/** Conservative local purchase context. Raw notifications/amounts/account labels never become provider input. */
public final class MoneyClassificationContext {
 private MoneyClassificationContext(){}
 public static String normalize(Object value){return Normalizer.normalize(Objects.toString(value,""),Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]","");}
 public static Map<String,Object> local(Map<String,Object> row){
  var context=new LinkedHashMap<String,Object>();context.put("accountId",Objects.toString(row.get("accountId"),""));context.put("type",row.get("type"));context.put("merchant",normalize(row.get("counterpartyText")));context.put("identity",List.of(Objects.toString(row.get("merchantIdentityId"),""),normalize(row.get("merchantIdentityName")),Objects.toString(row.get("merchantIdentityVersion"),"0")));context.put("purchase",normalize(row.get("title"))+"|"+normalize(row.get("memo")));return context;
 }
 public static String conversationText(String text,List<Map<String,Object>> books,List<Map<String,Object>> rules){
  String safe=Objects.toString(text,"");var privateValues=new LinkedHashSet<String>();
  for(var book:books){for(String field:List.of("counterpartyText","merchantIdentityName")){String value=Objects.toString(book.get(field),"");if(!value.isBlank()&&!business(value)&&!multiPurpose(value))privateValues.add(value);}for(String field:List.of("accountName","accountDisplayName","memo")){String value=Objects.toString(book.get(field),"");if(!value.isBlank()&&value.length()>1)privateValues.add(value);}}
  for(var rule:rules)if(rule.get("conditions")instanceof List<?> conditions)for(Object condition:conditions)if(condition instanceof Map<?,?> c&&"merchant".equals(c.get("field"))){String value=Objects.toString(c.get("value"),"");if(!value.isBlank()&&!business(value)&&!multiPurpose(value))privateValues.add(value);}
  for(String value:privateValues.stream().sorted(Comparator.comparingInt(String::length).reversed()).toList())safe=safe.replace(value,"[개인 정보 생략]");
  return safe.replaceAll("[\\w.+-]+@[\\w.-]+|\\d{5,}|https?://\\S+","[개인 정보 생략]");
 }

 public static boolean sameMeaning(String before,String after){
  String a=normalize(before),b=normalize(after);if(a.equals(b))return true;
  // A single spelling edit in an otherwise unchanged long description is not new purchase intent.
  if(Math.min(a.length(),b.length())<8||Math.abs(a.length()-b.length())>1)return false;
  int i=0,j=0,differences=0;while(i<a.length()&&j<b.length()){if(a.charAt(i)==b.charAt(j)){i++;j++;continue;}if(++differences>1)return false;if(a.length()>=b.length())i++;if(b.length()>=a.length())j++;}return differences+(a.length()-i)+(b.length()-j)<=1;
 }
 public static boolean multiPurpose(String merchant){String value=normalize(merchant);return List.of("쿠팡","coupang","네이버","naver","마트","market","백화점","페이","pay","11번가","옥션","g마켓").stream().anyMatch(value::contains);}
 public static boolean business(String merchant){return !multiPurpose(merchant)&&merchant!=null&&merchant.matches("(?s).*(카페|커피|식당|약국|병원|서점|편의점|주유소|상회|스토어|샵|coffee|cafe|café|restaurant|store).*" );}
 public static Map<String,Object> minimized(Map<String,Object> row,List<Map<String,Object>> categories){
  String merchant=Objects.toString(row.get("merchantIdentityName"),Objects.toString(row.get("counterpartyText"),""));String purchase=Objects.toString(row.get("title"),"")+" "+Objects.toString(row.get("memo"),"");
  var terms=new LinkedHashSet<String>();
  for(String term:List.of("식사","커피","간식","식료품","생활용품","화장품","의류","교통","주유","의료","약","책","교육","구독","통신","급여","선물","환불","기부","핸드크림","운동","여행","보험","임대","공과금"))if(purchase.contains(term))terms.add(term);
  String safeMerchant=business(merchant)?merchant.replaceAll("\\d+|[\\w.+-]+@[\\w.-]+","").replaceAll("[^\\p{L}\\s]","").strip():multiPurpose(merchant)?"다품목 또는 결제 중개 사업체":"개인 또는 확인되지 않은 상대방";
  if(safeMerchant.length()>80)safeMerchant=safeMerchant.substring(0,80);
  return Map.of("type",row.get("type"),"merchant",safeMerchant,"purchaseTerms",terms,"categories",categories);
 }
}
