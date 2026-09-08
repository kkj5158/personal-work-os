package com.kafka.backend.notesystem;

import com.kafka.backend.common.InvalidRequestException;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** Rebuildable explicit wiki syntax; code and escaped syntax are not connections. */
public final class NoteContent {
    private NoteContent() {}
    public record Link(String title, String normalized, int ordinal, int position, String context) {}
    public static String normalize(String value) {
        return Normalizer.normalize(value.strip(), Normalizer.Form.NFKC).replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
    public static String name(String value, int max) {
        if(value == null || normalize(value).isEmpty() || value.length()>max || value.matches("(?s).*[\\r\\n\\[\\]\\p{Cntrl}].*"))
            throw new InvalidRequestException("이름을 확인하세요 (최대 " + max + "자).");
        return value.strip();
    }
    public static String excerpt(String value) {
        // Also remove a truncated media directive from the bounded SQL excerpt.
        String text=value.replaceAll("(?s):::images.*?(?=\\n:::(?:\\n|$)|$)", " 이미지 ")
            .replace("\n:::", "")
            .replaceAll("(?m)^\\s*(`{3,}|~{3,})[^\\n]*", " ")
            .replaceAll("\\[\\[([^]\\n]+)]]", "$1")
            .replaceAll("!?\\[([^]\\n]*)]\\([^)]*(?:\\)|$)", "$1")
            .replaceAll("(?is)</?[a-z][^>]*(?:>|$)", " ")
            .replaceAll("(?m)^\\s*(?:#{1,6}\\s*|>\\s*|[-+*]\\s+|\\d+[.)]\\s+)", "")
            .replaceAll("\\[[ xX]]\\s*", "")
            .replaceAll("(?<![\\w&])#(?=[\\p{L}\\p{N}_])", "")
            .replaceAll("[\\[\\]*`~]|(?<!\\w)_|_(?!\\w)", "");
        for(int pass=0;pass<3;pass++){
          var entities=Pattern.compile("&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);").matcher(text);
          text=entities.replaceAll(match->{
            String entity=match.group(1),decoded=switch(entity){case "nbsp"->" ";case "amp"->"&";case "lt"->"<";case "gt"->">";case "quot"->"\"";case "apos"->"'";default->null;};
            if(decoded==null&&entity.startsWith("#"))try{int point=Integer.parseInt(entity.substring(entity.startsWith("#x")?2:1),entity.startsWith("#x")?16:10);decoded=Character.isValidCodePoint(point)?new String(Character.toChars(point)):" ";}catch(IllegalArgumentException ignored){decoded=" ";}
            return java.util.regex.Matcher.quoteReplacement(decoded==null?" ":decoded);
          });
        }
        text=text.replaceAll("(?is)</?[a-z][^>]*(?:>|$)", " ").replaceAll("[\\s\\u00a0]+", " ").strip();
        return text.substring(0,text.offsetByCodePoints(0,Math.min(180,text.codePointCount(0,text.length()))));
    }
    public static List<Link> links(String content) {
        StringBuilder visible = new StringBuilder(content);
        // A fence extends to its matching closing fence, or EOF while typing.
        char fenceChar = 0; int fenceLength = 0;
        var lines = Pattern.compile("(?m)^.*$").matcher(content);
        while (lines.find()) {
            String line = lines.group();
            var fence = Pattern.compile("^ {0,3}(`{3,}|~{3,})(.*)$").matcher(line);
            boolean fenced = fenceLength > 0;
            if (fence.find()) {
                String run = fence.group(1);
                if (!fenced) { fenceChar = run.charAt(0); fenceLength = run.length(); fenced = true; }
                else if (run.charAt(0) == fenceChar && run.length() >= fenceLength && fence.group(2).isBlank()) fenceLength = 0;
            }
            if (fenced || line.startsWith("    ") || line.startsWith("\t") || line.startsWith(":::images "))
                for (int i = lines.start(); i < lines.end(); i++) visible.setCharAt(i, ' ');
        }
        var code = Pattern.compile("(?<!`)(`+)(?!`)[\\s\\S]*?(?<!`)\\1(?!`)").matcher(visible.toString());
        while(code.find()) for(int i=code.start();i<code.end();i++) if(visible.charAt(i)!='\n') visible.setCharAt(i,' ');
        var matcher=Pattern.compile("(?<!\\[)\\[\\[([^\\[\\]\\r\\n]{1,240})]]").matcher(visible);
        List<Link> links=new ArrayList<>(); Map<String,Integer> counts=new HashMap<>();
        while(matcher.find()) {
            int escapes = 0; for (int i = matcher.start() - 1; i >= 0 && content.charAt(i) == '\\'; i--) escapes++;
            if (escapes % 2 == 1) continue;
            String title=matcher.group(1).strip(), key=normalize(title); if(key.isEmpty())continue;
            int boundary=content.lastIndexOf("\n\n",matcher.start());
            int start=boundary<0?0:boundary+2;
            int end=content.indexOf("\n\n",matcher.end()); if(end<0)end=content.length();
            start=Math.max(start,matcher.start()-180);end=Math.min(end,matcher.end()+180);
            links.add(new Link(title,key,counts.merge(key,1,Integer::sum)-1,matcher.start(),content.substring(start,end)));
        }
        return links;
    }
}
