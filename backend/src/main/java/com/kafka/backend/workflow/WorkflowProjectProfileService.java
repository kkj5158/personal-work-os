package com.kafka.backend.workflow;

import com.kafka.backend.common.CurrentUserProvider;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Canonical projection: no stored progress or second Project identity. */
@Service
@Transactional(readOnly=true)
public class WorkflowProjectProfileService {
    private final WorkflowService workflow;
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    public WorkflowProjectProfileService(WorkflowService workflow,JdbcTemplate db,CurrentUserProvider users,ObjectMapper json){
        this.workflow=workflow;this.db=db;this.users=users;this.json=json;
    }
    public List<Map<String,Object>> profiles(){
        var aggregate=workflow.all();
        var appearance=new HashMap<UUID,Map<String,Object>>();
        db.query("select id,emoji,image_url from projects where user_id=?",(org.springframework.jdbc.core.RowCallbackHandler) r->{
            var value=new LinkedHashMap<String,Object>();value.put("emoji",r.getString("emoji"));value.put("imageUrl",r.getString("image_url"));appearance.put(r.getObject("id",UUID.class),value);
        },users.getCurrentUserId());
        return aggregate.projects().stream().map(p->{
            @SuppressWarnings("unchecked") Map<String,Object> value=new LinkedHashMap<>(json.convertValue(p,Map.class));
            value.putAll(appearance.get(p.id()));
            var progress=progress(p,aggregate.phases(),aggregate.tasks());
            value.put("progress",progress.percent());value.put("progressBasis",progress.basis());
            return value;
        }).toList();
    }
    public record Progress(int percent,String basis){}
    /** Mirrors the locked WORK FLOW V1 count/weight/override model used by its screens. */
    public static Progress progress(Project project,List<Phase> phases,List<Task> tasks){
        var active=tasks.stream().filter(t->project.id().equals(t.projectId())&&t.archivedAt()==null).toList();
        var groups=phases.stream().filter(p->project.id().equals(p.projectId())).toList();
        var ids=groups.stream().map(Phase::id).collect(java.util.stream.Collectors.toSet());
        var unassigned=active.stream().filter(t->t.phaseId()==null||!ids.contains(t.phaseId())).toList();
        double weight=0,value=0;boolean weighted=!groups.isEmpty();
        if(!unassigned.isEmpty()){
            weighted &= project.unassignedWeight()!=null;
            double w=project.unassignedWeight()==null?0:project.unassignedWeight().doubleValue();weight+=w;value+=ratio(unassigned)*w/100;
        }
        for(var group:groups){
            weighted &= group.weight()!=null;
            double w=group.weight()==null?0:group.weight().doubleValue();weight+=w;
            int percent=group.progressOverride()==null?ratio(active.stream().filter(t->group.id().equals(t.phaseId())).toList()):group.progressOverride();
            value+=percent*w/100;
        }
        weight=Math.round(weight*100)/100.0;
        weighted &= Math.abs(weight-100)<0.01;
        return new Progress(weighted?(int)Math.round(value):ratio(active),groups.isEmpty()?"count":weighted?"weighted":"unconfirmed");
    }
    private static int ratio(List<Task> tasks){return tasks.isEmpty()?0:(int)Math.round(tasks.stream().filter(t->"DONE".equals(t.status())).count()*100.0/tasks.size());}
}
