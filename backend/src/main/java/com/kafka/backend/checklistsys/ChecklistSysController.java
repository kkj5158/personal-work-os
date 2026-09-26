package com.kafka.backend.checklistsys;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.kafka.backend.checklistsys.ChecklistSysTypes.*;

@RestController
@RequestMapping("/api/checklist-sys")
@ResponseStatus(HttpStatus.NO_CONTENT)
public class ChecklistSysController {
    private final ChecklistSysService service;

    public ChecklistSysController(ChecklistSysService service) { this.service = service; }

    @GetMapping @ResponseStatus(HttpStatus.OK)
    public Catalog catalog() { return service.catalog(); }

    @GetMapping("/records") @ResponseStatus(HttpStatus.OK)
    public List<DailyRecord> records(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                     @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.records(from, to);
    }

    @PutMapping("/records") public void saveRecords(@RequestBody RecordChanges input) { service.saveRecords(input); }

    @PutMapping("/identities/order") public void orderIdentities(@RequestBody OrderInput input) { service.orderIdentities(input); }
    @PutMapping("/identities/{id}") public void saveIdentity(@PathVariable UUID id, @RequestBody Identity input) { service.saveIdentity(id, input); }
    @DeleteMapping("/identities/{id}") public void deleteIdentity(@PathVariable UUID id) { service.deleteIdentity(id); }

    @PutMapping("/areas/order") public void orderAreas(@RequestBody OrderInput input) { service.orderAreas(input); }
    /** Area ownership move + target order, atomically (same Area id; items and history untouched). */
    @PutMapping("/areas/{id}/move") public void moveArea(@PathVariable UUID id, @RequestBody OrderInput input) { service.moveArea(id, input); }
    @PutMapping("/areas/{id}") public void saveArea(@PathVariable UUID id, @RequestBody Area input) { service.saveArea(id, input); }
    @DeleteMapping("/areas/{id}") public void deleteArea(@PathVariable UUID id) { service.deleteArea(id); }

    @PutMapping("/items/order") public void orderItems(@RequestBody OrderInput input) { service.orderItems(input); }
    @PutMapping("/items/{id}") public void saveItem(@PathVariable UUID id, @RequestBody Item input) { service.saveItem(id, input); }
    /** Delete = archive. Items are never physically removed. */
    @PostMapping("/items/{id}/archive") public void archiveItem(@PathVariable UUID id) { service.archiveItem(id); }
    @PostMapping("/items/{id}/restore") public void restoreItem(@PathVariable UUID id) { service.restoreItem(id); }
}
