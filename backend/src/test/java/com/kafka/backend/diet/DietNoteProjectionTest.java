package com.kafka.backend.diet;

import com.kafka.backend.notesystem.NoteContent;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.kafka.backend.diet.DietTypes.*;
import static org.assertj.core.api.Assertions.*;

class DietNoteProjectionTest {
    static final LocalDate DAY=LocalDate.of(2026,9,26);
    static final JsonMapper JSON=JsonMapper.builder().build();
    static final UUID CORE=UUID.randomUUID(),OPTIONAL=UUID.randomUUID(),LATER=UUID.randomUUID();
    static Data data(List<DailyCheck> checks,List<Challenge> challenges){
        var day=new DailyRecord(DAY,101.2,null,92d,null,null,7d,0.4,null,null,null,LocalDateTime.of(2026,9,26,7,10),LocalDateTime.of(2026,9,26,23,40));
        var items=List.of(new ChecklistItem(OPTIONAL,"물 마시기",Importance.OPTIONAL,"",0,null,null,true,DAY.minusDays(5)),
            new ChecklistItem(CORE,"아침 체중",Importance.CORE,"",1,null,null,true,DAY.minusDays(5)),
            new ChecklistItem(LATER,"다음 주 항목",Importance.CORE,"",2,null,null,true,DAY.plusDays(1)));
        return new Data(List.of(day),items,checks,challenges,List.of(),List.of(),Map.of(),List.of());
    }
    static Challenge challenge(String title,ChallengeRole role,LocalDate start,LocalDate end){
        return new Challenge(UUID.randomUUID(),title,ChallengeType.WEIGHT,ChallengeStatus.ACTIVE,start,end,"#8b5e3c","핵심",List.of(),0,105d,95d,List.of(),GoalMode.RATE,true,null,null,role,0);
    }

    @Test void snapshotCarriesMeasurementsChecklistNoteAndDerivedFocus(){
        var focus=challenge("9월 집중",ChallengeRole.CURRENT_FOCUS,DAY.minusDays(10),DAY.plusDays(4));
        var past=challenge("지난 단계",ChallengeRole.CURRENT_FOCUS,DAY.minusDays(40),DAY.minusDays(11));
        var d=data(List.of(new DailyCheck(DAY,CORE,CheckState.SUCCESS,""),new DailyCheck(DAY,OPTIONAL,CheckState.UNRECORDED,"")),List.of(past,focus));
        var s=DietNoteProjection.snapshot(DAY,d,"오늘 메모");
        @SuppressWarnings("unchecked") var m=(Map<String,Object>)s.get("measurements");
        assertThat(m).containsEntry("morningWeight",101.2).containsEntry("bedtimeBreathKetone",7d).containsEntry("morningBloodKetone",0.4)
            .containsEntry("morningMeasuredAt","2026-09-26T07:10").doesNotContainKey("bedtimeBloodKetone");
        @SuppressWarnings("unchecked") var c=(Map<String,Object>)s.get("checklist");
        assertThat(c).containsEntry("total",2).containsEntry("success",1).containsEntry("unrecorded",1);
        @SuppressWarnings("unchecked") var items=(List<Map<String,Object>>)c.get("items");
        assertThat(items).extracting(i->i.get("title")).containsExactly("아침 체중","물 마시기"); // CORE first, not-yet-started item excluded
        @SuppressWarnings("unchecked") var f=(List<Map<String,Object>>)s.get("focus");
        assertThat(f).extracting(x->x.get("title")).containsExactly("9월 집중");
        assertThat(s.get("note")).isEqualTo("오늘 메모");
        // Serialization is stable: an unchanged day produces an identical block.
        assertThat(DietNoteProjection.block(s,JSON)).isEqualTo(DietNoteProjection.block(DietNoteProjection.snapshot(DAY,d,"오늘 메모"),JSON));
    }

    @Test void challengeBoundaryOnlyChangesDerivedContextNotTheDate(){
        var edited=challenge("집중",ChallengeRole.CURRENT_FOCUS,DAY.plusDays(1),DAY.plusDays(20));
        var s=DietNoteProjection.snapshot(DAY,data(List.of(),List.of(edited)),"메모");
        assertThat(s.get("date")).isEqualTo("2026-09-26");
        assertThat((List<?>)s.get("focus")).isEmpty();
    }

    @Test void mergeReplacesManagedBlockInPlaceAndKeepsUserText(){
        String first=DietNoteProjection.block(Map.of("v",1,"note","첫 번째"),JSON);
        String second=DietNoteProjection.block(Map.of("v",1,"note","두 번째"),JSON);
        String created=DietNoteProjection.merge("",first);
        assertThat(created).isEqualTo(first);
        String withUser=created+"\n\n내가 직접 쓴 [[회고]]\n";
        String updated=DietNoteProjection.merge(withUser,second);
        assertThat(updated).contains("두 번째").doesNotContain("첫 번째").contains("내가 직접 쓴 [[회고]]");
        assertThat(updated.split(":::diet ",-1)).hasSize(2); // exactly one managed block
        assertThat(DietNoteProjection.merge(updated,second)).isEqualTo(updated); // idempotent
        // Stray duplicates collapse to one; removing the block keeps user text.
        String duplicated=first+"\n\n메모\n\n"+first;
        assertThat(DietNoteProjection.merge(duplicated,second).split(":::diet ",-1)).hasSize(2);
        assertThat(DietNoteProjection.merge(withUser,null)).doesNotContain(":::diet").contains("내가 직접 쓴");
        assertThat(DietNoteProjection.merge(first,null)).isEmpty();
        // Existing text without a block keeps its content below the new block.
        assertThat(DietNoteProjection.merge("원래 내용",first)).isEqualTo(first+"\n\n원래 내용");
    }

    @Test void noteLinksAndExcerptsIgnoreTheSnapshotPayload(){
        String block=DietNoteProjection.block(Map.of("v",1,"note","[[숨은 링크]] 텍스트"),JSON);
        String content=block+"\n\n본문 [[진짜 링크]]";
        assertThat(NoteContent.links(content)).extracting(NoteContent.Link::title).containsExactly("진짜 링크");
        assertThat(NoteContent.excerpt(content)).startsWith("다이어트 기록").contains("본문 진짜 링크").doesNotContain("\"v\"");
    }

    @Test void hasContentIgnoresUntouchedChecksAndEmptyNotes(){
        var empty=new Data(List.of(new DailyRecord(DAY,null,null,null,null,null,null,null,null,null,null)),List.of(),
            List.of(new DailyCheck(DAY,CORE,CheckState.MISSING,"")),List.of(),List.of(),List.of(),Map.of(),List.of());
        assertThat(DietNoteProjection.hasContent(DAY,empty," ")).isFalse();
        assertThat(DietNoteProjection.hasContent(DAY,empty,"메모")).isTrue();
        assertThat(DietNoteProjection.hasContent(DAY,data(List.of(),List.of()),null)).isTrue();
    }
}
