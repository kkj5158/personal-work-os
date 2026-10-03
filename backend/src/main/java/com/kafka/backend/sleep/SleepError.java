package com.kafka.backend.sleep;
import java.util.*;
public class SleepError extends RuntimeException {
 public final int status; public final Map<String,Object> body;
 public SleepError(int status,String code,String message,Object... fields){
  super(message);this.status=status;body=new LinkedHashMap<>();body.put("code",code);body.put("message",message);
  for(int i=0;i<fields.length;i+=2)body.put((String)fields[i],fields[i+1]);
 }
}
