package com.kafka.backend.notesystem;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class NoteContentTest {
 @Test void previewPreservesTextWithoutEditorSyntax(){
   assertThat(NoteContent.excerpt("# 제목\n[[노트 생성]] #태그 &nbsp; **강조** [링크](https://example.com) <span>본문</span> &#54620;&#xAE00;"))
     .isEqualTo("제목 노트 생성 태그 강조 링크 본문 한글");
   assertThat(NoteContent.excerpt("본문 &amp;nbsp; 유지 &lt;span&gt;내용&lt;/span&gt; 1 < 2 > 0")).isEqualTo("본문 유지 내용 1 < 2 > 0");
 }
 @Test void onlyExplicitLinksOutsideCodeCount(){
   var links=NoteContent.links("plain 방향성 [[방향성]] and [[ 방향성 ]]\n\n`[[code]]` \\[[escaped]]\n```text\n[[fenced]]\n```\n[[나의 길]]");
   assertThat(links).hasSize(3);assertThat(links.get(0).context()).startsWith("plain");
   assertThat(links.get(1).ordinal()).isEqualTo(1);assertThat(links.get(2).normalized()).isEqualTo("나의 길");
 }
 @Test void normalizationUnifiesUnicodeWhitespaceAndCase(){assertThat(NoteContent.normalize(" Ａ  Note ")).isEqualTo("a note");}
 @Test void namesRejectAmbiguousSyntax(){assertThatThrownBy(()->NoteContent.name("[[bad]]",240)).isInstanceOf(RuntimeException.class);}
 @Test void excerptHidesCanonicalMediaMetadata(){assertThat(NoteContent.excerpt("본문\n:::images {\"images\":[{\"src\":\"media:123")).isEqualTo("본문 이미지");}
 @Test void unfinishedAndLongerFencesDoNotCreateLinks(){
   assertThat(NoteContent.links("[[visible]]\n````md\n[[code]]\n```\n[[still code]]")).hasSize(1);
   assertThat(NoteContent.links("~~~\n[[code]]\n~~~~\n[[visible]]")).hasSize(1);
   assertThat(NoteContent.links("``x ` [[code]]`` [[visible]]")).hasSize(1);
 }
}
