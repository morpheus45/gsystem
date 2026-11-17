#!/usr/bin/env python3
"""Assemble la page du back-office en UN fichier HTML (Apps Script ne sert qu'un fichier).

Suit les imports relatifs de web/app.js (core/*.js, docs/app/*.js...) et inclut chaque
module une seule fois, dépendances d'abord, sans les « export ». Les imports externes
(https://...) restent en tête. La configuration (URL + clé PUBLIQUE) remplace config.js.

Usage : assembler.py <url> <cle_publique> <dossier_sortie> <bandeau>
"""
import os
import re
import subprocess
import sys

IMPORT = re.compile(r"^import \{[^}]*\} from '([^']+)';\n", re.M)
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # backoffice/


def assembler(entree):
    vus, morceaux, externes = set(), [], []

    def inclure(chemin):
        chemin = os.path.normpath(chemin)
        if chemin in vus:
            return
        vus.add(chemin)
        code = open(chemin, encoding='utf-8').read()
        for m in IMPORT.finditer(code):
            cible = m.group(1)
            if cible.startswith('https://'):
                if m.group(0) not in externes:
                    externes.append(m.group(0))
            elif not cible.endswith('config.js'):
                inclure(os.path.join(os.path.dirname(chemin), cible))
        code = IMPORT.sub('', code)
        morceaux.append(f'// ---- {os.path.relpath(chemin, RACINE)} ----\n' + re.sub(r'^export ', '', code, flags=re.M))

    inclure(entree)
    return ''.join(externes), '\n'.join(morceaux)


def main():
    url, cle, sortie, bandeau = sys.argv[1:5]
    if not cle.startswith('sb_publishable_'):
        sys.exit('clé publique sb_publishable_ attendue')
    externes, code = assembler(os.path.join(RACINE, 'web', 'app.js'))
    js = externes + f'const SUPABASE_URL = "{url}";\nconst SUPABASE_CLE_PUBLIQUE = "{cle}";\n\n' + code
    os.makedirs(sortie, exist_ok=True)
    # Contrôle : le module assemblé doit se lire sans erreur (noms en double, syntaxe).
    essai = os.path.join(sortie, 'controle.mjs')
    open(essai, 'w', encoding='utf-8').write(js)
    subprocess.run(['node', '--check', essai], check=True)
    os.remove(essai)
    html = open(os.path.join(RACINE, 'web', 'index.html'), encoding='utf-8').read()
    balise = '<script type="module" src="app.js"></script>'
    assert balise in html, 'balise script introuvable'
    html = html.replace(balise, '<script type="module">\n' + js + '\n</script>')
    html = html.replace('Base locale de développement — données fictives', bandeau)
    open(os.path.join(sortie, 'index.html'), 'w', encoding='utf-8').write(html)


if __name__ == '__main__':
    main()
