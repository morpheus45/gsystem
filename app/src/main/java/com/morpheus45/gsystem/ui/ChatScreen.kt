package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.chat.ChatApi
import com.morpheus45.gsystem.chat.ChatMessage
import com.morpheus45.gsystem.chat.ChatStore
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ChatBlue = Color(0xFF4FA3FF)
private val BureauBubble = Color(0xFF1A1D26)
private val BarBg = Color(0xFF0B0D13)
private val FieldBg = Color(0xFF14161D)
private val FieldLine = Color(0xFF2A2F3C)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    settings: AppSettings,
    settingsStore: SettingsStore,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val messages by ChatStore.messages.collectAsState()
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val tech = settings.nomUtilisateur

    // Poll périodique + marquage « lu » de tout ce qui arrive pendant qu'on regarde.
    LaunchedEffect(tech) {
        while (true) {
            ChatStore.refresh(tech)
            val latest = ChatStore.latestId()
            if (latest > settings.chatLastReadId) {
                settingsStore.update { it.copy(chatLastReadId = latest) }
                runCatching { ChatApi.markRead(tech, latest) }
            }
            delay(12_000)
        }
    }
    // Descend en bas à chaque nouveau message.
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            runCatching { listState.animateScrollToItem(messages.size - 1) }
        }
    }

    fun doSend() {
        val t = draft.trim()
        if (t.isBlank() || sending) return
        sending = true
        scope.launch {
            val ok = ChatApi.send(tech, t)
            if (ok) {
                draft = ""
                ChatStore.refresh(tech)
            }
            sending = false
        }
    }

    Scaffold(
        containerColor = Obsidian,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Support bureau", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Messagerie G-Systems", fontSize = 11.sp, color = Color(0xFFDCE7F5))
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour", tint = Color.White)
                    }
                },
                actions = {
                    if (messages.isNotEmpty()) {
                        IconButton(onClick = { confirmDelete = true }) {
                            Icon(Icons.Outlined.DeleteOutline, "Supprimer la conversation", tint = Color.White)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ChatBlue,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BarBg)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Écrire un message…", color = Color(0xFF8990A0)) },
                    singleLine = false,
                    maxLines = 4,
                    shape = RoundedCornerShape(20.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = FieldBg,
                        unfocusedContainerColor = FieldBg,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        cursorColor = ChatBlue,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    )
                )
                Box(
                    modifier = Modifier
                        .height(44.dp)
                        .widthIn(min = 44.dp)
                        .background(ChatBlue, RoundedCornerShape(22.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    if (sending) {
                        CircularProgressIndicator(
                            modifier = Modifier.height(20.dp).widthIn(20.dp, 20.dp),
                            color = Color(0xFF062036),
                            strokeWidth = 2.dp
                        )
                    } else {
                        IconButton(onClick = { doSend() }) {
                            Icon(Icons.AutoMirrored.Filled.Send, "Envoyer", tint = Color(0xFF062036))
                        }
                    }
                }
            }
        }
    ) { pad ->
        if (messages.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(pad).padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "Aucun message pour le moment.\nÉcris au bureau, il te répond ici.",
                    color = Color(0xFF8990A0),
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().padding(pad),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                items(messages, key = { it.id }) { m -> Bubble(m) }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Supprimer la conversation ?") },
            text = { Text("Tout le fil avec le bureau sera effacé des deux côtés. Action irréversible.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        if (ChatApi.deleteConversation(tech)) ChatStore.refresh(tech)
                    }
                }) { Text("Supprimer", color = Color(0xFFFF6B6B)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("Annuler") }
            }
        )
    }
}

@Composable
private fun Bubble(m: ChatMessage) {
    val mine = m.from == "tech"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 264.dp)
                .background(
                    if (mine) ChatBlue else BureauBubble,
                    RoundedCornerShape(
                        topStart = 14.dp, topEnd = 14.dp,
                        bottomStart = if (mine) 14.dp else 4.dp,
                        bottomEnd = if (mine) 4.dp else 14.dp
                    )
                )
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Text(
                text = m.text,
                color = if (mine) Color(0xFF062036) else Color(0xFFE6E8EE),
                fontSize = 13.sp
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = DateUtil.hm(m.ts),
                color = if (mine) Color(0xFF083B63) else Color(0xFF8990A0),
                fontSize = 9.5.sp,
                modifier = Modifier.align(Alignment.End)
            )
        }
    }
}
