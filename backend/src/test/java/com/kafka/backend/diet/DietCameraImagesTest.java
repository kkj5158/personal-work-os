package com.kafka.backend.diet;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class DietCameraImagesTest {
    final JsonMapper json=JsonMapper.builder().build();
    Map<String,Object> image(String src){return Map.of("src",src,"caption","memo [[literal]]","ratio",100);}
    @Test void groupsOfThreeAreStableAndPreserveTextAndForeignImages(){
        var images=List.of(image("media:a"),image("media:b"),image("media:c"),image("media:d"));
        var owned=Set.of("media:a","media:b","media:c","media:d");
        String user=":::diet {\"v\":1}\n:::\n\nUser [[note]]\n\n:::images {\"images\":[{\"src\":\"media:foreign\",\"caption\":\"Keep\",\"ratio\":100}],\"width\":80,\"align\":\"right\"}\n:::\n";
        String first=DietCameraImages.merge(user,owned,images,json);
        assertThat(first).contains("User [[note]]","media:foreign","\"width\":80");
        assertThat(first.split(":::images ",-1)).hasSize(4);
        assertThat(DietCameraImages.merge(first,owned,images,json)).isEqualTo(first);
        String removed=DietCameraImages.merge(first,owned,List.of(),json);
        assertThat(removed).contains("User [[note]]","media:foreign").doesNotContain("media:a","media:b","media:c","media:d");
        assertThat(DietCameraImages.merge(removed,owned,images,json)).isEqualTo(first);
    }
    @Test void photoOnlyAndMixedRowsAndLiteralExamples(){
        var owned=Set.of("media:a");var images=List.of(image("media:a"));
        String first=DietCameraImages.merge("",owned,images,json);
        assertThat(DietCameraImages.merge(first,owned,images,json)).isEqualTo(first);
        assertThat(DietCameraImages.merge(first,owned,List.of(),json)).isEmpty();
        String mixed=":::images {\"images\":[{\"src\":\"media:a\"},{\"src\":\"media:foreign\"}],\"width\":75}\n:::\nuser";
        assertThat(DietCameraImages.merge(mixed,owned,List.of(),json)).contains("media:foreign","user","75").doesNotContain("media:a");
        String literal="```text\n"+first+"\n```\nUser";
        assertThat(DietCameraImages.merge(literal,owned,List.of(),json)).isEqualTo(literal);
    }
    @Test void frozenOffsetControlsMidnightAndUploadTimeIsIrrelevant(){
        assertThat(DietCameraMediaService.captureDate(Instant.parse("2026-09-27T15:00:00Z"),540)).hasToString("2026-09-28");
        assertThat(DietCameraMediaService.captureDate(Instant.parse("2026-09-27T14:59:59.999Z"),540)).hasToString("2026-09-27");
        assertThat(DietCameraMediaService.captureDate(Instant.parse("2026-01-01T00:30:00Z"),-120)).hasToString("2025-12-31");
    }
}
