import java.sql.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** One read-only aggregate sample; never reads SQL text, identifiers, bodies, or application content. */
public class AttentionLatencyInspect {
    private static List<Map<String,Object>> rows(Connection connection,String sql)throws Exception {
        try(var statement=connection.createStatement()){
            statement.setQueryTimeout(5);try(var result=statement.executeQuery(sql)){
                var output=new ArrayList<Map<String,Object>>();while(result.next()){var row=new LinkedHashMap<String,Object>();for(int i=1;i<=result.getMetaData().getColumnCount();i++)row.put(result.getMetaData().getColumnLabel(i),result.getObject(i));output.add(row);}return output;
            }
        }
    }
    public static void main(String[] args)throws Exception {
        var output=new LinkedHashMap<String,Object>();output.put("observedAt",Instant.now().toString());output.put("scope","One Windows-to-DEV-DB read-only aggregate sample; not historical incident proof or Railway application pool telemetry.");
        String url=System.getenv("QA_DB_URL");url+=(url.contains("?")?"&":"?")+"options=-c%20default_transaction_read_only%3Don&connectTimeout=10&socketTimeout=15";
        var properties=new Properties();properties.put("user",System.getenv("QA_DB_USERNAME"));properties.put("password",System.getenv("QA_DB_PASSWORD"));properties.put("ApplicationName","work-queue-latency-readonly-inspect");
        long connected=System.nanoTime();try(var connection=DriverManager.getConnection(url,properties)){
            output.put("connectionMs",(System.nanoTime()-connected)/1_000_000);connection.setReadOnly(true);connection.setAutoCommit(false);
            Object readOnly=rows(connection,"show transaction_read_only").getFirst().get("transaction_read_only");if(!"on".equals(readOnly))throw new IllegalStateException("READ_ONLY_NOT_ENFORCED");output.put("readOnly",readOnly);
            var probes=new ArrayList<Long>();for(int i=0;i<3;i++){long before=System.nanoTime();rows(connection,"select 1 as ready");probes.add((System.nanoTime()-before)/1_000_000);}output.put("simpleQueryRttMs",probes);
            output.put("capacity",rows(connection,"select current_setting('max_connections')::int as max_connections,current_setting('superuser_reserved_connections')::int as reserved_connections,count(*) as visible_sessions,count(*) filter (where state='active') as active_sessions,count(*) filter (where state='idle in transaction') as idle_transactions,count(*) filter (where cardinality(pg_blocking_pids(pid))>0) as blocked_sessions from pg_stat_activity where datname=current_database()"));
            output.put("waits",rows(connection,"select coalesce(state,'UNAVAILABLE') as state,coalesce(wait_event_type,'NONE') as wait_type,coalesce(wait_event,'NONE') as wait_event,count(*) as sessions,round(max(extract(epoch from clock_timestamp()-xact_start))::numeric,3) as maximum_transaction_seconds from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() group by state,wait_event_type,wait_event order by state,wait_event_type,wait_event"));
            output.put("attentionRelationLocks",rows(connection,"select c.relname as relation,l.mode,l.granted,count(*) as locks from pg_locks l join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('attention_queues','attention_items','attention_lanes','attention_operations') group by c.relname,l.mode,l.granted order by c.relname,l.mode,l.granted"));
            output.put("attentionCounts",rows(connection,"select (select count(*) from public.attention_items) as items,(select count(*) from public.attention_queues) as queues,(select count(*) from public.attention_operations) as operations"));
            connection.rollback();
        }
        output.put("databaseMutationPerformed",false);Files.writeString(Path.of(System.getenv("QA_EVIDENCE_FILE")),JsonMapper.builder().build().writeValueAsString(output));System.out.println("ATTENTION_LATENCY_READONLY_SAMPLE=PASS");
    }
}
