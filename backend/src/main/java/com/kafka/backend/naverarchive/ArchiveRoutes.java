package com.kafka.backend.naverarchive;
public final class ArchiveRoutes {
 public static final String PREFIX="/api/naver-archive";
 public static boolean allowed(String method,String path){
  if(!path.startsWith(PREFIX+"/"))return false;String p=path.substring(PREFIX.length());String id="[a-fA-F0-9-]{36}";
  return switch(method){
   case "GET" -> p.equals("/summary")||p.equals("/posts")||p.matches("/posts/"+id+"(/revisions(/[0-9]+)?)?")||p.matches("/imports/"+id)||p.matches("/operations/"+id);
   case "POST" -> p.equals("/posts")||p.equals("/posts/duplicate-check")||p.equals("/imports/preview")||p.matches("/posts/"+id+"/(archive|restore)")||p.matches("/imports/"+id+"/execute");
   case "PATCH" -> p.matches("/posts/"+id);
   default -> false;
  };
 }
}
