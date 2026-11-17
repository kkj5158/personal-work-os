package com.kafka.log

import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

fun obj(vararg fields: Pair<String, Any?>) =
    JSONObject().apply {
        fields.forEach { (key, value) ->
            put(
                key,
                when (value) {
                    null -> JSONObject.NULL
                    is List<*> -> JSONArray(value)
                    else -> value
                },
            )
        }
    }

fun JSONObject.optional(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

fun JSONArray.strings() = (0 until length()).map { getString(it) }

fun <T> JSONArray.mapObjects(convert: (JSONObject) -> T) =
    (0 until length()).map { convert(getJSONObject(it)) }

data class Profile(
    val id: String,
    val name: String,
    val handle: String,
    val bio: String,
    val avatar: String?,
    val revision: Int,
) {
    companion object {
        fun parse(j: JSONObject) =
            Profile(
                j.getString("id"),
                j.getString("name"),
                j.getString("handle"),
                j.optString("bio"),
                j.optional("avatar"),
                j.getInt("revision"),
            )
    }
}

data class Post(
    val id: String,
    val text: String,
    val images: List<String>,
    val createdAt: Long,
    val revision: Int,
    val replyCount: Int,
) {
    companion object {
        fun parse(j: JSONObject) =
            Post(
                j.getString("id"),
                j.getString("text"),
                j.getJSONArray("images").strings(),
                j.getLong("createdAt"),
                j.getInt("revision"),
                j.optInt("replyCount"),
            )
    }
}

data class Reply(val id: String, val text: String, val createdAt: Long, val revision: Int) {
    companion object {
        fun parse(j: JSONObject) =
            Reply(
                j.getString("id"),
                j.getString("text"),
                j.getLong("createdAt"),
                j.getInt("revision"),
            )
    }
}

data class Stats(val posts: Int = 0, val media: Int = 0, val replies: Int = 0) {
    companion object {
        fun parse(j: JSONObject) = Stats(j.optInt("posts"), j.optInt("media"), j.optInt("replies"))
    }
}

data class Workspace(
    val owner: String,
    val profiles: List<Profile>,
    val active: String?,
    val maxImages: Int,
    val maxBytes: Long,
    val storage: Boolean,
) {
    companion object {
        fun parse(j: JSONObject) =
            Workspace(
                j.getString("ownerId"),
                j.getJSONArray("profiles").mapObjects(Profile::parse),
                j.optional("activeProfileId"),
                j.optInt("maxImagesPerPost", 20).coerceIn(1, 100),
                j.optLong("maxImageBytes", 18L * 1024 * 1024),
                j.optBoolean("storageEnabled"),
            )
    }
}

data class Feed(val posts: List<Post>, val next: Int?, val total: Int, val stats: Stats) {
    companion object {
        fun parse(j: JSONObject) =
            Feed(
                j.getJSONArray("posts").mapObjects(Post::parse),
                if (j.isNull("nextOffset")) null else j.getInt("nextOffset"),
                j.getInt("total"),
                Stats.parse(j.getJSONObject("stats")),
            )
    }
}

data class Attachment(
    val id: String = UUID.randomUUID().toString(),
    val uri: String? = null,
    val ready: Boolean = false,
    val phase: String = if (ready) "완료" else "대기",
    val error: String? = null,
) {
    fun json() = obj("id" to id, "uri" to uri, "ready" to ready)

    companion object {
        fun parse(j: JSONObject) =
            Attachment(
                j.getString("id"),
                j.optional("uri"),
                j.optBoolean("ready"),
                if (j.optBoolean("ready")) "완료" else "대기",
            )
    }
}

data class Editor(
    val profile: String,
    val id: String = UUID.randomUUID().toString(),
    val revision: Int? = null,
    val text: String = "",
    val images: List<Attachment> = emptyList(),
    val originalText: String = "",
    val originalImages: List<String> = emptyList(),
    val submitting: Boolean = false,
    val pendingPayload: String? = null,
    val conflict: Boolean = false,
) {
    val changed
        get() = text != originalText || images.map { it.id } != originalImages

    val valid
        get() =
            text.length <= 50000 &&
                (text.isNotBlank() || images.isNotEmpty()) &&
                images.all { it.ready } &&
                !submitting

    fun json() =
        obj(
            "profile" to profile,
            "id" to id,
            "revision" to revision,
            "text" to text,
            "images" to JSONArray(images.map { it.json() }),
            "originalText" to originalText,
            "originalImages" to originalImages,
            "pendingPayload" to pendingPayload,
            "conflict" to conflict,
        )

    companion object {
        fun parse(j: JSONObject) =
            Editor(
                j.getString("profile"),
                j.getString("id"),
                if (j.isNull("revision")) null else j.getInt("revision"),
                j.getString("text"),
                j.getJSONArray("images").mapObjects(Attachment::parse),
                j.optString("originalText"),
                j.optJSONArray("originalImages")?.strings().orEmpty(),
                pendingPayload = j.optional("pendingPayload"),
                conflict = j.optBoolean("conflict"),
            )
    }
}

fun <T> List<T>.move(from: Int, delta: Int): List<T> =
    toMutableList().apply {
        val to = from + delta
        if (from in indices && to in indices) add(to, removeAt(from))
    }
