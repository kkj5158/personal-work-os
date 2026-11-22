package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.JSON;
import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class StudyEducationPolicyTest {
  @Test void reservationsPastHistoricalLimitsRemainSingleUseAndDisputesStop(){
    var p=JSON.createObjectNode().put("authoringPolicy",StudyEducationPolicy.VERSION).put("inputDigest","fixture");
    var c=p.putArray("controls").addObject();c.putObject("question").put("prompt","visible");c.putObject("key").put("answer","private");
    var s=JSON.createObjectNode().put("authoringPolicy",StudyEducationPolicy.VERSION).put("spent",966552);
    s.putArray("slots");s.putArray("calls");for(int i=0;i<40;i++)s.withArrayProperty("calls").addObject();
    var j=new StudyEngineJob();j.workerId=UUID.randomUUID();j.leaseToken=UUID.randomUUID();
    var permit=StudyCampaign.reserve(j,p,s);
    assertThat(permit.path("stage").asString()).isEqualTo("blind");
    assertThat(permit.path("payload").toString()).doesNotContain("private","objectiveTier","expected");
    assertThat(StudyCampaign.reserve(j,p,s).path("action").asString()).isEqualTo("RECONCILE");
    s.remove("pending");s.putObject("controlReview");s.put("calibrated",false);
    assertThat(StudyCampaign.reserve(j,p,s).path("reason").asString()).isEqualTo("GOLDEN_SEMANTIC_DISPUTE");
    assertThat(s.path("calls").size()).isEqualTo(41);
  }
  @Test void oldAndNewFixturesAreIndependentlyAllowlisted(){
    var v1=StudyEducationPolicy.resource("POS_STUDY_GOLDEN_DATASET_V1_ORIGINAL.json",StudyEducationPolicy.V1);
    var v2=StudyEducationPolicy.golden();StudyEducationPolicy.verify(v1,false);StudyEducationPolicy.verify(v2,true);
    for(var bad:List.of(v1,v2+" ","{\"approved\":true}"))
      assertThatThrownBy(()->StudyEducationPolicy.verify(bad,true)).isInstanceOf(StudyException.class);
    assertThatThrownBy(()->StudyEducationPolicy.verify(v2,false)).isInstanceOf(StudyException.class);
    var old=JSON.readTree(v1);var revised=JSON.readTree(v2);
    var expected=old.deepCopy().asObject();expected.set("schemaVersion",revised.path("schemaVersion"));
    expected.set("approvalRecord",revised.path("approvalRecord"));
    for(int i=0;i<2;i++){
      var item=expected.path("cases").path(i).asObject();var next=revised.path("cases").path(i);
      if(i==0)item.set("hints",next.path("hints"));else{
        item.set("modelAnswer",next.path("modelAnswer"));
        item.withArrayProperty("hints").set(2,next.path("hints").path(2));
      }
    }
    assertThat(expected).isEqualTo(revised);
  }
  @Test void cognitiveDistributionAndNonQuestionControlsUseTheirOwnLayers(){
    assertThat(java.util.stream.IntStream.rangeClosed(1,5).mapToObj(i->StudyEducationPolicy.tier("single_choice",i)).toList())
      .containsExactly("cause_analysis","cause_analysis","basic_application","advanced_integration","advanced_integration");
    var cases=JSON.readTree(StudyEducationPolicy.golden()).path("cases");
    var repeated=cases.path(5);assertThat(repeated.path("type").asString()).isEqualTo("weekly_set");
    var slots=JSON.createArrayNode();
    for(int i=0;i<7;i++)slots.addObject().putObject("manifest").put("family","apply").put("objective","paraphrase "+i)
        .put("principleQuote",repeated.path("prompt").asString());
    assertThat(StudyEducationPolicy.variedOperations(slots)).isFalse();
    var bad=cases.path(6);assertThat(bad.path("type").asString()).isEqualTo("rendering");
    assertThat(StudyQuality.questionIssues(JSON.createObjectNode().put("prompt",bad.path("prompt").asString()),JSON.createObjectNode(),true)).contains("PRESENTATION_INTEGRITY");
    var r=JSON.createObjectNode().put("cycles",3);
    StudyCampaign.repair(r,"SHORTCUT",JSON.createObjectNode());assertThat(r.path("stage").asString()).isEqualTo("UNRESOLVED");
    r.put("cycles",1).put("preserveCandidate",true);StudyCampaign.repair(r,"SHORTCUT",JSON.createObjectNode());
    assertThat(r.path("stage").asString()).isEqualTo("UNRESOLVED");
  }
  @Test void historicalAcceptanceStaysVisibleDuringANewReviewAndAnswerIdsMustMatch(){
    var s=JSON.createObjectNode().put("authoringPolicy",StudyEducationPolicy.VERSION);
    s.putArray("slots").addObject().put("part","required").put("order",5).put("kind","single_choice").put("stage","review").put("cycles",1).put("replans",0);
    s.putObject("policyContinuation").putArray("slots").addObject().put("part","required").put("order",5).put("receiptDigest","original");
    var row=StudyCampaign.summary(s).path("slots").path(0);
    assertThat(row.path("previouslyAccepted").asBoolean()).isTrue();
    assertThat(row.path("stage").asString()).isEqualTo("review");
    var c=JSON.createObjectNode();c.putObject("question").put("kind","single_choice");c.putObject("key").put("answer","B");
    var f=JSON.createObjectNode().put("issue","none").put("grounded",true).put("reasoning",true).put("hintsSafe",true);
    var b=JSON.createObjectNode().put("solvable",true).put("answer","A");
    assertThat(StudyCampaign.controlAccepted(c,f,b)).isFalse();b.put("answer","B");assertThat(StudyCampaign.controlAccepted(c,f,b)).isTrue();
  }
  @Test void malformedControlReviewCannotCountAsCorrectRejection(){
    var out=JSON.createObjectNode();out.putArray("items").addObject().put("issue","AMBIGUOUS");
    assertThatThrownBy(()->StudyEducationPolicy.validateControlOutput("review",out)).isInstanceOf(StudyException.class);
    var q=JSON.createObjectNode().put("prompt","Short applied decision");
    assertThat(StudyQuality.questionIssues(q,JSON.createObjectNode(),true)).doesNotContain("REASONING_DEPTH");
  }
}
