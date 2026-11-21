// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Pont d'import : donnees.json de l'APK -> lignes d'UNE société, donnée en paramètre.
// Le JSON Kotlin (CycleSync.kt) omet les champs égaux à leur valeur par défaut :
// on les remet ici. nomClient et l'ancien champ heures ne sont jamais copiés.

// Clé JSON Kotlin -> [colonne, valeur par défaut]. null = clé connue mais non importée.
const CHAMPS = {
  temps: {
    id: null, date: ['date', ''], departement: ['departement', ''],
    typeMission: ['type_mission', ''], ville: ['ville', ''], numeroClient: ['numero_intervention', ''],
    observationType: ['observation_type', ''], observations: ['observations', ''],
    motifRetard: ['motif_retard', ''], retardTexte: ['retard_texte', ''], slotMidi: ['slot_midi', ''],
    heureDebut: ['heure_debut', ''], heureFin: ['heure_fin', ''], nomClient: null, heures: null,
  },
  frais: {
    id: null, date: ['date', ''], timestamp: ['horodatage', 0], fileName: ['fichier', ''],
    categorie: ['categorie', ''], montantEur: ['montant_eur', 0], observations: ['observations', ''],
    sansTva: ['sans_tva', false],
  },
  compteur: {
    id: null, date: ['date', ''], timestamp: ['horodatage', 0], fileName: ['fichier', ''],
    kilometres: ['kilometres', 0], observations: ['observations', ''],
  },
};
const BLOCS_IGNORES = ['gesteCo'];   // blocs traités à part (gestes ci-dessous)
const GESTE_CONNUS = ['id', 'date', 'siteNumber', 'epsDerogation', 'nomClient', 'observations', 'tempsId'];

// Bloc normalisé -> table de la base. compteur n'est pas importé seul : sa photo
// l'est (photos_apk) et le km sera relevé au bureau (releves_km).
export const TABLES_PONT = { temps: 'temps', frais: 'frais', photos: 'photos_apk', gestes: 'gestes_co' };

// Un nom de photo ou de dossier venu du téléphone devient un morceau de chemin dans le
// stockage : jamais « . », « .. », de barre ni de caractère de contrôle (S5, SECURITE.md).
export function nomDeFichierSur(nom) {
  return typeof nom === 'string' && nom.length > 0 && nom.length <= 200 && nom !== '.' && nom !== '..'
    && !/[\/\\\u0000-\u001f]/.test(nom);
}

export function normaliser(donnees, { societeId, technicienId } = {}) {
  if (!societeId) throw new Error('societeId obligatoire');
  if (!technicienId) throw new Error('technicienId obligatoire');
  if (!donnees || typeof donnees !== 'object') throw new Error('donnees.json vide ou invalide');
  const base = { societe_id: societeId, technicien_id: technicienId };
  const inconnues = new Set(Object.keys(donnees).filter((k) => k !== 'entries' && k !== 'photos'));
  const entries = donnees.entries ?? {};
  for (const k of Object.keys(entries)) {
    if (!(k in CHAMPS) && !BLOCS_IGNORES.includes(k)) inconnues.add(`entries.${k}`);
  }

  const lignes = (type) => (entries[type] ?? []).map((e) => {
    if (!e?.id) throw new Error(`entrée ${type} sans id : import refusé`);
    const l = { ...base, cle_source: `${technicienId}/${type}/${e.id}` };
    for (const [cle, def] of Object.entries(CHAMPS[type])) if (def) l[def[0]] = e[cle] ?? def[1];
    for (const cle of Object.keys(e)) if (!(cle in CHAMPS[type])) inconnues.add(`${type}.${cle}`);
    return l;
  });

  // GesteCo (primes) : équipements INSTALLÉS seulement (installedGsm... -> { gsm: n }) ;
  // les cadeaux client (offered*), le nom du client et les observations ne sont pas importés.
  const gestes = (entries.gesteCo ?? []).map((g) => {
    if (!g?.id) throw new Error('entrée gesteCo sans id : import refusé');
    const installes = {};
    for (const [cle, n] of Object.entries(g)) {
      const m = /^installed(.+)$/.exec(cle);
      if (m && n) installes[m[1][0].toLowerCase() + m[1].slice(1)] = n;
      else if (!/^(installed|offered)/.test(cle) && !GESTE_CONNUS.includes(cle)) inconnues.add(`gesteCo.${cle}`);
    }
    return { ...base, cle_source: `${technicienId}/gesteCo/${g.id}`, date: g.date ?? '', numero_site: g.siteNumber ?? '', installes };
  });

  const photos = Object.entries(donnees.photos ?? {}).map(([nomLocal, nomDrive]) => (
    { ...base, cle_source: `${technicienId}/photo/${nomLocal}`, nom_local: nomLocal, nom_drive: nomDrive }));

  return { temps: lignes('temps'), frais: lignes('frais'), compteur: lignes('compteur'), photos, gestes,
    clesInconnues: [...inconnues] };
}

// Véhicule du tech d'après l'APK : plaque des réglages (reglages.json) et photos
// du compteur nommées <PLAQUE>-<MM>-<AAAA>[-n].jpg (PhotoStorage.kt:74-80).
export function vehiculeDepuisApk(reglages, photos) {
  const plaque = String(reglages?.plaqueVoiture ?? '').trim().toUpperCase() || null;
  if (!plaque) return { plaque: null, photosCompteur: [] };
  const motif = /^(.+)-(\d{2})-(\d{4})(?:-\d+)?\.jpg$/;
  const premiers = new Map();   // periode -> { nom_drive, periode } : le premier importe gagne
  // Le nom sans suffixe (FS-687-VT-08-2026.jpg) passe avant ses doublons -2, -3… : tri par longueur puis par nom.
  for (const nom of Object.values(photos ?? {}).sort((x, y) => x.length - y.length || x.localeCompare(y))) {
    const m = motif.exec(nom);
    if (m && m[1].toUpperCase() === plaque) {
      const periode = `${m[3]}-${m[2]}`;
      const cle = `${plaque}|${periode}`;
      if (!premiers.has(cle)) premiers.set(cle, { nom_drive: nom, periode });
    }
  }
  return { plaque, photosCompteur: [...premiers.values()] };
}

// Affectation tech ↔ véhicule d'après l'APK. ouvertes = affectations en cours du tech.
// Déjà sur ce véhicule : rien. Sinon : fermer les autres la veille (jamais avant leur
// début) et ouvrir celle-ci, depuis la 1re donnée du tech si c'est sa première.
export function planAffectation(ouvertes, vehiculeId, aujourdhui, premiereDate) {
  if (ouvertes.some((a) => a.vehicule_id === vehiculeId)) return { fermer: [], ouvrir: null };
  const veille = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return {
    fermer: ouvertes.map((a) => ({ id: a.id, fin: a.debut > veille ? a.debut : veille })),
    ouvrir: { vehicule_id: vehiculeId, debut: ouvertes.length || !premiereDate ? aujourdhui : premiereDate },
  };
}
