/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.data

/**
 * Pré-remplissage des documents depuis l'ordre de mission du client « sur
 * place » (arrivée pointée sur sa tuile de tournée, pas encore clôturée).
 *
 * Brouillon de départ, sans jamais mélanger deux clients :
 *  - déjà pré-rempli pour CETTE mission → rendu tel quel (saisies gardées) ;
 *  - vierge, ou commencé pour une AUTRE mission → repart de la mission : un PV
 *    ou un bulletin se signe sur place, et les signatures ne sont pas gardées ;
 *  - saisie manuelle sans mission → seuls ses champs vides sont complétés.
 */
object Preremplissage {

    /** Client « sur place » : arrivée pointée, mission non clôturée (la plus récente). */
    fun surPlace(missions: List<Mission>): Mission? =
        missions.filter { !it.done && it.arrivalMs > 0L }.maxByOrNull { it.arrivalMs }

    /** « 12 RUE DE LA PAIX, 34140 MEZE » : une ligne, pour les champs d'adresse uniques. */
    fun adresseComplete(m: Mission): String =
        listOf(m.adresse, listOf(m.cp, m.ville).filter { it.isNotBlank() }.joinToString(" "))
            .filter { it.isNotBlank() }.joinToString(", ")

    fun pv(d: PvCameraDraft?, m: Mission?): PvCameraDraft? {
        if (m == null || (d != null && d.missionNum == m.num)) return d
        val manuel = d != null && d.missionNum.isBlank() &&
            listOf(d.convention, d.site, d.nomAbonne, d.adresse).any { it.isNotBlank() }
        val base = if (manuel) d!! else PvCameraDraft(nomTech = d?.nomTech.orEmpty())
        return base.copy(
            missionNum = m.num,
            convention = base.convention.ifBlank { m.conv },
            site = base.site.ifBlank { m.site },
            nomAbonne = base.nomAbonne.ifBlank { m.nom },
            adresse = base.adresse.ifBlank { adresseComplete(m) }
        )
    }

    fun bulletin(d: BulletinDraft?, m: Mission?): BulletinDraft? {
        if (m == null || (d != null && d.missionNum == m.num)) return d
        val manuel = d != null && d.missionNum.isBlank() &&
            listOf(d.numMission, d.lieuProtege, d.nom, d.adresse).any { it.isNotBlank() }
        val base = if (manuel) d!! else BulletinDraft(nomTech = d?.nomTech.orEmpty())
        return base.copy(
            missionNum = m.num,
            numMission = base.numMission.ifBlank { m.num },
            lieuProtege = base.lieuProtege.ifBlank { m.site },
            nom = base.nom.ifBlank { m.nom },
            adresse = base.adresse.ifBlank { m.adresse },
            codePostal = base.codePostal.ifBlank { m.cp },
            ville = base.ville.ifBlank { m.ville }
        )
    }
}
