package com.kafka.log

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.IOException
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class ApiFailure(val code: Int, message: String) : IOException(message)

/**
 * App-private authenticated encryption; backup disabled. Also protects local draft text/URI
 * references.
 */
interface PrivateStore {
    fun read(name: String): JSONObject?

    fun write(name: String, value: JSONObject?)

    fun clear()
}

class Vault(context: Context) : PrivateStore {
    private val prefs = context.getSharedPreferences("log_private", Context.MODE_PRIVATE)

    private fun key(): SecretKey =
        (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey("pos.log.v1", null)
            as? SecretKey)
            ?: KeyGenerator.getInstance("AES", "AndroidKeyStore")
                .apply {
                    init(
                        KeyGenParameterSpec.Builder(
                                "pos.log.v1",
                                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                            )
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .build()
                    )
                }
                .generateKey()

    @Synchronized
    override fun read(name: String): JSONObject? =
        runCatching {
                prefs.getString(name, null)?.let { encoded ->
                    val bytes = Base64.decode(encoded, Base64.NO_WRAP)
                    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                    cipher.init(
                        Cipher.DECRYPT_MODE,
                        key(),
                        GCMParameterSpec(128, bytes.copyOfRange(0, 12)),
                    )
                    cipher.updateAAD((BuildConfig.API_URL + name).toByteArray())
                    JSONObject(
                        String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
                    )
                }
            }
            .getOrNull()

    @Synchronized
    override fun write(name: String, value: JSONObject?) {
        if (value == null) {
            check(prefs.edit().remove(name).commit())
            return
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD((BuildConfig.API_URL + name).toByteArray())
        check(
            prefs
                .edit()
                .putString(
                    name,
                    Base64.encodeToString(
                        cipher.iv + cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8)),
                        Base64.NO_WRAP,
                    ),
                )
                .commit()
        )
    }

    @Synchronized
    override fun clear() {
        check(prefs.edit().clear().commit())
    }
}

class Http(
    val client: OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .callTimeout(120, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
) {
    suspend fun execute(request: Request): Response = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(
            object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    continuation.resume(response) { _, r, _ -> r.close() }
                }
            }
        )
    }

    suspend fun json(
        url: String,
        method: String = "GET",
        body: JSONObject? = null,
        headers: Map<String, String> = emptyMap(),
    ): JSONObject {
        val request =
            Request.Builder()
                .url(url)
                .method(
                    method,
                    if (method in listOf("GET", "HEAD")) null
                    else
                        (body ?: JSONObject())
                            .toString()
                            .toRequestBody("application/json".toMediaType()),
                )
                .apply { headers.forEach { (k, v) -> header(k, v) } }
                .build()
        return execute(request).use { response ->
            val raw = withContext(Dispatchers.IO) { response.body?.string().orEmpty() }
            val data = runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
            if (!response.isSuccessful)
                throw ApiFailure(
                    response.code,
                    data.optString(
                        "message",
                        data.optString("msg", "요청을 처리하지 못했습니다. (${response.code})"),
                    ),
                )
            data
        }
    }
}

interface Session {
    val owner: String?

    suspend fun token(force: Boolean = false): String
}

interface AuthSession : Session {
    suspend fun signIn(email: String, password: String)

    suspend fun signOut()
}

class PosAuth(private val vault: Vault, private val http: Http) : AuthSession {
    private val mutex = Mutex()
    override val owner
        get() = vault.read("session")?.optJSONObject("user")?.optional("id")

    override suspend fun signIn(email: String, password: String) {
        check(BuildConfig.PUBLISHABLE_KEY.isNotBlank()) { "POS 로그인 구성이 없습니다." }
        val session =
            http.json(
                BuildConfig.AUTH_URL + "/auth/v1/token?grant_type=password",
                "POST",
                obj("email" to email.trim(), "password" to password),
                mapOf("apikey" to BuildConfig.PUBLISHABLE_KEY),
            )
        require(
            session.optJSONObject("user")?.optional("id") != null && session.has("refresh_token")
        )
        if (owner != session.getJSONObject("user").getString("id")) vault.write("session", null)
        vault.write("session", session)
    }

    override suspend fun token(force: Boolean): String =
        mutex.withLock {
            val old = vault.read("session") ?: throw ApiFailure(401, "POS에 로그인해주세요.")
            if (!force && old.optLong("expires_at") > System.currentTimeMillis() / 1000 + 60)
                return@withLock old.getString("access_token")
            val next =
                http.json(
                    BuildConfig.AUTH_URL + "/auth/v1/token?grant_type=refresh_token",
                    "POST",
                    obj("refresh_token" to old.getString("refresh_token")),
                    mapOf("apikey" to BuildConfig.PUBLISHABLE_KEY),
                )
            if (
                next.getJSONObject("user").getString("id") !=
                    old.getJSONObject("user").getString("id")
            )
                throw ApiFailure(401, "로그인 계정을 확인해주세요.")
            vault.write("session", next)
            next.getString("access_token")
        }

    override suspend fun signOut() {
        try {
            http.json(
                BuildConfig.AUTH_URL + "/auth/v1/logout?scope=local",
                "POST",
                headers =
                    mapOf(
                        "apikey" to BuildConfig.PUBLISHABLE_KEY,
                        "Authorization" to "Bearer ${token()}",
                    ),
            )
        } finally {
            vault.write("session", null)
        }
    }
}

class LogApi(
    private val session: Session,
    private val http: Http,
    private val base: String = BuildConfig.API_URL,
) {
    private fun guard(expected: String) {
        if (session.owner != expected) throw ApiFailure(401, "로그인 계정이 변경되었습니다.")
    }

    suspend fun call(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        owner: String = session.owner ?: throw ApiFailure(401, "POS에 로그인해주세요."),
    ): JSONObject {
        guard(owner)
        suspend fun run(force: Boolean): JSONObject {
            val token = session.token(force)
            guard(owner)
            return http
                .json(
                    base + "/api/log" + path,
                    method,
                    body,
                    mapOf("Authorization" to "Bearer $token"),
                )
                .also { guard(owner) }
        }
        return try {
            run(false)
        } catch (e: ApiFailure) {
            if (e.code == 401) run(true) else throw e
        }
    }

    suspend fun binary(
        path: String,
        bytes: ByteArray? = null,
        owner: String = session.owner ?: throw ApiFailure(401, "POS에 로그인해주세요."),
    ): ByteArray {
        suspend fun run(force: Boolean): ByteArray {
            guard(owner)
            val token = session.token(force)
            guard(owner)
            val request =
                Request.Builder()
                    .url(base + "/api/log" + path)
                    .header("Authorization", "Bearer $token")
                    .apply {
                        if (bytes != null)
                            put(bytes.toRequestBody("application/octet-stream".toMediaType()))
                    }
                    .build()
            return http.execute(request).use { response ->
                if (!response.isSuccessful)
                    throw ApiFailure(response.code, "사진 요청에 실패했습니다. (${response.code})")
                val result = withContext(Dispatchers.IO) { response.body?.bytes() ?: byteArrayOf() }
                guard(owner)
                result
            }
        }
        return try {
            run(false)
        } catch (e: ApiFailure) {
            if (e.code == 401) run(true) else throw e
        }
    }
}
