package com.kafka.backend.notesystem;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.io.*;
import javax.imageio.ImageIO;

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
        if(in.data()==null||in.data().length()>13981016)throw new InvalidRequestException("이미지는 최대 10MB입니다.");
        byte[] data;try{data=Base64.getDecoder().decode(in.data());}catch(IllegalArgumentException e){throw new InvalidRequestException("이미지 데이터가 올바르지 않습니다.");}
        if(data.length==0||data.length>10485760)throw new InvalidRequestException("이미지는 최대 10MB입니다.");
        String mime;int width,height;
        try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(data))){
            var readers=ImageIO.getImageReaders(stream);if(!readers.hasNext())throw new InvalidRequestException("PNG, JPEG, GIF 이미지를 사용하세요. WebP는 브라우저에서 PNG로 변환됩니다.");
            var reader=readers.next();try{reader.setInput(stream);width=reader.getWidth(0);height=reader.getHeight(0);mime=switch(reader.getFormatName().toLowerCase(Locale.ROOT)){case "png"->"image/png";case "jpeg","jpg"->"image/jpeg";case "gif"->"image/gif";default->throw new InvalidRequestException("지원하지 않는 이미지 형식입니다.");};}finally{reader.dispose();}
        }
        if(width<1||height<1||(long)width*height>40000000)throw new InvalidRequestException("이미지 해상도가 너무 큽니다 (최대 40MP).");
        UUID id=UUID.randomUUID();db.update("insert into journal_media(id,workspace_id,mime_type,width,height,data) values(?,?,?,?,?,?)",id,w,mime,width,height,data);
        return Map.of("id",id,"width",width,"height",height,"mimeType",mime);
    }
    @GetMapping("/{id}") public ResponseEntity<byte[]> read(@PathVariable UUID w,@PathVariable UUID id){
        own(w,false);var rows=db.query("select mime_type,data from journal_media where workspace_id=? and id=?",(r,n)->ResponseEntity.ok().contentType(MediaType.parseMediaType(r.getString(1))).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(r.getBytes(2)),w,id);
        if(rows.isEmpty())throw new ResourceNotFoundException("이미지를 찾을 수 없습니다.");return rows.getFirst();
    }
}
