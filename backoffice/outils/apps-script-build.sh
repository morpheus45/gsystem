#!/bin/sh
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
// Sert seulement la page : aucune donnée ici, tout passe par Supabase (RLS).
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Back-office G-Systems (test)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
J
# La page : un seul fichier HTML, avec tous les calculs testés inclus (outils/assembler.py).
python3 outils/assembler.py "$SUPABASE_URL" "$SUPABASE_CLE_PUBLIQUE" "$D" "Version de test — données fictives"
echo "Construit dans $D/"
