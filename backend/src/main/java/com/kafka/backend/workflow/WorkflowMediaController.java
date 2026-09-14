package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.*;

@RestController
@RequestMapping("/api/workflow/images")
public class WorkflowMediaController {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public WorkflowMediaController(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    public record Upload(String data,String mimeType) {}
    @PostMapping public Map<String,Object> upload(@RequestBody Upload in)throws IOException {
        var image=RasterMedia.decode(in.data());UUID id=UUID.randomUUID();
        db.update("insert into journal_media(id,workflow_owner_id,mime_type,width,height,data) values(?,?,?,?,?,?)",id,users.getCurrentUserId(),image.mimeType(),image.width(),image.height(),image.data());
        return Map.of("id",id,"width",image.width(),"height",image.height(),"mimeType",image.mimeType());
    }
    @GetMapping("/{id}") public ResponseEntity<byte[]> read(@PathVariable UUID id){
        var rows=db.query("select mime_type,data from journal_media where workflow_owner_id=? and id=?",(r,n)->ResponseEntity.ok().contentType(MediaType.parseMediaType(r.getString(1))).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(r.getBytes(2)),users.getCurrentUserId(),id);
        if(rows.isEmpty())throw new ResourceNotFoundException("Image not found");return rows.getFirst();
    }
}
