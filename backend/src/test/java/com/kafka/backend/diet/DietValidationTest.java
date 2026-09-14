package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.kafka.backend.diet.DietTypes.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DietValidationTest {
    JdbcTemplate db=mock(JdbcTemplate.class);
    DietService service=new DietService(db,UUID::randomUUID,JsonMapper.builder().build());
    @Test void invalidMeasurementsAreRejectedBeforeDatabaseWrite(){
        var date=LocalDate.of(2026,9,14);
        for(Double invalid:new Double[]{Double.NaN,Double.POSITIVE_INFINITY,-1d,0d})
            assertThatThrownBy(()->service.day(date,new DailyRecord(date,invalid,null,null,null,null,null,null,null,null,null))).isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(db);
    }
    @Test void invalidChallengeRangesAndDuplicateSnapshotIdsAreRejected(){
        var date=LocalDate.now();var id=UUID.randomUUID();
        var reversed=new Challenge(id,"Test",ChallengeType.MANUAL,ChallengeStatus.ACTIVE,date,date.minusDays(1),"#123456","",List.of(),0,null,null,List.of(),GoalMode.COUNT,true,0d,5d,ChallengeRole.CURRENT_FOCUS,0);
        assertThatThrownBy(()->service.challenge(id,reversed)).isInstanceOf(InvalidRequestException.class);
        var duplicates=new Challenge(id,"Test",ChallengeType.CHECKLIST,ChallengeStatus.ACTIVE,date,date.plusDays(1),"#123456","",List.of(),0,null,null,List.of(id,id),GoalMode.COUNT,true,0d,5d,ChallengeRole.CURRENT_FOCUS,0);
        assertThatThrownBy(()->service.challenge(id,duplicates)).isInstanceOf(InvalidRequestException.class);verifyNoInteractions(db);
    }
    @Test void settingsRejectMalformedBandsAndExecutableBackgrounds(){
        var json=JsonMapper.builder().build();
        assertThatThrownBy(()->DietSettingsValidation.validate(Map.of("hero",Map.of("primaryText","","secondaryText","","backgroundImage","javascript:alert(1)")),json)).isInstanceOf(InvalidRequestException.class);
        var band=Map.of("id","a","name","personal","min",10,"max",2,"visible",true,"color","#123456");
        assertThatThrownBy(()->DietSettingsValidation.validate(Map.of("metabolic",Map.of("blood",Map.of("lines",List.of(),"bands",List.of(band)))),json)).isInstanceOf(InvalidRequestException.class);
        DietSettingsValidation.validate(Map.of("metabolic",Map.of("blood",Map.of("lines",List.of(),"bands",List.of()))),json);
    }
}
