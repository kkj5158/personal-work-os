package com.kafka.backend.exercise;
import java.util.Map;
public class ExerciseError extends RuntimeException {
 final int status; final String code; final Map<String,Object> details;
 ExerciseError(int status,String code,String message){this(status,code,message,Map.of());}
 ExerciseError(int status,String code,String message,Map<String,Object> details){super(message);this.status=status;this.code=code;this.details=details;}
}
