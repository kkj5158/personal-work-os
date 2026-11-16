package com.kafka.log

import java.util.UUID
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class RepositoryContractTest {
    private class TestSession : Session {
        override var owner: String? = "owner-a"
        var refreshes = 0

        override suspend fun token(force: Boolean): String {
            if (force) refreshes++
            return if (force) "refreshed-test" else "expired-test"
        }
    }

    @Test
    fun expiredSessionRefreshesOnceAndReplaysExactMutation() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
            server.enqueue(MockResponse().setBody("{\"id\":\"persisted\"}"))
            server.start()
            val session = TestSession()
            val api = LogApi(session, Http(), server.url("/").toString().trimEnd('/'))
            val body =
                obj(
                    "id" to UUID.randomUUID().toString(),
                    "text" to "one mutation",
                    "images" to emptyList<String>(),
                )
            assertEquals(
                "persisted",
                api.call("/profiles/test/posts", "POST", body).getString("id"),
            )
            val first = server.takeRequest()
            val second = server.takeRequest()
            assertEquals(first.body.readUtf8(), second.body.readUtf8())
            assertEquals(first.path, second.path)
            assertEquals("Bearer refreshed-test", second.getHeader("Authorization"))
            assertEquals(1, session.refreshes)
        }
    }

    @Test
    fun wrongOwnerStopsBeforeNetwork() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val api = LogApi(TestSession(), Http(), server.url("/").toString().trimEnd('/'))
            try {
                api.call("/state", owner = "other")
                fail()
            } catch (e: ApiFailure) {
                assertEquals(401, e.code)
            }
            assertEquals(0, server.requestCount)
        }
    }

    @Test
    fun redirectNeverReceivesAuthorization() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            server.enqueue(
                MockResponse()
                    .setResponseCode(302)
                    .setHeader("Location", "https://example.invalid/collect")
            )
            try {
                LogApi(TestSession(), Http(), server.url("/").toString().trimEnd('/'))
                    .call("/state")
                fail()
            } catch (e: ApiFailure) {
                assertEquals(302, e.code)
            }
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun conflictIsNotSilentlyRetried() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            server.enqueue(
                MockResponse().setResponseCode(409).setBody("{\"message\":\"changed elsewhere\"}")
            )
            try {
                LogApi(TestSession(), Http(), server.url("/").toString().trimEnd('/'))
                    .call("/profiles/p/posts/id", "PUT", obj("revision" to 1))
                fail()
            } catch (e: ApiFailure) {
                assertEquals(409, e.code)
                assertEquals("changed elsewhere", e.message)
            }
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun editorRoundTripPreservesRetryAndAttachmentOrder() {
        val e =
            Editor(
                "profile",
                text = "초안",
                images =
                    listOf(
                        Attachment(id = "first", uri = "content://one"),
                        Attachment(id = "second", ready = true),
                    ),
                pendingPayload = "{\"id\":\"stable\"}",
            )
        assertEquals(e, Editor.parse(e.json()))
        assertEquals(listOf("second", "first"), e.images.move(0, 1).map { it.id })
        assertEquals(e.images, e.images.move(0, -1))
    }

    @Test
    fun pendingOrFailedImageCannotPublish() {
        assertFalse(
            Editor("profile", text = "text", images = listOf(Attachment(error = "failed"))).valid
        )
        assertTrue(Editor("profile", images = listOf(Attachment(ready = true))).valid)
        assertFalse(Editor("profile", text = " ").valid)
    }
}
