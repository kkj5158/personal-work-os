@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.kafka.log

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.pager.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.*
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

val Ink = Color(0xff16191d)
val Sub = Color(0xff707783)
val Light = Color(0xff9da4ad)
val Line = Color(0xffe8eaee)
val Soft = Color(0xfff7f8fa)
val Green = Color(0xff728777)

@Composable
fun LogTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme =
            lightColorScheme(
                primary = Ink,
                onPrimary = Color.White,
                secondary = Green,
                background = Color.White,
                surface = Color.White,
                onSurface = Ink,
                surfaceContainer = Soft,
            ),
        typography =
            Typography(
                bodyMedium =
                    androidx.compose.ui.text.TextStyle(fontSize = 13.sp, lineHeight = 23.sp),
                bodySmall = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, lineHeight = 20.sp),
            ),
        content = content,
    )
}

@Composable
fun Glyph(icon: ImageVector, label: String?, modifier: Modifier = Modifier, tint: Color = Sub) {
    Icon(icon, label, modifier.size(21.dp), tint = tint)
}

@Composable
fun IconTap(icon: ImageVector, label: String, onClick: () -> Unit, enabled: Boolean = true) {
    IconButton(onClick, enabled = enabled) { Glyph(icon, label) }
}

@Composable
fun Wordmark() {
    Row {
        Text("LOG", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1).sp)
        Text(".", color = Green, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
fun LogApp(vm: LogViewModel) {
    val s by vm.state.collectAsStateWithLifecycle()
    var sheet by rememberSaveable { mutableStateOf<String?>(null) }
    var delete by remember { mutableStateOf<Post?>(null) }
    var replyDelete by remember { mutableStateOf<Reply?>(null) }
    var viewer by remember { mutableStateOf<Pair<List<String>, Int>?>(null) }
    var editingProfile by remember { mutableStateOf<Profile?>(null) }
    val nav = rememberNavController()
    val route = nav.currentBackStackEntryAsState().value?.destination?.route ?: "feed"
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(s.message) {
        s.message?.let {
            if (it == "기록을 게시했습니다." || it == "기록을 수정했습니다.") {
                nav.navigate("feed") {
                    popUpTo("feed")
                    launchSingleTop = true
                }
            }
            snackbar.showSnackbar(it)
            vm.clearMessage()
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (s.signedIn && s.editor == null && s.commentsPost == null) vm.refresh()
    }
    if (!s.signedIn) {
        LoginScreen(s, vm::login)
    } else {
        Scaffold(
            containerColor = Color.White,
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                Column(Modifier.statusBarsPadding()) {
                    Box(Modifier.fillMaxWidth().height(53.dp).padding(horizontal = 12.dp)) {
                        TextButton(
                            { sheet = "profiles" },
                            Modifier.align(Alignment.CenterStart).widthIn(max = 135.dp),
                            contentPadding = PaddingValues(horizontal = 6.dp),
                        ) {
                            Text(
                                s.profile?.name ?: "프로필",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Glyph(
                                Icons.Outlined.KeyboardArrowDown,
                                null,
                                Modifier.size(15.dp),
                                Light,
                            )
                        }
                        Box(Modifier.align(Alignment.Center)) { Wordmark() }
                        Box(Modifier.align(Alignment.CenterEnd)) {
                            IconTap(Icons.Outlined.Tune, "LOG 설정", { sheet = "settings" })
                        }
                    }
                    HorizontalDivider(color = Line.copy(alpha = .6f))
                }
            },
            bottomBar = {
                Column(Modifier.navigationBarsPadding()) {
                    HorizontalDivider(color = Line.copy(alpha = .6f))
                    Row(
                        Modifier.fillMaxWidth().height(66.dp).padding(horizontal = 20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceAround,
                    ) {
                        NavItem("내 피드", Icons.Outlined.Home, route == "feed") {
                            nav.navigate("feed") {
                                popUpTo("feed")
                                launchSingleTop = true
                            }
                        }
                        FilledIconButton(
                            { vm.openEditor() },
                            Modifier.size(49.dp, 45.dp).testTag("compose"),
                            enabled = s.profile != null && !s.busy,
                            shape = RoundedCornerShape(16.dp),
                        ) {
                            Glyph(Icons.Outlined.Add, "새 기록", tint = Color.White)
                        }
                        NavItem("검색", Icons.Outlined.Search, route == "search") {
                            nav.navigate("search") { launchSingleTop = true }
                            vm.search(s.search)
                        }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.padding(padding)) {
                NavHost(nav, startDestination = "feed") {
                    composable("feed") {
                        FeedScreen(
                            s,
                            vm,
                            {
                                sheet = "editProfile"
                                editingProfile = s.profile
                            },
                            { sheet = "insights" },
                            { p, i -> viewer = p.images to i },
                            { delete = it },
                            {
                                sheet = "createProfile"
                                editingProfile = null
                            },
                        )
                    }
                    composable("search") {
                        SearchScreen(s, vm) {
                            vm.jump(it)
                            nav.popBackStack("feed", false)
                        }
                    }
                }
            }
        }
        s.editor?.let { Composer(it, s.profile, s.workspace, vm) }
        if (sheet != null && s.editor == null)
            ModalBottomSheet(onDismissRequest = { sheet = null }, containerColor = Color.White) {
                Column(
                    Modifier.fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .navigationBarsPadding()
                        .imePadding()
                        .verticalScroll(rememberScrollState())
                ) {
                    when (sheet) {
                        "profiles" -> {
                            SheetTitle("프로필 전환") { sheet = null }
                            s.workspace?.profiles?.forEach { p ->
                                Row(
                                    Modifier.fillMaxWidth()
                                        .clickable(enabled = !s.busy) {
                                            vm.selectProfile(p)
                                            sheet = null
                                        }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Avatar(p, vm.repository, 42)
                                    Spacer(Modifier.width(10.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(p.name, fontWeight = FontWeight.Bold)
                                        Text("@${p.handle}", color = Light, fontSize = 11.sp)
                                    }
                                    if (p.id == s.profile?.id)
                                        Glyph(Icons.Outlined.Check, "선택됨", tint = Green)
                                }
                                HorizontalDivider(color = Line.copy(alpha = .5f))
                            }
                            OutlineAction("프로필 추가", Modifier.padding(top = 14.dp)) {
                                editingProfile = null
                                sheet = "createProfile"
                            }
                        }
                        "settings" -> {
                            SheetTitle("LOG 설정") { sheet = null }
                            ListItem(
                                headlineContent = {
                                    Text("프로필 관리", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                },
                                supportingContent = { Text("프로필 추가 · 전환") },
                                leadingContent = { Glyph(Icons.Outlined.Person, null) },
                                modifier = Modifier.clickable { sheet = "profiles" },
                                colors = ListItemDefaults.colors(containerColor = Color.White),
                            )
                            Text(
                                "POS LOG ${BuildConfig.VERSION_NAME}\n내 기록과 사진을 웹과 함께 보관합니다.",
                                color = Light,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(vertical = 22.dp),
                            )
                            OutlineAction("로그아웃") {
                                sheet = null
                                vm.logout()
                            }
                        }
                        "insights" -> {
                            SheetTitle("나의 LOG 인사이트") { sheet = null }
                            Text("현재 선택한 프로필의 기록 요약입니다.", color = Sub, fontSize = 12.sp)
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 28.dp),
                                horizontalArrangement = Arrangement.SpaceAround,
                            ) {
                                listOf(
                                        s.stats.posts to "전체 기록",
                                        s.stats.media to "등록된 사진",
                                        s.stats.replies to "댓글",
                                    )
                                    .forEach { (n, label) ->
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text(
                                                "$n",
                                                fontSize = 26.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                            Text(label, fontSize = 11.sp, color = Light)
                                        }
                                    }
                            }
                        }
                        "editProfile",
                        "createProfile" -> ProfileForm(editingProfile, s.busy, vm, { sheet = null })
                    }
                    Spacer(Modifier.height(28.dp))
                }
            }
        if (s.commentsPost != null && s.editor == null)
            ModalBottomSheet(onDismissRequest = vm::closeComments, containerColor = Color.White) {
                Column(
                    Modifier.fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .imePadding()
                        .navigationBarsPadding()
                ) {
                    SheetTitle("댓글") { vm.closeComments() }
                    Text(
                        s.commentsPost!!.text,
                        color = Sub,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                    HorizontalDivider(Modifier.padding(vertical = 12.dp), color = Line)
                    LazyColumn(Modifier.weight(1f, false).heightIn(max = 320.dp)) {
                        if (s.replies.isEmpty() && !s.commentsLoading)
                            item {
                                Text(
                                    "첫 댓글을 남겨보세요.",
                                    color = Light,
                                    modifier = Modifier.padding(vertical = 22.dp),
                                )
                            }
                        items(s.replies, key = { it.id }) { r ->
                            Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        s.profile?.name.orEmpty(),
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.weight(1f),
                                    )
                                    TextButton({ vm.editReply(r) }, enabled = !s.busy) {
                                        Text("수정", fontSize = 11.sp)
                                    }
                                    TextButton({ replyDelete = r }, enabled = !s.busy) {
                                        Text("삭제", fontSize = 11.sp)
                                    }
                                }
                                Text(r.text)
                                Text(timestamp(r.createdAt), fontSize = 10.sp, color = Light)
                                HorizontalDivider(
                                    Modifier.padding(top = 10.dp),
                                    color = Line.copy(alpha = .6f),
                                )
                            }
                        }
                        if (s.repliesNext != null)
                            item {
                                TextButton(
                                    { vm.comments(s.commentsPost!!, true) },
                                    enabled = !s.commentsLoading,
                                ) {
                                    Text("댓글 더 보기")
                                }
                            }
                    }
                    if (s.commentsLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (s.commentEditing != null)
                        TextButton({ vm.editReply(null) }) { Text("댓글 수정 취소") }
                    OutlinedTextField(
                        s.commentText,
                        vm::commentText,
                        Modifier.fillMaxWidth().testTag("comment-input"),
                        placeholder = { Text("댓글 작성...") },
                        maxLines = 5,
                        enabled = !s.busy,
                        shape = RoundedCornerShape(10.dp),
                    )
                    Button(
                        { vm.sendComment() },
                        Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        enabled = s.commentText.isNotBlank() && !s.busy,
                        shape = RoundedCornerShape(11.dp),
                    ) {
                        Text(if (s.commentEditing == null) "댓글 등록" else "댓글 저장")
                    }
                }
            }
        viewer?.let { (photos, index) ->
            s.profile?.let { p ->
                MediaViewer(photos, index, p.id, vm.repository) { viewer = null }
            }
        }
        delete?.let { post ->
            Confirm("이 기록을 삭제할까요?", "삭제한 기록은 되돌릴 수 없습니다.", { delete = null }) {
                vm.delete(post)
                delete = null
            }
        }
        replyDelete?.let { reply ->
            Confirm("댓글을 삭제할까요?", "삭제한 댓글은 되돌릴 수 없습니다.", { replyDelete = null }) {
                vm.sendComment(reply)
                replyDelete = null
            }
        }
    }
    s.error?.let { error ->
        AlertDialog(
            onDismissRequest = vm::dismissError,
            title = { Text("확인해주세요") },
            text = { Text(error) },
            confirmButton = { TextButton(vm::dismissError) { Text("확인") } },
        )
    }
}

@Composable
fun LoginScreen(s: UiState, login: (String, String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize()
            .background(Color.White)
            .safeDrawingPadding()
            .imePadding()
            .padding(28.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Wordmark()
        Spacer(Modifier.height(28.dp))
        Text("나의 일상을 기록합니다.", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text("기존 POS 계정으로 로그인하세요.", color = Sub, modifier = Modifier.padding(vertical = 16.dp))
        OutlinedTextField(
            email,
            { email = it },
            Modifier.fillMaxWidth().testTag("email"),
            label = { Text("이메일") },
            singleLine = true,
            keyboardOptions =
                androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
                ),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            password,
            { password = it },
            Modifier.fillMaxWidth().testTag("password"),
            label = { Text("비밀번호") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Button(
            {
                login(email, password)
                password = ""
            },
            Modifier.fillMaxWidth().padding(top = 20.dp).height(48.dp),
            enabled = !s.busy && email.isNotBlank() && password.isNotBlank(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(if (s.busy) "로그인 중..." else "로그인")
        }
        Text(
            if (BuildConfig.DEBUG) "DEV · 테스트 계정 전용" else "POS와 같은 계정과 기록을 사용합니다.",
            fontSize = 11.sp,
            color = Light,
            modifier = Modifier.padding(top = 18.dp),
        )
    }
}

@Composable
fun NavItem(label: String, icon: ImageVector, selected: Boolean, click: () -> Unit) {
    Column(
        Modifier.width(80.dp).height(56.dp).selectable(selected, role = Role.Tab, onClick = click),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Glyph(icon, null, tint = if (selected) Ink else Light)
        Spacer(Modifier.height(4.dp))
        Text(
            label,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Ink else Light,
        )
    }
}

@Composable
fun OutlineAction(text: String, modifier: Modifier = Modifier, click: () -> Unit) {
    OutlinedButton(
        click,
        modifier.fillMaxWidth().heightIn(min = 38.dp),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, Line),
        contentPadding = PaddingValues(8.dp),
    ) {
        Text(text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun SheetTitle(title: String, close: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.weight(1f))
        TextButton(close) { Text("닫기", fontSize = 12.sp, color = Sub) }
    }
}

@Composable
fun Confirm(title: String, text: String, cancel: () -> Unit, confirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = cancel,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(confirm) { Text("삭제", color = Color(0xffa43c38)) } },
        dismissButton = { TextButton(cancel) { Text("취소") } },
    )
}

@Composable
fun Avatar(profile: Profile, repo: LogRepository, size: Int = 37) {
    Box(
        Modifier.size(size.dp)
            .clip(CircleShape)
            .background(Green.copy(alpha = .28f))
            .border(1.dp, Green.copy(alpha = .35f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            profile.name.take(1).uppercase(),
            fontWeight = FontWeight.Bold,
            fontSize = (size * .32).sp,
            color = Green,
        )
        profile.avatar?.let {
            PrivatePhoto(
                profile.id,
                it,
                repo,
                Modifier.fillMaxSize(),
                ContentScale.Crop,
                "${profile.name} 프로필 사진",
            )
        }
    }
}

@Composable
fun PrivatePhoto(
    profile: String,
    id: String,
    repo: LogRepository,
    modifier: Modifier = Modifier,
    scale: ContentScale = ContentScale.Fit,
    label: String = "기록에 첨부된 사진",
) {
    var failed by remember(profile, id) { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }
    val data by
        produceState<ByteArray?>(null, profile, id, retry) {
            failed = false
            value = null
            try {
                value = repo.image(profile, id)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                failed = true
            }
        }
    Box(modifier.background(Soft), contentAlignment = Alignment.Center) {
        data?.let { bytes ->
            AsyncImage(
                ImageRequest.Builder(LocalContext.current)
                    .data(bytes)
                    .diskCachePolicy(CachePolicy.DISABLED)
                    .memoryCacheKey("$profile/$id")
                    .build(),
                label,
                Modifier.fillMaxSize(),
                contentScale = scale,
            )
        }
        if (failed) TextButton({ retry++ }) { Text("사진 다시 불러오기", fontSize = 11.sp) }
        else if (data == null) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 1.dp)
    }
}

@Composable
fun FeedScreen(
    s: UiState,
    vm: LogViewModel,
    editProfile: () -> Unit,
    insights: () -> Unit,
    viewer: (Post, Int) -> Unit,
    delete: (Post) -> Unit,
    createProfile: () -> Unit,
) {
    var tab by rememberSaveable(s.profile?.id) { mutableStateOf("threads") }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val sorted =
        s.posts.sortedWith(compareByDescending<Post> { it.createdAt }.thenByDescending { it.id })
    LaunchedEffect(s.profile?.id) { list.scrollToItem(0) }
    LaunchedEffect(s.jumpId) {
        s.jumpId?.let { id ->
            tab = "threads"
            val index = sorted.indexOfFirst { it.id == id }
            if (index >= 0) list.animateScrollToItem(index + 2)
            vm.jumped()
        }
    }
    PullToRefreshBox(s.loading, { vm.refresh() }, Modifier.fillMaxSize()) {
        if (s.profile == null)
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Empty("첫 프로필을 만들어보세요", "이름과 소개를 등록하면 기록을 시작할 수 있어요.")
                    Box(Modifier.padding(24.dp)) { OutlineAction("프로필 추가", click = createProfile) }
                }
            }
        else {
            val p = s.profile
            if (tab == "threads")
                LazyColumn(Modifier.fillMaxSize().testTag("feed-list"), state = list) {
                    item(key = "profile") {
                        ProfileHeader(p, s.stats, vm.repository, editProfile, insights, tab) {
                            tab = it
                        }
                    }
                    item(key = "quick") {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Avatar(p, vm.repository)
                            TextButton(
                                { vm.openEditor() },
                                Modifier.weight(1f),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 12.dp),
                            ) {
                                Text(
                                    "지금 떠오르는 생각을 기록하세요...",
                                    fontSize = 12.sp,
                                    color = Light,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            OutlinedIconButton(
                                { vm.openEditor() },
                                Modifier.size(40.dp),
                                border = BorderStroke(1.dp, Line),
                            ) {
                                Glyph(Icons.Outlined.Add, "빠른 기록")
                            }
                        }
                        HorizontalDivider(color = Line)
                    }
                    if (sorted.isEmpty() && !s.loading)
                        item { Empty("첫 기록을 남겨보세요", "짧은 생각과 사진부터 시작할 수 있어요.") }
                    items(sorted, key = { it.id }) { post ->
                        PostCard(
                            post,
                            p,
                            vm.repository,
                            { vm.openEditor(post) },
                            { vm.comments(post) },
                            { delete(post) },
                            { viewer(post, it) },
                        )
                    }
                    if (s.next != null)
                        item {
                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                TextButton(vm::more, enabled = !s.loading) { Text("기록 더 보기") }
                            }
                        }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            else {
                val media =
                    sorted.flatMap { post ->
                        post.images.mapIndexed { i, id -> Triple(post, i, id) }
                    }
                LazyVerticalGrid(
                    GridCells.Fixed(3),
                    Modifier.fillMaxSize().testTag("media-grid"),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    item(span = { GridItemSpan(3) }) {
                        ProfileHeader(p, s.stats, vm.repository, editProfile, insights, tab) {
                            tab = it
                        }
                    }
                    if (media.isEmpty() && !s.loading)
                        item(span = { GridItemSpan(3) }) {
                            Empty("아직 사진 기록이 없어요", "사진을 첨부한 기록이 여기에 모여요.")
                        }
                    items(media, key = { "${it.first.id}/${it.second}" }) { (post, index, id) ->
                        PrivatePhoto(
                            p.id,
                            id,
                            vm.repository,
                            Modifier.aspectRatio(1f).clickable { viewer(post, index) },
                            ContentScale.Crop,
                            "사진 ${index+1} 확대",
                        )
                    }
                    if (s.next != null)
                        item(span = { GridItemSpan(3) }) {
                            TextButton(vm::more, enabled = !s.loading) { Text("기록 더 보기") }
                        }
                }
            }
        }
    }
}

@Composable
fun ProfileHeader(
    p: Profile,
    stats: Stats,
    repo: LogRepository,
    edit: () -> Unit,
    insights: () -> Unit,
    tab: String,
    select: (String) -> Unit,
) {
    Column {
        Column(Modifier.fillMaxWidth().padding(start = 22.dp, end = 22.dp, top = 25.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        p.name,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = (-1).sp,
                    )
                    Text(
                        "@${p.handle}",
                        fontSize = 12.sp,
                        color = Sub,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                Avatar(p, repo, 70)
            }
            Text(
                p.bio,
                fontSize = 13.sp,
                lineHeight = 23.sp,
                modifier = Modifier.padding(top = 18.dp, bottom = 17.dp),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Glyph(Icons.Outlined.Lock, null, Modifier.size(13.dp), Light)
                Spacer(Modifier.width(9.dp))
                Text("게시글 ${stats.posts}개 · 사진 ${stats.media}장", color = Light, fontSize = 11.sp)
            }
            Row(Modifier.padding(top = 22.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) { OutlineAction("프로필 편집", click = edit) }
                Box(Modifier.weight(1f)) { OutlineAction("인사이트 보기", click = insights) }
            }
        }
        Row(Modifier.padding(top = 17.dp)) {
            listOf("threads" to "스레드", "media" to "미디어").forEach { (value, label) ->
                Column(
                    Modifier.weight(1f).selectable(tab == value, role = Role.Tab) { select(value) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(Modifier.height(48.dp), contentAlignment = Alignment.Center) {
                        Text(
                            label,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (tab == value) Ink else Light,
                        )
                    }
                    HorizontalDivider(
                        thickness = if (tab == value) 2.dp else 1.dp,
                        color = if (tab == value) Ink else Line,
                    )
                }
            }
        }
    }
}

@Composable
fun Empty(title: String, subtitle: String) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 30.dp, vertical = 50.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Text(subtitle, color = Light, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
    }
}

fun timestamp(millis: Long): String {
    val age = System.currentTimeMillis() - millis
    return if (age in 0..59999) "방금"
    else if (age in 60000..3599999) "${age/60000}분 전"
    else
        DateTimeFormatter.ofPattern("M월 d일 HH:mm")
            .withZone(ZoneId.systemDefault())
            .format(Instant.ofEpochMilli(millis))
}

@Composable
fun PostCard(
    post: Post,
    p: Profile,
    repo: LogRepository,
    edit: () -> Unit,
    comments: () -> Unit,
    delete: () -> Unit,
    viewer: (Int) -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 17.dp, top = 18.dp, bottom = 18.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Avatar(p, repo)
        Column(Modifier.weight(1f)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(p.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(
                    timestamp(post.createdAt),
                    fontSize = 11.sp,
                    color = Light,
                    modifier = Modifier.padding(start = 7.dp).weight(1f),
                )
                Box {
                    IconTap(Icons.Outlined.MoreHoriz, "게시물 메뉴", { menu = true })
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(
                            { Text("수정") },
                            {
                                menu = false
                                edit()
                            },
                        )
                        DropdownMenuItem(
                            { Text("삭제") },
                            {
                                menu = false
                                delete()
                            },
                        )
                    }
                }
            }
            if (post.text.isNotEmpty())
                Text(
                    post.text,
                    fontSize = 13.sp,
                    lineHeight = 23.sp,
                    modifier = Modifier.padding(bottom = 10.dp),
                )
            if (post.images.isNotEmpty()) Gallery(post.images, p.id, repo, viewer)
            Row(
                Modifier.fillMaxWidth().padding(top = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(
                    comments,
                    modifier = Modifier.testTag("comments-${post.id}"),
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Glyph(Icons.Outlined.ChatBubbleOutline, null, Modifier.size(17.dp), Light)
                    Spacer(Modifier.width(5.dp))
                    Text("댓글 ${post.replyCount}개", fontSize = 11.sp, color = Light)
                }
                TextButton(
                    edit,
                    modifier = Modifier.testTag("edit-${post.id}"),
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Glyph(Icons.Outlined.Edit, null, Modifier.size(17.dp), Light)
                    Spacer(Modifier.width(5.dp))
                    Text("수정", fontSize = 11.sp, color = Light)
                }
            }
        }
    }
    HorizontalDivider(color = Line.copy(alpha = .55f))
}

@Composable
fun Gallery(photos: List<String>, profile: String, repo: LogRepository, viewer: (Int) -> Unit) {
    val pager = rememberPagerState(pageCount = { photos.size })
    val scope = rememberCoroutineScope()
    Box(
        Modifier.fillMaxWidth()
            .height(216.dp)
            .clip(RoundedCornerShape(12.dp))
            .testTag("post-gallery")
    ) {
        HorizontalPager(pager, Modifier.fillMaxSize(), key = { photos[it] }) { i ->
            PrivatePhoto(
                profile,
                photos[i],
                repo,
                Modifier.fillMaxSize().clickable { viewer(i) },
                ContentScale.Fit,
                "첨부 사진 ${i+1}",
            )
        }
        if (photos.size > 1) {
            Text(
                "${pager.currentPage+1} / ${photos.size}",
                Modifier.align(Alignment.TopEnd)
                    .padding(10.dp)
                    .background(Ink.copy(alpha = .7f), CircleShape)
                    .padding(horizontal = 8.dp, vertical = 5.dp),
                color = Color.White,
                fontSize = 10.sp,
            )
            if (pager.currentPage > 0)
                Box(
                    Modifier.align(Alignment.CenterStart)
                        .background(Color.White.copy(alpha = .85f), CircleShape)
                ) {
                    IconTap(
                        Icons.Outlined.ChevronLeft,
                        "이전 사진",
                        { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) } },
                    )
                }
            if (pager.currentPage < photos.lastIndex)
                Box(
                    Modifier.align(Alignment.CenterEnd)
                        .background(Color.White.copy(alpha = .85f), CircleShape)
                ) {
                    IconTap(
                        Icons.Outlined.ChevronRight,
                        "다음 사진",
                        { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                    )
                }
        }
    }
}

@Composable
fun SearchScreen(s: UiState, vm: LogViewModel, jump: (Post) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        item {
            Text(
                "내 기록 검색",
                fontSize = 23.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-.9).sp,
                modifier = Modifier.padding(top = 21.dp, bottom = 18.dp),
            )
            OutlinedTextField(
                s.search,
                { vm.search(it) },
                Modifier.fillMaxWidth().testTag("search-input"),
                placeholder = { Text("어떤 기록을 찾고 계세요?", fontSize = 13.sp) },
                singleLine = true,
                leadingIcon = { Glyph(Icons.Outlined.Search, null) },
                trailingIcon = {
                    if (s.search.isNotEmpty())
                        IconTap(Icons.Outlined.Close, "검색어 지우기", { vm.search("") })
                },
                shape = RoundedCornerShape(11.dp),
                colors =
                    OutlinedTextFieldDefaults.colors(
                        unfocusedContainerColor = Soft,
                        focusedContainerColor = Soft,
                        unfocusedBorderColor = Color.Transparent,
                        focusedBorderColor = Line,
                    ),
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                modifier = Modifier.padding(top = 6.dp),
            ) {
                FilterChip(
                    !s.photoFilter,
                    { vm.search(s.search, false) },
                    label = { Text("전체 기록", fontSize = 11.sp) },
                )
                FilterChip(
                    s.photoFilter,
                    { vm.search(s.search, true) },
                    label = { Text("사진 포함", fontSize = 11.sp) },
                )
            }
            if (s.searching) LinearProgressIndicator(Modifier.fillMaxWidth())
            Text(
                if (s.search.isBlank()) "최근 기록" else "검색 결과",
                fontSize = 12.sp,
                color = Light,
                modifier = Modifier.padding(top = 12.dp, bottom = 8.dp),
            )
        }
        if (!s.searching && s.results.isEmpty())
            item { Empty("일치하는 기록이 없습니다", "다른 단어로 다시 검색해보세요.") }
        items(s.results, key = { it.id }) { post ->
            Row(
                Modifier.fillMaxWidth().clickable { jump(post) }.padding(vertical = 15.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${s.profile?.name.orEmpty()} · ${timestamp(post.createdAt)}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        post.text.replace('\n', ' '),
                        fontSize = 12.sp,
                        color = Sub,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                post.images.firstOrNull()?.let {
                    PrivatePhoto(
                        s.profile!!.id,
                        it,
                        vm.repository,
                        Modifier.padding(start = 8.dp).size(54.dp).clip(RoundedCornerShape(9.dp)),
                        ContentScale.Crop,
                    )
                }
            }
            HorizontalDivider(color = Line.copy(alpha = .55f))
        }
        if (s.searchNext != null)
            item {
                TextButton({ vm.search(s.search, more = true) }, enabled = !s.searching) {
                    Text("검색 결과 더 보기")
                }
            }
    }
}

@Composable
fun ProfileForm(p: Profile?, busy: Boolean, vm: LogViewModel, close: () -> Unit) {
    var name by rememberSaveable(p?.id) { mutableStateOf(p?.name.orEmpty()) }
    var handle by rememberSaveable(p?.id) { mutableStateOf(p?.handle.orEmpty()) }
    var bio by rememberSaveable(p?.id) { mutableStateOf(p?.bio.orEmpty()) }
    SheetTitle(if (p == null) "새 프로필" else "프로필 편집", close)
    OutlinedTextField(
        name,
        { name = it.take(40) },
        Modifier.fillMaxWidth().testTag("profile-name"),
        label = { Text("표시 이름") },
        singleLine = true,
        enabled = !busy,
    )
    OutlinedTextField(
        handle,
        { handle = it.take(32) },
        Modifier.fillMaxWidth().padding(top = 10.dp).testTag("profile-handle"),
        label = { Text("사용자 이름") },
        prefix = { Text("@") },
        singleLine = true,
        enabled = !busy,
        supportingText = { Text("문자·숫자·점·밑줄, 최대 32자") },
    )
    OutlinedTextField(
        bio,
        { bio = it.take(300) },
        Modifier.fillMaxWidth().testTag("profile-bio"),
        label = { Text("소개") },
        minLines = 3,
        enabled = !busy,
    )
    Button(
        { vm.saveProfile(p?.id, name, handle, bio, p?.avatar, close) },
        Modifier.fillMaxWidth().padding(top = 17.dp),
        enabled = !busy && name.isNotBlank() && handle.matches(Regex("[a-zA-Z0-9_.가-힣]{1,32}")),
        shape = RoundedCornerShape(11.dp),
    ) {
        Text(if (busy) "저장 중..." else if (p == null) "프로필 만들기" else "저장")
    }
}

@Composable
fun Composer(e: Editor, p: Profile?, w: Workspace?, vm: LogViewModel) {
    val context = LocalContext.current
    val scroll = rememberScrollState()
    var confirm by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(false) }
    val locked = e.submitting || e.pendingPayload != null
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(100)) {
            uris ->
            uris.forEach { uri ->
                runCatching {
                    context.contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                }
            }
            vm.addPhotos(uris.map(Uri::toString))
        }
    fun close() {
        if (e.changed) confirm = true else vm.closeEditor(true)
    }
    Dialog(
        onDismissRequest = { if (!e.submitting) close() },
        properties =
            DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
                dismissOnBackPress = false,
            ),
    ) {
        BackHandler { if (!e.submitting) close() }
        Column(
            Modifier.fillMaxSize()
                .background(Color.White)
                .safeDrawingPadding()
                .imePadding()
                .testTag("composer")
        ) {
            Row(
                Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(
                    { close() },
                    enabled = !e.submitting,
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Text("취소", color = Sub, fontSize = 13.sp)
                }
                Text(
                    if (e.revision == null) "새 기록" else "기록 수정",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Button(
                    vm::publish,
                    enabled = e.valid,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 7.dp),
                    shape = RoundedCornerShape(11.dp),
                    modifier = Modifier.testTag("publish"),
                ) {
                    Text(
                        if (e.submitting) "저장 중"
                        else if (e.pendingPayload != null) "재시도"
                        else if (e.revision == null) "게시" else "저장",
                        fontSize = 13.sp,
                    )
                }
            }
            HorizontalDivider(color = Line.copy(alpha = .6f))
            if (e.submitting) LinearProgressIndicator(Modifier.fillMaxWidth())
            Column(Modifier.weight(1f).verticalScroll(scroll).padding(20.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (p != null) Avatar(p, vm.repository, 42)
                    Column(Modifier.weight(1f)) {
                        Text(
                            p?.name.orEmpty(),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 5.dp),
                        )
                        androidx.compose.foundation.text.BasicTextField(
                            e.text,
                            vm::text,
                            Modifier.fillMaxWidth()
                                .heightIn(min = 140.dp)
                                .padding(top = 14.dp, bottom = 20.dp)
                                .testTag("compose-text"),
                            enabled = !locked,
                            textStyle =
                                androidx.compose.ui.text.TextStyle(
                                    color = Ink,
                                    fontSize = 15.sp,
                                    lineHeight = 26.sp,
                                ),
                            decorationBox = { inner ->
                                Box {
                                    if (e.text.isEmpty())
                                        Text("오늘의 장면을 남겨보세요.", color = Light, fontSize = 15.sp)
                                    inner()
                                }
                            },
                        )
                        BoxWithConstraints(Modifier.fillMaxWidth()) {
                            val thumbnailSize = ((maxWidth - 14.dp) / 3).coerceAtMost(90.dp)
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(7.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                itemsIndexed(e.images, key = { _, a -> a.id }) { index, a ->
                                    Column(Modifier.width(thumbnailSize)) {
                                        Box(
                                            Modifier.size(thumbnailSize)
                                                .clip(RoundedCornerShape(11.dp))
                                                .background(Soft)
                                        ) {
                                            if (a.uri != null)
                                                AsyncImage(
                                                    ImageRequest.Builder(context)
                                                        .data(Uri.parse(a.uri))
                                                        .diskCachePolicy(CachePolicy.DISABLED)
                                                        .build(),
                                                    "선택 사진 ${index+1}",
                                                    Modifier.fillMaxSize(),
                                                    contentScale = ContentScale.Crop,
                                                )
                                            else
                                                PrivatePhoto(
                                                    e.profile,
                                                    a.id,
                                                    vm.repository,
                                                    Modifier.fillMaxSize(),
                                                    ContentScale.Crop,
                                                )
                                            Text(
                                                "${index+1}",
                                                Modifier.align(Alignment.TopStart)
                                                    .padding(5.dp)
                                                    .background(
                                                        Ink.copy(alpha = .7f),
                                                        RoundedCornerShape(6.dp),
                                                    )
                                                    .padding(horizontal = 5.dp, vertical = 2.dp),
                                                color = Color.White,
                                                fontSize = 10.sp,
                                            )
                                            IconButton(
                                                { vm.removePhoto(a.id) },
                                                Modifier.align(Alignment.TopEnd)
                                                    .size(40.dp)
                                                    .background(Ink.copy(alpha = .6f), CircleShape),
                                                enabled = !locked,
                                            ) {
                                                Glyph(
                                                    Icons.Outlined.Close,
                                                    "사진 ${index+1} 삭제",
                                                    tint = Color.White,
                                                )
                                            }
                                            Row(
                                                Modifier.align(Alignment.BottomEnd)
                                                    .background(
                                                        Color.White.copy(alpha = .9f),
                                                        RoundedCornerShape(6.dp),
                                                    )
                                            ) {
                                                IconButton(
                                                    { vm.movePhoto(index, -1) },
                                                    Modifier.size(36.dp),
                                                    enabled = index > 0 && !locked,
                                                ) {
                                                    Glyph(
                                                        Icons.Outlined.ChevronLeft,
                                                        "사진 ${index+1} 왼쪽 이동",
                                                    )
                                                }
                                                IconButton(
                                                    { vm.movePhoto(index, 1) },
                                                    Modifier.size(36.dp),
                                                    enabled = index < e.images.lastIndex && !locked,
                                                ) {
                                                    Glyph(
                                                        Icons.Outlined.ChevronRight,
                                                        "사진 ${index+1} 오른쪽 이동",
                                                    )
                                                }
                                            }
                                        }
                                        Text(
                                            a.phase,
                                            fontSize = 10.sp,
                                            color =
                                                if (a.error == null) Sub
                                                else MaterialTheme.colorScheme.error,
                                            modifier = Modifier.padding(top = 4.dp),
                                        )
                                        if (a.error != null) {
                                            Text(
                                                a.error,
                                                fontSize = 10.sp,
                                                color = MaterialTheme.colorScheme.error,
                                                maxLines = 3,
                                            )
                                            TextButton({ vm.retry(a.id) }, enabled = !locked) {
                                                Text("다시 시도", fontSize = 11.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        OutlinedButton(
                            {
                                picker.launch(
                                    PickVisualMediaRequest(
                                        ActivityResultContracts.PickVisualMedia.ImageOnly
                                    )
                                )
                            },
                            Modifier.padding(top = 10.dp).heightIn(min = 44.dp),
                            enabled =
                                !locked && w?.storage == true && e.images.size < (w.maxImages),
                            shape = RoundedCornerShape(11.dp),
                            border = BorderStroke(1.dp, Line),
                        ) {
                            Glyph(Icons.Outlined.Image, null)
                            Spacer(Modifier.width(6.dp))
                            Text("사진 선택", fontSize = 12.sp)
                        }
                        Text(
                            "여러 장 첨부 · 순서 변경 가능",
                            fontSize = 11.sp,
                            color = Light,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                        if (w?.storage == false)
                            Text(
                                "현재 사진 저장소를 사용할 수 없습니다. 글만 게시할 수 있어요.",
                                fontSize = 12.sp,
                                color = Sub,
                            )
                        if (e.pendingPayload != null && !e.submitting)
                            Text(
                                "서버 저장 여부를 확인하려면 재시도를 눌러주세요. 전송 내용은 안전하게 보관됩니다.",
                                fontSize = 12.sp,
                                color = Sub,
                                modifier = Modifier.padding(top = 10.dp),
                            )
                        if (e.conflict) {
                            Text(
                                "다른 기기에서 바뀐 기록입니다. 현재 입력을 복사하거나 최신 기록을 불러오세요.",
                                fontSize = 12.sp,
                                color = Sub,
                            )
                            Row {
                                val clipboard =
                                    androidx.compose.ui.platform.LocalClipboardManager.current
                                TextButton({
                                    clipboard.setText(
                                        androidx.compose.ui.text.AnnotatedString(e.text)
                                    )
                                }) {
                                    Text("입력 복사")
                                }
                                TextButton({ reload = true }) { Text("최신 기록 불러오기") }
                            }
                        }
                    }
                }
            }
            HorizontalDivider(color = Line.copy(alpha = .6f))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("내 LOG 기록으로 저장", fontSize = 11.sp, color = Light)
                Text("사진 ${e.images.size}장 / ${w?.maxImages?:20}", fontSize = 11.sp, color = Light)
            }
        }
        if (confirm)
            AlertDialog(
                onDismissRequest = { confirm = false },
                title = { Text("작성 중인 기록을 닫을까요?") },
                text = { Text("초안을 기기에 보관하거나 삭제할 수 있습니다.") },
                confirmButton = {
                    TextButton({
                        confirm = false
                        vm.closeEditor()
                    }) {
                        Text("초안 보관")
                    }
                },
                dismissButton = {
                    Row {
                        TextButton({ confirm = false }) { Text("계속 작성") }
                        TextButton({
                            confirm = false
                            vm.closeEditor(true)
                        }) {
                            Text("초안 삭제")
                        }
                    }
                },
            )
        if (reload)
            AlertDialog(
                onDismissRequest = { reload = false },
                title = { Text("최신 기록을 불러올까요?") },
                text = { Text("현재 수정 내용을 지우고 서버에 저장된 기록을 불러옵니다. 필요한 내용은 먼저 복사해주세요.") },
                confirmButton = {
                    TextButton({
                        reload = false
                        vm.reloadEditor()
                    }) {
                        Text("불러오기")
                    }
                },
                dismissButton = { TextButton({ reload = false }) { Text("취소") } },
            )
    }
}

@Composable
fun MediaViewer(
    photos: List<String>,
    initial: Int,
    profile: String,
    repo: LogRepository,
    close: () -> Unit,
) {
    val pager =
        rememberPagerState(
            initialPage = initial.coerceIn(0, photos.lastIndex),
            pageCount = { photos.size },
        )
    val scope = rememberCoroutineScope()
    Dialog(
        close,
        properties =
            DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        BackHandler(onBack = close)
        Column(
            Modifier.fillMaxSize()
                .background(Color.Black)
                .safeDrawingPadding()
                .testTag("media-viewer")
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(close) { Glyph(Icons.Outlined.Close, "사진 닫기", tint = Color.White) }
                Text(
                    "${pager.currentPage+1} / ${photos.size}",
                    color = Color.White,
                    modifier = Modifier.weight(1f),
                    fontSize = 13.sp,
                )
            }
            HorizontalPager(pager, Modifier.weight(1f), key = { photos[it] }) { i ->
                PrivatePhoto(
                    profile,
                    photos[i],
                    repo,
                    Modifier.fillMaxSize(),
                    ContentScale.Fit,
                    "전체 크기 사진 ${i+1}",
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(
                    { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) } },
                    enabled = pager.currentPage > 0,
                ) {
                    Glyph(Icons.Outlined.ChevronLeft, "이전 사진", tint = Color.White)
                }
                IconButton(
                    { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                    enabled = pager.currentPage < photos.lastIndex,
                ) {
                    Glyph(Icons.Outlined.ChevronRight, "다음 사진", tint = Color.White)
                }
            }
        }
    }
}
