/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.Mission
import com.morpheus45.gsystem.ui.theme.ArriveeAccent
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.Success
import com.morpheus45.gsystem.ui.theme.TempsStart
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import com.morpheus45.gsystem.util.DateUtil

/**
 * TOURNÉE DU JOUR : une tuile par ordre de mission importé (PDF), triée par
 * heure de RDV. Toucher une tuile pointe l'arrivée + appelle la techline ; la
 * tuile bascule alors en « Clôturer » qui ouvre la clôture pré-remplie. N'existe
 * que s'il y a des missions (sinon l'app est inchangée).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TourneeScreen(
    missions: List<Mission>,
    onTapMission: (Mission) -> Unit,
    onCloturer: (Mission) -> Unit,
    onCallClient: (Mission) -> Unit,
    onClearAll: () -> Unit,
    onBack: () -> Unit
) {
    val actives = missions.filter { !it.done }.sortedBy { it.heure }
    Scaffold(
        containerColor = Obsidian,
        topBar = {
            TopAppBar(
                title = { Text("TOURNÉE DU JOUR", fontWeight = FontWeight.Bold, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, "Retour", tint = Color.White)
                    }
                },
                actions = {
                    if (actives.isNotEmpty()) {
                        IconButton(onClick = onClearAll) {
                            Icon(Icons.Outlined.DeleteSweep, "Vider la tournée", tint = Color.White)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = TempsStart,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White
                )
            )
        }
    ) { pad ->
        if (actives.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(pad).padding(24.dp), contentAlignment = Alignment.Center) {
                Text(
                    "Aucune mission. Partage un PDF « ordre de mission » vers G-Systems.",
                    color = TextMid, fontSize = 14.sp
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(pad).padding(horizontal = 14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(vertical = 14.dp)
            ) {
                items(actives, key = { it.num }) { m ->
                    MissionTile(m, onTapMission, onCloturer, onCallClient)
                }
            }
        }
    }
}

@Composable
private fun MissionTile(
    m: Mission,
    onTapMission: (Mission) -> Unit,
    onCloturer: (Mission) -> Unit,
    onCallClient: (Mission) -> Unit
) {
    val arrived = m.arrivalMs > 0L
    val borderColor = if (arrived) Success else Color(0xFF2F3340)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF12141B), RoundedCornerShape(12.dp))
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .then(if (arrived) Modifier else Modifier.clickable { onTapMission(m) })
            .padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .background(ArriveeAccent.copy(alpha = 0.18f), RoundedCornerShape(20.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text(m.type.ifBlank { "?" }, color = ArriveeAccent, fontSize = 12.sp,
                    fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(8.dp))
            Text(m.heure, color = TextMid, fontSize = 13.sp)
            Spacer(Modifier.weight(1f))
            Text("N° ${m.num}", color = TextLow, fontSize = 11.sp)
        }
        Spacer(Modifier.height(6.dp))
        Text(m.nom.ifBlank { "—" }, color = TextHi, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        val lieu = listOf(m.adresse, "${m.ville}${if (m.dept.isNotBlank()) " (${m.dept})" else ""}")
            .filter { it.isNotBlank() }.joinToString(" · ")
        if (lieu.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(lieu, color = TextMid, fontSize = 13.sp)
        }
        if (m.tel.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onCallClient(m) }
            ) {
                Icon(Icons.Outlined.Call, "Appeler le client", tint = ArriveeAccent,
                    modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(m.tel, color = ArriveeAccent, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.height(8.dp))
        if (arrived) {
            Text("Arrivée pointée ${DateUtil.hm(m.arrivalMs)}", color = Success, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            GPrimaryButton(
                label = "CLÔTURER (pré-rempli)",
                accent = TempsStart,
                icon = Icons.Outlined.Assignment,
                onClick = { onCloturer(m) }
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Place, null, tint = TextLow, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(6.dp))
                Text("Toucher = pointer l'arrivée + appel techline", color = TextLow, fontSize = 12.sp)
            }
        }
    }
}
