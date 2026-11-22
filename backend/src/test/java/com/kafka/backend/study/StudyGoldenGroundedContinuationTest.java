package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.JSON;
import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class StudyGoldenGroundedContinuationTest {

  @Test void onlyTwoOwnerApprovedExplanationFieldsDifferFromFrozenGolden() {
    var previous=JSON.readTree(StudyEducationPolicy.frozen()).deepCopy().asObject();
    var approved=JSON.readTree(StudyEducationPolicy.grounded());
    var oldG01=previous.path("cases").path(0).asObject();
    var newG01=approved.path("cases").path(0);
    assertThat(oldG01.path("answer").asString()).isEqualTo("B");
    assertThat(newG01.path("answer").asString()).isEqualTo("B");
    assertThat(oldG01.path("rationale").asString()).doesNotContain("startup-file code");
    assertThat(newG01.path("rationale").asString()).contains("startup-file code");
    assertThat(newG01.path("rationale").asString()).doesNotContain("excessive noise");
    assertThat(newG01.path("distractorReasons").path("C").asString())
        .doesNotContain("floods context","can distract");
    oldG01.set("rationale",newG01.path("rationale"));
    oldG01.path("distractorReasons").asObject()
        .set("C",newG01.path("distractorReasons").path("C"));
    assertThat(previous).isEqualTo(approved);
    assertThat(previous.path("cases").path(0).path("hints").size()).isEqualTo(3);
  }

  @Test void failedGoldenReviewCanResumeWithPreservedBlindAndAllHistoricalReceipts() {
    var beforePlan=JSON.createObjectNode()
        .put("goldenRelease",StudyEducationPolicy.FROZEN)
        .put("goldenSha256",StudyEducationPolicy.FROZEN_SHA);
    beforePlan.putArray("passages");
    for(int i=0;i<5;i++){
      var c=beforePlan.withArrayProperty("controls").addObject()
          .put("referenceId","reference"+i);
      c.putObject("question").put("prompt","Learner question "+i)
          .put("kind",i==1?"essay":"single_choice");
      c.putObject("key").put("answer","B").put("explanation","old explanation")
          .putObject("incorrectReasons").put("C","old reason");
      c.putArray("spanIds");
      c.putObject("referenceContext").put("objectiveTier","advanced_integration");
    }
    var nextPlan=beforePlan.deepCopy().asObject();
    nextPlan.path("controls").path(0).path("key").asObject()
        .put("explanation","new grounded explanation");
    nextPlan.path("controls").path(0).path("key").path("incorrectReasons")
        .asObject().put("C","new grounded C reason");
    var state=JSON.createObjectNode().put("status","GOLDEN_SEMANTIC_DISPUTE")
        .put("spent",1085043).put("campaignId","historical-campaign").put("calibrated",false);
    var calls=state.putArray("calls");
    for(int i=0;i<44;i++){
      var id="call-"+i;
      var row=calls.addObject().put("callId",id).put("campaign","historical-campaign")
          .put("status","COMPLETED");
      row.putObject("receipt").put("callId",id);
      row.putObject("usage").put("input_tokens",i==0?1085043:0).put("output_tokens",0);
    }
    for(int i=0;i<8;i++){
      var row=state.withArrayProperty("slots").addObject()
          .put("part",i<6?"required":"extension").put("order",i<6?i+1:i-5)
          .put("stage",i==4||i>=6?"ACCEPTED":"review")
          .put("cycles",i==4?1:2);
      row.putObject("candidate").put("id","protected-"+i);
      if(i==4||i>=6){
        row.put("receiptDigest","original-"+i);
        row.putObject("blind").put("solvable",true);
      }
    }
    for(int i=0;i<5;i++){
      state.withArrayProperty("controlBlind").addObject().put("answer","B").put("solvable",true);
      state.withArrayProperty("controlReview").addObject().put("issue",i==0?"DISTRACTOR":"none");
    }
    // controlBlind/controlReview are objects containing the items arrays in PROD.
    var blindItems=state.path("controlBlind").deepCopy();
    var reviewItems=state.path("controlReview").deepCopy();
    state.remove("controlBlind");state.remove("controlReview");
    state.putObject("controlBlind").set("items",blindItems);
    state.putObject("controlReview").set("items",reviewItems);

    beforePlan.put("inputDigest","test-plan-digest");
    var blindEntry=state.path("calls").path(42).asObject();
    blindEntry.put("stage","blind").put("slot",-2);
    blindEntry.set("output",state.path("controlBlind"));
    blindEntry.put("inputDigest",StudyEngineRules.hash("test-plan-digest/"+StudyCampaign.reviewPolicy(state)+"/0/"+StudyCampaign.controlTask(beforePlan,null)));
    var parent=new StudyEngineJob();
    parent.id=UUID.randomUUID();parent.kind="GENERATE";parent.state="BLOCKED";
    parent.input=beforePlan.toString();parent.result=state.toString();
    var historicalCalls=state.path("calls").deepCopy();
    var historicalSlots=state.path("slots").deepCopy();
    var continuation=StudyEducationPolicy.resumeGrounded(parent,nextPlan);
    assertThat(continuation.path("calls")).isEqualTo(historicalCalls);
    assertThat(continuation.path("slots")).isEqualTo(historicalSlots);
    assertThat(continuation.path("controlBlind").path("items").size()).isEqualTo(5);
    assertThat(continuation.has("controlReview")).isFalse();
    assertThat(continuation.path("spent").asLong()).isEqualTo(1085043);
    assertThat(continuation.path("calibrated").asBoolean()).isFalse();
    assertThat(StudyCampaign.next(continuation,nextPlan).path("stage").asString()).isEqualTo("review");
    assertThat(StudyCampaign.next(continuation,nextPlan).path("slot").asInt()).isEqualTo(-2);

    var unauthorized=nextPlan.deepCopy().asObject();
    unauthorized.path("controls").path(0).path("question").asObject().put("prompt","changed student problem");
    assertThatThrownBy(()->StudyEducationPolicy.resumeGrounded(parent,unauthorized))
        .isInstanceOf(StudyException.class);
    assertThat(StudyCampaign.state(parent)).isEqualTo(state);
  }
}
