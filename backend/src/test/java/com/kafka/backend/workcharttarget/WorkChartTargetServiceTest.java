package com.kafka.backend.workcharttarget;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkChartTargetServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private WorkChartTargetRepository repository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private WorkChartTargetService newService() {
        return new WorkChartTargetService(repository, currentUserProvider);
    }

    @Test
    void returnsAReasonableDefaultWhenUnconfigured() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());

        WorkChartTargetResponse response = newService().get();

        assertThat(response.targetWorkMinutes()).isEqualTo(480);
        assertThat(response.targetScore()).isEqualTo(80);
    }

    @Test
    void returnsTheConfiguredValueWhenSet() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(new WorkChartTarget(USER_ID, 300, 90)));

        WorkChartTargetResponse response = newService().get();

        assertThat(response.targetWorkMinutes()).isEqualTo(300);
        assertThat(response.targetScore()).isEqualTo(90);
    }

    @Test
    void updateCreatesARowWhenNoneExists() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkChartTargetResponse response = newService().update(360, 85);

        assertThat(response.targetWorkMinutes()).isEqualTo(360);
        assertThat(response.targetScore()).isEqualTo(85);
    }

    @Test
    void updateOverwritesAnExistingRowInPlace() {
        WorkChartTarget existing = new WorkChartTarget(USER_ID, 480, 80);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkChartTargetResponse response = newService().update(300, 90);

        assertThat(response.targetWorkMinutes()).isEqualTo(300);
        assertThat(response.targetScore()).isEqualTo(90);
    }

    @Test
    void rejectsAZeroOrNegativeTargetWorkMinutes() {
        WorkChartTargetService service = newService();

        assertThatThrownBy(() -> service.update(0, 80)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.update(-10, 80)).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsATargetWorkMinutesAboveOneDay() {
        WorkChartTargetService service = newService();

        assertThatThrownBy(() -> service.update(1441, 80)).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsATargetScoreOutsideZeroToOneHundred() {
        WorkChartTargetService service = newService();

        assertThatThrownBy(() -> service.update(480, -1)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.update(480, 101)).isInstanceOf(InvalidRequestException.class);
    }
}
