package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.GesteCoClientGifts
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.data.GsmSeulEntry
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.ui.theme.ColorGsmSeul

/**
 * État + UI des sections optionnelles ajoutées à la clôture d'une INSTALLATION :
 *   - GESTE CO : tableau complet 12 types (Installé / GESTE CO) + dérogation EPS + prime
 *   - GSM seul : 3 toggles
 *
 * Réutilise ExtRow et MAX_GIFT_EUR (GesteCoScreen, même package). Les entrées
 * construites (buildGeste / buildGsm) alimentent RÉCAP + ENVOI MENSUEL et sont
 * envoyées via les mêmes générateurs (sendGesteCoEmail / sendGsmEmail) → contenu
 * strictement identique aux écrans GESTE CO / GSM SEUL historiques.
 */
internal class InstallExtrasState {
    // --- GESTE CO ---
    var gesteOn by mutableStateOf(false)
    var eps by mutableStateOf(false)
    var iGsm by mutableStateOf(""); var iCo by mutableStateOf(""); var iDmp by mutableStateOf("")
    var iSe by mutableStateOf(""); var iTc by mutableStateOf(""); var iSi by mutableStateOf("")
    var iCam by mutableStateOf(""); var iDacco by mutableStateOf(""); var iBa by mutableStateOf("")
    var iCl by mutableStateOf(""); var iDf by mutableStateOf(""); var iSondeIn by mutableStateOf("")
    var oGsm by mutableStateOf(""); var oCo by mutableStateOf(""); var oDmp by mutableStateOf("")
    var oSe by mutableStateOf(""); var oTc by mutableStateOf(""); var oSi by mutableStateOf("")
    var oCam by mutableStateOf(""); var oDacco by mutableStateOf(""); var oBa by mutableStateOf("")
    var oCl by mutableStateOf(""); var oDf by mutableStateOf(""); var oSondeIn by mutableStateOf("")

    // --- GSM seul ---
    var gsmOn by mutableStateOf(false)
    var pasMedias by mutableStateOf(true)
    var cables by mutableStateOf(false)
    var cpl by mutableStateOf(false)

    private fun n(s: String) = s.toIntOrNull() ?: 0
    private fun installedList() = listOf(iGsm, iCo, iDmp, iSe, iTc, iSi, iCam, iDacco, iBa, iCl, iDf, iSondeIn)
    private fun offeredList() = listOf(oGsm, oCo, oDmp, oSe, oTc, oSi, oCam, oDacco, oBa, oCl, oDf, oSondeIn)

    fun installedAll() = installedList().sumOf { n(it) }
    fun offeredAll() = offeredList().sumOf { n(it) }

    fun totalGift(g: GesteCoClientGifts): Double =
        n(oGsm) * g.gsm + n(oCo) * g.co + n(oDmp) * g.dmp + n(oSe) * g.se +
        n(oTc) * g.tc + n(oSi) * g.si + n(oCam) * g.cam + n(oDacco) * g.dacco +
        n(oBa) * g.ba + n(oCl) * g.cl + n(oDf) * g.df + n(oSondeIn) * g.sondeIn

    fun totalPrime(p: GesteCoPrices): Double =
        n(iGsm) * p.gsm + n(iCo) * p.co + n(iDmp) * p.dmp + n(iSe) * p.se +
        n(iTc) * p.tc + n(iSi) * p.si + n(iCam) * p.cam + n(iDacco) * p.dacco +
        n(iBa) * p.ba + n(iCl) * p.cl + n(iDf) * p.df + n(iSondeIn) * p.sondeIn

    private fun perTypeOk(): Boolean =
        n(oGsm) <= n(iGsm) && n(oCo) <= n(iCo) && n(oDmp) <= n(iDmp) && n(oSe) <= n(iSe) &&
        n(oTc) <= n(iTc) && n(oSi) <= n(iSi) && n(oCam) <= n(iCam) && n(oDacco) <= n(iDacco) &&
        n(oBa) <= n(iBa) && n(oCl) <= n(iCl) && n(oDf) <= n(iDf) && n(oSondeIn) <= n(iSondeIn)

    /** GESTE CO valide ? (rien à offrir = OK ; sinon respect des règles). */
    fun gesteValid(gifts: GesteCoClientGifts): Boolean {
        if (!gesteOn || installedAll() == 0) return true
        val halfOk = eps || offeredAll() <= installedAll() / 2
        val capOk = eps || totalGift(gifts) <= MAX_GIFT_EUR + 0.001
        return perTypeOk() && halfOk && capOk
    }

    /** Crée l'entrée GESTE CO si des extensions sont installées, sinon null. */
    fun buildGeste(date: String, site: String, nom: String, obs: String): GesteCoEntry? {
        if (!gesteOn || installedAll() == 0) return null
        return GesteCoEntry(
            id = EntriesRepository.newId(),
            date = date.trim(), siteNumber = site.trim(),
            installedGsm = n(iGsm), installedCo = n(iCo), installedDmp = n(iDmp), installedSe = n(iSe),
            installedTc = n(iTc), installedSi = n(iSi), installedCam = n(iCam),
            installedDacco = n(iDacco), installedBa = n(iBa),
            installedCl = n(iCl), installedDf = n(iDf), installedSondeIn = n(iSondeIn),
            offeredGsm = n(oGsm), offeredCo = n(oCo), offeredDmp = n(oDmp), offeredSe = n(oSe),
            offeredTc = n(oTc), offeredSi = n(oSi), offeredCam = n(oCam),
            offeredDacco = n(oDacco), offeredBa = n(oBa),
            offeredCl = n(oCl), offeredDf = n(oDf), offeredSondeIn = n(oSondeIn),
            epsDerogation = eps, nomClient = nom.trim(), observations = obs.trim()
        )
    }

