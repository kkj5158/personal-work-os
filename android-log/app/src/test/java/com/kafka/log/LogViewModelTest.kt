@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package com.kafka.log

import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class LogViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun cleanup() {
        Dispatchers.resetMain()
    }

    private class Store : PrivateStore {
        val values = mutableMapOf<String, String>()

        override fun read(name: String) = values[name]?.let(::JSONObject)

        override fun write(name: String, value: JSONObject?) {
            if (value == null) values.remove(name) else values[name] = value.toString()
        }

        override fun clear() {
            values.clear()
        }
    }

    private class Auth : AuthSession {
        override val owner = "owner"

        override suspend fun token(force: Boolean) = "test"

        override suspend fun signIn(email: String, password: String) {}

        override suspend fun signOut() {}
    }

    private class Repo : LogRepository {
        val a = Profile("profile-a", "A", "a", "", null, 1)
        val b = a.copy(id = "profile-b", name = "B", handle = "b")
        var active = a.id
        var sent = mutableListOf<String>()
        var failPublish = false
        var publishGate: CompletableDeferred<Unit>? = null
        var queries = mutableListOf<String>()
        var uploads = CompletableDeferred<Unit>()

        override suspend fun state() =
            Workspace("owner", listOf(a, b), active, 20, 18L * 1024 * 1024, true)

        override suspend fun feed(
            profile: String,
            query: String,
            media: Boolean,
            offset: Int,
        ): Feed {
            queries += query
            return Feed(
                listOf(Post("$profile-$query", "$profile-$query", emptyList(), 1, 1, 0)),
                null,
                1,
                Stats(1),
            )
        }

        override suspend fun activate(profile: String) {
            active = profile
        }

        override suspend fun profile(
            id: String,
            name: String,
            handle: String,
            bio: String,
            revision: Int?,
            avatar: String?,
        ) = a

        override suspend fun post(profile: String, id: String) =
            Post(id, "text", emptyList(), 1, 1, 0)

        override suspend fun publish(profile: String, payload: JSONObject, editing: Boolean): Post {
            sent += payload.toString()
            publishGate?.await()
            if (failPublish) throw java.io.IOException("lost response")
            return post(profile, payload.getString("id"))
        }

        override suspend fun delete(profile: String, post: Post) {}

        override suspend fun replies(profile: String, post: String, offset: Int) =
            emptyList<Reply>() to null

        override suspend fun reply(
            profile: String,
            post: String,
            id: String,
            text: String,
            revision: Int?,
            delete: Boolean,
        ) {}

        override suspend fun upload(
            profile: String,
            attachment: Attachment,
            maxBytes: Long,
            phase: (String) -> Unit,
        ): String {
            phase("전송 중")
            uploads.await()
            return attachment.id
        }

        override suspend fun image(profile: String, id: String) = byteArrayOf()

        override fun clearImages() {}
    }

    @Test
    fun doubleTapPublishesOnlyOneRequest() =
        runTest(dispatcher) {
            val r = Repo()
            val vm = LogViewModel(r, Auth(), Store(), dispatcher)
            advanceUntilIdle()
            vm.openEditor()
            vm.text("native")
            r.publishGate = CompletableDeferred()
            vm.publish()
            vm.publish()
            runCurrent()
            assertEquals(1, r.sent.size)
            r.publishGate!!.complete(Unit)
            advanceUntilIdle()
            assertNull(vm.state.value.editor)
        }

    @Test
    fun lostResponseRetainsImmutableIdAndPayload() =
        runTest(dispatcher) {
            val r = Repo()
            r.failPublish = true
            val vm = LogViewModel(r, Auth(), Store(), dispatcher)
            advanceUntilIdle()
            vm.openEditor()
            vm.text("first")
            vm.publish()
            advanceUntilIdle()
            vm.text("changed after uncertain save")
            assertEquals("first", vm.state.value.editor!!.text)
            r.failPublish = false
            vm.publish()
            advanceUntilIdle()
            assertEquals(2, r.sent.size)
            assertEquals(r.sent[0], r.sent[1])
        }

    @Test
    fun removedAttachmentIgnoresLateCompletion() =
        runTest(dispatcher) {
            val r = Repo()
            val vm = LogViewModel(r, Auth(), Store(), dispatcher)
            advanceUntilIdle()
            vm.openEditor()
            vm.addPhotos(listOf("content://photo"))
            runCurrent()
            val id = vm.state.value.editor!!.images.single().id
            vm.removePhoto(id)
            r.uploads.complete(Unit)
            advanceUntilIdle()
            assertTrue(vm.state.value.editor!!.images.isEmpty())
        }

    @Test
    fun overCapSelectionIsRejectedWithoutTruncating() =
        runTest(dispatcher) {
            val vm = LogViewModel(Repo(), Auth(), Store(), dispatcher)
            advanceUntilIdle()
            vm.openEditor()
            vm.addPhotos((1..21).map { "content://$it" })
            runCurrent()
            assertTrue(vm.state.value.editor!!.images.isEmpty())
            assertNotNull(vm.state.value.error)
        }

    @Test
    fun searchDebouncesAndProfileSwitchClearsOldData() =
        runTest(dispatcher) {
            val r = Repo()
            val vm = LogViewModel(r, Auth(), Store(), dispatcher)
            advanceUntilIdle()
            r.queries.clear()
            vm.search("old")
            advanceTimeBy(100)
            vm.search("new")
            advanceUntilIdle()
            assertEquals(listOf("new"), r.queries)
            vm.selectProfile(r.b)
            runCurrent()
            advanceUntilIdle()
            assertEquals(r.b.id, vm.state.value.profile!!.id)
            assertTrue(vm.state.value.posts.all { it.id.startsWith(r.b.id) })
            assertEquals("", vm.state.value.search)
        }

    @Test
    fun cancelEditingDoesNotWritePost() =
        runTest(dispatcher) {
            val r = Repo()
            val vm = LogViewModel(r, Auth(), Store(), dispatcher)
            advanceUntilIdle()
            vm.openEditor(Post("post", "original", emptyList(), 1, 1, 0))
            vm.text("unsaved")
            vm.closeEditor(true)
            advanceUntilIdle()
            assertTrue(r.sent.isEmpty())
        }
}
