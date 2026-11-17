package com.kafka.backend.workflow.attention;
import java.util.Set;
public final class AttentionManagementRoutes {
 public static final String PREFIX="/api/orbit/work-queue/v1/";
 public static boolean allowed(String method,String path){if(!path.startsWith(PREFIX))return false;String route=path.substring(PREFIX.length());return "GET".equals(method)&&Set.of("list","summary","item","connections","operation").contains(route)||"POST".equals(method)&&Set.of("create","edit","move","hide","restore","preview","execute","restore-connection","revoke-connection").contains(route);}
}
