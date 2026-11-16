package com.kafka.log

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.File
import java.io.FileInputStream
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/**
 * Runs only with explicitly supplied disposable DEV account; no shipped fixtures or login bypass.
 */
class HostedUiTest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
    private val instrument
        get() = InstrumentationRegistry.getInstrumentation()

    private fun fixture(): JSONObject {
        check(BuildConfig.DEBUG && BuildConfig.API_URL.contains("development"))
        val fd =
            instrument.uiAutomation.executeShellCommand("cat /data/local/tmp/log-android-qa.json")
        return fd.use { JSONObject(FileInputStream(it.fileDescriptor).bufferedReader().readText()) }
    }

    private fun waitText(text: String) {
        ui.waitUntil(90000) { ui.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun shot(name: String) {
        ui.waitForIdle()
        val folder =
            File(instrument.targetContext.getExternalFilesDir(null), "qa").apply { mkdirs() }
        instrument.uiAutomation.takeScreenshot().let { bitmap ->
            File(folder, "$name.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        }
    }

    private fun signIn() {
        val actor = fixture().getJSONArray("actors").getJSONObject(0)
        ui.waitUntil(60000) {
            ui.onAllNodesWithTag("email").fetchSemanticsNodes().isNotEmpty() ||
                ui.onAllNodesWithText("LOG Android QA").fetchSemanticsNodes().isNotEmpty()
        }
        if (ui.onAllNodesWithTag("email").fetchSemanticsNodes().isNotEmpty()) {
            ui.onNodeWithTag("email").performTextInput(actor.getString("email"))
            ui.onNodeWithTag("password").performTextInput(actor.getString("password"))
            ui.onNodeWithText("로그인", useUnmergedTree = false).performClick()
        }
        waitText("LOG Android QA")
    }

    @Test
    fun nativeCrudProfilesSearchAndMedia() {
        signIn()
        shot("01-feed")
        ui.onNodeWithContentDescription("LOG 설정").performClick()
        waitText("프로필 관리")
        ui.onNodeWithText("프로필 관리").performClick()
        waitText("프로필 전환")
        shot("04-profile-picker")
        ui.onNodeWithText("LOG Second QA").performClick()
        waitText("첫 기록을 남겨보세요")
        ui.onNodeWithContentDescription("LOG 설정").performClick()
        ui.onNodeWithText("프로필 관리").performClick()
        ui.onNodeWithText("LOG Android QA").performClick()
        waitText("스레드")
        ui.onNodeWithText("미디어").performClick()
        ui.waitUntil(60000) {
            ui.onAllNodesWithContentDescription("사진 1 확대").fetchSemanticsNodes().isNotEmpty()
        }
        ui.onAllNodesWithContentDescription("사진 1 확대").onFirst().performClick()
        ui.onNodeWithTag("media-viewer").assertIsDisplayed()
        shot("05-media-viewer")
        ui.onNodeWithContentDescription("다음 사진").performClick()
        waitText("2 / 3")
        ui.onNodeWithContentDescription("사진 닫기").performClick()
        ui.onNodeWithText("스레드").performClick()
        // Real persisted media loaded into the native editing route; cancel must preserve server
        // content.
        val mediaId = fixture().getJSONObject("mediaPost").getString("id")
        ui.onNodeWithTag("feed-list").performScrollToNode(hasTestTag("edit-$mediaId"))
        ui.onNodeWithTag("edit-$mediaId").performClick()
        waitText("기록 수정")
        shot("02-composer-three-images")
        ui.onNodeWithTag("compose-text").performTextReplacement("Android native edited\n사진 순서 보존")
        ui.onNodeWithContentDescription("사진 3 왼쪽 이동").performScrollTo().performClick()
        ui.onNodeWithTag("publish").performClick()
        ui.waitUntil(90000) { ui.onAllNodesWithTag("composer").fetchSemanticsNodes().isEmpty() }
        ui.onNodeWithTag("compose").performClick()
        waitText("새 기록")
        ui.onNodeWithTag("compose-text").performTextInput("Android native created\n실제 DEV 기록")
        ui.onNodeWithTag("publish").performClick()
        ui.waitUntil(90000) { ui.onAllNodesWithTag("composer").fetchSemanticsNodes().isEmpty() }
        ui.onNodeWithText("검색", useUnmergedTree = false).performClick()
        ui.onNodeWithTag("search-input").performTextInput("Android native")
        waitText("Android native created 실제 DEV 기록")
        shot("03-search")
        ui.onNodeWithText("Android native created 실제 DEV 기록").performClick()
        waitText("Android native created\n실제 DEV 기록")
        ui.onNodeWithTag("feed-list")
            .performScrollToNode(hasText("Android native created\n실제 DEV 기록"))
        ui.onAllNodesWithText("댓글 0개").onFirst().performClick()
        ui.onNodeWithTag("comment-input").performTextInput("Android native reply")
        ui.onNodeWithText("댓글 등록").performClick()
        waitText("Android native reply")
        ui.onNodeWithText("닫기").performClick()
        ui.onNodeWithContentDescription("LOG 설정").performClick()
        ui.onNodeWithText("프로필 관리").performClick()
        ui.onNodeWithText("LOG Second QA").performClick()
        waitText("첫 기록을 남겨보세요")
        ui.onNodeWithContentDescription("LOG 설정").performClick()
        ui.onNodeWithText("프로필 관리").performClick()
        ui.onNodeWithText("LOG Android QA").performClick()
        waitText("스레드")
    }

    @Test
    fun privateMediaAndCrossOwnerContracts() = runBlocking {
        val j = fixture()
        val vault = Vault(instrument.targetContext)
        val http = Http()
        val auth = PosAuth(vault, http)
        val a = j.getJSONArray("actors").getJSONObject(0)
        auth.signIn(a.getString("email"), a.getString("password"))
        val api = LogApi(auth, http)
        val firstToken = auth.token()
        assertNotEquals(firstToken, auth.token(true))
        val p = j.getJSONObject("primary").getString("id")
        val q = j.getJSONObject("secondary").getString("id")
        val media = j.getJSONArray("images").getString(0)
        assertTrue(api.binary("/profiles/$p/images/$media").size > 50)
        try {
            http.json(BuildConfig.API_URL + "/api/log/state")
            fail("anonymous accepted")
        } catch (e: ApiFailure) {
            assertEquals(401, e.code)
        }
        try {
            api.call(
                "/profiles/$p/images",
                "POST",
                obj(
                    "id" to java.util.UUID.randomUUID().toString(),
                    "name" to "bad.svg",
                    "mime" to "image/svg+xml",
                    "sizeBytes" to 10,
                    "sha256" to "0".repeat(64),
                ),
            )
            fail("invalid MIME accepted")
        } catch (e: ApiFailure) {
            assertEquals(400, e.code)
        }
        try {
            api.call(
                "/profiles/$p/images",
                "POST",
                obj(
                    "id" to java.util.UUID.randomUUID().toString(),
                    "name" to "large.png",
                    "mime" to "image/png",
                    "sizeBytes" to (18 * 1024 * 1024 + 1),
                    "sha256" to "0".repeat(64),
                ),
            )
            fail("oversized accepted")
        } catch (e: ApiFailure) {
            assertEquals(413, e.code)
        }
        try {
            api.binary("/profiles/$q/images/$media")
            fail("wrong profile accepted")
        } catch (e: ApiFailure) {
            assertEquals(404, e.code)
        }
        val b = j.getJSONArray("actors").getJSONObject(1)
        auth.signIn(b.getString("email"), b.getString("password"))
        try {
            api.call("/profiles/$p/posts")
            fail("wrong owner accepted")
        } catch (e: ApiFailure) {
            assertEquals(404, e.code)
        }
        auth.signIn(a.getString("email"), a.getString("password"))
    }

    @Test
    fun systemPhotoPickerLaunchesWithoutStoragePermission() {
        signIn()
        ui.onNodeWithTag("compose").performClick()
        waitText("새 기록")
        ui.onNodeWithText("사진 선택").performClick()
        val device = UiDevice.getInstance(instrument)
        device.waitForIdle(5000)
        val folder =
            File(instrument.targetContext.getExternalFilesDir(null), "qa").apply { mkdirs() }
        device.dumpWindowHierarchy(File(folder, "picker.xml"))
        shot("06-system-photo-picker")
        val photos = device.findObjects(By.desc(java.util.regex.Pattern.compile("^Photo taken.*")))
        assertTrue("QA photos are missing", photos.size >= 3)
        photos.takeLast(3).forEach { it.click() }
        val add =
            device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("Add.*"))), 10000)
        assertNotNull("System picker add action missing", add)
        add.click()
        waitText("사진 3장 / 20")
        ui.waitUntil(90000) { ui.onAllNodesWithText("완료").fetchSemanticsNodes().size == 3 }
        shot("07-picked-three-images")
        ui.onNodeWithTag("compose-text").performTextInput("Android picker upload 3")
        ui.onNodeWithTag("publish").performClick()
        ui.waitUntil(90000) { ui.onAllNodesWithTag("composer").fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun webChangesAndServerOrderSurviveAppRestart() {
        signIn()
        ui.activityRule.scenario.recreate()
        waitText("스레드")
        ui.onNodeWithText("검색", useUnmergedTree = false).performClick()
        ui.onNodeWithTag("search-input").performTextInput("Web ")
        waitText("Web created native shared record 웹에서 만든 기록")
        waitText("Web edited Android record 양방향 수정 확인")
        shot("09-android-web-readback")
        runBlocking {
            val j = fixture()
            val vault = Vault(instrument.targetContext)
            val auth = PosAuth(vault, Http())
            val api = LogApi(auth, Http())
            val p = j.getJSONObject("primary").getString("id")
            val media = j.getJSONObject("mediaPost").getString("id")
            val saved = api.call("/profiles/$p/posts/$media").getJSONArray("images").strings()
            val original = j.getJSONArray("images").strings()
            assertEquals(listOf(original[0], original[2], original[1]), saved)
            val web =
                api.call("/profiles/$p/posts?q=Web%20created")
                    .getJSONArray("posts")
                    .getJSONObject(0)
            assertEquals(2, web.getJSONArray("images").length())
        }
    }

    @Test
    fun nativeTwentyImageBatchAndCancelRemainSafe() {
        signIn()
        val model = androidx.lifecycle.ViewModelProvider(ui.activity)[LogViewModel::class.java]
        val resolver = instrument.targetContext.contentResolver
        val uris =
            (1..20).map { i ->
                val values =
                    android.content.ContentValues().apply {
                        put(
                            android.provider.MediaStore.Images.Media.DISPLAY_NAME,
                            "log-native-qa-$i.png",
                        )
                        put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png")
                        put(
                            android.provider.MediaStore.Images.Media.RELATIVE_PATH,
                            "Pictures/LOG_QA_BATCH",
                        )
                    }
                val uri =
                    resolver.insert(
                        android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        values,
                    )!!
                val bitmap =
                    Bitmap.createBitmap(32, 48, Bitmap.Config.ARGB_8888).apply {
                        eraseColor(android.graphics.Color.rgb(100 + i * 3, 130, 160))
                    }
                resolver.openOutputStream(uri)!!.use {
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
                uri
            }
        try {
            ui.onNodeWithTag("compose").performClick()
            waitText("새 기록")
            ui.runOnIdle { model.addPhotos(uris.map { it.toString() }) }
            ui.waitUntil(180000) { model.state.value.editor!!.images.all { it.ready } }
            assertEquals(20, model.state.value.editor!!.images.size)
            val allIds = model.state.value.editor!!.images.map { it.id }
            ui.runOnIdle { model.addPhotos(listOf(uris[0].toString())) }
            ui.waitUntil(10000) { model.state.value.error != null }
            assertEquals(20, model.state.value.editor!!.images.size)
            ui.runOnIdle {
                model.dismissError()
                model.movePhoto(19, -1)
                model.removePhoto(model.state.value.editor!!.images[0].id)
            }
            assertEquals(19, model.state.value.editor!!.images.size)
            val ids = model.state.value.editor!!.images.map { it.id }
            ui.runOnIdle {
                model.text("Android native batch 19 after reorder and remove")
                model.publish()
            }
            ui.waitUntil(90000) { model.state.value.editor == null }
            runBlocking {
                val api = LogApi(PosAuth(Vault(instrument.targetContext), Http()), Http())
                val p = fixture().getJSONObject("primary").getString("id")
                val post =
                    api.call("/profiles/$p/posts?q=Android%20native%20batch")
                        .getJSONArray("posts")
                        .getJSONObject(0)
                assertEquals(ids, post.getJSONArray("images").strings())
                for (n in listOf(1, 2, 3, 4, 20)) {
                    val body =
                        obj(
                            "id" to java.util.UUID.randomUUID().toString(),
                            "text" to "Native batch $n",
                            "images" to allIds.take(n),
                        )
                    val record = api.call("/profiles/$p/posts", "POST", body)
                    assertEquals(n, record.getJSONArray("images").length())
                    api.call(
                        "/profiles/$p/posts/${record.getString("id")}/delete",
                        "POST",
                        obj("revision" to record.getInt("revision"), "confirm" to true),
                    )
                }
            }
            ui.onNodeWithTag("compose").performClick()
            waitText("새 기록")
            ui.onNodeWithTag("compose-text").performTextInput("rotation draft")
            ui.activityRule.scenario.recreate()
            waitText("새 기록")
            ui.onNodeWithTag("compose-text").assertTextContains("rotation draft")
            ui.onNodeWithText("취소", useUnmergedTree = false).performClick()
            ui.onNodeWithText("초안 삭제").performClick()
            ui.waitUntil(30000) { model.state.value.editor == null }
        } finally {
            uris.forEach { resolver.delete(it, null, null) }
        }
    }
}
