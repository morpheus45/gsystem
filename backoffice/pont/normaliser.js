// Pont d'import : donnees.json de l'APK -> lignes d'UNE société, donnée en paramètre.
// Le JSON Kotlin (CycleSync.kt) omet les champs égaux à leur valeur par défaut :
// on les remet ici. nomClient et l'ancien champ heures ne sont jamais copiés.

// Clé JSON Kotlin -> [colonne, valeur par défaut]. null = clé connue mais non importée.
const CHAMPS = {
  temps: {
    id: ['id_source', ''], date: ['date', ''], departement: ['departement', ''],
    typeMission: ['type_mission', ''], ville: ['ville', ''], numeroClient: ['numero_intervention', ''],
    observationType: ['observation_type', ''], observations: ['observations', ''],
    motifRetard: ['motif_retard', ''], retardTexte: ['retard_texte', ''], slotMidi: ['slot_midi', ''],
    heureDebut: ['heure_debut', ''], heureFin: ['heure_fin', ''], nomClient: null, heures: null,
  },
  frais: {
    id: ['id_source', ''], date: ['date', ''], timestamp: ['horodatage', 0], fileName: ['fichier', ''],
    categorie: ['categorie', ''], montantEur: ['montant_eur', 0], observations: ['observations', ''],
    sansTva: ['sans_tva', false],
  },
  compteur: {
    id: ['id_source', ''], date: ['date', ''], timestamp: ['horodatage', 0], fileName: ['fichier', ''],
    kilometres: ['kilometres', 0], observations: ['observations', ''],
  },
};
const BLOCS_IGNORES = ['gesteCo']; // primes : pas encore importées

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

  const photos = Object.entries(donnees.photos ?? {}).map(([nomLocal, nomDrive]) => (
    { ...base, cle_source: `${technicienId}/photo/${nomLocal}`, nom_local: nomLocal, nom_drive: nomDrive }));

  return { temps: lignes('temps'), frais: lignes('frais'), compteur: lignes('compteur'), photos,
    clesInconnues: [...inconnues] };
}
