package com.morpheus45.gsystem.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.util.DateUtil
import java.time.LocalDate

/** Bandeau affichant la période en cours et son nombre d'éléments. */
@Composable
fun PeriodHeader(start: LocalDate, end: LocalDate, count: Int, totalLabel: String? = null) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.DateRange, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer)
                Spacer(Modifier.height(0.dp).padding(start = 8.dp))
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text("Période en cours", fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
                    Text("${DateUtil.fr(start)} → ${DateUtil.fr(end)}",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("$count", fontSize = 22.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text(totalLabel ?: "entrée(s)", fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
            }
        }
    }
}

/**
 * Bandeau de période MODIFIABLE (Du / Au). Le tech ajuste les bornes car le
 * jour de coupure du cycle varie de 2-3 jours selon le mois. La sélection est
 * partagée entre les écrans (Temps, Frais) via les callbacks.
 *
 * `onChange` n'est appelé que sur une saisie valide (dates parseables, début ≤ fin).
 * `onResetCycle` réinitialise au cycle calculé automatiquement.
 */
@Composable
fun EditablePeriodHeader(
    start: LocalDate,
    end: LocalDate,
    count: Int,
    totalLabel: String? = null,
    onChange: (LocalDate, LocalDate) -> Unit,
    onResetCycle: (() -> Unit)? = null
) {
    var startText by remember(start) { mutableStateOf(start.toString()) }
    var endText by remember(end) { mutableStateOf(end.toString()) }

    fun tryPropagate(s: String, e: String) {
        val ps = runCatching { DateUtil.parseIso(s.trim()) }.getOrNull()
        val pe = runCatching { DateUtil.parseIso(e.trim()) }.getOrNull()
        if (ps != null && pe != null && ps <= pe) onChange(ps, pe)
    }

    val parsedStart = runCatching { DateUtil.parseIso(startText.trim()) }.getOrNull()
    val parsedEnd = runCatching { DateUtil.parseIso(endText.trim()) }.getOrNull()
    val invalid = parsedStart == null || parsedEnd == null || parsedStart > parsedEnd

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp).fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.DateRange, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text("  Période (modifiable)", fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("$count", fontSize = 20.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text(totalLabel ?: "entrée(s)", fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = startText,
                    onValueChange = { startText = it.trim(); tryPropagate(it, endText) },
                    label = { Text("Du (AAAA-MM-JJ)") },
                    singleLine = true,
                    isError = parsedStart == null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = endText,
                    onValueChange = { endText = it.trim(); tryPropagate(startText, it) },
                    label = { Text("Au (AAAA-MM-JJ)") },
                    singleLine = true,
                    isError = parsedEnd == null || invalid,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f)
                )
            }
            if (invalid) {
                Text("Dates invalides (format AAAA-MM-JJ, début ≤ fin)",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp))
            }
            if (onResetCycle != null) {
                Row(horizontalArrangement = Arrangement.End,
                    modifier = Modifier.fillMaxWidth()) {
                    TextButton(onClick = onResetCycle) {
                        Text("↺ Cycle par défaut", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
