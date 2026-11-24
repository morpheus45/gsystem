// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Jeton par téléphone : changement de téléphone, perte, essais abusifs, cloisonnement. Rien ne s'efface.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const H = '10000000-0000-0000-0000-0000000000f1', A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const UA = u('a1'), UG = u('a2'), UC = u('a3'), UB = u('b1'), UH = u('d1'), T1 = u('a9'), T2 = u('a8'), TB = u('b9');
let db;
const service = async (q, p) => { await db.exec('reset role; set role service_role'); try { return (await db.query(q, p)).rows; } finally { await db.exec('reset role'); } };
const demander = (m) => service('select * from telephone_demander_code($1)', [m]);
const connecter = async (m, c, app, ok = true) => (await service('select * from telephone_connecter($1, $2, $3, $4)', [m, c, app, ok]))[0];
const verifier = (j, envoi = false) => service('select * from telephone_verifier($1, $2)', [j, envoi]);
const M1 = 'un@exemple.test';

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id) values ('${UA}'), ('${UG}'), ('${UC}'), ('${UB}'), ('${UH}');
    insert into holdings (id, nom) values ('${H}', 'H');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', null);
    insert into membres values ('${A}', '${UA}', 'admin'), ('${A}', '${UG}', 'gestion'), ('${A}', '${UC}', 'comptable'), ('${B}', '${UB}', 'admin');
    insert into membres_holding values ('${H}', '${UH}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T1}', '${A}', 'Un', 'UN'), ('${T2}', '${A}', 'Deux', 'DEUX'), ('${TB}', '${B}', 'B', 'BB');`);
  await db.comme(UA, () => db.query('select telephone_regler_mail($1, $2)', [T1, ' Un@Exemple.test ']));
  await db.comme(UH, () => db.query('select telephone_regler_mail($1, $2)', [T2, 'deux@exemple.test']));
});
beforeEach(() => db.exec(`delete from private.telephone_codes; delete from telephones; update techniciens set actif = true, archive_le = null`));

const brancher = async (m, app) => { const [d] = await demander(m); return (await connecter(m, d.code, app)).jeton; };
const vieillir = () => db.exec(`update private.telephone_codes set cree_le = cree_le - interval '2 minutes'`);

test('le technicien se connecte, et n\'a droit qu\'à son dossier', async () => {
  const [d] = await demander('UN@exemple.TEST');
  assert.match(d.code, /^\d{6}$/);
  assert.equal(d.mail, M1);
  assert.equal((await connecter(M1, d.code, 'Ancien', false)).etat, 'pret');
  const r = await connecter(M1, `${d.code.slice(0, 3)} ${d.code.slice(3)}`, 'Ancien');
  assert.equal(r.etat, 'ok');
  assert.match(r.jeton, /^[0-9a-f]{64}$/);
  assert.deepEqual(await verifier(r.jeton), [{ societe_id: A, technicien_id: T1, dossier: 'UN' }]);
  assert.deepEqual(await verifier('faux'), []);
  assert.deepEqual(await verifier(null), []);
});

test('nouveau téléphone : prévient, puis coupe l\'ancien ; ne touche pas aux autres techniciens', async () => {
  const ancien = await brancher(M1, 'Ancien'), autre = await brancher('deux@exemple.test', 'Autre');
  await verifier(ancien, true);
  await vieillir();
  const [d] = await demander(M1);
  const avis = await connecter(M1, d.code, 'Nouveau', false);
  assert.equal(avis.etat, 'remplace');
  assert.equal(avis.ancien, 'Ancien');
  assert.ok(avis.ancien_envoi);
  assert.equal((await verifier(ancien)).length, 1);   // rien n'est coupé avant la confirmation
  const r = await connecter(M1, d.code, 'Nouveau');
  assert.equal((await verifier(ancien)).length, 0);
  assert.equal((await verifier(r.jeton)).length, 1);
  assert.equal((await verifier(autre)).length, 1);
  const l = (await db.query(`select appareil, coupe_motif from telephones where technicien_id = '${T1}' order by cree_le`)).rows;
  assert.deepEqual(l, [{ appareil: 'Ancien', coupe_motif: 'remplace' }, { appareil: 'Nouveau', coupe_motif: null }]);
});

test('un code ne sert qu\'une fois, expire, et un nouveau code annule le précédent', async () => {
  const [d] = await demander(M1);
  assert.equal((await connecter(M1, d.code, 'x')).etat, 'ok');
  assert.equal((await connecter(M1, d.code, 'y')).etat, 'refus');
  await vieillir();
  const [d2] = await demander(M1);
  await vieillir();
  const [d3] = await demander(M1);
  if (d2.code !== d3.code) assert.equal((await connecter(M1, d2.code, 'y')).etat, 'refus');
  await db.exec(`update private.telephone_codes set expire_le = now() - interval '1 second'`);
  assert.equal((await connecter(M1, d3.code, 'y')).etat, 'refus');
});

test('5 codes faux : le bon ne marche plus ; l\'ancien téléphone reste connecté', async () => {
  const j = await brancher(M1, 'Ancien');
  await vieillir();
  const [d] = await demander(M1), faux = d.code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await connecter(M1, faux, 'Voleur')).etat, 'refus');
  assert.equal((await connecter(M1, d.code, 'Voleur')).etat, 'refus');
  assert.equal((await verifier(j)).length, 1);
});

test('demandes limitées : 1 par minute, 3 par heure, et après 10 essais faux', async () => {
  assert.equal((await demander(M1)).length, 1);
  assert.equal((await demander(M1)).length, 0);
  await vieillir(); assert.equal((await demander(M1)).length, 1);
  await vieillir(); assert.equal((await demander(M1)).length, 1);
  await vieillir(); assert.equal((await demander(M1)).length, 0);
  await db.exec(`delete from private.telephone_codes`);
  for (let k = 0; k < 2; k++) { await demander(M1); for (let i = 0; i < 5; i++) await connecter(M1, 'x', 'x'); await vieillir(); }
  assert.equal((await demander(M1)).length, 0);
});

test('mail inconnu ou technicien parti : même silence, accès coupé', async () => {
  assert.equal((await demander('inconnu@exemple.test')).length, 0);
  assert.equal((await connecter('inconnu@exemple.test', '123456', 'x')).etat, 'refus');
  const j = await brancher(M1, 'x');
  await db.exec(`update techniciens set actif = false where id = '${T1}'`);
  assert.equal((await verifier(j)).length, 0);
  await vieillir();
  assert.equal((await demander(M1)).length, 0);
});

test('bureau : admin et gestion coupent ; code de secours et mail réservés à l\'admin et à la holding', async () => {
  const j = await brancher(M1, 'x');
  for (const x of [UC, UB]) await db.comme(x, () => assert.rejects(db.query('select telephone_couper($1)', [T1]), /reserve/));
  for (const x of [UG, UC, UB]) await db.comme(x, async () => {
    await assert.rejects(db.query('select telephone_code_bureau($1)', [T1]), /reserve/);
    await assert.rejects(db.query('select telephone_regler_mail($1, $2)', [T1, 'pirate@exemple.test']), /reserve/);
  });
  await db.comme(UG, () => db.query('select telephone_couper($1)', [T1]));
  assert.equal((await verifier(j)).length, 0);
  const code = await db.comme(UH, async () => (await db.query('select telephone_code_bureau($1) c', [T1])).rows[0].c);
  assert.match(code, /^\d{8}$/);
  assert.equal((await connecter(M1, code, 'Secours')).etat, 'ok');
});

test('couper ou changer le mail annule un code en attente', async () => {
  let [d] = await demander(M1);
  await db.comme(UG, () => db.query('select telephone_couper($1)', [T1]));
  assert.equal((await connecter(M1, d.code, 'x')).etat, 'refus');
  await vieillir();
  [d] = await demander(M1);
  await db.comme(UA, () => db.query('select telephone_regler_mail($1, $2)', [T1, M1]));
  assert.equal((await connecter(M1, d.code, 'x')).etat, 'refus');
});

test('personne ne lit les empreintes ni les codes ; les fonctions du téléphone sont fermées aux utilisateurs', async () => {
  const j = await brancher(M1, 'x');
  await db.comme(UA, async () => {
    assert.equal((await db.query('select appareil from telephones')).rows.length, 1);
    await assert.rejects(db.query('select jeton_hash from telephones'), /permission denied/);
    await assert.rejects(db.query('select * from private.telephone_codes'), /permission denied/);
    await assert.rejects(db.query('update telephones set coupe_le = null'), /permission denied/);
    for (const f of [`telephone_demander_code('${M1}')`, `telephone_connecter('${M1}', '1', 'x', true)`, `telephone_verifier('${j}')`])
      await assert.rejects(db.query(`select * from ${f}`), /permission denied/);
  });
  for (const x of [UC, UB]) await db.comme(x, async () => assert.equal((await db.query('select id from telephones')).rows.length, 0));
  const tout = JSON.stringify((await db.query('select * from telephones')).rows) + JSON.stringify((await db.query('select * from audit')).rows);
  assert.ok(!tout.includes(j));
  assert.ok(!JSON.stringify((await db.query(`select * from audit where table_nom = 'telephones'`)).rows).includes('jeton_hash'));
});

test('un mail = un seul technicien', async () => {
  await db.comme(UB, () => assert.rejects(db.query('select telephone_regler_mail($1, $2)', [TB, 'UN@exemple.test']), /unique|duplicate/));
});

test('aucune table de données de l\'APK n\'est touchée par un changement de téléphone', async () => {
  await db.exec(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission) values ('${A}', '${T1}', 'k', '2026-11-02', 'INST') on conflict do nothing`);
  const avant = JSON.stringify((await db.query('select * from temps')).rows);
  await brancher(M1, 'a'); await vieillir(); await brancher(M1, 'b');
  assert.equal(JSON.stringify((await db.query('select * from temps')).rows), avant);
});
