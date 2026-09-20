package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.*;
import java.util.*;
import static com.kafka.backend.diet.DietBoardService.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIET_DB_TEST",matches="true")
@SpringJUnitConfig(DietBoardIntegrationTest.Config.class)
@Transactional
class DietBoardIntegrationTest {
    static class User implements CurrentUserProvider {UUID id;public UUID getCurrentUserId(){return id;}}
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DriverManagerDataSource datasource(){return new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));}
        @Bean JdbcTemplate db(DriverManagerDataSource ds){return new JdbcTemplate(ds);}
        @Bean DataSourceTransactionManager transactionManager(DriverManagerDataSource ds){return new DataSourceTransactionManager(ds);}
        @Bean User user(){return new User();}
        @Bean DietBoardService service(JdbcTemplate db,User user){return new DietBoardService(db,user);}
    }
    @Autowired DietBoardService service;@Autowired JdbcTemplate db;@Autowired User user;
    @BeforeEach void owner(){user.id=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user.id);}
    @Test void boardRoundTripOrdersMoveAndMediaCleanup()throws Exception{
        UUID section=UUID.randomUUID(),second=UUID.randomUUID(),column=UUID.randomUUID();
        service.section(section,new Section(null,"First","",0));service.section(second,new Section(null,"Second","",0));
        service.section(section,new Section(null,"Renamed","Description",0));
        UUID first=service.read().columns().stream().filter(v->v.sectionId().equals(section)).findFirst().orElseThrow().id();
        service.column(column,new Column(null,section,"Second column",0));
        UUID a=UUID.randomUUID(),b=UUID.randomUUID();
        service.block(a,new Block(null,first,"TEXT",null,"A",0));service.block(b,new Block(null,first,"TEXT",null,"B",0));
        service.reorder("blocks",new Order(first,List.of(b,a)));
        assertThat(service.read().blocks().stream().map(Block::id)).containsExactly(b,a);
        service.move(b,new Move(column,0));service.reorder("columns",new Order(section,List.of(column,first)));
        service.reorder("sections",new Order(null,List.of(second,section)));
        assertThat(service.read().sections().stream().map(Section::id)).containsExactly(second,section);
        assertThat(service.read().blocks().stream().filter(v->v.id().equals(b)).findFirst().orElseThrow().columnId()).isEqualTo(column);
        service.upload(new Upload(first,"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII="));
        UUID media=service.read().blocks().stream().filter(v->v.type().equals("IMAGE")).findFirst().orElseThrow().mediaId();
        assertThat(db.queryForObject("select diet_owner_id from journal_media where id=?",UUID.class,media)).isEqualTo(user.id);
        service.delete("sections",section);
        assertThat(service.read().blocks()).isEmpty();assertThat(db.queryForObject("select count(*) from journal_media where id=?",Integer.class,media)).isZero();
    }
    @Test void identityLimitAndOwnerIsolation(){
        UUID a=UUID.randomUUID(),b=UUID.randomUUID(),c=UUID.randomUUID(),section=UUID.randomUUID();
        for(UUID id:List.of(a,b,c))service.identity(id,new Identity(null,"Title","Body",0));
        service.reorder("identities",new Order(null,List.of(c,a,b)));
        assertThat(service.read().identities().stream().map(Identity::id)).containsExactly(c,a,b);
        assertThatThrownBy(()->service.identity(UUID.randomUUID(),new Identity(null,"Fourth","",0))).isInstanceOf(InvalidRequestException.class);
        service.delete("identities",b);service.identity(a,new Identity(null,"Edited","New body",0));assertThat(service.read().identities()).hasSize(2);
        service.section(section,new Section(null,"Private","",0));UUID column=service.read().columns().getFirst().id();
        assertThatThrownBy(()->service.delete("columns",column)).isInstanceOf(InvalidRequestException.class);
        owner();assertThat(service.read().identities()).isEmpty();assertThat(service.read().sections()).isEmpty();
        assertThatThrownBy(()->service.identity(a,new Identity(null,"Overwrite","",0))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.column(UUID.randomUUID(),new Column(null,section,"Foreign",0))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.reorder("blocks",new Order(column,List.of()))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.delete("sections",section)).isInstanceOf(ResourceNotFoundException.class);
    }
}
