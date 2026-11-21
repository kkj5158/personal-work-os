package com.kafka.backend.naverarchive;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.jsoup.Jsoup;
import org.w3c.dom.*;
import org.xml.sax.SAXException;

final class NaverRssFeed {
 static final String BLOG="yozo990", URL="https://rss.blog.naver.com/yozo990.xml";
 static final int MAX_BYTES=2_000_000, MAX_ITEMS=100;
 record Entry(String id,String title,String category,Instant published,String url,String excerpt,String hash,boolean truncated,int media){}
 record Feed(List<Entry> items,int invalid,String hash,Instant oldest,Instant newest){}
 static final class Failure extends RuntimeException {
  final String category;final boolean blocked;final Instant retryAt;
  Failure(String category){this(category,false,null);}
  Failure(String category,boolean blocked,Instant retryAt){super(category);this.category=category;this.blocked=blocked;this.retryAt=retryAt;}
 }
 static String id(String raw){
  if(raw==null||raw.length()>1000)return null;
  try{
   URI u=URI.create(raw);if(!"https".equals(u.getScheme())||!Set.of("blog.naver.com","m.blog.naver.com").contains(u.getHost())||u.getUserInfo()!=null||u.getPort()!=-1||u.getFragment()!=null)return null;
   if(u.getPath().matches("/"+BLOG+"/[0-9]{1,30}/?"))return u.getPath().replaceAll(".*/([0-9]+)/?$","$1");
   if(!"/PostView.naver".equals(u.getPath()))return null;
   Map<String,String> q=new HashMap<>();for(String part:Objects.toString(u.getRawQuery(),"").split("&")){String[] pair=part.split("=",2);if(pair.length==2&&q.put(pair[0],pair[1])!=null)return null;}
   return BLOG.equals(q.get("blogId"))&&Objects.toString(q.get("logNo"),"").matches("[0-9]{1,30}")?q.get("logNo"):null;
  }catch(RuntimeException e){return null;}
 }
 static String plain(String html){var d=Jsoup.parseBodyFragment(html);d.select("script,style,iframe,object,embed,noscript").remove();return d.body().wholeText().strip();}
 static String text(Element e,String name){for(Node n=e.getFirstChild();n!=null;n=n.getNextSibling())if(n instanceof Element x&&name.equals(x.getTagName()))return x.getTextContent();return "";}
 static Instant date(String raw){try{return ZonedDateTime.parse(raw,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();}catch(RuntimeException e){return null;}}
 static Feed parse(byte[] bytes){
  if(bytes.length>MAX_BYTES)throw new Failure("PAYLOAD_TOO_LARGE");
  try{
   var f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);f.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);f.setFeature("http://xml.org/sax/features/external-general-entities",false);f.setFeature("http://xml.org/sax/features/external-parameter-entities",false);f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");f.setXIncludeAware(false);f.setExpandEntityReferences(false);
   var parser=f.newDocumentBuilder();parser.setEntityResolver((p,s)->{throw new SAXException("ENTITY_DENIED");});parser.setErrorHandler(new org.xml.sax.helpers.DefaultHandler(){@Override public void fatalError(org.xml.sax.SAXParseException e)throws SAXException{throw e;}});
   Document doc=parser.parse(new ByteArrayInputStream(bytes));if(!"rss".equals(doc.getDocumentElement().getTagName()))throw new Failure("INVALID_RSS");
   var channels=doc.getDocumentElement().getElementsByTagName("channel");if(channels.getLength()!=1)throw new Failure("INVALID_RSS");
   Element channel=(Element)channels.item(0);String source=text(channel,"link");if(!source.isBlank()){
    URI u=URI.create(source);if(!"https".equals(u.getScheme())||!"blog.naver.com".equals(u.getHost())||!("/"+BLOG).equals(u.getPath())||u.getUserInfo()!=null||u.getPort()!=-1)throw new Failure("WRONG_BLOG");
   }
   var nodes=channel.getElementsByTagName("item");if(nodes.getLength()>MAX_ITEMS)throw new Failure("TOO_MANY_ITEMS");
   List<Entry> entries=new ArrayList<>();Set<String> ids=new HashSet<>();int invalid=0;
   for(int i=0;i<nodes.getLength();i++){
    Element e=(Element)nodes.item(i);String guid=text(e,"guid"),link=text(e,"link"),a=id(guid),b=id(link),post=a!=null?a:b;
    String title=plain(text(e,"title")),category=plain(text(e,"category")),html=text(e,"description");
    // content:encoded, if present, is still unverified source content. Never a full archive.
    if(post==null||!link.isBlank()&&b==null||a!=null&&b!=null&&!a.equals(b)||title.isBlank()||title.length()>500||category.length()>200||html.length()>100_000){invalid++;continue;}
    if(!ids.add(post))throw new Failure("DUPLICATE_FEED_ID");
    String excerpt=plain(html);if(excerpt.length()>20_000){invalid++;continue;}
    Instant published=date(text(e,"pubDate"));int media=Jsoup.parseBodyFragment(html).select("img,video,audio,iframe").size()+e.getElementsByTagName("enclosure").getLength()+e.getElementsByTagNameNS("http://search.yahoo.com/mrss/","*").getLength();
    String hash=ArchiveContent.hash(String.join("\0",post,title,category,Objects.toString(published,""),excerpt,Integer.toString(media)));
    entries.add(new Entry(post,title,category.isBlank()?null:category,published,"https://blog.naver.com/"+BLOG+"/"+post,excerpt,hash,excerpt.matches("(?s).*(?:\\.{3,}|…+)\\s*$"),media));
   }
   if(entries.isEmpty())throw new Failure("EMPTY_OR_INVALID_FEED");
   var dates=entries.stream().map(Entry::published).filter(Objects::nonNull).sorted().toList();
   return new Feed(List.copyOf(entries),invalid,HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)),dates.isEmpty()?null:dates.getFirst(),dates.isEmpty()?null:dates.getLast());
  }catch(Failure e){throw e;}catch(Exception e){throw new Failure("INVALID_XML");}
 }
}
