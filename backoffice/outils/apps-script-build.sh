#!/bin/sh
# © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
# Construit la version « test en ligne » servie par un Apps Script SÉPARÉ
# (dossier Drive « Backoffice »), à partir de web/ qui reste la seule source.
# Usage : SUPABASE_URL=... SUPABASE_CLE_PUBLIQUE=sb_publishable_... sh outils/apps-script-build.sh
# Seule la clé PUBLIQUE est acceptée : la sécurité est dans la base (RLS).
set -e
cd "$(dirname "$0")/.."
case "$SUPABASE_CLE_PUBLIQUE" in sb_publishable_*) ;; *) echo "clé publique sb_publishable_ attendue" >&2; exit 1 ;; esac
[ -n "$SUPABASE_URL" ] || { echo "SUPABASE_URL manquant" >&2; exit 1; }
D=apps-script-test
mkdir -p "$D"
cat > "$D/appsscript.json" <<'J'
{
  "timeZone": "Europe/Paris",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
J
cat > "$D/Code.js" <<'J'
// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2).
// Sert seulement la page : aucune donnée ici, tout passe par Supabase (RLS).
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Back-office (test)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Identité d'un véhicule depuis sa plaque, à son entrée dans la flotte (page : google.script.run).
// Réservé aux comptes connectés (jeton vérifié auprès de Supabase), 50 consultations par jour au plus.
function ficheVehicule(texte, jeton) {
  var plaque = normaliserPlaque(texte);
  if (!plaque) return null;
  var u = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user',
    { headers: { apikey: SUPABASE_CLE_PUBLIQUE, Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true });
  if (u.getResponseCode() !== 200) throw new Error('connexion requise');
  var cache = CacheService.getScriptCache();
  var cle = 'fiches-' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd');
  var n = Number(cache.get(cle) || 0);
  if (n >= 50) return null;
  cache.put(cle, String(n + 1), 21600);
  var r = UrlFetchApp.fetch('https://immatriculation-auto.info/vehicle/' + plaque, { muteHttpExceptions: true });
  return r.getResponseCode() === 200 ? lireFicheImmat(r.getContentText()) : null;
}
J
printf "\nvar SUPABASE_URL = '%s', SUPABASE_CLE_PUBLIQUE = '%s';\n" "$SUPABASE_URL" "$SUPABASE_CLE_PUBLIQUE" >> "$D/Code.js"
sed 's/^export //' core/plaque.js >> "$D/Code.js"
# La page : un seul fichier HTML, avec tous les calculs testés inclus (outils/assembler.py).
python3 outils/assembler.py "$SUPABASE_URL" "$SUPABASE_CLE_PUBLIQUE" "$D" "Version de test — données réelles de l'APK"
echo "Construit dans $D/"
