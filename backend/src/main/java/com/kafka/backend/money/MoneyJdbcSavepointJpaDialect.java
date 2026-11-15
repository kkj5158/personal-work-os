package com.kafka.backend.money;

import jakarta.persistence.EntityManager;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.jdbc.datasource.JdbcTransactionObjectSupport;
import org.springframework.transaction.TransactionDefinition;
import java.sql.SQLException;

/** Spring 7 requires transaction data to implement SavepointManager explicitly.
 * Supply Spring's JDBC savepoint implementation for MONEY's JDBC-only nested commands.
 * Ordinary Hibernate transaction begin, isolation, flush and cleanup still use the vendor dialect.
 * Nested command scopes must never manipulate JPA entities/persistence-context state.
 */
final class MoneyJdbcSavepointJpaDialect extends HibernateJpaDialect {
 private static final class Data extends JdbcTransactionObjectSupport {
  final Object vendorData;
  Data(Object vendorData,java.sql.Connection connection){this.vendorData=vendorData;setConnectionHolder(new ConnectionHolder(connection));setSavepointAllowed(true);}
 }
 @Override public Object beginTransaction(EntityManager em,TransactionDefinition definition)throws SQLException{
  Object original=super.beginTransaction(em,definition);
  return new Data(original,getJdbcConnection(em,definition.isReadOnly()).getConnection());
 }
 @Override public void cleanupTransaction(Object data){super.cleanupTransaction(data instanceof Data d?d.vendorData:data);}
}
