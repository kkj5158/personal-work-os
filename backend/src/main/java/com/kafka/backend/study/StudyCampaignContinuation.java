package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.require;
import static com.kafka.backend.study.StudyEngineRules.hash;
import static com.kafka.backend.study.StudyValidation.JSON;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.*;

/** Import a verified terminal checkpoint as a linked continuation. The original receipt is immutable. */
final class StudyCampaignContinuation {
  static final int OLD_CALLS = 16, OLD_TOKENS = 398623, TOKEN_LIMIT = 1000000;
  static final String POLICY = "study-item-review-v320-closeout-1";
  static final String SOURCE = "e9331c80662ecbaf26d44d8cd671e8556b2cb1fbcef341cf1112cbd52f113c67";

  static ObjectNode restore(ObjectNode plan, JsonNode archive, String digest) {
    require("BUDGET_PAUSED".equals(archive.path("terminal").asString()) && archive.path("calls").size() == OLD_CALLS);
    String campaign = UUID.fromString(archive.path("campaignId").asString()).toString();
    var calls = archive.path("calls");
    var unique = new HashSet<String>();
    long spent = 0;
    for (var entry : calls) {
      require(unique.add(entry.path("callId").asString()) && campaign.equals(entry.path("campaign").asString())
          && entry.path("callId").equals(entry.path("receipt").path("callId"))
          && entry.path("status").asString().equals("COMPLETED"));
      spent += entry.path("usage").path("input_tokens").asLong() + entry.path("usage").path("output_tokens").asLong();
    }
    require(spent == OLD_TOKENS);
    var ids = new HashMap<String,String>();
    var used = new HashSet<String>();
    for (var old : archive.path("passages")) {
      require(SOURCE.equals(old.path("sourceHash").asString()));
      var matches = plan.path("passages").valueStream().filter(row -> sameExcerpt(old,row)).toList();
      require(matches.size() == 1);
      var row = matches.getFirst();
      require(used.add(row.path("id").asString()));
      ids.put(old.path("id").asString(), row.path("id").asString());
      ids.put(old.path("materialId").asString(), row.path("materialId").asString());
    }
    require(used.size() == 28 && used.size() == plan.path("passages").size());
    var state = JSON.createObjectNode().put("campaignId",campaign).put("status","DRAFT")
        .put("spent",spent).put("priorCalls",0).put("planned",true).put("calibrated",false);
    state.set("calls", calls.deepCopy());
    var audit = state.putObject("continuation").put("archiveDigest",digest).put("terminal","BUDGET_PAUSED")
        .put("oldTokenLimit",StudyCampaign.TOKENS).put("tokenLimit",TOKEN_LIMIT).put("callLimit",StudyCampaign.CALLS)
        .put("previousCalls",OLD_CALLS).put("previousTokens",spent).put("authority","owner-once-20261122")
        .put("sourceDigest",archive.path("sourceDigest").asString());
    audit.set("sourceMapping",JSON.valueToTree(ids));
    audit.set("originalSlots",archive.path("slots"));
    audit.set("originalValidation",archive.path("validation"));
    audit.set("originalControlReview",archive.path("oldControlReview"));
    require(archive.path("slots").size()==8 && archive.path("slots").valueStream().filter(s->s.has("candidate")).count()==7);
    var slots = state.putArray("slots");
    for (var original : archive.path("slots")) {
      var slot = remap(original,ids,"").asObject();
      StudyCampaign.manifest(plan,slot.path("manifest"));
      slot.put("manifestDigest",hash(plan.path("inputDigest")+"/"+slot.path("manifest")));
      if (slot.has("candidate")) {
        var candidate=slot.path("candidate");
        String issue=StudyCampaign.checkCandidate(plan,slot,candidate);
        String kind=slot.path("kind").asString();
        if (issue.equals("CITATION_LIMIT")) setRepair(slot,"citations",issue);
        else if (candidate.path("key").path("rubric").size()<StudyCampaign.minRubrics(kind)) setRepair(slot,"rubric","RUBRIC_COUNT");
        else if (!issue.isEmpty()) StudyCampaign.repair(slot,issue,JSON.getNodeFactory().stringNode(issue));
        else if ("RUBRIC".equals(slot.path("issue").asString(""))) setRepair(slot,"rubric","RUBRIC");
        else if ("ACCEPTED".equals(slot.path("stage").asString())) {
          // Preserve every authored field. The explanatory policy changed; renew only the affected review.
          slot.put("stage","review");slot.remove("receiptDigest");
        }
        if (slot.has("blind")) slot.put("blindDigest",StudyCampaign.blindDigest(plan,slot));
      }
      slots.add(slot);
    }
    // The old control was indexed in a different database. Match its citation text before rebinding.
    var historical = archive.path("oldControls").valueStream().filter(c->c.path("key").has("citations")).findFirst();
    if(historical.isPresent()){
      var control=remap(historical.get(),ids,"").asObject();
      var reading=StudyCampaign.spans(plan,control.path("spanIds"));
      for(var citation:control.path("key").path("citations")){
        String quote=citation.path("quote").asString();
        var hits=reading.valueStream().filter(x->!quote.isBlank() && x.path("text").asString().contains(quote)).toList();
        require(hits.size()==1);citation.asObject().set("excerptId",hits.getFirst().path("id"));
      }
      control.put("expected","control");
      plan.withArrayProperty("controls").add(control);
    }
    return state;
  }

  private static void setRepair(ObjectNode slot,String component,String issue) {
    require(slot.path("cycles").asInt()<3);
    slot.put("stage","write").put("issue",issue).put("repairComponent",component);
    slot.remove("receiptDigest");
  }

  private static boolean sameExcerpt(JsonNode a,JsonNode b) {
    return List.of("materialVersion","sourceHash","parserVersion","pageIndex","ordinal","text","quality")
        .stream().allMatch(k->a.has(k)&&a.path(k).equals(b.path(k)))
        && b.path("pageIndex").asInt()>=26 && b.path("pageIndex").asInt()<=53;
  }

  private static JsonNode remap(JsonNode node,Map<String,String> ids,String field) {
    if (node.isArray()) {var copy=JSON.createArrayNode();node.forEach(v->copy.add(remap(v,ids,field)));return copy;}
    if (node.isObject()) {var copy=JSON.createObjectNode();node.properties().forEach(e->copy.set(e.getKey(),remap(e.getValue(),ids,e.getKey())));return copy;}
    if (node.isString() && Set.of("materialId","section","excerptId","spanIds").contains(field) && ids.containsKey(node.asString())) return JSON.getNodeFactory().stringNode(ids.get(node.asString()));
    return node;
  }

  private StudyCampaignContinuation() {}
}
