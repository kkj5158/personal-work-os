package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.JSON;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;

class StudyKoreanLanguageTest {
  @Test void englishQuestionsOptionsHintsAndExplanationsAreFlagged() {
    var q=JSON.createObjectNode().put("prompt",
        "Which handoff provides enough evidence to call both installed helpers without reading extra files?");
    var k=JSON.createObjectNode();
    assertThat(StudyKoreanLanguage.hasEnglishLearnerProse(q,k)).isTrue();
    q.put("prompt","두 함수의 실제 호출 규약을 어떤 자료로 확인해야 할까요?");
    var choices=q.putArray("options");
    choices.addObject().put("id","A").put("text",
        "Provide all installed interfaces and unrelated startup initialization files.");
    assertThat(StudyKoreanLanguage.hasEnglishLearnerProse(q,k)).isTrue();
    q.remove("options");
    k.putArray("hints").add("Compare both records before selecting the best possible handoff.");
    assertThat(StudyKoreanLanguage.hasEnglishLearnerProse(q,k)).isTrue();
    k.remove("hints");
    k.put("explanation","The extra startup file is not needed because middleware already supplies the required inputs.");
    assertThat(StudyKoreanLanguage.hasEnglishLearnerProse(q,k)).isTrue();
  }

  @Test void koreanProseWithTechnicalIdentifiersIsAllowed() {
    var q=JSON.createObjectNode().put("prompt",
        "API 요청에서 middleware가 전달하는 connection과 date policy를 비교해 보세요.");
    q.put("context","함수 사용 예제로 database.connection()과 utils.py가 제시됐습니다.");
    q.putArray("options")
        .addObject().put("id","A").put("text","cache.get(user_id) 호출만 활용한다.");
    var k=JSON.createObjectNode().put("model","실제 API 호출 규약을 확인합니다.")
        .put("explanation","미들웨어가 제공하는 연결 객체와 날짜 정책을 기준으로 판단합니다.");
    k.putArray("hints").add("어떤 정보가 이미 제공됐는지 확인하세요.");
    k.putArray("rubric").add("두 호출의 인자와 근거를 비교했는지 확인합니다.");
    k.putObject("incorrectReasons").put("C","초기화 파일을 추가로 읽을 필요가 없습니다.");
    assertThat(StudyKoreanLanguage.hasEnglishLearnerProse(q,k)).isFalse();
  }

  @Test void englishSourceQuotesAreNotTranslatedAndAnswerIdsRemainAllowed() {
    var q=JSON.createObjectNode().put("prompt","실제 함수의 호출법을 검증할 방법은 무엇일까요?");
    var k=JSON.createObjectNode().put("answer","B").put("model","B");
    k.putArray("citations").addObject().put("quote",
        "The installed helper takes an open connection and a configured date policy.");
    assertThat(StudyKoreanLanguage.hasEnglishLearnerProse(q,k)).isFalse();
  }

  @Test void followUpOutputIsCheckedIndividually() {
    var output=JSON.createObjectNode();
    var items=output.putArray("followUps");
    for(int i=0;i<10;i++)items.add("다음 상황에서 API 연동이 적절한지 판단해 보세요.");
    assertThat(StudyKoreanLanguage.hasEnglishFollowUps(output)).isFalse();
    items.set(3,JSON.getNodeFactory().stringNode(
        "Which deployment path preserves the same database state in this particular case?"));
    assertThat(StudyKoreanLanguage.hasEnglishFollowUps(output)).isTrue();
  }

  @Test void assemblyLanguageFailureNeverPretendsToBeACompletedWorkbook() {
    var plan=JSON.createObjectNode().put("authoringPolicy",StudyEducationPolicy.VERSION);
    var state=JSON.createObjectNode();
    var receipt=JSON.createObjectNode().put("stage","assemble").put("slot",-1);
    var english=JSON.createObjectNode();
    english.putArray("followUps").add("Which option provides enough evidence for this decision?");
    StudyCampaign.apply(state,plan,receipt,english);
    assertThat(state.path("assemblyLanguageFailures").asInt()).isEqualTo(1);
    assertThat(state.has("assembly")).isFalse();
    StudyCampaign.apply(state,plan,receipt,english);
    assertThat(state.path("assemblyLanguageFailures").asInt()).isEqualTo(2);
    assertThat(state.has("assembly")).isFalse();
    var korean=JSON.createObjectNode();
    korean.putArray("followUps").add("어떤 근거를 먼저 확인해야 할까요?");
    StudyCampaign.apply(state,plan,receipt,korean);
    assertThat(state.has("assembly")).isTrue();
  }
}
