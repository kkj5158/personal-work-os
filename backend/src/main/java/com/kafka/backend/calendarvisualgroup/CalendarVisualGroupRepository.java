package com.kafka.backend.calendarvisualgroup;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.*;

public interface CalendarVisualGroupRepository extends JpaRepository<CalendarVisualGroup, UUID> {
    @EntityGraph(attributePaths = "days")
    Optional<CalendarVisualGroup> findByIdAndUserId(UUID id, UUID userId);

    @EntityGraph(attributePaths = "days")
    @Query("select distinct g from CalendarVisualGroup g where g.userId=:owner and g.startDate<=:to and g.endDate>=:from order by g.startDate,g.title,g.id")
    List<CalendarVisualGroup> findIntersecting(@Param("owner") UUID owner, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
