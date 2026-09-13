package com.kafka.backend.diet;

import com.kafka.backend.common.InvalidRequestException;
import tools.jackson.databind.*;
import java.util.*;

/** Presentation preferences only; references are personal numeric values, not diagnoses. */
final class DietSettingsValidation {
    private DietSettingsValidation() {}
    private static final Set<String> MEASUREMENTS=Set.of("morningWeight","targetWeight","morningGlucose","morningBreathKetone","bedtimeGlucose","bedtimeBreathKetone","morningBloodKetone","bedtimeBloodKetone","waistCircumference","fastingHours");
    private static final Set<String> IMPORTANCE=Set.of("CORE","SECONDARY","OPTIONAL");
    private static final Set<String> GOALS=Set.of("SHORT_TERM","WEEKLY","MONTHLY","FINAL");
    private static void check(boolean valid) { if(!valid)throw new InvalidRequestException("설정의 형식, 범위 또는 텍스트 길이를 확인하세요."); }
    private static void string(JsonNode n,int max) { check(n!=null&&n.isString()&&n.asString().length()<=max); }
    private static void number(JsonNode n) { check(n!=null&&n.isNumber()&&Double.isFinite(n.asDouble())&&Math.abs(n.asDouble())<=1000000); }
    private static void visible(JsonNode n) { check(n!=null&&n.isBoolean()); }
    private static void lines(JsonNode list,boolean band) {
        check(list.isArray()&&list.size()<=100);
        for(JsonNode n:list) {
            check(n.isObject());string(n.get("id"),100);string(n.get("name"),200);visible(n.get("visible"));
            if(band) {number(n.get("min"));number(n.get("max"));check(n.get("min").asDouble()<n.get("max").asDouble());string(n.get("color"),7);check(n.get("color").asString().matches("#[0-9a-fA-F]{6}"));}
            else {number(n.get("value"));if(n.hasNonNull("goalKind"))check(GOALS.contains(n.get("goalKind").asString()));}
        }
    }
    static void validate(Map<String,Object> settings,ObjectMapper json) {
        check(settings!=null&&json.writeValueAsString(settings).length()<=100000);
        JsonNode root=json.valueToTree(settings);
        if(root.hasNonNull("hero")) {
            var hero=root.get("hero");check(hero.isObject());string(hero.get("primaryText"),200);string(hero.get("secondaryText"),500);string(hero.get("backgroundImage"),8000);
            String url=hero.get("backgroundImage").asString();check(url.isEmpty()||url.startsWith("https://")||url.startsWith("http://")||url.startsWith("/")&&!url.startsWith("//"));
        }
        if(root.hasNonNull("measurementImportance")) {
            var values=root.get("measurementImportance");check(values.isObject());
            for(var entry:values.properties())check(MEASUREMENTS.contains(entry.getKey())&&entry.getValue().isString()&&IMPORTANCE.contains(entry.getValue().asString()));
        }
        if(root.hasNonNull("measurementOrder")) {
            var values=root.get("measurementOrder");check(values.isArray()&&values.size()<=MEASUREMENTS.size());Set<String> seen=new HashSet<>();
            for(var n:values)check(n.isString()&&MEASUREMENTS.contains(n.asString())&&seen.add(n.asString()));
        }
        if(root.hasNonNull("hiddenGoalLines")) {var values=root.get("hiddenGoalLines");check(values.isArray()&&values.size()<=4);for(var n:values)check(n.isString()&&GOALS.contains(n.asString()));}
        if(root.hasNonNull("weightLines"))lines(root.get("weightLines"),false);
        if(root.hasNonNull("metabolic")) {
            var values=root.get("metabolic");check(values.isObject());
            for(var entry:values.properties()) {
                check(Set.of("glucose","breath","blood").contains(entry.getKey())&&entry.getValue().isObject());
                var metric=entry.getValue();check(metric.hasNonNull("lines")&&metric.hasNonNull("bands"));lines(metric.get("lines"),false);lines(metric.get("bands"),true);
            }
        }
    }
}
