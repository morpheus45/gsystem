#!/bin/sh
# © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
# Version d'ESSAI de la passerelle : même logique, mais un dossier à part et vide, ni Supabase,
# ni mail, ni ancien script. Le jeton d'essai est tiré au hasard à chaque construction (dossier non versionné).
set -e
cd "$(dirname "$0")/.."
D=passerelle-essai-apps-script
mkdir -p "$D"
JETON=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
umask 077
printf '%s' "$JETON" > "$D/.jeton"
printf '**\n!appsscript.json\n!Code.js\n' > "$D/.claspignore"
cat > "$D/appsscript.json" <<'J'
{
  "timeZone": "Europe/Paris",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": ["https://www.googleapis.com/auth/drive"],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
J
{
  head -1 passerelle/logique.js
  printf '// ESSAI construit par outils/passerelle-essai-build.sh. À SUPPRIMER après les essais.\n'
  printf 'const JETON_ESSAI = "%s";\n\n' "$JETON"
  cat <<'J'
// À lancer UNE fois dans l'éditeur : autorise le script et crée le dossier d'essai vide.
function preparerEssai() {
  const racine = DriveApp.getRootFolder();
  const it = racine.getFoldersByName(RACINE);
  const r = it.hasNext() ? it.next() : racine.createFolder(RACINE);
  const t = r.getFoldersByName('TECH-ESSAI');
  if (!t.hasNext()) r.createFolder('TECH-ESSAI');
  console.log('Dossier d\'essai prêt : ' + RACINE);
}

J
  # Remplace l'environnement réel : aucune propriété secrète, aucun appel réseau, aucun mail.
  python3 - <<'PY'
s = open('passerelle/apps-script.js').read()
s = s[s.index("const RACINE"):]
assert s.count("'Sauvegardes G-Systems'") == 1
s = s.replace("'Sauvegardes G-Systems'", "'ESSAI passerelle G-Systems'")
def sans(debut, fin):
    global s
    i = s.index(debut); j = s.index(fin, i); s = s[:i] + s[j:]
sans("function propriete_(", "function environnement_(")
sans("    mail: (a", "    base: {")
sans("      verifier:", "    },\n    relais")
s = s.replace("    base: {\n", "    mail: () => {},\n    base: {\n      verifier: (j) => (j === JETON_ESSAI ? { dossier: 'TECH-ESSAI' } : null),\n      demanderCode: () => null,\n      connecter: () => null,\n", 1)
sans("    relais: (p) => {", "    // Le dossier du technicien doit")
s = s.replace("    // Le dossier du technicien doit", "    relais: () => ({ ok: true, messages: [] }),\n    // Le dossier du technicien doit", 1)
sans("function rpc_(", "function liste_(")
for mot in ('UrlFetchApp', 'MailApp', 'PropertiesService', 'Sauvegardes', 'SUPABASE'):
    assert mot not in s, mot
print(s)
PY
  tail -n +2 passerelle/logique.js | sed 's/^export //'
} > "$D/Code.js"
node -e "new Function(require('fs').readFileSync('$D/Code.js','utf8'))"
echo "Construit dans $D/ (essai)"
