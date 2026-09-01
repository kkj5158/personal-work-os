package com.kafka.backend.workchartreferenceline;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkChartReferenceLineServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final UUID OTHER_USER_ID = UUID.randomUUID();

    @Mock
    private WorkChartReferenceLineRepository repository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private WorkChartReferenceLineService newService() {
        return new WorkChartReferenceLineService(repository, currentUserProvider);
    }

    private WorkChartReferenceLine line(WorkChartReferenceLineScope scope, int position, UUID userId) {
        return new WorkChartReferenceLine(userId, scope, position, "목표", 480, WorkChartReferenceLineColor.GRAY);
    }

    @Test
    void createsTheFirstLineAtPositionZero() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndScopeOrderByPositionAsc(USER_ID, WorkChartReferenceLineScope.DAILY_TIME))
                .thenReturn(List.of());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkChartReferenceLine created = newService().create(
                WorkChartReferenceLineScope.DAILY_TIME, "최소 목표", 360, WorkChartReferenceLineColor.BLUE);

        assertThat(created.getPosition()).isEqualTo(0);
        assertThat(created.getLabel()).isEqualTo("최소 목표");
        assertThat(created.getValue()).isEqualTo(360);
        assertThat(created.getColor()).isEqualTo(WorkChartReferenceLineColor.BLUE);
    }

    @Test
    void appendsSubsequentLinesAtTheNextPosition() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndScopeOrderByPositionAsc(USER_ID, WorkChartReferenceLineScope.DAILY_TIME))
                .thenReturn(List.of(line(WorkChartReferenceLineScope.DAILY_TIME, 0, USER_ID)));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkChartReferenceLine created = newService().create(
                WorkChartReferenceLineScope.DAILY_TIME, "권장 목표", 480, WorkChartReferenceLineColor.GREEN);

        assertThat(created.getPosition()).isEqualTo(1);
    }

    @Test
    void rejectsAFourthLineInTheSameScope() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndScopeOrderByPositionAsc(USER_ID, WorkChartReferenceLineScope.DAILY_TIME))
                .thenReturn(List.of(
                        line(WorkChartReferenceLineScope.DAILY_TIME, 0, USER_ID),
                        line(WorkChartReferenceLineScope.DAILY_TIME, 1, USER_ID),
                        line(WorkChartReferenceLineScope.DAILY_TIME, 2, USER_ID)
                ));

        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.DAILY_TIME, "네번째", 100, WorkChartReferenceLineColor.RED))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void scopesAreIsolatedFromEachOther() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        // DAILY_TIME already has 3 lines, but WEEKLY_TIME has none yet.
        when(repository.findByUserIdAndScopeOrderByPositionAsc(USER_ID, WorkChartReferenceLineScope.WEEKLY_TIME))
                .thenReturn(List.of());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkChartReferenceLine created = newService().create(
                WorkChartReferenceLineScope.WEEKLY_TIME, "주간 목표", 2400, WorkChartReferenceLineColor.BLUE);

        assertThat(created.getScope()).isEqualTo(WorkChartReferenceLineScope.WEEKLY_TIME);
        assertThat(created.getPosition()).isEqualTo(0);
    }

    @Test
    void rejectsADailyTimeValueAboveOneDay() {
        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.DAILY_TIME, "목표", 1441, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void permitsAWeeklyTimeValueAboveOneDayAsADuration() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndScopeOrderByPositionAsc(USER_ID, WorkChartReferenceLineScope.WEEKLY_TIME))
                .thenReturn(List.of());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // 34:15 expressed as minutes — a weekly total, not a clock-of-day value.
        WorkChartReferenceLine created = newService().create(
                WorkChartReferenceLineScope.WEEKLY_TIME, "권장", 2055, WorkChartReferenceLineColor.GREEN);

        assertThat(created.getValue()).isEqualTo(2055);
    }

    @Test
    void rejectsAWeeklyTimeValueAboveSevenDays() {
        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.WEEKLY_TIME, "목표", 10081, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAScoreOutsideZeroToOneHundred() {
        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.DAILY_SCORE, "목표", 101, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.DAILY_SCORE, "목표", -1, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsABlankOrOverlongLabel() {
        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.DAILY_TIME, "   ", 480, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create(WorkChartReferenceLineScope.DAILY_TIME, "a".repeat(21), 480, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void updatePersistsLabelValueAndColor() {
        WorkChartReferenceLine existing = line(WorkChartReferenceLineScope.DAILY_TIME, 0, USER_ID);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkChartReferenceLine updated = newService().update(existing.getId(), "새 라벨", 500, WorkChartReferenceLineColor.RED);

        assertThat(updated.getLabel()).isEqualTo("새 라벨");
        assertThat(updated.getValue()).isEqualTo(500);
        assertThat(updated.getColor()).isEqualTo(WorkChartReferenceLineColor.RED);
    }

    @Test
    void updateRejectsAForeignOwnedLine() {
        WorkChartReferenceLine existing = line(WorkChartReferenceLineScope.DAILY_TIME, 0, OTHER_USER_ID);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.empty());

        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.update(existing.getId(), "x", 480, WorkChartReferenceLineColor.BLUE))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void deleteRenumbersRemainingSiblingsContiguously() {
        WorkChartReferenceLine first = line(WorkChartReferenceLineScope.DAILY_TIME, 0, USER_ID);
        WorkChartReferenceLine second = line(WorkChartReferenceLineScope.DAILY_TIME, 1, USER_ID);
        WorkChartReferenceLine third = line(WorkChartReferenceLineScope.DAILY_TIME, 2, USER_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(second.getId(), USER_ID)).thenReturn(Optional.of(second));
        when(repository.findByUserIdAndScopeOrderByPositionAsc(USER_ID, WorkChartReferenceLineScope.DAILY_TIME))
                .thenReturn(List.of(first, third));

        newService().delete(second.getId());

        assertThat(first.getPosition()).isEqualTo(0);
        assertThat(third.getPosition()).isEqualTo(1);
    }

    @Test
    void deleteRejectsAForeignOwnedLine() {
        UUID id = UUID.randomUUID();
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(id, USER_ID)).thenReturn(Optional.empty());

        WorkChartReferenceLineService service = newService();
        assertThatThrownBy(() -> service.delete(id)).isInstanceOf(ResourceNotFoundException.class);
    }
}
