package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import com.kafka.backend.common.InvalidRequestException;
import static org.assertj.core.api.Assertions.*;
class MoneyCalendarTest {
 @Test void overnightAndBreakDuration(){assertThat(MoneyCalendarService.duration("22:00","02:30",true,30)).isEqualTo(240);assertThat(MoneyCalendarService.duration("09:00","18:00",false,60)).isEqualTo(480);}
 @Test void invalidOrAmbiguousIntervalsRejected(){for(var times:new String[][]{{"22:00","02:00"},{"09:00","09:00"}})assertThatThrownBy(()->MoneyCalendarService.duration(times[0],times[1],false,0)).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->MoneyCalendarService.duration("09:00","18:00",true,0)).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->MoneyCalendarService.duration("09:00","10:00",false,60)).isInstanceOf(InvalidRequestException.class);}
}
