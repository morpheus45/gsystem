#!/bin/sh
# © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
# Construit l'Apps Script SÉPARÉ de la passerelle des téléphones. Ne déploie rien.
# Usage : SUPABASE_URL=... sh outils/passerelle-build.sh
# Les secrets ne sont JAMAIS ici : Propriétés du script.
set -e
cd "$(dirname "$0")/.."
[ -n "$SUPABASE_URL" ] || { echo "SUPABASE_URL requis" >&2; exit 1; }
D=passerelle-apps-script
mkdir -p "$D"
cat > "$D/appsscript.json" <<'J'
{
  "timeZone": "Europe/Paris",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.send_mail"
  ],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
J
{
  head -1 passerelle/logique.js
  printf '// FICHIER CONSTRUIT par outils/passerelle-build.sh : modifier passerelle/*.js, pas ce fichier.\n'
  printf 'const SUPABASE_URL = "%s";\n\n' "$SUPABASE_URL"
  tail -n +2 passerelle/apps-script.js
  printf '\n'
  tail -n +2 passerelle/logique.js | sed 's/^export //'
} > "$D/Code.js"
node -e "new Function(require('fs').readFileSync('$D/Code.js','utf8'))"
echo "Construit dans $D/"
