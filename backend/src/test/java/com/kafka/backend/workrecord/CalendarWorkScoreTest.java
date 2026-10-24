package com.kafka.backend.workrecord;
import com.kafka.backend.common.*;
import com.kafka.backend.calendar.ActualOverlapChecker;
import com.kafka.backend.checklist.ChecklistSnapshotService;
import com.kafka.backend.leaveallowance.LeaveAllowanceService;
import com.kafka.backend.starttimecriterion.StartTimeCriterionRepository;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryService;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class CalendarWorkScoreTest {
 WorkRecordRepository repo=mock(WorkRecordRepository.class);ActualOverlapChecker overlap=mock(ActualOverlapChecker.class);
 WorkTimeEntryService time=mock(WorkTimeEntryService.class);SupplementalWorkEntryService supplemental=mock(SupplementalWorkEntryService.class);ChecklistSnapshotService checklist=mock(ChecklistSnapshotService.class);
 UUID owner=UUID.randomUUID();LocalDate date=LocalDate.of(2026,10,24);
 WorkRecordService service=new WorkRecordService(repo,mock(StartTimeCriterionRepository.class),time,supplemental,mock(LeaveAllowanceService.class),checklist,()->owner,mock(EntityManager.class),overlap);
 WorkRecord record(WorkAttendanceStatus status){var record=mock(WorkRecord.class);when(record.getStatus()).thenReturn(status);when(record.getVersion()).thenReturn(3);when(repo.findByUserIdAndWorkDate(owner,date)).thenReturn(Optional.of(record));when(repo.saveAndFlush(record)).thenReturn(record);return record;}
 @Test void scoreOnlyUpdateAcceptsZeroAndClearWithoutTouchingOtherOwners(){var r=record(WorkAttendanceStatus.WORK);assertThat(service.updateScore(date,0,3)).isSameAs(r);verify(r).updateWorkScore(0);service.updateScore(date,null,3);verify(r).updateWorkScore(null);verifyNoInteractions(time,supplemental,checklist);verify(overlap,times(2)).lockOwner(owner);}
 @Test void absentRecordNeverCreatesAttendance(){when(repo.findByUserIdAndWorkDate(owner,date)).thenReturn(Optional.empty());assertThatThrownBy(()->service.updateScore(date,30,null)).isInstanceOf(ResourceNotFoundException.class);verify(repo,never()).save(any());verify(repo,never()).saveAndFlush(any());}
 @Test void restDayStaleVersionAndInvalidScoresAreRejected(){var r=record(WorkAttendanceStatus.DAY_OFF);assertThatThrownBy(()->service.updateScore(date,0,3)).isInstanceOf(InvalidRequestException.class);when(r.getStatus()).thenReturn(WorkAttendanceStatus.WORK);assertThatThrownBy(()->service.updateScore(date,0,2)).isInstanceOf(OptimisticLockConflictException.class);for(int n:new int[]{-1,101})assertThatThrownBy(()->service.updateScore(date,n,3)).isInstanceOf(InvalidRequestException.class);verify(r,never()).updateWorkScore(any());}
}
