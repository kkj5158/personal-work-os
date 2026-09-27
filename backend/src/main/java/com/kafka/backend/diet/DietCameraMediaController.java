package com.kafka.backend.diet;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/diet/camera-media")
public class DietCameraMediaController {
    private final DietCameraMediaService media;private final DietNoteSync sync;private final CurrentUserProvider users;
    private final String environment;
    public DietCameraMediaController(DietCameraMediaService media,DietNoteSync sync,CurrentUserProvider users,@Value("${app.db-environment}") String environment){this.media=media;this.sync=sync;this.users=users;this.environment=environment;}
    @GetMapping("/session") public Map<String,Object> session(){return Map.of("ownerId",users.getCurrentUserId(),"environment",environment);}
    @GetMapping public List<DietCameraMediaService.Media> list(@RequestParam(required=false) LocalDate date){return media.list(date);}
    @GetMapping("/{client}") public DietCameraMediaService.Media get(@PathVariable UUID client){return media.get(client);}
    @GetMapping("/{client}/image") public ResponseEntity<byte[]> image(@PathVariable UUID client){return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(media.image(client));}
    @PutMapping("/{client}") public DietCameraMediaService.Media put(@PathVariable UUID client,@RequestBody DietCameraMediaService.Input input)throws java.io.IOException{
        var saved=media.put(client,input); // canonical transaction commits before projection
        try{sync.project(List.of(saved.capturedDate()));}catch(RuntimeException ignored){/* durable projection_pending remains; same identity retries safely */}
        return saved.purgeRequested()?media.finishPurge(client):media.get(client);
    }
    @PostMapping("/{client}/reconcile") public DietCameraMediaService.Media reconcile(@PathVariable UUID client){
        var saved=media.get(client);
        try{sync.project(List.of(saved.capturedDate()));}catch(RuntimeException ignored){/* pending is exposed, never reported as complete */}
        return saved.purgeRequested()?media.finishPurge(client):media.get(client);
    }
}
