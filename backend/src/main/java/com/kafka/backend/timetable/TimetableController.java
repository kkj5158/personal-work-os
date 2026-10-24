package com.kafka.backend.timetable;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.kafka.backend.timetable.TimetableTypes.*;
import com.kafka.backend.common.InvalidRequestException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.DeserializationFeature;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/calendar/timetables")
public class TimetableController {
    private final TimetableService service;
    private static final JsonMapper STRICT=JsonMapper.builder().disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private <T>T input(JsonNode node,Class<T> type){if(node==null||!node.isObject())throw new InvalidRequestException("입력 정보를 확인하세요.");return STRICT.treeToValue(node,type);}
    @ExceptionHandler({tools.jackson.core.JacksonException.class,org.springframework.web.bind.MissingRequestHeaderException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","시각·요일·버전·요청 식별자를 확인하세요."));}
    public TimetableController(TimetableService service){this.service=service;}
    @GetMapping public List<Timetable> list(){return service.list();}
    @GetMapping("/context") public Map<String,UUID> context(){return service.context();}
    @PostMapping public Timetable create(@RequestBody JsonNode in,@RequestHeader("Idempotency-Key") UUID key){return service.create(input(in,Input.class),key);}
    @PutMapping("/order") public List<Timetable> reorder(@RequestBody JsonNode in){return service.reorder(input(in,ReorderInput.class));}
    @GetMapping("/{id}") public Timetable get(@PathVariable UUID id){return service.get(id);}
    @PutMapping("/{id}") public Timetable update(@PathVariable UUID id,@RequestBody JsonNode in){return service.update(id,input(in,Input.class));}
    @PutMapping("/{id}/archive") public Timetable archive(@PathVariable UUID id,@RequestBody JsonNode in){return service.archive(id,input(in,ArchiveInput.class));}
    @PostMapping("/{id}/duplicate") public Timetable duplicate(@PathVariable UUID id,@RequestBody JsonNode in,@RequestHeader("Idempotency-Key") UUID key){return service.duplicate(id,input(in,VersionInput.class),key);}
    @GetMapping("/{id}/philosophy") public Philosophy philosophy(@PathVariable UUID id){return service.philosophy(id);}
    @PutMapping("/{id}/philosophy") public Philosophy philosophy(@PathVariable UUID id,@RequestBody JsonNode in){return service.savePhilosophy(id,input(in,PhilosophyInput.class));}
    @GetMapping("/{id}/blocks") public List<Block> blocks(@PathVariable UUID id){return service.blocks(id);}
    @PostMapping("/{id}/blocks") public Blocks createBlocks(@PathVariable UUID id,@RequestBody JsonNode in,@RequestHeader("Idempotency-Key") UUID key){return service.createBlocks(id,input(in,CreateBlocks.class),key);}
    @PutMapping("/{id}/block-groups/{group}") public Blocks updateGroup(@PathVariable UUID id,@PathVariable UUID group,@RequestBody JsonNode in,@RequestHeader("Idempotency-Key") UUID key){return service.updateGroup(id,group,input(in,UpdateGroup.class),key);}
    @PutMapping("/{id}/block-groups/{group}/placement") public Blocks placeGroup(@PathVariable UUID id,@PathVariable UUID group,@RequestBody JsonNode in,@RequestHeader("Idempotency-Key") UUID key){return service.placeGroup(id,group,input(in,GroupPlacement.class),key);}
    @PutMapping("/{id}/blocks/{block}") public Block updateBlock(@PathVariable UUID id,@PathVariable UUID block,@RequestBody JsonNode in){return service.updateBlock(id,block,input(in,BlockInput.class));}
    @DeleteMapping("/{id}/blocks/{block}") public Block deleteBlock(@PathVariable UUID id,@PathVariable UUID block,@RequestParam long version){return service.deleteBlock(id,block,new VersionInput(version));}
    @PostMapping("/{id}/blocks/{block}/restore") public Block restoreBlock(@PathVariable UUID id,@PathVariable UUID block,@RequestBody JsonNode in){return service.restoreBlock(id,block,input(in,VersionInput.class));}
}
