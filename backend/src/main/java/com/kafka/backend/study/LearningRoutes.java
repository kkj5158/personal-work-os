package com.kafka.backend.study;

/** Exact delegated routes. Browser pairing and all measurement endpoints require separate authority. */
public final class LearningRoutes {
    private static final String ROOT="/api/study/", BASE=ROOT+"learning-sessions";
    private static final String UUID="[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
    private LearningRoutes(){}
    public static boolean allowed(String method,String path){
        return switch(method){
            case "GET" -> path.equals(BASE)||path.equals(BASE+"/current")||path.matches(BASE+"/"+UUID)||
                path.equals(ROOT+"learning-context")||path.equals(ROOT+"statistics")||path.matches(ROOT+"learning-operations/"+UUID);
            case "POST" -> path.equals(BASE)||path.equals(BASE+"/manual")||path.matches(BASE+"/"+UUID+"/(pause|resume|complete|cancel|checkpoints|restore)");
            case "PATCH","DELETE" -> path.matches(BASE+"/"+UUID);
            default -> false;
        };
    }
}
