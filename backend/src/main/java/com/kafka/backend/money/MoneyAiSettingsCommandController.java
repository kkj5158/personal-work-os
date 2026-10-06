package com.kafka.backend.money;
import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/money/ai/settings-command")
public class MoneyAiSettingsCommandController {
 private final MoneyAiService ai;private final MoneyCommandService commands;private final CurrentUserProvider users;
 public MoneyAiSettingsCommandController(MoneyAiService ai,MoneyCommandService commands,CurrentUserProvider users){this.ai=ai;this.commands=commands;this.users=users;}
 public record Input(UUID requestId,Long expectedVersion,Boolean automaticRules,Boolean externalLookup){}
 @PostMapping public Map<String,Object> save(@RequestBody Input input){return commands.execute(users.getCurrentUserId(),input.requestId(),"AI_SETTINGS",input,()->ai.settings(new MoneyAiService.SettingsInput(input.expectedVersion(),input.automaticRules(),input.externalLookup())));}
}
