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
# La page : le script module est inclus dans le HTML, la configuration en dur.
python3 - "$SUPABASE_URL" "$SUPABASE_CLE_PUBLIQUE" <<'P'
import sys
url, cle = sys.argv[1], sys.argv[2]
js = open('web/app.js').read().replace(
    "import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';",
    f'const SUPABASE_URL = "{url}";\nconst SUPABASE_CLE_PUBLIQUE = "{cle}";')
# core/vehicules.js est inclus tel quel (sans les « export ») à la place de son import.
import re
imp = re.search(r"^import \{[^}]*\} from '\.\./core/vehicules\.js';$", js, re.M)
if imp:
    core = re.sub(r'^export ', '', open('core/vehicules.js').read(), flags=re.M)
    js = js.replace(imp.group(0), core)
assert 'config.js' not in js and '../core/' not in js
html = open('web/index.html').read()
balise = '<script type="module" src="app.js"></script>'
assert balise in html, 'balise script introuvable'
html = html.replace(balise, '<script type="module">\n' + js + '\n</script>')
html = html.replace('Base locale de développement — données fictives', 'Version de test — données fictives')
open('apps-script-test/index.html', 'w').write(html)
P
echo "Construit dans $D/"
