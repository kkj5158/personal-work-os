package com.kafka.backend.money;

import java.util.Map;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.money.MoneyBookkeepingWorkspace.*;

@RestController
public class MoneyBookkeepingWorkspaceController {
    private final MoneyBookkeepingWorkspace workspace;
    private final MoneyOrbitConsoleService console;

    public MoneyBookkeepingWorkspaceController(MoneyBookkeepingWorkspace workspace, MoneyOrbitConsoleService console) {
        this.workspace=workspace;
        this.console=console;
    }

    @GetMapping("/api/money/bookkeeping/unified/confirmed")
    public Map<String,Object> confirmed(@ModelAttribute Filter filter) {
        return workspace.confirmed(filter);
    }

    @GetMapping("/api/money/bookkeeping/unified/review")
    public Map<String,Object> review(@RequestParam Lane lane,@RequestParam(defaultValue="25") int limit,
            @RequestParam(defaultValue="0") int offset) {
        return workspace.review(lane,limit,offset);
    }

    @GetMapping("/api/orbit/money/v1/unified-transactions")
    public Object orbitConfirmed(@ModelAttribute Filter filter) {
        return console.envelope(workspace.confirmed(filter));
    }

    @GetMapping("/api/orbit/money/v1/workspace-review")
    public Object orbitReview(@RequestParam Lane lane,@RequestParam(defaultValue="25") int limit,
            @RequestParam(defaultValue="0") int offset) {
        return console.envelope(workspace.review(lane,limit,offset));
    }
}
