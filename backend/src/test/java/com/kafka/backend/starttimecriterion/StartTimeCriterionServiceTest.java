package com.kafka.backend.starttimecriterion;

import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StartTimeCriterionServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private StartTimeCriterionRepository repository;

    @Mock
    private WorkRecordRepository workRecordRepository;

    @Mock
    private AttendancePlanRepository attendancePlanRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private StartTimeCriterionService newService() {
        return new StartTimeCriterionService(repository, workRecordRepository, attendancePlanRepository, currentUserProvider);
    }

    private static StartTimeCriterion criterion(String name, LocalTime startTime, int sortOrder, int graceMinutes) {
        return new StartTimeCriterion(USER_ID, name, startTime, sortOrder, graceMinutes, null);
    }

    @Test
    void listsOnlyCriteriaOwnedByTheCurrentUser() {
        StartTimeCriterion owned = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID)).thenReturn(List.of(owned));

        assertThat(newService().list()).containsExactly(owned);
    }

    @Test
    void createsAValidCriterion() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, null);

        assertThat(created.getName()).isEqualTo("오후 출근");
        assertThat(created.getStartTime()).isEqualTo(LocalTime.of(15, 0));
        assertThat(created.getIsActive()).isTrue();
    }

    @Test
    void trimsTheNameOnCreate() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("  오후 출근  ", LocalTime.of(15, 0), null, null);

        assertThat(created.getName()).isEqualTo("오후 출근");
    }

    @Test
    void rejectsABlankName() {
        assertThatThrownBy(() -> newService().create("   ", LocalTime.of(15, 0), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAMissingStartTimeOnCreate() {
        assertThatThrownBy(() -> newService().create("오후 출근", null, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void updatesAnOwnedCriterion() {
        StartTimeCriterion existing = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion updated = newService().update(existing.getId(), "저녁 출근", LocalTime.of(19, 0), false, null, null);

        assertThat(updated.getName()).isEqualTo("저녁 출근");
        assertThat(updated.getStartTime()).isEqualTo(LocalTime.of(19, 0));
        assertThat(updated.getIsActive()).isFalse();
    }

    @Test
    void reactivatesAnOwnedCriterion() {
        StartTimeCriterion existing = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        existing.update(existing.getName(), existing.getStartTime(), false, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion updated = newService().update(existing.getId(), existing.getName(), existing.getStartTime(), true, null, null);

        assertThat(updated.getIsActive()).isTrue();
    }

    @Test
    void rejectsUpdateOfAMissingOrForeignOwnedCriterion() {
        UUID missingId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingId, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().update(missingId, "오후 출근", LocalTime.of(15, 0), true, null, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsUpdateWithABlankName() {
        assertThatThrownBy(() -> newService().update(UUID.randomUUID(), "  ", LocalTime.of(15, 0), true, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void firstCriterionForAUserReceivesSortOrderZero() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findTopByUserIdOrderBySortOrderDesc(USER_ID)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, null);

        assertThat(created.getSortOrder()).isEqualTo(0);
    }

    @Test
    void secondCriterionForTheSameUserReceivesSortOrderOne() {
        StartTimeCriterion first = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findTopByUserIdOrderBySortOrderDesc(USER_ID)).thenReturn(Optional.of(first));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("저녁 출근", LocalTime.of(19, 0), null, null);

        assertThat(created.getSortOrder()).isEqualTo(1);
    }

    @Test
    void anotherUserIndependentlyStartsAtSortOrderZero() {
        UUID otherUserId = UUID.randomUUID();
        // First user already has a criterion at sortOrder 1, but the next-order
        // lookup is scoped to otherUserId only — first user's data must never
        // leak into the second user's calculation.
        when(currentUserProvider.getCurrentUserId()).thenReturn(otherUserId);
        when(repository.findTopByUserIdOrderBySortOrderDesc(otherUserId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, null);

        assertThat(created.getSortOrder()).isEqualTo(0);
    }

    @Test
    void updatePreservesTheExistingSortOrder() {
        StartTimeCriterion existing = criterion("오후 출근", LocalTime.of(15, 0), 3, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion updated = newService().update(existing.getId(), "저녁 출근", LocalTime.of(19, 0), false, null, null);

        assertThat(updated.getSortOrder()).isEqualTo(3);
    }

    // --- Grace period (pre-production final polish) ---

    @Test
    void createsACriterionWithAnExplicitGracePeriod() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), 5, null);

        assertThat(created.getGraceMinutes()).isEqualTo(5);
    }

    @Test
    void createDefaultsGraceToZeroWhenNotProvided() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, null);

        assertThat(created.getGraceMinutes()).isZero();
    }

    @Test
    void rejectsANegativeGracePeriodOnCreate() {
        assertThatThrownBy(() -> newService().create("오후 출근", LocalTime.of(15, 0), -1, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAGracePeriodAboveTheMaximumOnCreate() {
        assertThatThrownBy(() -> newService().create("오후 출근", LocalTime.of(15, 0), 121, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void acceptsTheMaximumGracePeriodOnCreate() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), 120, null);

        assertThat(created.getGraceMinutes()).isEqualTo(120);
    }

    @Test
    void updateCanChangeTheGracePeriod() {
        StartTimeCriterion existing = criterion("오후 출근", LocalTime.of(15, 0), 0, 5);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion updated = newService().update(existing.getId(), existing.getName(), existing.getStartTime(), true, 10, null);

        assertThat(updated.getGraceMinutes()).isEqualTo(10);
    }

    @Test
    void updateDefaultsGraceToZeroWhenNotProvided() {
        StartTimeCriterion existing = criterion("오후 출근", LocalTime.of(15, 0), 0, 5);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion updated = newService().update(existing.getId(), existing.getName(), existing.getStartTime(), true, null, null);

        assertThat(updated.getGraceMinutes()).isZero();
    }

    @Test
    void rejectsANegativeGracePeriodOnUpdate() {
        // Grace validation runs before the repository lookup, so no id/user
        // stub is needed here — reaching the repository at all would mean
        // the invalid grace value was wrongly accepted first.
        assertThatThrownBy(() -> newService().update(UUID.randomUUID(), "오후 출근", LocalTime.of(15, 0), true, -5, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAGracePeriodAboveTheMaximumOnUpdate() {
        assertThatThrownBy(() -> newService().update(UUID.randomUUID(), "오후 출근", LocalTime.of(15, 0), true, 200, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Memo (attendance management batch) ---

    @Test
    void createPersistsATrimmedMemo() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, "  평상시 근무 기준  ");

        assertThat(created.getMemo()).isEqualTo("평상시 근무 기준");
    }

    @Test
    void createTreatsABlankMemoAsNull() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, "   ");

        assertThat(created.getMemo()).isNull();
    }

    @Test
    void updateCanChangeTheMemo() {
        StartTimeCriterion existing = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion updated = newService().update(existing.getId(), existing.getName(), existing.getStartTime(), true, null, "새 메모");

        assertThat(updated.getMemo()).isEqualTo("새 메모");
    }

    // --- Default criterion invariant (post-production iteration 1) ---

    @Test
    void firstCriterionEverCreatedBecomesTheDefaultAutomatically() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndIsDefaultTrue(USER_ID)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, null);

        assertThat(created.getIsDefault()).isTrue();
    }

    @Test
    void secondCriterionIsNotDefaultWhenOneAlreadyExists() {
        StartTimeCriterion existingDefault = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        existingDefault.markAsDefault();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndIsDefaultTrue(USER_ID)).thenReturn(Optional.of(existingDefault));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion created = newService().create("오후 출근", LocalTime.of(15, 0), null, null);

        assertThat(created.getIsDefault()).isFalse();
    }

    @Test
    void setDefaultClearsThePreviousDefaultAndPromotesTheTarget() {
        StartTimeCriterion previousDefault = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        previousDefault.markAsDefault();
        StartTimeCriterion target = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));
        when(repository.findByUserIdAndIsDefaultTrue(USER_ID)).thenReturn(Optional.of(previousDefault));
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion result = newService().setDefault(target.getId());

        assertThat(result.getIsDefault()).isTrue();
        assertThat(previousDefault.getIsDefault()).isFalse();
    }

    @Test
    void setDefaultRejectsAnInactiveCriterion() {
        StartTimeCriterion inactive = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        inactive.update(inactive.getName(), inactive.getStartTime(), false, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(inactive.getId(), USER_ID)).thenReturn(Optional.of(inactive));

        assertThatThrownBy(() -> newService().setDefault(inactive.getId()))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void setDefaultIsIdempotentWhenAlreadyDefault() {
        StartTimeCriterion alreadyDefault = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        alreadyDefault.markAsDefault();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(alreadyDefault.getId(), USER_ID)).thenReturn(Optional.of(alreadyDefault));

        StartTimeCriterion result = newService().setDefault(alreadyDefault.getId());

        assertThat(result.getIsDefault()).isTrue();
    }

    @Test
    void deactivatingTheDefaultPromotesAnotherActiveCriterionDeterministically() {
        StartTimeCriterion currentDefault = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        currentDefault.markAsDefault();
        StartTimeCriterion replacement = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(currentDefault.getId(), USER_ID)).thenReturn(Optional.of(currentDefault));
        when(repository.findFirstByUserIdAndIsActiveTrueAndIdNotOrderBySortOrderAscNameAsc(USER_ID, currentDefault.getId()))
                .thenReturn(Optional.of(replacement));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion deactivated = newService().update(currentDefault.getId(), currentDefault.getName(), currentDefault.getStartTime(), false, null, null);

        assertThat(deactivated.getIsDefault()).isFalse();
        assertThat(replacement.getIsDefault()).isTrue();
    }

    @Test
    void deactivatingTheOnlyActiveCriterionLeavesNoDefault() {
        StartTimeCriterion onlyCriterion = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        onlyCriterion.markAsDefault();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(onlyCriterion.getId(), USER_ID)).thenReturn(Optional.of(onlyCriterion));
        when(repository.findFirstByUserIdAndIsActiveTrueAndIdNotOrderBySortOrderAscNameAsc(USER_ID, onlyCriterion.getId()))
                .thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion deactivated = newService().update(onlyCriterion.getId(), onlyCriterion.getName(), onlyCriterion.getStartTime(), false, null, null);

        assertThat(deactivated.getIsDefault()).isFalse();
    }

    @Test
    void reactivatingACriterionBecomesDefaultWhenNoneExists() {
        StartTimeCriterion inactive = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        inactive.update(inactive.getName(), inactive.getStartTime(), false, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(inactive.getId(), USER_ID)).thenReturn(Optional.of(inactive));
        when(repository.findByUserIdAndIsDefaultTrue(USER_ID)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterion reactivated = newService().update(inactive.getId(), inactive.getName(), inactive.getStartTime(), true, null, null);

        assertThat(reactivated.getIsDefault()).isTrue();
    }

    // --- Delete: unused hard-delete vs. used archive (attendance management batch) ---

    @Test
    void deletingAnUnusedCriterionHardDeletesIt() {
        StartTimeCriterion unused = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(unused.getId(), USER_ID)).thenReturn(Optional.of(unused));
        when(workRecordRepository.existsByUserIdAndAppliedCriterionId(USER_ID, unused.getId())).thenReturn(false);
        when(attendancePlanRepository.existsByUserIdAndStartTimeCriterionId(USER_ID, unused.getId())).thenReturn(false);

        newService().delete(unused.getId());

        verify(repository).delete(unused);
        verify(repository, never()).save(any());
    }

    @Test
    void deletingACriterionWithWorkRecordHistoryArchivesItInstead() {
        StartTimeCriterion used = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(used.getId(), USER_ID)).thenReturn(Optional.of(used));
        when(workRecordRepository.existsByUserIdAndAppliedCriterionId(USER_ID, used.getId())).thenReturn(true);
        lenient().when(attendancePlanRepository.existsByUserIdAndStartTimeCriterionId(USER_ID, used.getId())).thenReturn(false);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        newService().delete(used.getId());

        assertThat(used.isDeleted()).isTrue();
        assertThat(used.getIsActive()).isFalse();
        verify(repository, never()).delete(any(StartTimeCriterion.class));
    }

    @Test
    void deletingACriterionWithAttendancePlanHistoryArchivesItInstead() {
        StartTimeCriterion used = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(used.getId(), USER_ID)).thenReturn(Optional.of(used));
        when(workRecordRepository.existsByUserIdAndAppliedCriterionId(USER_ID, used.getId())).thenReturn(false);
        when(attendancePlanRepository.existsByUserIdAndStartTimeCriterionId(USER_ID, used.getId())).thenReturn(true);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        newService().delete(used.getId());

        assertThat(used.isDeleted()).isTrue();
        verify(repository, never()).delete(any(StartTimeCriterion.class));
    }

    @Test
    void deletingTheDefaultCriterionTransfersDefaultToAnotherActiveOne() {
        StartTimeCriterion currentDefault = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        currentDefault.markAsDefault();
        StartTimeCriterion replacement = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(currentDefault.getId(), USER_ID)).thenReturn(Optional.of(currentDefault));
        when(workRecordRepository.existsByUserIdAndAppliedCriterionId(USER_ID, currentDefault.getId())).thenReturn(false);
        when(attendancePlanRepository.existsByUserIdAndStartTimeCriterionId(USER_ID, currentDefault.getId())).thenReturn(false);
        when(repository.findFirstByUserIdAndIsActiveTrueAndIdNotOrderBySortOrderAscNameAsc(USER_ID, currentDefault.getId()))
                .thenReturn(Optional.of(replacement));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        newService().delete(currentDefault.getId());

        assertThat(replacement.getIsDefault()).isTrue();
    }

    @Test
    void deleteIsIdempotentWhenAlreadyArchived() {
        StartTimeCriterion archived = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        archived.archive(java.time.OffsetDateTime.now());

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(archived.getId(), USER_ID)).thenReturn(Optional.of(archived));

        newService().delete(archived.getId());

        verify(repository, never()).delete(any(StartTimeCriterion.class));
        verify(repository, never()).save(any());
    }

    @Test
    void updateRejectsAnArchivedCriterion() {
        StartTimeCriterion archived = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        archived.archive(java.time.OffsetDateTime.now());

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(archived.getId(), USER_ID)).thenReturn(Optional.of(archived));

        assertThatThrownBy(() -> newService().update(archived.getId(), "오후 출근", LocalTime.of(15, 0), true, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void archivedCriterionIsNotSelectableForNewUse() {
        StartTimeCriterion archived = criterion("오후 출근", LocalTime.of(15, 0), 0, 0);
        archived.markAsDefault();
        archived.archive(java.time.OffsetDateTime.now());

        assertThat(archived.isSelectableForNewUse()).isFalse();
        assertThat(archived.getIsActive()).isFalse();
        assertThat(archived.getIsDefault()).isFalse();
    }

    // --- Reorder (attendance refinement batch §14-16) ---

    @Test
    void reorderPersistsTheNewSortOrderForEverySibling() {
        StartTimeCriterion first = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        StartTimeCriterion second = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);
        StartTimeCriterion third = criterion("야간 출근", LocalTime.of(22, 0), 2, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(first, second, third));
        when(repository.saveAll(any())).thenReturn(List.of());

        newService().reorder(List.of(third.getId(), first.getId(), second.getId()));

        assertThat(third.getSortOrder()).isEqualTo(0);
        assertThat(first.getSortOrder()).isEqualTo(1);
        assertThat(second.getSortOrder()).isEqualTo(2);
    }

    @Test
    void reorderIsExactlyOnePersistCallPerCompletedDrop() {
        StartTimeCriterion first = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        StartTimeCriterion second = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(first, second));
        when(repository.saveAll(any())).thenReturn(List.of());

        newService().reorder(List.of(second.getId(), first.getId()));

        verify(repository, org.mockito.Mockito.times(1)).saveAll(any());
        verify(repository, never()).save(any());
    }

    @Test
    void reorderRejectsAnEmptyOrderedIdsList() {
        assertThatThrownBy(() -> newService().reorder(List.of()))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void reorderRejectsAnIncompleteSiblingSet() {
        StartTimeCriterion first = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        StartTimeCriterion second = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(first, second));

        assertThatThrownBy(() -> newService().reorder(List.of(first.getId())))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void reorderRejectsAnUnknownId() {
        StartTimeCriterion first = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(first));

        assertThatThrownBy(() -> newService().reorder(List.of(UUID.randomUUID())))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void reorderExcludesArchivedCriteriaFromTheSiblingSet() {
        // The sibling set reorder validates against is exactly what list()
        // returns (deletedAt IS NULL) — an archived criterion's id must
        // never be accepted or required here, matching the management UI,
        // which never renders an archived row to drag in the first place.
        StartTimeCriterion first = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        StartTimeCriterion second = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);
        StartTimeCriterion archived = criterion("야간 출근", LocalTime.of(22, 0), 2, 0);
        archived.archive(java.time.OffsetDateTime.now());

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        // findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc already
        // excludes archived rows at the query level — simulated here by
        // simply not including `archived` in the stubbed result.
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(first, second));
        when(repository.saveAll(any())).thenReturn(List.of());

        newService().reorder(List.of(second.getId(), first.getId()));

        assertThat(second.getSortOrder()).isEqualTo(0);
        assertThat(first.getSortOrder()).isEqualTo(1);
        assertThat(archived.getSortOrder()).isEqualTo(2); // untouched
    }

    @Test
    void reorderNeverTouchesDefaultStatus() {
        StartTimeCriterion currentDefault = criterion("오전 출근", LocalTime.of(9, 0), 0, 0);
        currentDefault.markAsDefault();
        StartTimeCriterion other = criterion("오후 출근", LocalTime.of(15, 0), 1, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(currentDefault, other));
        when(repository.saveAll(any())).thenReturn(List.of());

        // Moves the default criterion out of position 0 — its isDefault
        // flag (presentation-independent) must survive unchanged.
        newService().reorder(List.of(other.getId(), currentDefault.getId()));

        assertThat(currentDefault.getIsDefault()).isTrue();
        assertThat(other.getIsDefault()).isFalse();
        assertThat(currentDefault.getSortOrder()).isEqualTo(1);
    }

    @Test
    void reorderNeverTouchesAnAlreadyAppliedWorkRecordSnapshot() {
        // Reordering is presentation metadata only — a criterion's own
        // startTime/graceMinutes (what a WorkRecord snapshots at apply time)
        // must be untouched by a pure sortOrder change.
        StartTimeCriterion first = criterion("오전 출근", LocalTime.of(9, 0), 0, 10);
        StartTimeCriterion second = criterion("오후 출근", LocalTime.of(15, 0), 1, 5);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(USER_ID))
                .thenReturn(List.of(first, second));
        when(repository.saveAll(any())).thenReturn(List.of());

        newService().reorder(List.of(second.getId(), first.getId()));

        assertThat(first.getStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(first.getGraceMinutes()).isEqualTo(10);
        assertThat(second.getStartTime()).isEqualTo(LocalTime.of(15, 0));
        assertThat(second.getGraceMinutes()).isEqualTo(5);
    }
}
