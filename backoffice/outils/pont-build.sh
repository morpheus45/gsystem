#!/bin/sh
# © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
# Construit l'Apps Script SÉPARÉ du pont APK -> back-office (dossier Drive « Backoffice »).
# Usage : SUPABASE_URL=... SOCIETE_ID=<uuid de la société choisie> sh outils/pont-build.sh
# La clé serveur n'est JAMAIS ici : elle se met dans les Propriétés du script.
set -e
cd "$(dirname "$0")/.."
[ -n "$SUPABASE_URL" ] && [ -n "$SOCIETE_ID" ] || { echo "SUPABASE_URL et SOCIETE_ID requis" >&2; exit 1; }
echo "$SOCIETE_ID" | grep -Eq '^[0-9a-f-]{36}$' || { echo "SOCIETE_ID invalide" >&2; exit 1; }
D=pont-apps-script
mkdir -p "$D"
cat > "$D/appsscript.json" <<'J'
{
  "timeZone": "Europe/Paris",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/spreadsheets"
  ],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
J
{
  printf '// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'\''auteur (CPI L.122-4, L.122-6, L.335-2).\n// FICHIER CONSTRUIT par outils/pont-build.sh : modifier pont/*.js, pas ce fichier.\n'
  printf 'const SUPABASE_URL = "%s";\nconst SOCIETE_ID = "%s";\n\n' "$SUPABASE_URL" "$SOCIETE_ID"
  # installer() en tête : c'est la fonction proposée par défaut dans l'éditeur.
  sed -n '/^\/\/ À lancer UNE fois/,$p' pont/apps-script.js
  printf '\n'
  sed '/^\/\/ À lancer UNE fois/,$d' pont/apps-script.js
  printf '\n'
  sed 's/^export //' pont/chat.js
  printf '\n'
  sed 's/^export //' pont/normaliser.js
  printf '\n'
  sed 's/^export //' core/plaque.js
} > "$D/Code.js"
node --check "$D/Code.js" 2>/dev/null || node -e "new Function(require('fs').readFileSync('$D/Code.js','utf8'))"
echo "Construit dans $D/"
