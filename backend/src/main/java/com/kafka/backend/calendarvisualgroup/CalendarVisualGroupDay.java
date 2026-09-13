package com.kafka.backend.calendarvisualgroup;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "calendar_visual_group_days", uniqueConstraints = @UniqueConstraint(columnNames = {"group_id", "entry_date"}))
public class CalendarVisualGroupDay {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false, updatable = false) private CalendarVisualGroup group;
    @Column(name = "user_id", nullable = false, updatable = false) private UUID userId;
    @Column(name = "entry_date", nullable = false, updatable = false) private LocalDate entryDate;
    @Column(nullable = false) private boolean enabled;
    @Column(name = "start_time") private LocalTime startTime;
    @Column(name = "end_time") private LocalTime endTime;
    protected CalendarVisualGroupDay() {}
    CalendarVisualGroupDay(CalendarVisualGroup group, LocalDate date) {id=UUID.randomUUID();this.group=group;userId=group.getUserId();entryDate=date;}
    void apply(VisualGroupRequest.Day day){enabled=day.enabled();startTime=day.startTime();endTime=day.endTime();}
    public UUID getId(){return id;} public LocalDate getEntryDate(){return entryDate;}
    public boolean isEnabled(){return enabled;} public LocalTime getStartTime(){return startTime;} public LocalTime getEndTime(){return endTime;}
}
