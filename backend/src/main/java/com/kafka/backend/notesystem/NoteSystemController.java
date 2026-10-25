package com.kafka.backend.notesystem;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.notesystem.NoteTypes.*;

@RestController
@RequestMapping("/api/note-system")
public class NoteSystemController {
    private final NoteSystemService service;
    private final com.kafka.backend.diet.DietNoteSync dietSync;
    @org.springframework.beans.factory.annotation.Autowired
    public NoteSystemController(NoteSystemService service,com.kafka.backend.diet.DietNoteSync dietSync){this.service=service;this.dietSync=dietSync;}
    public NoteSystemController(NoteSystemService service){this(service,null);}
    private void refreshDiet(UUID w,LocalDate date){
        if(dietSync==null||date==null)return;var settings=dietSync.settings();
        if(settings.enabled()&&w.equals(settings.workspaceId()))dietSync.project(List.of(date));
    }
    private boolean isDiet(UUID w){if(dietSync==null)return false;var settings=dietSync.settings();return settings.enabled()&&w.equals(settings.workspaceId());}
    private Note withDashboard(Note n){
        if(n.journalDate()==null||!isDiet(n.workspaceId())||com.kafka.backend.diet.DietJournalContent.hasDashboard(n.content()))return n;
        return new Note(n.id(),n.workspaceId(),n.type(),n.journalDate(),n.title(),com.kafka.backend.diet.DietNoteProjection.merge(n.content(),dietSync.dashboard(n.journalDate())),n.version(),n.pinnedAt(),n.deletedAt(),n.createdAt(),n.updatedAt(),n.aliases(),n.tags());
    }    @GetMapping("/workspaces") public List<Workspace> workspaces(){return service.workspaces();}
    @PutMapping("/workspaces/reorder") public List<Workspace> reorderWorkspaces(@RequestBody WorkspaceOrderInput in){return service.reorderWorkspaces(in.orderedIds());}
    @PostMapping("/workspaces") public Map<String,UUID> createWorkspace(@Valid @RequestBody WorkspaceInput in){return Map.of("id",service.createWorkspace(in));}
    @PutMapping("/workspaces/{w}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void workspace(@PathVariable UUID w,@Valid @RequestBody WorkspaceInput in){service.updateWorkspace(w,in);}
    @DeleteMapping("/workspaces/{w}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void deleteWorkspace(@PathVariable UUID w,@RequestParam String confirmation){service.deleteWorkspace(w,confirmation);}
    @GetMapping("/settings") public Settings settings(){return service.settings();}
    @GetMapping("/settings/main-workspace") public MainWorkspace mainWorkspace(){return service.mainWorkspace();}
    @PutMapping("/settings/main-workspace") public MainWorkspace mainWorkspace(@Valid @RequestBody MainWorkspace value){return service.mainWorkspace(value);}
    @GetMapping("/daily-hub/settings") public DailyHubSettings dailyHubSettings(){return service.dailyHubSettings();}
    @PutMapping("/daily-hub/settings") public DailyHubSettings dailyHubSettings(@Valid @RequestBody DailyHubSettings settings){return service.dailyHubSettings(settings);}
    @GetMapping("/daily-hub") public List<Note> dailyHub(@RequestParam LocalDate date){return service.dailyHub(date);}
    @GetMapping("/daily-hub/records") public List<DailyHubRecord> dailyHubRecords(@RequestParam LocalDate end,@RequestParam(defaultValue="31") int days){return service.dailyHubRecords(end,days);}
    @GetMapping("/daily-hub/recent") public List<DailyHubRecord> dailyHubRecent(@RequestParam(defaultValue="30") int limit){return service.dailyHubRecent(limit);}
    @PutMapping("/settings") public Settings settings(@Valid @RequestBody Settings settings){return service.settings(settings);}
    @GetMapping("/workspaces/{w}/operational-notes") public List<Summary> operationalNotes(@PathVariable UUID w){return service.operationalNotes(w);}
    @PutMapping("/workspaces/{w}/operational-notes") public List<Summary> reorderOperationalNotes(@PathVariable UUID w,@Valid @RequestBody OperationalNoteOrderInput in){return service.reorderOperationalNotes(w,in);}
    @GetMapping("/workspaces/{w}/daily") public List<Note> daily(@PathVariable UUID w,@RequestParam LocalDate end,@RequestParam(defaultValue="14") int days){service.daily(w,end,days);refreshDiet(w,end);var rows=new ArrayList<>(service.daily(w,end,days));
        if(isDiet(w)){int index=-1;for(int i=0;i<rows.size();i++)if(end.equals(rows.get(i).journalDate()))index=i;
            if(index>=0)rows.set(index,withDashboard(rows.get(index)));
            else rows.add(new Note(UUID.randomUUID(),w,"DAILY",end,end.toString(),dietSync.dashboard(end),0,null,null,null,null,List.of(),List.of()));
        }return rows;}
    @GetMapping("/workspaces/{w}/notes") public Page<Summary> library(@PathVariable UUID w,@RequestParam(defaultValue="ALL") String filter,@RequestParam(defaultValue="") String q,@RequestParam(required=false) UUID tag,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="50") int limit){return service.library(w,filter,q,tag,offset,limit);}
    @PutMapping("/workspaces/{w}/notes") public Note save(@PathVariable UUID w,@Valid @RequestBody NoteInput in){return service.save(w,in);}
    @GetMapping("/workspaces/{w}/notes/{id}") public Note note(@PathVariable UUID w,@PathVariable UUID id){var note=service.note(w,id);refreshDiet(w,note.journalDate());return withDashboard(service.note(w,id));}
    @GetMapping("/workspaces/{w}/resolve") public Note resolve(@PathVariable UUID w,@RequestParam String title){return service.resolveNote(w,title);}
    @PostMapping("/workspaces/{w}/wiki") public Note openWiki(@PathVariable UUID w,@Valid @RequestBody RenameInput in){return service.openWiki(w,in.title());}
    @GetMapping("/workspaces/{w}/wiki") public List<SearchResult> wikiSuggestions(@PathVariable UUID w,@RequestParam(defaultValue="") String q){return service.wikiSuggestions(w,q);}
    @DeleteMapping("/workspaces/{w}/notes/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void deleteNote(@PathVariable UUID w,@PathVariable UUID id,@RequestParam long expectedVersion,@RequestParam String confirmation){service.deleteNote(w,id,expectedVersion,confirmation);}
    @PutMapping("/workspaces/{w}/notes/{id}/title") public Note rename(@PathVariable UUID w,@PathVariable UUID id,@Valid @RequestBody RenameInput in){return service.rename(w,id,in);}
    @PutMapping("/workspaces/{w}/notes/{id}/pin") public Note pin(@PathVariable UUID w,@PathVariable UUID id,@Valid @RequestBody VersionInput in){return service.pin(w,id,in);}
    @PutMapping("/workspaces/{w}/notes/{id}/trash") public Note trash(@PathVariable UUID w,@PathVariable UUID id,@Valid @RequestBody VersionInput in){return service.trash(w,id,in);}
    @PostMapping("/workspaces/{w}/notes/{id}/visit") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void visit(@PathVariable UUID w,@PathVariable UUID id){service.visit(w,id);}
    @GetMapping("/workspaces/{w}/tags") public List<Tag> tags(@PathVariable UUID w){return service.tags(w);}
    @PostMapping("/workspaces/{w}/tags") public Tag tag(@PathVariable UUID w,@Valid @RequestBody TagInput in){return service.createTag(w,in.name());}
    @PutMapping("/workspaces/{w}/tags/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void tag(@PathVariable UUID w,@PathVariable UUID id,@Valid @RequestBody TagInput in){service.renameTag(w,id,in.name());}
    @DeleteMapping("/workspaces/{w}/tags/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void deleteTag(@PathVariable UUID w,@PathVariable UUID id){service.deleteTag(w,id);}
    @PostMapping("/workspaces/{w}/notes/{id}/tags") public Note attach(@PathVariable UUID w,@PathVariable UUID id,@Valid @RequestBody TagInput in){return service.tag(w,id,in.name(),true);}
    @DeleteMapping("/workspaces/{w}/notes/{id}/tags") public Note detach(@PathVariable UUID w,@PathVariable UUID id,@RequestParam String name){return service.tag(w,id,name,false);}
    @GetMapping("/workspaces/{w}/references") public List<Reference> references(@PathVariable UUID w,@RequestParam(required=false) UUID target,@RequestParam(defaultValue="") String pending){return service.references(w,target,pending);}
    @GetMapping("/workspaces/{w}/pending") public List<Pending> pending(@PathVariable UUID w){return service.pending(w);}
    @GetMapping("/workspaces/{w}/metrics") public List<Metric> metrics(@PathVariable UUID w){return service.metrics(w);}
    @GetMapping("/workspaces/{w}/graph") public Graph graph(@PathVariable UUID w){return service.graph(w);}
    @GetMapping("/workspaces/{w}/search") public List<SearchResult> search(@PathVariable UUID w,@RequestParam String q,@RequestParam(defaultValue="30") int limit){return service.search(w,q,limit);}
    @GetMapping("/reflection-provider") public Map<String,Object> reflectionProvider(){return Map.of("available",true,"apiBasePath","/api/reflections");}
}
