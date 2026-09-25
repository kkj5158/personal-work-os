import java.sql.*;
import java.util.Properties;
import org.flywaydb.core.Flyway;

/** QA-only tool. Never calls migrate, repair, clean or changes application data. */
public class DatabaseAudit {
    public static void main(String[] args) throws Exception {
        String url = System.getenv("DEV_DB_URL");
        Properties props = new Properties();
        props.setProperty("user", System.getenv("DEV_DB_USERNAME"));
        props.setProperty("password", System.getenv("DEV_DB_PASSWORD"));
        props.setProperty("ApplicationName", "pos-qa-audit");
        props.setProperty("connectTimeout", "15");
        props.setProperty("socketTimeout", "30");
        try (Connection connection = DriverManager.getConnection(url, props)) {
            connection.setReadOnly(true);
            if (args.length > 0 && args[0].equals("connections")) {
                try (PreparedStatement statement = connection.prepareStatement("select count(*) from pg_stat_activity where application_name=?")) {
                    statement.setString(1, "qa-" + System.getenv("QA_RUN_ID"));
                    for (int retry = 0; retry < 20; retry++) {
                        try (ResultSet rows = statement.executeQuery()) {
                            rows.next();
                            if (rows.getInt(1) == 0) { System.out.println("QA_OWNED_DB_CONNECTIONS=0"); return; }
                        }
                        Thread.sleep(250);
                    }
                    throw new IllegalStateException("QA_OWNED_DB_CONNECTIONS_REMAIN");
                }
            }
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(15);
                try (ResultSet rows = statement.executeQuery("select current_setting('max_connections')::int - current_setting('superuser_reserved_connections')::int - (select count(*) from pg_stat_activity)")) {
                    rows.next(); int available = rows.getInt(1);
                    System.out.println("QA_DB_CAPACITY_ESTIMATE=" + available);
                    if (available < 4) throw new IllegalStateException("QA_DB_CAPACITY_INSUFFICIENT");
                }
                try (ResultSet rows = statement.executeQuery("select version,success from public.flyway_schema_history where version is not null order by installed_rank")) {
                    while (rows.next()) System.out.println("QA_APPLIED_VERSION=" + rows.getString(1) + ":" + rows.getBoolean(2));
                }
            }
        }
        // PostgreSQL itself enforces read-only connections, including Flyway's connections.
        String readOnlyUrl = url + (url.contains("?") ? "&" : "?") + "options=-c%20default_transaction_read_only%3Don&connectTimeout=15&socketTimeout=30";
        Flyway flyway = Flyway.configure().dataSource(readOnlyUrl, props.getProperty("user"), props.getProperty("password"))
            .locations("filesystem:" + System.getenv("QA_MIGRATIONS")).cleanDisabled(true).load();
        var info = flyway.info();
        int futureCount = 0;
        for (var migration : info.all()) {
            if (migration.getState().name().startsWith("FUTURE")) {
                futureCount++;
                System.out.println("QA_FUTURE_VERSION=" + migration.getVersion());
            }
        }
        if (futureCount > 0 && "integration".equals(System.getenv("QA_MODE"))) throw new IllegalStateException("QA_FUTURE_MIGRATIONS_REQUIRE_RECONCILIATION");
        if (info.pending().length != 0) throw new IllegalStateException("QA_PENDING_MIGRATIONS_REQUIRE_RECONCILIATION");
        flyway.validate();
        System.out.println("QA_FLYWAY_VALIDATE=PASS");
    }
}
