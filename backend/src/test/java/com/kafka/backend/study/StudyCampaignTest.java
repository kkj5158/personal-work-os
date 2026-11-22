package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.JSON;
import static org.assertj.core.api.Assertions.*;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

class StudyCampaignTest {
  ObjectNode manifest(String ref) {
    var m=JSON.createObjectNode().put("objective","행동 예측").put("family","predict_trace").put("limit","추적에 없는 값은 미확정")
      .put("principleQuote","A complete trace records each observed step.");
    m.putArray("spanIds").add(ref);return m;
  }
  @Test void replanningReplacesOnlyFailedManifestAndDoesNotRefundCycles() {
    var state=JSON.createObjectNode();var slots=state.putArray("slots");
    var good=slots.addObject().put("stage","ACCEPTED").put("receiptDigest","bound");
    good.putObject("candidate").put("key","unchanged");String retained=good.toString();
    var r=slots.addObject().put("cycles",2).put("stage","review").put("manifestDigest","original");
    r.set("manifest",manifest("a"));r.set("alternate",manifest("b"));
    StudyCampaign.repair(r,"SOURCE_UNSUITABLE",JSON.getNodeFactory().stringNode("unsupported objective"));
    assertThat(r.path("manifest")).isEqualTo(manifest("b"));assertThat(r.path("priorManifests").path(0)).isEqualTo(manifest("a"));
    assertThat(r.path("replans").asInt()).isOne();assertThat(r.path("cycles").asInt()).isEqualTo(2);
    assertThat(r.path("parentManifest").asString()).isEqualTo("original");
    StudyCampaign.repair(r,"SOURCE_UNSUITABLE",JSON.getNodeFactory().stringNode("still unsupported"));
    assertThat(r.path("stage").asString()).isEqualTo("UNRESOLVED");assertThat(good.toString()).isEqualTo(retained);
  }
  @Test void aPendingReplanDoesNotRelabelTheLastAuthoredQuestion(){
    var slot=JSON.createObjectNode();slot.set("manifest",manifest("future"));
    slot.putArray("priorManifests").add(manifest("authored"));
    slot.putObject("candidate").putObject("question").putObject("source").put("section","authored");
    assertThat(StudyCampaign.candidateManifest(slot)).isEqualTo(manifest("authored"));
    assertThat(slot.path("manifest")).isEqualTo(manifest("future"));
  }
  @Test void rejectedDraftCannotSmugglePrivateFieldsIntoLearnerProjection(){
    var q=JSON.createObjectNode().put("prompt","visible").put("answer","private");
    q.putArray("options").addObject().put("id","A").put("text","first").put("rubric","private");
    q.putObject("guidance").put("key","private");
    assertThat(StudyCampaign.learnerQuestion(q).toString()).doesNotContain("private").contains("visible","first");
    assertThat(StudyCampaign.visible(q,JSON.createArrayNode()).toString()).doesNotContain("private");
  }
  @Test void manifestMustHaveExactCompleteAuthorizedEvidence() {
    var p=JSON.createObjectNode();var list=p.putArray("passages");
    for(String id:new String[]{"a","b","c"})list.addObject().put("id",id).put("quality","usable").put("pageIndex",12)
      .put("text","A complete trace records each observed step.");
    var m=manifest("a");StudyCampaign.manifest(p,m);
    m.withArrayProperty("spanIds").add("c");assertThatThrownBy(()->StudyCampaign.manifest(p,m)).isInstanceOf(StudyException.class);
    assertThatThrownBy(()->StudyCampaign.manifest(p,manifest("outside"))).isInstanceOf(StudyException.class);
    assertThatThrownBy(()->StudyCampaign.manifest(p,manifest("a").put("principleQuote","The complete missing example."))).isInstanceOf(StudyException.class);
  }
  @Test
  @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="STUDY_PRIVATE_ROUTING",matches=".+")
  void citationSupportCanBeRepairedOnlyWhenAllDecisionClaimsBindToTheAssignedSource() throws Exception {
    var replay=JSON.readTree(java.nio.file.Files.readString(java.nio.file.Path.of(System.getenv("STUDY_PRIVATE_ROUTING"))));
    var slot=replay.path("slot");var plan=replay.path("plan");var finding=replay.path("finding").deepCopy().asObject();
    assertThat(StudyCampaign.citationRepair(slot,plan,finding)).isTrue();
    finding.put("grounded",false);assertThat(StudyCampaign.citationRepair(slot,plan,finding)).isFalse();
    finding.put("grounded",true);finding.path("claimChecks").path(0).asObject().put("anchor","missing-test-evidence");
    assertThat(StudyCampaign.citationRepair(slot,plan,finding)).isFalse();
  }
  @Test void sameSourceCombinedRepairIsLimitedToAnchoredRubricDefects(){
    var plan=JSON.createObjectNode().put("goldenRelease",StudyEducationPolicy.GROUNDED);
    String source="Two examples demonstrate the different return values.";
    plan.putArray("passages").addObject().put("id","excerpt").put("text",source);
    var slot=JSON.createObjectNode().put("stage","UNRESOLVED").put("cycles",2);
    slot.putObject("manifest").putArray("spanIds").add("excerpt");
    var candidate=slot.putObject("candidate");candidate.putObject("question").put("prompt","Which option?");
    var key=candidate.putObject("key").put("answer","B").put("model","model").put("explanation","reason");
    key.putArray("rubric").add("criterion");
    var f=slot.putObject("finding").put("issue","SOURCE_UNSUITABLE").put("field","key.citations, rubric.0").put("repair","인용 “"+source+"”와 채점 기준을 대조한다.");
    for(String name:List.of("answer","model","explanation","rubric.0")){
      f.withArrayProperty("claimChecks").addObject().put("field",name).put("claim",name.equals("rubric.0")?"criterion":key.path(name).asString())
          .put("anchor",source).put("reason","review finding").put("supported",!name.equals("rubric.0"));
    }
    assertThat(StudyCampaign.canResumeKeyRepair(slot,plan)).isTrue();
    slot.put("cycles",3);assertThat(StudyCampaign.canResumeKeyRepair(slot,plan)).isFalse();slot.put("cycles",2);
    f.path("claimChecks").path(0).asObject().put("supported",false);
    assertThat(StudyCampaign.canResumeKeyRepair(slot,plan)).isFalse();
    f.path("claimChecks").path(0).asObject().put("supported",true);f.put("repair","Use another chapter.");
    assertThat(StudyCampaign.canResumeKeyRepair(slot,plan)).isFalse();
  }
  @Test void indexMappingAllowsOnlyPlatformLineEndingsAndKeepsLearnerFields() {
    var old=JSON.createObjectNode().put("sourceHash","same").put("materialVersion",1).put("parserVersion","v1")
        .put("ordinal",0).put("quality","usable").put("pageIndex",26).put("text","first\r\nsecond");
    var target=old.deepCopy().put("text","first\nsecond");
    assertThat(StudyCampaignContinuation.sameExcerpt(old,target)).isTrue();
    assertThat(StudyCampaignContinuation.sameExcerpt(old,target.deepCopy().put("text","first second"))).isFalse();
    var item=JSON.createObjectNode().put("prompt","first\r\nsecond").put("quote","first\r\nsecond");
    StudyCampaignContinuation.bindQuotedNewlines(item,JSON.createArrayNode().add(target));
    assertThat(item.path("quote").asString()).isEqualTo("first\nsecond");
    assertThat(item.path("prompt").asString()).isEqualTo("first\r\nsecond");
  }

  @Test void totalBudgetSurvivesRoundTripAndPreventsReservation() {
    var job=new StudyEngineJob();job.workerId=UUID.randomUUID();job.leaseToken=UUID.randomUUID();
    for(boolean tokens:new boolean[]{true,false}){
      var state=JSON.createObjectNode().put("spent",tokens?399995:0);state.putArray("slots");
      var calls=state.putArray("calls");if(!tokens)for(int i=0;i<40;i++)calls.addObject();
      job.result=state.toString();int before=calls.size();
      var step=StudyCampaign.reserve(job,JSON.createObjectNode(),StudyCampaign.state(job));
      assertThat(step.path("action").asString()).isEqualTo("STOP");assertThat(StudyCampaign.state(job).path("calls").size()).isEqualTo(before);
    }
  }
}

