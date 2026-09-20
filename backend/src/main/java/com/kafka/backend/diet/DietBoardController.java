package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.*;
import static com.kafka.backend.diet.DietBoardService.*;

@RestController
@RequestMapping("/api/diet/board")
public class DietBoardController {
    private final DietBoardService service;
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public DietBoardController(DietBoardService service,JdbcTemplate db,CurrentUserProvider users){this.service=service;this.db=db;this.users=users;}
    @GetMapping public Board read(){return service.read();}
    @PutMapping("/sections/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void section(@PathVariable UUID id,@RequestBody Section in){service.section(id,in);}
    @PutMapping("/columns/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void column(@PathVariable UUID id,@RequestBody Column in){service.column(id,in);}
    @PutMapping("/blocks/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void block(@PathVariable UUID id,@RequestBody Block in){service.block(id,in);}
    @PutMapping("/identities/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void identity(@PathVariable UUID id,@RequestBody Identity in){service.identity(id,in);}
    @PutMapping("/order/{kind}") @ResponseStatus(HttpStatus.NO_CONTENT) public void reorder(@PathVariable String kind,@RequestBody Order in){service.reorder(kind,in);}
    @PutMapping("/blocks/{id}/move") @ResponseStatus(HttpStatus.NO_CONTENT) public void move(@PathVariable UUID id,@RequestBody Move in){service.move(id,in);}
    @DeleteMapping("/{kind}/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable String kind,@PathVariable UUID id){service.delete(kind,id);}
    @PostMapping("/images") @ResponseStatus(HttpStatus.NO_CONTENT) public void upload(@RequestBody Upload in)throws IOException{service.upload(in);}
    @GetMapping("/images/{id}") public ResponseEntity<byte[]> image(@PathVariable UUID id){
        var rows=db.query("select mime_type,data from journal_media where diet_owner_id=? and id=?",(r,n)->ResponseEntity.ok().contentType(MediaType.parseMediaType(r.getString(1))).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(r.getBytes(2)),users.getCurrentUserId(),id);
        if(rows.isEmpty())throw new ResourceNotFoundException("이미지를 찾을 수 없습니다.");return rows.getFirst();
    }
}
