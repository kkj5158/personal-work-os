package com.kafka.backend.money;

import com.kafka.backend.common.InvalidRequestException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import java.math.BigDecimal;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.zip.*;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;
import static com.kafka.backend.money.MoneyService.require;

/** Provider adapter boundary. No OCR, formula evaluation, external entities or network access. */
public final class MoneyStatementParser implements BankStatementAdapter {
 public boolean supports(String provider,String format){return "IBK".equals(provider)&&Set.of("PDF","CSV","XLSX","HTML_XLS").contains(Objects.toString(format,""));}
 public static final int MAX_BYTES=2_000_000,MAX_ROWS=2000;
 public record Row(int number,Instant occurredAt,BigDecimal outflow,BigDecimal inflow,BigDecimal balanceAfter,String description,int page,String original) {
  public BigDecimal signed(){return inflow.subtract(outflow);}
  public BigDecimal amount(){return outflow.add(inflow);}
  public String direction(){return outflow.signum()>0?"OUT":"IN";}
 }
 public record Statement(String provider,String currency,String fingerprint,String normalizedFingerprint,String maskedAccount,LocalDate from,LocalDate to,List<Row> rows,BigDecimal outflow,BigDecimal inflow,BigDecimal openingBalance,BigDecimal finalBalance,String verification){ public Statement withMaskedAccount(String account){return new Statement(provider,currency,fingerprint,normalizedFingerprint,account,from,to,rows,outflow,inflow,openingBalance,finalBalance,verification);} }
 private static final Pattern IBK_ROW=Pattern.compile("^(\\d+)\\s+(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{2}:\\d{2}:\\d{2})\\s+([\\d,]+)\\s+([\\d,]+)\\s+(-?[\\d,]+)\\s*(.*)$");
 private static final ZoneId KST=ZoneId.of("Asia/Seoul");
 public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception e){throw new IllegalStateException(e);}}
 public static String mask(String s){return s==null?null:s.replaceAll("(?<![0-9])(?:[0-9][ -]?){7,}[0-9](?![0-9])","[REDACTED]");}
 public Statement parse(byte[] bytes,String format,String provider){
  require(bytes!=null&&bytes.length>0&&bytes.length<=MAX_BYTES,"STATEMENT_SIZE_LIMIT");require("IBK".equals(provider),"UNSUPPORTED_PROVIDER");
  try{return switch(Objects.toString(format,"")){case "PDF"->pdf(bytes);case "CSV"->table(bytes,csv(new String(bytes,StandardCharsets.UTF_8)),"CSV");case "XLSX"->table(bytes,xlsx(bytes),"XLSX");case "HTML_XLS"->htmlXls(bytes);default->throw new InvalidRequestException("UNSUPPORTED_FORMAT");};}
  catch(InvalidRequestException e){throw e;}catch(Exception e){throw new InvalidRequestException("UNSUPPORTED_OR_INVALID_STATEMENT");}
 }
 private Statement pdf(byte[] bytes)throws Exception{
  require(new String(bytes,0,Math.min(5,bytes.length),StandardCharsets.US_ASCII).equals("%PDF-"),"INVALID_PDF");
  try(var doc=Loader.loadPDF(bytes)){
   require(!doc.isEncrypted()&&doc.getNumberOfPages()<=60,"UNSUPPORTED_PDF");var strip=new PDFTextStripper();strip.setSortByPosition(true);var rows=new ArrayList<Row>();var all=new StringBuilder();
   for(int p=1;p<=doc.getNumberOfPages();p++){strip.setStartPage(p);strip.setEndPage(p);String text=strip.getText(doc);all.append(text);for(String line:text.split("\\R")){var m=IBK_ROW.matcher(line.trim());if(m.matches())rows.add(new Row(Integer.parseInt(m.group(1)),LocalDateTime.parse(m.group(2)+" "+m.group(3),DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")).atZone(KST).toInstant(),number(m.group(4)),number(m.group(5)),number(m.group(6)),mask(m.group(7).trim()),p,mask(line.trim())));}}
   String text=all.toString();require(text.contains("mybank.ibk.co.kr")&&text.contains("\uac70\ub798\ub0b4\uc5ed\uc870\ud68c")&&text.contains("\uc870\ud68c\uc2dc\uc791\uc77c\uc790")&&text.contains("\uc870\ud68c\uc885\ub8cc\uc77c\uc790"),"UNSUPPORTED_IBK_LAYOUT_OR_OCR");
   LocalDate from=headerDate(text,"\uc870\ud68c\uc2dc\uc791\uc77c\uc790"),to=headerDate(text,"\uc870\ud68c\uc885\ub8cc\uc77c\uc790");
   Statement s=validate(bytes,rows,from,to,"BANK_PDF_TABLE");
   Matcher total=Pattern.compile("\ud569\\s*\uacc4\\s+([\\d,]+)\\s+([\\d,]+)").matcher(text);require(total.find(),"STATEMENT_TOTALS_MISSING");require(s.outflow().compareTo(number(total.group(1)))==0&&s.inflow().compareTo(number(total.group(2)))==0,"STATEMENT_TOTALS_MISMATCH");
   Matcher balance=Pattern.compile("\ud604\uc7ac\uc794\uc561\\s*:\\s*([\\d,]+)").matcher(text);require(balance.find()&&s.finalBalance().compareTo(number(balance.group(1)))==0,"STATEMENT_FINAL_BALANCE_MISMATCH");var account=Pattern.compile("\uacc4\uc88c\ubc88\ud638\\s*:\\s*([0-9-]+)").matcher(text);require(account.find(),"STATEMENT_ACCOUNT_HEADER_MISSING");String digits=account.group(1).replace("-","");require(digits.length()>=8,"STATEMENT_ACCOUNT_HEADER_INVALID");return s.withMaskedAccount("IBK ***"+digits.substring(digits.length()-3));
  }
 }
 private LocalDate headerDate(String text,String key){var m=Pattern.compile(key+"\\s*:\\s*(\\d{4}-\\d{2}-\\d{2})").matcher(text);require(m.find(),"STATEMENT_DATE_HEADER_MISSING");return LocalDate.parse(m.group(1));}
 private static BigDecimal number(String s){require(s!=null&&s.matches("-?[0-9][0-9,]*"),"INVALID_MONEY_VALUE");return new BigDecimal(s.replace(",",""));}
 private Statement htmlXls(byte[] bytes)throws Exception{
  // Detect actual content, never trust .xls or rename the owner's original file.
  require(bytes.length>=5&&bytes[0]!='P'&&(bytes[0]&255)!=0xd0,"HTML_XLS_CONTENT_MISMATCH");
  String text;
  try{text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();}
  catch(java.nio.charset.CharacterCodingException e){text=java.nio.charset.Charset.forName("MS949").newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();}
  require(!text.matches("(?is).*(<!ENTITY|<!DOCTYPE[^>]*\\[).*"),"HTML_XLS_EXTERNAL_ENTITY_REJECTED");
  var doc=org.jsoup.Jsoup.parse(text);require(doc.select("script,object,embed,iframe").isEmpty(),"HTML_XLS_ACTIVE_CONTENT_REJECTED");
  var tables=doc.select("tr");require(tables.size()<=MAX_ROWS+100,"STATEMENT_ROW_LIMIT");
  List<String> header=List.of("No","거래일시","출금","입금","거래후 잔액","거래내용");boolean found=false;var rows=new ArrayList<Row>();
  BigDecimal totalOut=null,totalIn=null;
  for(var tr:tables){var cells=tr.children().stream().filter(c->Set.of("td","th").contains(c.tagName())).map(org.jsoup.nodes.Element::text).map(String::trim).toList();
   if(cells.size()>=6&&cells.subList(0,6).equals(header)){require(!found,"HTML_XLS_MULTIPLE_HEADERS");found=true;continue;}
   if(!found||cells.stream().allMatch(String::isBlank))continue;
   if(cells.size()==13&&cells.get(0).isBlank()&&cells.get(1).equals("합계")){require(totalOut==null,"HTML_XLS_DUPLICATE_TOTALS");totalOut=number(cells.get(2));totalIn=number(cells.get(3));continue;}
   require(totalOut==null&&cells.size()==13&&cells.get(0).matches("[0-9]+"),"HTML_XLS_INVALID_ROW");
   rows.add(new Row(Integer.parseInt(cells.get(0)),LocalDateTime.parse(cells.get(1),DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(java.time.format.ResolverStyle.STRICT)).atZone(KST).toInstant(),number(cells.get(2)),number(cells.get(3)),number(cells.get(4)),mask(cells.get(5)),1,"[PRIVATE_NATIVE_ROW]"));
  }
  require(found&&!rows.isEmpty()&&totalOut!=null&&totalIn!=null,"HTML_XLS_HEADER_OR_TOTALS_MISSING");
  LocalDate from=rows.getLast().occurredAt().atZone(KST).toLocalDate(),to=rows.getFirst().occurredAt().atZone(KST).toLocalDate();
  var result=validate(bytes,rows,from,to,"TABULAR_CONTINUITY_ONLY_HTML_XLS");
  require(result.outflow().compareTo(totalOut)==0&&result.inflow().compareTo(totalIn)==0,"STATEMENT_TOTALS_MISMATCH");
  // Native layout and arithmetic do not silently upgrade the established posting
  // gate: this source remains preview-only until independently corroborated.
  return result;
 }
 private Statement table(byte[] bytes,List<List<String>> table,String kind){
  require(table.size()>1&&table.size()<=MAX_ROWS+1,"STATEMENT_ROW_LIMIT");var header=table.getFirst().stream().map(s->s.replace("\ufeff","").trim()).toList();require(header.equals(List.of("no","time","out","inc","balance","desc","page")),"UNSUPPORTED_TABLE_COLUMNS");
  var rows=new ArrayList<Row>();for(var c:table.subList(1,table.size())){require(c.size()==7,"INCOMPLETE_STATEMENT_ROW");rows.add(new Row(Integer.parseInt(c.get(0)),LocalDateTime.parse(c.get(1),DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")).atZone(KST).toInstant(),number(c.get(2)),number(c.get(3)),number(c.get(4)),mask(c.get(5)),Integer.parseInt(c.get(6)),mask(String.join(" | ",c))));}
  // Tables have no bank header/totals assertion. Continuity is validated but bank authenticity is unknown.
  LocalDate from=rows.stream().map(r->r.occurredAt().atZone(KST).toLocalDate()).min(LocalDate::compareTo).orElseThrow(),to=rows.stream().map(r->r.occurredAt().atZone(KST).toLocalDate()).max(LocalDate::compareTo).orElseThrow();return validate(bytes,rows,from,to,"TABULAR_CONTINUITY_ONLY_"+kind);
 }
 static Statement validate(byte[] bytes,List<Row> input,LocalDate from,LocalDate to,String verification){
  require(!input.isEmpty()&&input.size()<=MAX_ROWS&&!to.isBefore(from),"INVALID_STATEMENT_RANGE");var rows=input.stream().sorted(Comparator.comparingInt(Row::number)).toList();
  for(int i=0;i<rows.size();i++){var r=rows.get(i);require(r.number()==i+1&&r.page()>0&&r.balanceAfter()!=null&&r.outflow().signum()>=0&&r.inflow().signum()>=0&&(r.outflow().signum()>0) != (r.inflow().signum()>0),"INVALID_STATEMENT_ROW_"+r.number());LocalDate date=r.occurredAt().atZone(KST).toLocalDate();require(!date.isBefore(from)&&!date.isAfter(to),"ROW_OUTSIDE_HEADER_RANGE");if(i>0){var newer=rows.get(i-1);require(!newer.occurredAt().isBefore(r.occurredAt())&&r.balanceAfter().add(newer.signed()).compareTo(newer.balanceAfter())==0,"BALANCE_CONTINUITY_ROW_"+newer.number());}}
  var oldest=rows.getLast();String canonical=rows.stream().map(r->r.number()+"|"+r.occurredAt()+"|"+r.signed()+"|"+r.balanceAfter()+"|"+r.description().replaceAll("[\\s\\p{Z}]+","").replaceAll("[0-9]*\\[REDACTED\\]","[REDACTED]")).reduce("IBK|KRW",(a,b)->a+"\n"+b);
  return new Statement("IBK","KRW",hash(bytes),hash(canonical.getBytes(StandardCharsets.UTF_8)),"IBK [MASKED]",from,to,rows,rows.stream().map(Row::outflow).reduce(BigDecimal.ZERO,BigDecimal::add),rows.stream().map(Row::inflow).reduce(BigDecimal.ZERO,BigDecimal::add),oldest.balanceAfter().subtract(oldest.signed()),rows.getFirst().balanceAfter(),verification);
 }
 static List<List<String>> csv(String text){var table=new ArrayList<List<String>>();var row=new ArrayList<String>();var cell=new StringBuilder();boolean quoted=false;for(int i=0;i<text.length();i++){char c=text.charAt(i);if(c=='"'){if(quoted&&i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else quoted=!quoted;}else if(!quoted&&(c==','||c=='\n')){row.add(cell.toString().replaceAll("\\r$",""));cell.setLength(0);if(c=='\n'){if(row.size()>1||!row.getFirst().isBlank())table.add(List.copyOf(row));row.clear();}}else cell.append(c);}require(!quoted,"MALFORMED_CSV");if(!cell.isEmpty()||!row.isEmpty()){row.add(cell.toString().replaceAll("\\r$",""));table.add(row);}return table;}
 private static List<List<String>> xlsx(byte[] bytes)throws Exception{
  var entries=new HashMap<String,byte[]>();int total=0,count=0;try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes))){for(ZipEntry e;(e=zip.getNextEntry())!=null;){require(++count<=100,"XLSX_ENTRY_LIMIT");byte[] b=zip.readNBytes(MAX_BYTES+1);total+=b.length;require(total<=8_000_000&&b.length<=MAX_BYTES,"XLSX_EXPANSION_LIMIT");if(e.getName().equals("xl/sharedStrings.xml")||e.getName().equals("xl/worksheets/sheet1.xml"))entries.put(e.getName(),b);require(!e.getName().toLowerCase(Locale.ROOT).contains("vbaproject"),"XLSX_MACRO_REJECTED");}}
  require(entries.containsKey("xl/worksheets/sheet1.xml"),"UNSUPPORTED_XLSX");var factory=DocumentBuilderFactory.newInstance();factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);factory.setFeature("http://xml.org/sax/features/external-general-entities",false);factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);factory.setXIncludeAware(false);factory.setExpandEntityReferences(false);var builder=factory.newDocumentBuilder();var strings=new ArrayList<String>();if(entries.containsKey("xl/sharedStrings.xml")){var shared=builder.parse(new ByteArrayInputStream(entries.get("xl/sharedStrings.xml"))).getElementsByTagName("si");for(int i=0;i<shared.getLength();i++)strings.add(shared.item(i).getTextContent());}
  var doc=builder.parse(new ByteArrayInputStream(entries.get("xl/worksheets/sheet1.xml")));require(doc.getElementsByTagName("f").getLength()==0,"XLSX_FORMULA_REJECTED");var rows=new ArrayList<List<String>>();var nodes=doc.getElementsByTagName("row");require(nodes.getLength()<=MAX_ROWS+1,"STATEMENT_ROW_LIMIT");for(int i=0;i<nodes.getLength();i++){var cells=((Element)nodes.item(i)).getElementsByTagName("c");var row=new ArrayList<String>();for(int j=0;j<cells.getLength();j++){var c=(Element)cells.item(j);require(c.getAttribute("r").matches("[A-G][0-9]+")&&c.getAttribute("r").charAt(0)=='A'+j,"XLSX_MISSING_OR_EXTRA_COLUMN");var vs=c.getElementsByTagName("v");String value=vs.getLength()>0?vs.item(0).getTextContent():c.getTextContent();if(c.getAttribute("t").equals("s"))value=strings.get(Integer.parseInt(value));row.add(value);}rows.add(row);}return rows;
 }
}
