package com.kafka.backend.exercise;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.*;
@RestController @RequestMapping("/api/exercise/v1")
public class ExerciseController {
 final ObjectMapper wireJson=new ObjectMapper();
 final ExerciseService service;public ExerciseController(ExerciseService service){this.service=service;}
 @GetMapping(value="/state",produces="application/json") public String state(){return service.state().toString();}
 @PostMapping(value="/mutations",produces="application/json") public String mutate(@RequestBody String request){
  ObjectNode parsed;
  try{var node=wireJson.readTree(request);if(!(node instanceof ObjectNode))throw new IllegalArgumentException();parsed=(ObjectNode)node;}
  catch(Exception e){throw new ExerciseError(422,"INVALID_JSON","입력 형식을 확인해주세요.");}
  return service.mutate(parsed).toString();
 }
 @ExceptionHandler(ExerciseError.class) public ResponseEntity<?> error(ExerciseError e){var m=new LinkedHashMap<String,Object>(e.details);m.put("code",e.code);m.put("message",e.getMessage());return ResponseEntity.status(e.status).contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(wireJson.valueToTree(m).toString());}
 @ExceptionHandler({IllegalArgumentException.class,ClassCastException.class}) public ResponseEntity<?> invalid(Exception e){return ResponseEntity.unprocessableEntity().body(Map.of("code","INVALID_REQUEST","message","입력 내용을 확인해주세요."));}
}
