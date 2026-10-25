package com.kafka.backend.diet;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class DietJournalContentTest {
    private final tools.jackson.databind.ObjectMapper json=JsonMapper.builder().build();
    @Test void mobileTextMovesIntoNormalBodyAndProjectionIsIdempotent(){
        assertThat(DietJournalContent.projectBody("","","모바일 **기록**")).isEqualTo("모바일 **기록**");
        assertThat(DietJournalContent.projectBody("모바일 **기록**","모바일 **기록**","새 기록")).isEqualTo("새 기록");
        assertThat(DietJournalContent.projectBody("새 기록","새 기록","새 기록")).isEqualTo("새 기록");
    }
    @Test void legacyManualRichTextIsRetainedAndDeletionOnlyRemovesSharedSuffix(){
        String legacy="# 기존 웹 글\n\n:::images {\"images\":[{\"src\":\"media:00000000-0000-0000-0000-000000000001\",\"caption\":\"캡션\",\"ratio\":100}],\"width\":100,\"align\":\"left\"}\n:::";
        String first=DietJournalContent.projectBody(legacy,"","모바일 본문");
        assertThat(first).isEqualTo(legacy+"\n\n모바일 본문");
        assertThat(DietJournalContent.projectBody(first,"모바일 본문","수정 본문")).isEqualTo(legacy+"\n\n수정 본문");
        assertThat(DietJournalContent.projectBody(first,"모바일 본문","")).isEqualTo(legacy);
    }
    @Test void dashboardAndCanonicalCameraRowsAreExcludedButManualMediaAndFencedExamplesSurvive(){
        String camera="media:"+UUID.randomUUID(),manual="media:"+UUID.randomUUID();
        String content=":::diet {\"v\":1,\"date\":\"2026-10-25\",\"note\":\"글\",\"noteVersion\":3}\n:::\n\n:::images {\"images\":[{\"src\":\""+camera+"\",\"caption\":\"카메라\",\"ratio\":100},{\"src\":\""+manual+"\",\"caption\":\"원본\",\"ratio\":100}],\"width\":100,\"align\":\"left\"}\n:::\n\n글\n\n```\n:::diet {\"note\":\"예제\"}\n:::\n```";
        String body=DietJournalContent.body(content,Set.of(camera),json);
        assertThat(body).contains(manual,"원본","글",":::diet {\"note\":\"예제\"}").doesNotContain(camera,"noteVersion");
        assertThat(DietJournalContent.snapshot(content,json)).isEqualTo(new DietJournalContent.Snapshot("글",3L));
        String saved=DietJournalContent.withSnapshot(content,"새 글",4,json);
        assertThat(DietJournalContent.snapshot(saved,json)).isEqualTo(new DietJournalContent.Snapshot("새 글",4L));
        assertThat(saved).contains(":::diet {\"note\":\"예제\"}");
    }
    @Test void unrelatedConcurrentBodyIsNeverSilentlyReplaced(){
        assertThatThrownBy(()->DietJournalContent.projectBody("다른 웹 초안","이전 모바일","최신 모바일"))
            .isInstanceOf(com.kafka.backend.common.OptimisticLockConflictException.class);
    }
    @Test void projectionNeverReplacesFencedDashboardExamples(){
        String example="```\n:::diet {\"note\":\"user example\"}\n:::\n```\n\n    indented code";
        String block=":::diet {\"v\":1,\"date\":\"2026-10-25\",\"note\":\"\",\"noteVersion\":0}\n:::";
        String merged=DietNoteProjection.merge(example,block);
        assertThat(merged).isEqualTo(block+"\n\n"+example);
        assertThat(DietNoteProjection.merge(merged,block)).isEqualTo(merged);
        assertThat(DietJournalContent.body(merged,Set.of(),json)).isEqualTo(example);
        assertThat(DietJournalContent.hasDashboard(example)).isFalse();
        assertThat(DietJournalContent.hasDashboard(merged)).isTrue();
    }}
