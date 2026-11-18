package com.kafka.backend.money;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import static com.kafka.backend.money.MoneyService.require;

/** Local decoding transport, never a claim that JSON is an independently authenticated bank PDF.
 * Original files/passwords stay local. The original hash and native lineage require exact owner attestation.
 */
final class MoneyNativeReplayParser implements BankStatementAdapter {
 public boolean supports(String provider,String format){return "NATIVE_JSON".equals(format)&&Set.of("KAKAO","SHINHAN","IBK").contains(provider);}
 public MoneyStatementParser.Statement parse(byte[] bytes,String format,String provider){
  require(supports(provider,format)&&bytes.length<=MoneyStatementParser.MAX_BYTES,"INVALID_NATIVE_REPLAY");
  var node=JsonMapper.builder().build().readTree(bytes);
  for(var field:node.properties())require(Set.of("formatVersion","provider","sourceFileSha256","accountSuffix","openingBalance","closingBalance","rows").contains(field.getKey()),"UNEXPECTED_NATIVE_FIELD_PASSWORDS_AND_RAW_PAYLOADS_FORBIDDEN");
  require("BANK_NATIVE_REPLAY_V1".equals(node.path("formatVersion").asString())&&provider.equals(node.path("provider").asString()),"NATIVE_SCHEMA_PROVIDER_MISMATCH");
  String original=node.path("sourceFileSha256").asString(),suffix=node.path("accountSuffix").asString();
  require(original.matches("[a-f0-9]{64}")&&suffix.matches("[0-9]{3,4}"),"NATIVE_ORIGINAL_IDENTITY_REQUIRED");
  var rows=new ArrayList<MoneyStatementParser.Row>();var hashes=new HashSet<String>();
  int number=0;
  for(var n:node.path("rows")){
   for(var field:n.properties())require(Set.of("rowHash","occurredAt","precision","outflow","inflow","balanceAfter","sourceSheet","sourceRow","description").contains(field.getKey()),"UNEXPECTED_NATIVE_ROW_FIELD");
   require(++number<=MoneyStatementParser.MAX_ROWS,"STATEMENT_ROW_LIMIT");
   String rowHash=n.path("rowHash").asString(),precision=n.path("precision").asString();
   require(rowHash.matches("[a-f0-9]{64}")&&hashes.add(rowHash)&&Set.of("SECOND","DAY").contains(precision),"NATIVE_LINEAGE_REQUIRED");
   Instant at=Instant.parse(n.path("occurredAt").asString());
   if(precision.equals("DAY"))require(at.atZone(ZoneId.of("Asia/Seoul")).toLocalTime().equals(LocalTime.MIDNIGHT),"DAY_PRECISION_MUST_REMAIN_DAY");
   BigDecimal out=n.path("outflow").decimalValue(),in=n.path("inflow").decimalValue(),balance=n.path("balanceAfter").decimalValue();
   require(out.abs().max(in.abs()).max(balance.abs()).compareTo(new BigDecimal("100000000000000000"))<0,"NATIVE_KRW_LIMIT");
   require(out.signum()>=0&&in.signum()>=0&&out.stripTrailingZeros().scale()<=0&&in.stripTrailingZeros().scale()<=0&&out.multiply(in).signum()==0&&balance.stripTrailingZeros().scale()<=0,"NATIVE_KRW_CASH_INVALID");
   require(n.path("sourceSheet").asInt()>=0&&n.path("sourceRow").asInt()>0,"NATIVE_ROW_COORDINATES_REQUIRED");
   rows.add(new MoneyStatementParser.Row(number,at,out,in,balance,MoneyStatementParser.mask(n.path("description").asString()).substring(0,Math.min(1000,MoneyStatementParser.mask(n.path("description").asString()).length())),n.path("sourceSheet").asInt()+1,"[LOCAL_NATIVE_REPLAY]",rowHash,n.path("sourceRow").asInt(),precision));
  }
  require(!rows.isEmpty(),"EMPTY_NATIVE_REPLAY");
  for(int i=1;i<rows.size();i++){
   var newer=rows.get(i-1);var older=rows.get(i);
   require(!newer.occurredAt().isBefore(older.occurredAt())&&older.balanceAfter().add(newer.signed()).compareTo(newer.balanceAfter())==0,"NATIVE_BALANCE_CHAIN_INVALID");
  }
  var oldest=rows.getLast();BigDecimal opening=oldest.balanceAfter().subtract(oldest.signed());
  require(opening.compareTo(node.path("openingBalance").decimalValue())==0&&rows.getFirst().balanceAfter().compareTo(node.path("closingBalance").decimalValue())==0,"NATIVE_HEADER_BALANCE_CONFLICT");
  return new MoneyStatementParser.Statement(provider,"KRW",MoneyStatementParser.hash(bytes),MoneyStatementParser.hash(bytes),suffix,oldest.occurredAt().atZone(ZoneId.of("Asia/Seoul")).toLocalDate(),rows.getFirst().occurredAt().atZone(ZoneId.of("Asia/Seoul")).toLocalDate(),rows,rows.stream().map(MoneyStatementParser.Row::outflow).reduce(BigDecimal.ZERO,BigDecimal::add),rows.stream().map(MoneyStatementParser.Row::inflow).reduce(BigDecimal.ZERO,BigDecimal::add),opening,rows.getFirst().balanceAfter(),"OWNER_ATTESTATION_REQUIRED",original);
 }
}
