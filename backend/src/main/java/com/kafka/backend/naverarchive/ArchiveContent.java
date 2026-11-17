package com.kafka.backend.naverarchive;

import java.nio.*;
import java.nio.charset.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;
import java.io.*;
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;

/** Pure local parsing. URLs are identity only; this class has no HTTP client. */
final class ArchiveContent {
 static ArchiveException bad(String message){return new ArchiveException(400,message);}
 static String hash(String input){return hash(input.getBytes(StandardCharsets.UTF_8));}
 static String hash(byte[] input){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input));}catch(Exception e){throw new IllegalStateException(e);}}
 static String utf8(byte[] bytes){try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}catch(CharacterCodingException e){throw bad("UTF-8 파일만 지원합니다. 원본 인코딩을 확인해주세요.");}}
 static String safeHtml(String html){
  if(html==null||html.isEmpty())return "";
  var doc=Jsoup.parseBodyFragment(html);
  // No remote images/tracking, style, embedded content or active URLs.
  for(var image:doc.select("img")){String src=image.attr("src");if(src.matches("asset:[a-fA-F0-9-]{36}")){image.attr("data-asset",src.substring(6));image.removeAttr("src");}else image.remove();}
  var list=Safelist.relaxed().removeTags("iframe","video","audio","source")
    .removeAttributes("img","src").addAttributes("img","data-asset")
    .addProtocols("a","href","https","http");
  String clean=Jsoup.clean(doc.body().html(),"",list,new org.jsoup.nodes.Document.OutputSettings().prettyPrint(false));
  var result=Jsoup.parseBodyFragment(clean);result.outputSettings().prettyPrint(false);
  result.select("a").forEach(a->{a.attr("rel","noreferrer noopener nofollow");a.attr("target","_blank");});
  return result.body().html();
 }
 static Map<String,byte[]> unzip(byte[] bytes){
  if(bytes.length==0||bytes.length>8_000_000)throw bad("ZIP 크기는 8 MB 이하여야 합니다.");
  Map<String,byte[]> entries=new LinkedHashMap<>();long total=0;
  try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes),StandardCharsets.UTF_8)){
   ZipEntry e;while((e=zip.getNextEntry())!=null){String name=e.getName();
    if(name.startsWith("/")||name.contains("\\")||name.contains(":")||Arrays.asList(name.split("/",-1)).contains("..")||name.indexOf('\0')>=0||name.length()>240)throw bad("안전하지 않은 ZIP 경로입니다.");
    if(e.isDirectory())continue;
    if(entries.size()>=1000||entries.containsKey(name)||name.toLowerCase(Locale.ROOT).matches(".*\\.(zip|rar|7z|gz|tar)$"))throw bad("중복·중첩 ZIP 또는 파일 수 제한입니다.");
    byte[] content=zip.readNBytes(2_000_001);total+=content.length;
    if(content.length>2_000_000||total>32_000_000||e.getCompressedSize()>0&&content.length>Math.max(100_000,e.getCompressedSize()*100))throw bad("압축 해제 제한을 초과했습니다.");
    entries.put(name,content);zip.closeEntry();
   }
  }catch(IOException e){throw bad("읽을 수 없는 ZIP입니다. 암호·인코딩을 확인해주세요.");}
  if(entries.isEmpty()||total>Math.max(100_000,bytes.length*100L))throw bad("비어 있거나 압축률 제한을 초과했습니다.");
  return entries;
 }
}
