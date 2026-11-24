package com.kafka.backend.pos;

import com.kafka.backend.common.ApiExceptionHandler;
import com.kafka.backend.common.ProdCurrentUserProvider;
import com.kafka.backend.common.ProdSecurityConfig;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value = PosSpaceDefaultsController.class, properties = {
        "app.supabase.jwks-uri=https://example.invalid/jwks", "app.supabase.issuer=https://example.invalid",
        "app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class, ProdCurrentUserProvider.class, ApiExceptionHandler.class})
@ActiveProfiles("prod")
class PosSpaceDefaultsSecurityTest {
    private static final String ENDPOINT = "/api/pos/preferences/space-defaults";
    static final String INITIAL = """
            {"defaults":{"work":"WORK FLOW","knowledge":"NOTE SYS","growth":"STUDY","life":"LIFE CODE","finance":"MONEY SYS","diet":"DIET SYS"},"revision":0}
            """;
    static final String CHANGED = INITIAL.replace("WORK FLOW", "Calendar").replace("NOTE SYS", "BLOG")
            .replace("LIFE CODE", "CHECKLIST SYS");

    @Autowired MockMvc mvc;
    @MockitoBean JdbcTemplate db;
    @MockitoBean JwtDecoder decoder;

    @Test void anonymousCannotReadOrWrite() throws Exception {
        mvc.perform(get(ENDPOINT)).andExpect(status().isUnauthorized());
        mvc.perform(put(ENDPOINT).contentType("application/json").content(CHANGED)).andExpect(status().isUnauthorized());
        verifyNoInteractions(db);
    }

    @Test void authenticatedGetAndPutUseJwtOwnerAndReturnConfirmedRevision() throws Exception {
        UUID owner = UUID.randomUUID();
        when(db.query(contains("where owner_id=?"), any(RowMapper.class), eq(owner))).thenReturn(List.of());
        when(db.update(contains("on conflict (owner_id) do nothing"), eq(owner), anyString())).thenReturn(1);
        mvc.perform(get(ENDPOINT).param("owner_id", UUID.randomUUID().toString()).with(jwt().jwt(j -> j.subject(owner.toString()))))
                .andExpect(status().isOk()).andExpect(content().json(INITIAL));
        mvc.perform(put(ENDPOINT).with(jwt().jwt(j -> j.subject(owner.toString()))).contentType("application/json").content(CHANGED))
                .andExpect(status().isOk()).andExpect(content().json(CHANGED.replace("\"revision\":0", "\"revision\":1")));
        verify(db).query(contains("where owner_id=?"), any(RowMapper.class), eq(owner));
        verify(db).update(contains("on conflict (owner_id) do nothing"), eq(owner), anyString());
    }

    @Test void malformedDocumentsAndDuplicateKeysAreRejectedBeforeAnyWrite() throws Exception {
        UUID owner = UUID.randomUUID();
        for (String malformed : List.of("", "null", "{}", "[]", INITIAL + "{}",
                INITIAL.replace("\"work\":\"WORK FLOW\"", "\"work\":\"NOTE SYS\""),
                INITIAL.replace("\"work\":\"WORK FLOW\"", "\"work\":\"WORK FLOW\",\"work\":\"WORK OS\""),
                INITIAL.replace("\"finance\":\"MONEY SYS\"", "\"finance\":\"WORK OS\""),
                INITIAL.replace("\"finance\":\"MONEY SYS\"", "\"finance\":null"),
                INITIAL.replace("\"life\":\"LIFE CODE\"", "\"life\":\"DIET SYS\""),
                INITIAL.replace("\"diet\":\"DIET SYS\"", "\"diet\":\"LIFE CODE\""),
                INITIAL.replace("\"work\":\"WORK FLOW\"", "\"work\":[\"WORK FLOW\"]"),
                INITIAL.replace("\"work\"", "\"unknown\""), INITIAL.replace(",\"revision\":0", ""),
                INITIAL.replace("\"revision\":0", "\"revision\":\"0\""),
                INITIAL.replace("\"revision\":0", "\"revision\":-1"),
                INITIAL.replace("\"revision\":0", "\"revision\":0,\"revision\":0"),
                INITIAL.replace("\"revision\":0", "\"revision\":0,\"owner_id\":\"" + UUID.randomUUID() + "\""))) {
            mvc.perform(put(ENDPOINT).with(jwt().jwt(j -> j.subject(owner.toString()))).contentType("application/json").content(malformed))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(db);
    }

    @Test void staleAndConcurrentWritesReportConflict() throws Exception {
        UUID owner = UUID.randomUUID();
        for (int revision : List.of(0, 1)) {
            mvc.perform(put(ENDPOINT).with(jwt().jwt(j -> j.subject(owner.toString()))).contentType("application/json")
                    .content(CHANGED.replace("\"revision\":0", "\"revision\":" + revision))).andExpect(status().isConflict());
        }
        verify(db).update(contains("where owner_id=? and revision=?"), anyString(), eq(owner), eq(1L));
    }

    @Test void readNormalizationToleratesPartialAndFutureValues() {
        var initial = PosSpaceDefaultsController.parse(INITIAL).defaults();
        initial.put("work", "Calendar");
        assertThat(PosSpaceDefaultsController.normalizeStored("{\"work\":\"Calendar\",\"life\":\"BLOG\",\"growth\":false,\"extra\":[]}"))
                .containsAllEntriesOf(initial).doesNotContainKey("extra");
    }

    @Test void legacyLifeDietDefaultsUseTheExistingLifeFallback() {
        String legacy = CHANGED.replace(",\"diet\":\"DIET SYS\"", "").replace("CHECKLIST SYS", "DIET SYS");
        var expected = PosSpaceDefaultsController.parse(CHANGED.replace("CHECKLIST SYS", "LIFE CODE"));
        assertThat(PosSpaceDefaultsController.parse(legacy)).isEqualTo(expected);
        assertThat(PosSpaceDefaultsController.normalizeStored("""
                {"work":"Calendar","knowledge":"BLOG","growth":"STUDY","life":"DIET SYS","finance":"MONEY SYS"}
                """)).isEqualTo(expected.defaults());
    }
}
