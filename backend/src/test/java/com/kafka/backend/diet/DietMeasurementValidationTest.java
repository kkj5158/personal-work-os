package com.kafka.backend.diet;
import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class DietMeasurementValidationTest {
 @Test void malformedNonfiniteNonpositiveFutureAndInvalidSlotsAreRejected(){
  var id=UUID.randomUUID();var date=LocalDate.now(com.kafka.backend.common.AppTimeZone.ZONE);
  for(Double value:new Double[]{null,Double.NaN,Double.POSITIVE_INFINITY,0d,-1d,1000001d})assertThatThrownBy(()->DietMeasurementService.validate(id,new DietMeasurementService.Input(UUID.randomUUID(),id,"weight",date,date.atTime(7,0),value,"MORNING",null))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->DietMeasurementService.validate(id,new DietMeasurementService.Input(UUID.randomUUID(),id,"weight",date.plusDays(1),date.plusDays(1).atTime(7,0),70d,"MORNING",null))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->DietMeasurementService.validate(id,new DietMeasurementService.Input(UUID.randomUUID(),id,"weight",date,date.atTime(7,0),70d,"BEFORE_SLEEP",null))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->DietMeasurementService.validate(id,new DietMeasurementService.Input(UUID.randomUUID(),id,"glucose",date,date.minusDays(1).atTime(7,0),90d,"MORNING",null))).isInstanceOf(InvalidRequestException.class);
 }
}
