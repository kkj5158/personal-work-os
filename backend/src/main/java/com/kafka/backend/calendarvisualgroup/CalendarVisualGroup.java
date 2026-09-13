package com.kafka.backend.calendarvisualgroup;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

/** Calendar presentation metadata only; no Activity/category/State relationship or duration totals. */
@Entity
@Table(name = "calendar_visual_groups")
public class CalendarVisualGroup {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false, updatable = false) private UUID userId;
    @Column(nullable = false, length = 200) private String title;
    @Column(name = "start_date", nullable = false) private LocalDate startDate;
    @Column(name = "end_date", nullable = false) private LocalDate endDate;
    @Enumerated(EnumType.STRING) @Column(name = "time_rule", nullable = false, length = 24) private VisualGroupTimeRule timeRule;
    @Column(nullable = false, length = 7) private String color;
    @Column(name = "start_time") private LocalTime startTime;
    @Column(name = "end_time") private LocalTime endTime;
    @Column(name = "weekday_mask", nullable = false) private int weekdayMask;
    @Column(name = "created_at", nullable = false, updatable = false) private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private OffsetDateTime updatedAt;
    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("entryDate ASC")
    private List<CalendarVisualGroupDay> days = new ArrayList<>();

    protected CalendarVisualGroup() {}
    public CalendarVisualGroup(UUID id, UUID userId) { this.id=id; this.userId=userId; this.createdAt=OffsetDateTime.now(); }

    public void apply(VisualGroupRequest request) {
        title=request.title(); startDate=request.startDate(); endDate=request.endDate(); timeRule=request.timeRule();
        color=request.color(); startTime=request.startTime(); endTime=request.endTime();
        weekdayMask=request.weekdays().stream().mapToInt(day -> 1 << (day-1)).reduce(0, (a,b)->a|b);
        // Reuse matching day rows; replacing every child would race Hibernate's insert/delete order.
        var retained=new HashSet<LocalDate>();
        for (var value:request.days()) {
            retained.add(value.date());
            var row=days.stream().filter(d->d.getEntryDate().equals(value.date())).findFirst().orElse(null);
            if(row==null) { row=new CalendarVisualGroupDay(this,value.date()); days.add(row); }
            row.apply(value);
        }
        days.removeIf(day->!retained.contains(day.getEntryDate()));
        updatedAt=OffsetDateTime.now();
    }
    void restoreCreatedAt(OffsetDateTime value) { createdAt=value; }
    public UUID getId(){return id;} public UUID getUserId(){return userId;}
    public String getTitle(){return title;} public LocalDate getStartDate(){return startDate;} public LocalDate getEndDate(){return endDate;}
    public VisualGroupTimeRule getTimeRule(){return timeRule;} public String getColor(){return color;}
    public LocalTime getStartTime(){return startTime;} public LocalTime getEndTime(){return endTime;}
    public int getWeekdayMask(){return weekdayMask;} public List<CalendarVisualGroupDay> getDays(){return days;}
    public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getUpdatedAt(){return updatedAt;}
}
