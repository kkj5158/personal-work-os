package com.kafka.backend.diet;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import java.util.*;

/** Emulator-only fixture host. Test classpath only; never packaged in the production JAR. */
@Configuration @EnableAutoConfiguration
@Import({DietMeasurementService.class,DietMeasurementController.class,com.kafka.backend.common.ApiExceptionHandler.class,DietApiErrors.class})
public class DietMeasurementQaApplication {
 public static void main(String[] args){
  String url=System.getenv("DIET_MEASUREMENT_DB_URL");
  if(url==null||!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/diet_v2_qa"))throw new IllegalStateException("Disposable loopback QA database required");
  var app=new SpringApplication(DietMeasurementQaApplication.class);
  var props=new java.util.HashMap<String,String>();props.put("server.address","127.0.0.1");props.put("server.port","18766");props.put("spring.datasource.url",url);props.put("spring.datasource.username","diet_qa");props.put("spring.datasource.password","");props.put("spring.flyway.enabled","false");props.put("spring.jpa.hibernate.ddl-auto","none");props.put("spring.jpa.open-in-view","false");props.put("spring.main.banner-mode","off");props.put("spring.config.location","optional:classpath:/measurement-qa.properties");props.forEach(System::setProperty);app.run(args);
 }
 @Bean CurrentUserProvider qaUser(){return ()->UUID.fromString("11111111-1111-4111-8111-111111111111");}
 @Bean SecurityFilterChain qaSecurity(HttpSecurity http)throws Exception{return http.csrf(c->c.disable()).authorizeHttpRequests(a->a.anyRequest().permitAll()).build();}
}