    /** Crée l'entrée GSM seul si le toggle est actif, sinon null. */
    fun buildGsm(date: String, site: String, nom: String, obs: String): GsmSeulEntry? {
        if (!gsmOn) return null
        return GsmSeulEntry(
            id = EntriesRepository.newId(),
            date = date.trim(), siteNumber = site.trim(),
            nomClient = nom.trim(), observations = obs.trim(),
            pasMediasExploitables = pasMedias,
            cablesLaissesSurSite = cables,
            cplDejaPresent = cpl
        )
    }

    /** Au moins une section active → le N° de site devient obligatoire. */
    fun needsSite(): Boolean = (gesteOn && installedAll() > 0) || gsmOn
}

@Composable
internal fun rememberInstallExtrasState(): InstallExtrasState = remember { InstallExtrasState() }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InstallExtrasSection(state: InstallExtrasState, settings: AppSettings) {
    // ===== GESTE CO =====
    Card(
        colors = CardDefaults.cardColors(containerColor = ColorGesteCo.copy(alpha = 0.10f)),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()) {
                Text("Extensions installées (GESTE CO)",
                    fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = ColorGesteCo,
                    modifier = Modifier.weight(1f))
                Switch(checked = state.gesteOn, onCheckedChange = { state.gesteOn = it })
            }
            if (state.gesteOn) {
                Spacer(Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Type", modifier = Modifier.weight(0.65f),
                        fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    Text("Installé", modifier = Modifier.weight(1f),
                        fontWeight = FontWeight.SemiBold, fontSize = 12.sp, textAlign = TextAlign.Center)
                    Text("GESTE CO", modifier = Modifier.weight(1f),
                        fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                        textAlign = TextAlign.Center, color = ColorGesteCo)
                }
                ExtRow("GSM",   settings.prices.gsm,   state.iGsm,   { state.iGsm = it },   state.oGsm,   { state.oGsm = it })
                ExtRow("CO",    settings.prices.co,    state.iCo,    { state.iCo = it },    state.oCo,    { state.oCo = it })
                ExtRow("DMP",   settings.prices.dmp,   state.iDmp,   { state.iDmp = it },   state.oDmp,   { state.oDmp = it })
                ExtRow("SE",    settings.prices.se,    state.iSe,    { state.iSe = it },    state.oSe,    { state.oSe = it })
                ExtRow("TC",    settings.prices.tc,    state.iTc,    { state.iTc = it },    state.oTc,    { state.oTc = it })
                ExtRow("SI",    settings.prices.si,    state.iSi,    { state.iSi = it },    state.oSi,    { state.oSi = it })
                ExtRow("CAM",   settings.prices.cam,   state.iCam,   { state.iCam = it },   state.oCam,   { state.oCam = it })
                ExtRow("DACCO", settings.prices.dacco, state.iDacco, { state.iDacco = it }, state.oDacco, { state.oDacco = it })
                ExtRow("BA",    settings.prices.ba,    state.iBa,    { state.iBa = it },    state.oBa,    { state.oBa = it })
                ExtRow("CL",       settings.prices.cl,      state.iCl,      { state.iCl = it },      state.oCl,      { state.oCl = it })
                ExtRow("DF",       settings.prices.df,      state.iDf,      { state.iDf = it },      state.oDf,      { state.oDf = it })
                ExtRow("SONDE IN", settings.prices.sondeIn, state.iSondeIn, { state.iSondeIn = it }, state.oSondeIn, { state.oSondeIn = it })

                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Dérogation EPS", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Text("Désactive les règles 4,50 € et moitié max", fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                    Switch(checked = state.eps, onCheckedChange = { state.eps = it })
                }
                Spacer(Modifier.height(8.dp))
                val valid = state.gesteValid(settings.clientGifts)
                Card(colors = CardDefaults.cardColors(
                    containerColor = if (valid) ColorGesteCo.copy(alpha = 0.10f) else Color(0xFFFFEBEE))) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        if (!valid) {
                            Text("✗ Règle non respectée (cadeau > installé, > moitié, ou > 4,50 €)",
                                color = Color(0xFFC62828), fontSize = 11.sp)
                        } else if (state.installedAll() > 0) {
                            Text("✓ Règles OK", fontSize = 11.sp, color = ColorGesteCo,
                                fontWeight = FontWeight.SemiBold)
                        }
                        Text("Installé : ${state.installedAll()}  ·  Offert : ${state.offeredAll()}  ·  GESTE CO : %.2f €".format(state.totalGift(settings.clientGifts)),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
                        Text("Ta prime : %.2f €".format(state.totalPrime(settings.prices)),
                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(10.dp))

    // ===== GSM seul =====
    Card(
        colors = CardDefaults.cardColors(containerColor = ColorGsmSeul.copy(alpha = 0.10f)),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()) {
                Text("GSM seul sur ce site",
                    fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = ColorGsmSeul,
                    modifier = Modifier.weight(1f))
                Switch(checked = state.gsmOn, onCheckedChange = { state.gsmOn = it })
            }
            if (state.gsmOn) {
                Spacer(Modifier.height(4.dp))
                ToggleLine("Pas de MEDIAS exploitables", state.pasMedias) { state.pasMedias = it }
                ToggleLine("Câbles laissés sur site", state.cables) { state.cables = it }
                ToggleLine("CPL déjà présent", state.cpl) { state.cpl = it }
            }
        }
    }
}

@Composable
private fun ToggleLine(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
