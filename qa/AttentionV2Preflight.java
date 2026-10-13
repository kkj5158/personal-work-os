import java.sql.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.flywaydb.core.Flyway;
import tools.jackson.databind.json.JsonMapper;

/** Read-only release preflight. No migrate/repair/clean, startup, fixture or credential output. */
public class AttentionV2Preflight {
    private static String fingerprint(Connection connection,String columns)throws Exception {
        var digest=MessageDigest.getInstance("SHA-256");
        try(var statement=connection.createStatement();var rows=statement.executeQuery("select "+columns+" from public.attention_items order by id")){
            while(rows.next())for(int i=1;i<=rows.getMetaData().getColumnCount();i++){
                String value=rows.getString(i);byte[] bytes=(value==null?"<NULL>":value).getBytes(StandardCharsets.UTF_8);
                digest.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array());digest.update(bytes);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }
    public static void main(String[] ignored)throws Exception {
        String url=System.getenv("QA_DB_URL"),user=System.getenv("QA_DB_USERNAME"),password=System.getenv("QA_DB_PASSWORD");
        String readOnlyUrl=url+(url.contains("?")?"&":"?")+"options=-c%20default_transaction_read_only%3Don&connectTimeout=15&socketTimeout=30";
        var props=new Properties();props.put("user",user);props.put("password",password);props.put("ApplicationName","work-queue-v2-readonly-preflight");
        var evidence=new LinkedHashMap<String,Object>();evidence.put("environment",System.getenv("QA_ENVIRONMENT"));evidence.put("observedAt",Instant.now().toString());evidence.put("databaseMutationPerformed",false);
        try(var connection=DriverManager.getConnection(readOnlyUrl,props)){
            connection.setReadOnly(true);connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);connection.setAutoCommit(false);
            try(var statement=connection.createStatement();var rows=statement.executeQuery("show transaction_read_only")){rows.next();String readOnly=rows.getString(1);if(!"on".equals(readOnly))throw new IllegalStateException("READ_ONLY_NOT_ENFORCED");evidence.put("transactionReadOnly",readOnly);}
            var applied=new ArrayList<Map<String,Object>>();
            try(var statement=connection.createStatement();var rows=statement.executeQuery("select version,script,checksum,success from public.flyway_schema_history where version is not null order by installed_rank")){
                while(rows.next()){var entry=new LinkedHashMap<String,Object>();entry.put("version",rows.getString(1));entry.put("script",rows.getString(2));entry.put("checksum",rows.getObject(3));entry.put("success",rows.getBoolean(4));applied.add(entry);}
            }evidence.put("appliedMigrations",applied);
            var columns=new ArrayList<Map<String,Object>>();
            try(var statement=connection.createStatement();var rows=statement.executeQuery("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='attention_items' order by ordinal_position")){
                while(rows.next()){var entry=new LinkedHashMap<String,Object>();entry.put("name",rows.getString(1));entry.put("type",rows.getString(2));entry.put("nullable",rows.getString(3));entry.put("default",rows.getString(4));columns.add(entry);}
            }evidence.put("attentionColumns",columns);
            if(columns.stream().anyMatch(column->"memo".equals(column.get("name")))&&columns.stream().anyMatch(column->"memo_revision".equals(column.get("name")))){
                try(var statement=connection.createStatement();var rows=statement.executeQuery("select count(*),count(*) filter (where memo='' and memo_revision=0),count(*) filter (where memo is null or memo_revision is null),count(*) filter (where memo<>''),count(*) filter (where memo_revision<>0) from public.attention_items")){
                    rows.next();evidence.put("memoDefaults",Map.of("total",rows.getLong(1),"emptyMemoRevisionZero",rows.getLong(2),"nullValues",rows.getLong(3),"nonemptyMemos",rows.getLong(4),"nonzeroMemoRevisions",rows.getLong(5)));
                }
            }
            var counts=new LinkedHashMap<String,Object>();
            for(String table:List.of("attention_items","attention_lanes","attention_operations"))try(var statement=connection.createStatement();var rows=statement.executeQuery("select count(*) from public."+table)){rows.next();counts.put(table,rows.getLong(1));}
            try(var statement=connection.createStatement();var rows=statement.executeQuery("select status,count(*) from public.attention_items group by status order by status")){var statuses=new LinkedHashMap<String,Long>();while(rows.next())statuses.put(rows.getString(1),rows.getLong(2));counts.put("lifecycle",statuses);}evidence.put("counts",counts);
            var fingerprints=new LinkedHashMap<String,String>();
            fingerprints.put("identitySource",fingerprint(connection,"id,user_id,source_key,generation,producer_namespace,md5(source)"));
            fingerprints.put("ordering",fingerprint(connection,"id,lane_id,stack_order,lane_order,attention_sequence"));
            fingerprints.put("lifecycle",fingerprint(connection,"id,status,completed_at,dismissed_at,seen_at"));
            fingerprints.put("revision",fingerprint(connection,"id,revision,updated_at"));evidence.put("fingerprints",fingerprints);
            connection.rollback();
            Path backlog=Path.of("D:/Planning_SPACE/WORK_QUEUE_PLANNING_20261004/09_IMPLEMENTATION/V2/PROD_V2_OLD_PENDING_IDS_20261013.json");
            if("PROD".equals(System.getenv("QA_ENVIRONMENT"))&&Files.exists(backlog)){
                var metadata=JsonMapper.builder().build().readTree(Files.readString(backlog));
                UUID owner=UUID.fromString(metadata.path("ownerId").asString());
                if(!owner.equals(UUID.fromString("53e4f63c-6d19-42e7-acc2-ec5536100fb3")))throw new IllegalStateException("FIXED_BACKLOG_OWNER_REQUIRED");
                var ids=new ArrayList<UUID>();for(var id:metadata.path("operations"))ids.add(UUID.fromString(id.asString()));
                if(ids.size()!=85||new HashSet<>(ids).size()!=85)throw new IllegalStateException("ORIGINAL_85_IDENTITIES_REQUIRED");
                String placeholders=String.join(",",Collections.nCopies(ids.size(),"?::uuid"));
                try(var statement=connection.prepareStatement("select count(distinct operation_id) from public.attention_operations where user_id=? and operation_id in ("+placeholders+")")){
                    statement.setObject(1,owner);for(int i=0;i<ids.size();i++)statement.setObject(i+2,ids.get(i));
                    try(var rows=statement.executeQuery()){rows.next();long matched=rows.getLong(1);evidence.put("preservedBacklogCanonicalAcknowledgement",Map.of("originalPending",ids.size(),"matchedCanonicalOperations",matched,"all85Acknowledged",matched==85,"readOnly",true));}
                }
                connection.rollback();
            }
        }
        var flyway=Flyway.configure().dataSource(readOnlyUrl,user,password).locations("filesystem:"+System.getenv("QA_MIGRATIONS")).cleanDisabled(true).validateMigrationNaming(true).load();
        var migrations=new ArrayList<Map<String,Object>>();
        for(var migration:flyway.info().all()){var entry=new LinkedHashMap<String,Object>();entry.put("version",migration.getVersion()==null?null:migration.getVersion().toString());entry.put("script",migration.getScript());entry.put("checksum",migration.getChecksum());entry.put("state",migration.getState().name());migrations.add(entry);}evidence.put("flywayInfo",migrations);
        var validation=flyway.validateWithResult();evidence.put("flywayValidationSuccessful",validation.validationSuccessful);
        if(validation.errorDetails!=null)evidence.put("flywayValidationError",Map.of("code",validation.errorDetails.errorCode.toString(),"message",validation.errorDetails.errorMessage));
        var invalid=new ArrayList<Map<String,Object>>();for(var migration:validation.invalidMigrations)invalid.add(Map.of("version",Objects.toString(migration.version,""),"description",Objects.toString(migration.description,""),"code",migration.errorDetails.errorCode.toString(),"message",migration.errorDetails.errorMessage));evidence.put("invalidMigrations",invalid);
        Files.writeString(Path.of(System.getenv("QA_EVIDENCE_FILE")),JsonMapper.builder().build().writeValueAsString(evidence));
        System.out.println("ATTENTION_PREFLIGHT_READ_ONLY=PASS");
        System.out.println("ATTENTION_PREFLIGHT_VALIDATION="+(validation.validationSuccessful?"PASS":"RECONCILIATION_REQUIRED"));
    }
}
