// ZIP sans compression (photos et PDF sont déjà compressés), vérifié par le lecteur ZIP de Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipStocke } from '../core/zip.js';

test('archive lisible, noms accentués et contenus intacts', () => {
  const zip = zipStocke([
    { nom: 'Tech Été/2026-11/photo.jpg', donnees: new Uint8Array([0xff, 0xd8, 0x00, 0x42]) },
    { nom: 'récap-frais.csv', donnees: new TextEncoder().encode('a;b\n1;2\n') },
  ], new Date(2026, 10, 18, 10, 30));
  const f = join(mkdtempSync(join(tmpdir(), 'zip-')), 'a.zip');
  writeFileSync(f, zip);
  const sortie = execFileSync('python3', ['-I', '-c', `import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(json.dumps([[i.filename, list(z.read(i.filename)), list(i.date_time)] for i in z.infolist()]))`, f]).toString();
  assert.deepEqual(JSON.parse(sortie), [
    ['Tech Été/2026-11/photo.jpg', [255, 216, 0, 66], [2026, 11, 18, 10, 30, 0]],
    ['récap-frais.csv', [...new TextEncoder().encode('a;b\n1;2\n')], [2026, 11, 18, 10, 30, 0]],
  ]);
});
