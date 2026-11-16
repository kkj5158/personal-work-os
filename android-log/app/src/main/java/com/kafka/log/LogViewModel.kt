package com.kafka.log

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

data class UiState(
    val signedIn: Boolean = false,
    val workspace: Workspace? = null,
    val profile: Profile? = null,
    val posts: List<Post> = emptyList(),
    val next: Int? = null,
    val stats: Stats = Stats(),
    val loading: Boolean = false,
    val busy: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val photoFilter: Boolean = false,
    val results: List<Post> = emptyList(),
    val searchNext: Int? = null,
    val searching: Boolean = false,
    val editor: Editor? = null,
    val replies: List<Reply> = emptyList(),
    val repliesNext: Int? = null,
    val commentsPost: Post? = null,
    val commentsLoading: Boolean = false,
    val commentText: String = "",
    val commentEditing: Reply? = null,
    val jumpId: String? = null,
    val message: String? = null,
)

class LogViewModel(
    val repository: LogRepository,
    private val auth: AuthSession,
    private val store: PrivateStore,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val mutable = MutableStateFlow(UiState(signedIn = auth.owner != null))
    val state = mutable.asStateFlow()
    private var generation = 0
    private var searchJob: Job? = null
    private var feedJob: Job? = null
    private var draftJob: Job? = null
    private val draftLock = Mutex()
    private val uploadJobs = mutableMapOf<String, Job>()
    private var commentId = UUID.randomUUID().toString()
    private var profileCreateId = UUID.randomUUID().toString()

    private fun update(f: (UiState) -> UiState) {
        mutable.update(f)
    }

    init {
        if (auth.owner != null) refresh()
    }

    private fun fail(e: Throwable) {
        if (e is CancellationException) return
        update {
            it.copy(
                error =
                    if (e is ApiFailure) e.message
                    else e.message?.takeIf { text -> text.length < 200 } ?: "연결을 확인하고 다시 시도해주세요.",
                signedIn = if (e is ApiFailure && e.code == 401) false else it.signedIn,
            )
        }
    }

    fun dismissError() {
        update { it.copy(error = null) }
    }

    fun clearMessage() {
        update { it.copy(message = null) }
    }

    fun login(email: String, password: String) {
        if (state.value.busy) return
        update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                auth.signIn(email, password)
                repository.clearImages()
                update { UiState(signedIn = true) }
                refresh()
            } catch (e: Exception) {
                fail(e)
            } finally {
                update { it.copy(busy = false) }
            }
        }
    }

    fun logout() {
        if (state.value.busy || state.value.editor != null) return
        generation++
        searchJob?.cancel()
        feedJob?.cancel()
        uploadJobs.values.forEach { it.cancel() }
        uploadJobs.clear()
        viewModelScope.launch {
            try {
                auth.signOut()
            } catch (_: Exception) {} finally {
                repository.clearImages()
                update { UiState() }
            }
        }
    }

    fun refresh() {
        if (state.value.editor != null) return
        val token = ++generation
        feedJob?.cancel()
        searchJob?.cancel()
        update { it.copy(loading = true, error = null) }
        feedJob =
            viewModelScope.launch {
                try {
                    val w = repository.state()
                    val p = w.profiles.find { it.id == w.active } ?: w.profiles.firstOrNull()
                    val f = p?.let { repository.feed(it.id) }
                    if (token != generation) return@launch
                    update {
                        it.copy(
                            workspace = w,
                            profile = p,
                            posts = f?.posts.orEmpty(),
                            next = f?.next,
                            stats = f?.stats ?: Stats(),
                            results = emptyList(),
                            searchNext = null,
                        )
                    }
                    search(state.value.search, state.value.photoFilter)
                } catch (e: Exception) {
                    if (token == generation) fail(e)
                } finally {
                    if (token == generation) update { it.copy(loading = false) }
                }
            }
    }

    fun selectProfile(p: Profile) {
        if (state.value.busy || state.value.editor != null || p.id == state.value.profile?.id)
            return
        generation++
        feedJob?.cancel()
        searchJob?.cancel()
        repository.clearImages()
        update {
            it.copy(
                profile = p,
                posts = emptyList(),
                results = emptyList(),
                stats = Stats(),
                next = null,
                searchNext = null,
                busy = true,
                loading = true,
                replies = emptyList(),
                commentsPost = null,
                search = "",
                jumpId = null,
            )
        }
        viewModelScope.launch {
            try {
                repository.activate(p.id)
                update { it.copy(busy = false) }
                refresh()
            } catch (e: Exception) {
                fail(e)
                update { it.copy(busy = false, loading = false) }
                refresh()
            }
        }
    }

    fun more() {
        val s = state.value
        val p = s.profile ?: return
        val offset = s.next ?: return
        if (s.loading) return
        val token = generation
        update { it.copy(loading = true) }
        feedJob =
            viewModelScope.launch {
                try {
                    val f = repository.feed(p.id, offset = offset)
                    if (token == generation)
                        update {
                            it.copy(
                                posts = (it.posts + f.posts).distinctBy(Post::id),
                                next = f.next,
                                stats = f.stats,
                            )
                        }
                } catch (e: Exception) {
                    if (token == generation) fail(e)
                } finally {
                    if (token == generation) update { it.copy(loading = false) }
                }
            }
    }

    fun search(query: String, photos: Boolean = state.value.photoFilter, more: Boolean = false) {
        searchJob?.cancel()
        val p = state.value.profile ?: return
        val token = generation
        val offset = if (more) state.value.searchNext ?: return else 0
        update {
            it.copy(
                search = query.take(200),
                photoFilter = photos,
                searching = true,
                results = if (more) it.results else emptyList(),
                searchNext = if (more) it.searchNext else null,
            )
        }
        searchJob =
            viewModelScope.launch {
                try {
                    if (!more) delay(300)
                    val f = repository.feed(p.id, query.take(200), photos, offset)
                    if (token == generation)
                        update {
                            it.copy(
                                results =
                                    (if (more) it.results + f.posts else f.posts).distinctBy(
                                        Post::id
                                    ),
                                searchNext = f.next,
                            )
                        }
                } catch (e: Exception) {
                    if (token == generation) fail(e)
                } finally {
                    if (token == generation) update { it.copy(searching = false) }
                }
            }
    }

    fun jump(post: Post) {
        update {
            it.copy(
                posts =
                    if (it.posts.any { p -> p.id == post.id }) it.posts
                    else (it.posts + post).sortedByDescending(Post::createdAt),
                jumpId = post.id,
            )
        }
    }

    fun jumped() {
        update { it.copy(jumpId = null) }
    }

    fun saveProfile(
        id: String?,
        name: String,
        handle: String,
        bio: String,
        avatar: String?,
        done: () -> Unit,
    ) {
        if (state.value.busy) return
        val old = state.value.workspace?.profiles?.find { it.id == id }
        update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                val saved =
                    repository.profile(
                        id ?: profileCreateId,
                        name,
                        handle,
                        bio,
                        old?.revision,
                        avatar,
                    )
                if (old == null) repository.activate(saved.id)
                profileCreateId = UUID.randomUUID().toString()
                done()
                refresh()
            } catch (e: Exception) {
                fail(e)
            } finally {
                update { it.copy(busy = false) }
            }
        }
    }

    private fun draftKey(profile: String, post: String? = null) =
        "draft/${auth.owner}/$profile/${post?:"new"}"

    private fun draftKey(editor: Editor) =
        draftKey(editor.profile, if (editor.revision != null) editor.id else null)

    fun openEditor(post: Post? = null) {
        val p = state.value.profile ?: return
        if (state.value.editor != null) return
        val saved =
            store.read(draftKey(p.id, post?.id))?.let {
                runCatching { Editor.parse(it) }.getOrNull()
            }
        val editor =
            if (post != null)
                saved
                    ?: Editor(
                        p.id,
                        post.id,
                        post.revision,
                        post.text,
                        post.images.map { Attachment(id = it, ready = true, phase = "완료") },
                        post.text,
                        post.images,
                    )
            else saved ?: Editor(p.id)
        update { it.copy(editor = editor, error = null) }
        editor.images.filter { !it.ready }.forEach { upload(it) }
    }

    private fun edit(f: (Editor) -> Editor) {
        update { s -> s.editor?.let { s.copy(editor = f(it)) } ?: s }
        draftJob?.cancel()
        draftJob =
            viewModelScope.launch {
                delay(150)
                persistDraft()
            }
    }

    suspend fun persistDraft() {
        withContext(io) {
            draftLock.withLock {
                state.value.editor?.let { editor -> store.write(draftKey(editor), editor.json()) }
            }
        }
    }

    fun text(text: String) {
        if (state.value.editor?.pendingPayload == null) edit { it.copy(text = text.take(50000)) }
    }

    fun addPhotos(uris: List<String>) {
        val e = state.value.editor ?: return
        val w = state.value.workspace ?: return
        if (e.submitting || e.pendingPayload != null) return
        if (e.images.size + uris.size > w.maxImages) {
            update { it.copy(error = "사진은 최대 ${w.maxImages}장까지 첨부할 수 있습니다. 선택한 사진을 줄여주세요.") }
            return
        }
        val attachments =
            uris.filter { u -> e.images.none { it.uri == u } }.map { Attachment(uri = it) }
        edit { it.copy(images = it.images + attachments) }
        attachments.forEach { upload(it) }
    }

    private fun upload(a: Attachment) {
        val e = state.value.editor ?: return
        if (uploadJobs[a.id]?.isActive == true) return
        val max = state.value.workspace?.maxBytes ?: return
        uploadJobs[a.id] =
            viewModelScope.launch {
                try {
                    repository.upload(e.profile, a, max) { phase ->
                        editAttachment(e.id, a.id) { it.copy(phase = phase, error = null) }
                    }
                    editAttachment(e.id, a.id) { it.copy(ready = true, phase = "완료", error = null) }
                    persistDraft()
                } catch (ex: Exception) {
                    if (ex !is CancellationException)
                        editAttachment(e.id, a.id) {
                            it.copy(phase = "실패", error = ex.message ?: "사진을 전송하지 못했습니다.")
                        }
                }
            }
    }

    private fun editAttachment(editorId: String, id: String, f: (Attachment) -> Attachment) {
        edit { e ->
            if (e.id != editorId) e
            else e.copy(images = e.images.map { if (it.id == id) f(it) else it })
        }
    }

    fun retry(id: String) {
        state.value.editor?.images?.find { it.id == id }?.let { upload(it) }
    }

    fun removePhoto(id: String) {
        val e = state.value.editor ?: return
        if (e.submitting || e.pendingPayload != null) return
        uploadJobs.remove(id)?.cancel()
        edit { it.copy(images = it.images.filterNot { a -> a.id == id }) }
    }

    fun movePhoto(index: Int, delta: Int) {
        if (state.value.editor?.pendingPayload == null)
            edit { it.copy(images = it.images.move(index, delta)) }
    }

    fun closeEditor(discard: Boolean = false) {
        val e = state.value.editor ?: return
        if (e.submitting) return
        uploadJobs.values.forEach { it.cancel() }
        uploadJobs.clear()
        draftJob?.cancel()
        viewModelScope.launch {
            withContext(io) {
                draftLock.withLock {
                    store.write(draftKey(e), if (discard) null else e.json())
                    update { it.copy(editor = null) }
                }
            }
        }
    }

    fun publish() {
        val e = state.value.editor ?: return
        if (!e.valid) return
        val payload =
            e.pendingPayload
                ?: obj(
                        "id" to e.id,
                        "text" to e.text,
                        "images" to e.images.map { it.id },
                        "revision" to e.revision,
                    )
                    .toString()
        edit { it.copy(submitting = true, pendingPayload = payload) }
        viewModelScope.launch {
            try {
                persistDraft() // Stable ID and immutable retry payload survive process death before
                // send.
                repository.publish(e.profile, JSONObject(payload), e.revision != null)
                draftJob?.cancel()
                withContext(io) {
                    draftLock.withLock {
                        store.write(draftKey(e), null)
                        update { it.copy(editor = null) }
                    }
                }
                update {
                    it.copy(
                        editor = null,
                        message = if (e.revision == null) "기록을 게시했습니다." else "기록을 수정했습니다.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                edit {
                    it.copy(
                        submitting = false,
                        pendingPayload =
                            if (ex is ApiFailure && ex.code in listOf(400, 404, 409, 410, 413, 422))
                                null
                            else it.pendingPayload,
                        conflict = ex is ApiFailure && ex.code == 409,
                    )
                }
                fail(ex)
            }
        }
    }

    fun reloadEditor() {
        val e = state.value.editor ?: return
        if (e.revision == null || e.submitting) return
        viewModelScope.launch {
            try {
                val post = repository.post(e.profile, e.id)
                edit {
                    Editor(
                        e.profile,
                        post.id,
                        post.revision,
                        post.text,
                        post.images.map { Attachment(id = it, ready = true) },
                        post.text,
                        post.images,
                    )
                }
            } catch (ex: Exception) {
                fail(ex)
            }
        }
    }

    fun delete(post: Post) {
        val p = state.value.profile ?: return
        if (state.value.busy) return
        update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                repository.delete(p.id, post)
                update { it.copy(message = "기록을 삭제했습니다.") }
                refresh()
            } catch (e: Exception) {
                fail(e)
            } finally {
                update { it.copy(busy = false) }
            }
        }
    }

    fun comments(post: Post, more: Boolean = false) {
        val p = state.value.profile ?: return
        val token = generation
        val offset = if (more) state.value.repliesNext ?: return else 0
        update {
            it.copy(
                commentsPost = post,
                replies = if (more) it.replies else emptyList(),
                commentsLoading = true,
            )
        }
        viewModelScope.launch {
            try {
                val (replies, next) = repository.replies(p.id, post.id, offset)
                if (token == generation && state.value.commentsPost?.id == post.id)
                    update {
                        it.copy(
                            replies =
                                if (more) (it.replies + replies).distinctBy(Reply::id) else replies,
                            repliesNext = next,
                        )
                    }
            } catch (e: Exception) {
                if (token == generation) fail(e)
            } finally {
                if (token == generation) update { it.copy(commentsLoading = false) }
            }
        }
    }

    fun closeComments() {
        update {
            it.copy(
                commentsPost = null,
                replies = emptyList(),
                commentText = "",
                commentEditing = null,
            )
        }
        commentId = UUID.randomUUID().toString()
    }

    fun commentText(text: String) {
        update { it.copy(commentText = text.take(3000)) }
    }

    fun editReply(reply: Reply?) {
        update { it.copy(commentEditing = reply, commentText = reply?.text.orEmpty()) }
    }

    fun sendComment(delete: Reply? = null) {
        val s = state.value
        val p = s.profile ?: return
        val post = s.commentsPost ?: return
        if (s.busy || (delete == null && s.commentText.isBlank())) return
        val editing = delete ?: s.commentEditing
        update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                repository.reply(
                    p.id,
                    post.id,
                    editing?.id ?: commentId,
                    s.commentText,
                    editing?.revision,
                    delete != null,
                )
                commentId = UUID.randomUUID().toString()
                update { it.copy(commentText = "", commentEditing = null) }
                comments(post)
                val f = repository.feed(p.id)
                update { it.copy(posts = f.posts, next = f.next, stats = f.stats) }
            } catch (e: Exception) {
                fail(e)
            } finally {
                update { it.copy(busy = false) }
            }
        }
    }
}
