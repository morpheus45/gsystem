#!/bin/sh
# Lance l'écran du back-office sur http://127.0.0.1:5180 (ce poste seulement).
# Écrit web/config.js avec l'adresse et la clé PUBLIQUE de Supabase local
# (jamais la clé secrète). Supabase local doit déjà tourner.
set -e
cd "$(dirname "$0")/.."
eval "$(npx -y supabase@2.122.1 status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
[ -n "$API_URL" ] && [ -n "$PUBLISHABLE_KEY" ] || { echo "Supabase local n'est pas démarré." >&2; exit 1; }
printf 'export const SUPABASE_URL = "%s";\nexport const SUPABASE_CLE_PUBLIQUE = "%s";\n' "$API_URL" "$PUBLISHABLE_KEY" > web/config.js
# Sert backoffice/ entier : la page réutilise core/ (règles testées).
echo "Back-office : http://127.0.0.1:5180/web/"
exec python3 -m http.server 5180 --bind 127.0.0.1 --directory .
