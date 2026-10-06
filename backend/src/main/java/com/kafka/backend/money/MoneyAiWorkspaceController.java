package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/ai/workspace")
public class MoneyAiWorkspaceController {
 private final MoneyAiWorkspaceService service;
 public MoneyAiWorkspaceController(MoneyAiWorkspaceService service){this.service=service;}
 @GetMapping public Map<String,Object> read(){service.retain();return service.read();}
 @GetMapping("/conversations/{id}") public Map<String,Object> conversation(@PathVariable UUID id){service.retain();return service.readConversation(id);}
 @PostMapping("/messages") public Map<String,Object> message(@RequestBody MoneyAiWorkspaceService.Message input){service.retain();return service.message(input);}
 @PostMapping("/conversation-change") public Map<String,Object> change(@RequestBody MoneyAiWorkspaceService.ConversationChange input){return service.changeConversation(input);}
 @PostMapping("/drafts") public Map<String,Object> draft(@RequestBody MoneyAiWorkspaceService.DraftInput input){return service.saveDraft(input);}
 @PostMapping("/preview") public Map<String,Object> preview(@RequestBody List<MoneyAiWorkspaceService.Selection> selected){return service.preview(selected);}
 @PostMapping("/approve") public Map<String,Object> approve(@RequestBody MoneyAiWorkspaceService.Approval input){return service.approve(input);}
 @PostMapping("/discard") public Map<String,Object> discard(@RequestBody MoneyAiWorkspaceService.Discard input){return service.discard(input);}
}
