package com.kafka.backend.orbit;

import java.util.Set;

/** Exact application boundary. No delegated access to the ordinary MONEY controllers. */
public final class OrbitMoneyRoutes {
 private OrbitMoneyRoutes() {}
 public static final String PREFIX="/api/orbit/money/v1/";
 public static final Set<String> READ=Set.of("capabilities","dashboard","attention","review-items","review-item","review-candidates","processing-events","review-history","bookkeeping","bookkeeping-item","classification-candidates","classification-history","merchants","categories","category-impact","category-palette","rules","rule","rule-matches","accounts","account","reconciliation","account-reconciliation","bank-cutoff-projection","financial-detail","loans","loan-repayments","savings","change-history","operation-outcome");
 public static final Set<String> PLAN=Set.of("category-color-plan","classification-batch","rule-change","rule-history","category-structure","financial-correction","account-settings","undo-classification","review-batch");
 public static final Set<String> WRITE=Set.of("category-color","create-category","category-metadata","category-order","bookkeeping-category","bulk-classify","bookkeeping-meaning");
 public static boolean allowed(String method,String path) {
  if(!path.startsWith(PREFIX))return false;
  String route=path.substring(PREFIX.length());
  if(route.startsWith("recon/"))return "GET".equals(method)&&Set.of("capabilities","statements","statement","rows","status","candidate","observation","history").contains(route.substring(6))||"POST".equals(method)&&Set.of("intake-start","intake-chunk","import-preview","analyze","batch-preview","batch-execute").contains(route.substring(6));
  return "GET".equals(method)&&READ.contains(route)||"POST".equals(method)&&(WRITE.contains(route)||route.startsWith("preview/")&&PLAN.contains(route.substring(8))||route.startsWith("execute/")&&PLAN.contains(route.substring(8)));
 }
}
