package com.kafka.backend.orbit;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class OrbitWorkQueueProofTest {
 private final OrbitMoneyProofTest fixture=new OrbitMoneyProofTest();
 @Test void newBoundaryIsExactAndDoesNotGrantOwnerWebOrPossessionRoutes(){
  var policy=new OrbitDelegatedAccessPolicy(OrbitMoneyProofTest.CLIENT);var user=fixture.user(OrbitMoneyProofTest.OWNER,OrbitMoneyProofTest.CLIENT);
  assertThat(policy.allowed(user,"GET","/api/orbit/work-queue/v1/summary")).isTrue();assertThat(policy.allowed(user,"POST","/api/orbit/work-queue/v1/execute")).isTrue();
  for(String route:List.of("/api/workflow/attention/items","/api/workflow/attention/devices/00000000-0000-0000-0000-000000000001/possession","/api/orbit/work-queue/v1/delete","/api/orbit/work-queue/v1/execute/extra","/api/orbit/work-queue/v1/proxy"))assertThat(policy.allowed(user,"POST",route)).as(route).isFalse();
 }
 @Test void queueScopeAndPurposeCannotBeReplacedByMoneyReadOrAnotherOwner(){
  String path="/api/orbit/work-queue/v1/execute",binding=OrbitMoneyProofFilter.digest("POST\n"+path+"\n{}");
  var queue=fixture.proof("orbit:write:work-queue",Map.of("purpose","orbit-work-queue-v1","request_hash",binding));var filter=new OrbitMoneyProofFilter(t->queue,OrbitMoneyProofTest.ISS,OrbitMoneyProofTest.AUD);
  assertThat(filter.valid(fixture.user(OrbitMoneyProofTest.OWNER,OrbitMoneyProofTest.CLIENT),"POST",path,null,"{}","proof")).isTrue();
  assertThat(filter.valid(fixture.user(UUID.randomUUID().toString(),OrbitMoneyProofTest.CLIENT),"POST",path,null,"{}","proof")).isFalse();
  assertThat(filter.valid(fixture.user(OrbitMoneyProofTest.OWNER,OrbitMoneyProofTest.CLIENT),"POST",path,null,"{\"expanded\":true}","proof")).isFalse();
  for(String scope:List.of("orbit:read","orbit:write:money","orbit:write:diary")){var bad=fixture.proof(scope,Map.of("purpose","orbit-work-queue-v1","request_hash",binding));assertThat(new OrbitMoneyProofFilter(t->bad,OrbitMoneyProofTest.ISS,OrbitMoneyProofTest.AUD).valid(fixture.user(OrbitMoneyProofTest.OWNER,OrbitMoneyProofTest.CLIENT),"POST",path,null,"{}","proof")).isFalse();}
 }
}
