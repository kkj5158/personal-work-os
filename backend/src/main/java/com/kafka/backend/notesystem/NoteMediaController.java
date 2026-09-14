package com.kafka.backend.notesystem;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.io.*;

/** Stable media UUIDs; private authenticated reads, bounded validated raster bytes. */
@RestController
@RequestMapping("/api/note-system/workspaces/{w}/media")
public class NoteMediaController {
    private final JdbcTemplate db;private final CurrentUserProvider users;
    public NoteMediaController(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    public record Upload(String data,String mimeType) {}
    private void own(UUID w,boolean write){
        var found=db.queryForList("select id from note_workspaces where id=? and owner_id=?"+(write?" and archived_at is null for update":""),UUID.class,w,users.getCurrentUserId());
        if(found.isEmpty())throw new ResourceNotFoundException("Workspace를 찾을 수 없습니다.");
    }
    @PostMapping @Transactional public Map<String,Object> upload(@PathVariable UUID w,@RequestBody Upload in)throws IOException {
        own(w,true);
        var image=RasterMedia.decode(in.data());
        byte[] data=image.data();String mime=image.mimeType();int width=image.width(),height=image.height();
        UUID id=UUID.randomUUID();db.update("insert into journal_media(id,workspace_id,mime_type,width,height,data) values(?,?,?,?,?,?)",id,w,mime,width,height,data);
        return Map.of("id",id,"width",width,"height",height,"mimeType",mime);
    }
    @GetMapping("/{id}") public ResponseEntity<byte[]> read(@PathVariable UUID w,@PathVariable UUID id){
        own(w,false);var rows=db.query("select mime_type,data from journal_media where workspace_id=? and id=?",(r,n)->ResponseEntity.ok().contentType(MediaType.parseMediaType(r.getString(1))).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(r.getBytes(2)),w,id);
        if(rows.isEmpty())throw new ResourceNotFoundException("이미지를 찾을 수 없습니다.");return rows.getFirst();
    }
}
