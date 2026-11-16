package com.kafka.log

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import java.net.URLEncoder
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject

interface LogRepository {
    suspend fun state(): Workspace

    suspend fun feed(
        profile: String,
        query: String = "",
        media: Boolean = false,
        offset: Int = 0,
    ): Feed

    suspend fun activate(profile: String)

    suspend fun profile(
        id: String,
        name: String,
        handle: String,
        bio: String,
        revision: Int?,
        avatar: String?,
    ): Profile

    suspend fun post(profile: String, id: String): Post

    suspend fun publish(profile: String, payload: JSONObject, editing: Boolean): Post

    suspend fun delete(profile: String, post: Post)

    suspend fun replies(profile: String, post: String, offset: Int): Pair<List<Reply>, Int?>

    suspend fun reply(
        profile: String,
        post: String,
        id: String,
        text: String,
        revision: Int? = null,
        delete: Boolean = false,
    )

    suspend fun upload(
        profile: String,
        attachment: Attachment,
        maxBytes: Long,
        phase: (String) -> Unit,
    ): String

    suspend fun image(profile: String, id: String): ByteArray

    fun clearImages()
}

class ServerRepository(
    private val context: Context,
    private val api: LogApi,
    private val session: Session,
) : LogRepository {
    private val uploads = Semaphore(2)
    private val downloads = Semaphore(2)
    private val cache =
        object : LruCache<String, ByteArray>(24 * 1024 * 1024) {
            override fun sizeOf(key: String, value: ByteArray) = value.size
        }

    override fun clearImages() = cache.evictAll()

    private fun path(p: String) = "/profiles/${java.util.UUID.fromString(p)}"

    override suspend fun state() = Workspace.parse(api.call("/state"))

    override suspend fun activate(profile: String) {
        api.call(path(profile) + "/active", "PUT")
    }

    override suspend fun feed(profile: String, query: String, media: Boolean, offset: Int) =
        Feed.parse(
            api.call(
                path(profile) +
                    "/posts?chronological=true&limit=30&offset=$offset&filter=${if(media) "media" else "threads"}&q=${URLEncoder.encode(query,"UTF-8")}"
            )
        )

    override suspend fun profile(
        id: String,
        name: String,
        handle: String,
        bio: String,
        revision: Int?,
        avatar: String?,
    ) =
        Profile.parse(
            api.call(
                if (revision == null) "/profiles" else path(id),
                if (revision == null) "POST" else "PUT",
                obj(
                    "id" to id,
                    "name" to name,
                    "handle" to handle,
                    "bio" to bio,
                    "revision" to revision,
                    "avatar" to avatar,
                ),
            )
        )

    override suspend fun post(profile: String, id: String) =
        Post.parse(api.call(path(profile) + "/posts/$id"))

    override suspend fun publish(profile: String, payload: JSONObject, editing: Boolean) =
        Post.parse(
            api.call(
                path(profile) + "/posts" + if (editing) "/${payload.getString("id")}" else "",
                if (editing) "PUT" else "POST",
                payload,
            )
        )

    override suspend fun delete(profile: String, post: Post) {
        api.call(
            path(profile) + "/posts/${post.id}/delete",
            "POST",
            obj("revision" to post.revision, "confirm" to true),
        )
    }

    override suspend fun replies(
        profile: String,
        post: String,
        offset: Int,
    ): Pair<List<Reply>, Int?> {
        val j = api.call(path(profile) + "/posts/$post/replies?offset=$offset")
        return j.getJSONArray("replies").mapObjects(Reply::parse) to
            if (j.isNull("nextOffset")) null else j.getInt("nextOffset")
    }

    override suspend fun reply(
        profile: String,
        post: String,
        id: String,
        text: String,
        revision: Int?,
        delete: Boolean,
    ) {
        api.call(
            path(profile) +
                "/posts/$post/replies" +
                if (revision == null) "" else "/$id" + if (delete) "/delete" else "",
            if (revision != null && !delete) "PUT" else "POST",
            obj("id" to id, "text" to text, "revision" to revision, "confirm" to delete),
        )
    }

    override suspend fun image(profile: String, id: String): ByteArray {
        val owner = session.owner ?: throw ApiFailure(401, "로그인이 필요합니다.")
        val key = "$owner/$profile/$id"
        cache.get(key)?.let {
            return it
        }
        return downloads.withPermit {
            cache.get(key)
                ?: api.binary(path(profile) + "/images/$id", owner = owner).also {
                    cache.put(key, it)
                }
        }
    }

    override suspend fun upload(
        profile: String,
        attachment: Attachment,
        maxBytes: Long,
        phase: (String) -> Unit,
    ): String =
        uploads.withPermit {
            val owner = session.owner ?: throw ApiFailure(401, "로그인이 필요합니다.")
            phase("검사 중")
            val (bytes, mime) =
                withContext(Dispatchers.IO) {
                    val uri = Uri.parse(requireNotNull(attachment.uri))
                    val type = context.contentResolver.getType(uri) ?: ""
                    require(type in setOf("image/png", "image/jpeg", "image/webp")) {
                        "PNG, JPEG, WebP 사진을 선택해주세요. HEIC는 변환 후 첨부해주세요."
                    }
                    val data =
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            val out = java.io.ByteArrayOutputStream()
                            val buffer = ByteArray(8192)
                            while (true) {
                                val n = input.read(buffer)
                                if (n < 0) break
                                require(out.size().toLong() + n <= maxBytes) {
                                    "사진 한 장은 ${maxBytes/1024/1024}MB 이하만 첨부할 수 있습니다."
                                }
                                out.write(buffer, 0, n)
                            }
                            out.toByteArray()
                        } ?: error("사진을 읽지 못했습니다. 다시 선택해주세요.")
                    validateImage(data, type, maxBytes)
                    data to type
                }
            val claim =
                obj(
                    "id" to attachment.id,
                    "name" to
                        "photo.${when(mime) { "image/png" -> "png"
 "image/jpeg" -> "jpg"
 else -> "webp" }}",
                    "mime" to mime,
                    "sizeBytes" to bytes.size,
                    "sha256" to
                        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") {
                            "%02x".format(it)
                        },
                )
            phase("예약 중")
            val ticket = api.call(path(profile) + "/images", "POST", claim, owner)
            if (!ticket.optBoolean("ready")) {
                phase("전송 중")
                api.binary(path(profile) + "/images/${attachment.id}/bytes", bytes, owner)
                phase("서버 확인 중")
                api.call(path(profile) + "/images/${attachment.id}/complete", "POST", owner = owner)
            }
            attachment.id
        }
}

fun validateImage(bytes: ByteArray, mime: String, maxBytes: Long) {
    require(bytes.isNotEmpty() && bytes.size <= maxBytes) { "사진 크기를 확인해주세요." }
    val magic =
        when (mime) {
            "image/png" ->
                bytes
                    .take(8)
                    .toByteArray()
                    .contentEquals(byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10))
            "image/jpeg" ->
                bytes.size >= 3 &&
                    bytes[0] == (-1).toByte() &&
                    bytes[1] == (-40).toByte() &&
                    bytes[2] == (-1).toByte()
            "image/webp" ->
                bytes.size >= 12 &&
                    String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" &&
                    String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP"
            else -> false
        }
    require(magic) { "파일 형식과 사진 내용이 일치하지 않습니다." }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    require(
        bounds.outWidth in 1..20000 &&
            bounds.outHeight in 1..20000 &&
            bounds.outWidth.toLong() * bounds.outHeight <= 40_000_000
    ) {
        "손상되었거나 해상도가 너무 큰 사진입니다."
    }
}
