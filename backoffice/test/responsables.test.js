// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Responsables de secteur : leurs cases, leurs techniciens, et rien d'autre.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b', H = '10000000-0000-0000-0000-0000000000f1';
const u = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const OP = u('99'), ADJ = u('a1'), GES = u('a2'), LEC = u('a3'), UB = u('b1'), GIL = u('d1'), R = u('e1'), R2 = u('e2');
const T1 = u('a9'), T2 = u('a8'), TB = u('b9'), V1 = u('c1'), V2 = u('c2'), VB = u('c3');
const DOM = ['interventions', 'conges', 'frais', 'vehicules', 'messages', 'saisies', 'primes', 'permis', 'paie', 'compta', 'facturation'];
let db;
const par = (x, q, p) => db.comme(x, async () => (await db.query(q, p)).rows);
const modifiees = (x, q) => db.comme(x, async () => (await db.query(q)).affectedRows);
const regler = (droits, techs = [T1], x = ADJ, qui = R, s = A) => par(x, 'select regler_responsable($1, $2, $3, $4)', [s, qui, JSON.stringify(droits), techs]);
const TABLES = { temps: 'interventions', conges: 'conges', frais: 'frais', photos_apk: 'frais', messages: 'messages', affectations: 'vehicules',
  vehicules: 'vehicules', echeances: 'vehicules', entretiens: 'vehicules', releves_km: 'vehicules', amendes: 'vehicules', saisies_modules: 'saisies',
  gestes_co: 'primes', primes_tarifs: 'primes', permis_conduire: 'permis', heures_sup: 'paie', exports_compta: 'compta' };
const SOCIETE = { periodes_paie: 'paie', parametres_compta: 'compta', factures: 'compta', tarifs_facturation: 'facturation' };   // pour toute la société
const vue = async (x) => { const o = {}; for (const t of Object.keys(TABLES)) o[t] = Number((await par(x, `select count(*) n from ${t}`))[0].n); return o; };

before(async () => {
  db = await ouvrirBase();
  const tous = [OP, ADJ, GES, LEC, UB, GIL, R, R2];
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ${tous.map((x) => `('${x}', '${x.slice(-2)}@x.test', now())`).join(',')};
    insert into operateurs (user_id) values ('${OP}');
    insert into holdings (id, nom) values ('${H}', 'H');
    insert into membres_holding values ('${H}', '${GIL}', 'admin');
    insert into societes (id, nom, holding_id) values ('${A}', 'A', '${H}'), ('${B}', 'B', null);
    insert into membres values ('${A}', '${ADJ}', 'admin'), ('${A}', '${GES}', 'gestion'), ('${A}', '${LEC}', 'lecture'), ('${B}', '${UB}', 'admin');
    insert into techniciens (id, societe_id, nom, nom_apk) values ('${T1}', '${A}', 'Un', 'UN'), ('${T2}', '${A}', 'Deux', 'DEUX'), ('${TB}', '${B}', 'B', 'BB');
    insert into vehicules (id, societe_id, plaque) values ('${V1}', '${A}', 'AA-001-AA'), ('${V2}', '${A}', 'AA-002-AA'), ('${VB}', '${B}', 'BB-001-BB');`);
  const m = (await par(OP, 'select enregistrer_module_perso(null, $1, $2, $3, $4, 24, $5) as id', ['Outillage', 'outil', '#e6001c', 'Suivre les outils confiés',
    JSON.stringify([{ cle: 'etat', libelle: 'État', type: 'texte', obligatoire: true }])]))[0].id;
  let n = 0;
  for (const [s, t, v] of [[A, T1, V1], [A, T2, V2], [B, TB, VB]]) {
    n++;
    await db.exec(`insert into temps (societe_id, technicien_id, cle_source, date, type_mission) values ('${s}', '${t}', 't${n}', current_date, 'SAV');
      insert into conges (societe_id, technicien_id, debut, fin, type) values ('${s}', '${t}', current_date + 30, current_date + 31, 'CP');
      insert into frais (societe_id, technicien_id, cle_source, date, montant_eur) values ('${s}', '${t}', 'f${n}', current_date, 10);
      insert into photos_apk (societe_id, technicien_id, cle_source, nom_local, nom_drive) values ('${s}', '${t}', 'p${n}', 'l${n}', 'd${n}');
      insert into messages (societe_id, technicien_id, de, texte) values ('${s}', '${t}', 'technicien', 'bonjour');
      insert into affectations (societe_id, vehicule_id, technicien_id, debut) values ('${s}', '${v}', '${t}', current_date - 10);
      insert into echeances (societe_id, vehicule_id, type, date) values ('${s}', '${v}', 'CT', current_date + 30);
      insert into entretiens (societe_id, vehicule_id, type, date) values ('${s}', '${v}', 'vidange', current_date);
      insert into releves_km (societe_id, vehicule_id, date, km, source) values ('${s}', '${v}', current_date, 1000, 'saisie');
      insert into saisies_modules (id, societe_id, technicien_id, module_id, version, date, valeurs) values ('${u('f' + n)}', '${s}', '${t}', '${m}', 1, current_date, '{"etat":"Bon"}');
      insert into gestes_co (societe_id, technicien_id, cle_source, date) values ('${s}', '${t}', 'g${n}', current_date);
      insert into permis_conduire (societe_id, technicien_id, numero) values ('${s}', '${t}', 'ABC12345${n}');`);
    await db.exec(`insert into primes_tarifs (societe_id, technicien_id, mois) values ('${s}', '${t}', 'courant');
      insert into heures_sup (societe_id, technicien_id, semaine, date) values ('${s}', '${t}', '2026-W47', current_date);
      insert into exports_compta (societe_id, technicien_id, debut, fin, frais_ids, parametres, par) values ('${s}', '${t}', current_date, current_date, '{}', '{}', '${ADJ}');`);
    if (n !== 2) await db.exec(`insert into periodes_paie (societe_id, debut, fin) values ('${s}', '2020-01-01', '2020-01-31');
      insert into parametres_compta (societe_id) values ('${s}');
      insert into tarifs_facturation (societe_id, categorie, code, libelle) values ('${s}', 'intervention', 'c', 'l');
      insert into factures (societe_id, sens, numero, date, tiers, montant_ht, tva, montant_ttc) values ('${s}', (enum_range(null::sens_facture))[1], '1', current_date, 't', 1, 0, 1);`);
    await db.exec(`insert into amendes (societe_id, vehicule_id, technicien_id, numero_avis, date_avis) values ('${s}', '${v}', '${t}', '${n}', current_date)`);
  }
  await par(ADJ, 'select nommer_responsable($1, $2)', [A, 'E1@x.test']);
});
beforeEach(() => regler({}, []));

test('nommé sans case : voit le nom de sa société et rien d\'autre, dans AUCUNE table', async () => {
  assert.deepEqual((await par(R, 'select nom from societes')).map((x) => x.nom), ['A']);
  await regler({}, [T1, T2]);
  const tables = (await db.query(`select table_name t from information_schema.columns where table_schema = 'public' and column_name = 'societe_id'
    and table_name not in ('responsables', 'responsables_techniciens', 'techniciens')`)).rows.map((x) => x.t);
  assert.ok(tables.length > 25);
  for (const t of tables) {
    const c = await par(R, `select count(*) n from ${t}`).catch((e) => { assert.match(e.message, /permission denied/, t); return [{ n: 0 }]; });
    assert.equal(Number(c[0].n), 0, t);
  }
  for (const t of ['holdings', 'membres_holding', 'operateurs', 'modules_holding', 'tuiles_reglages', 'modules_perso']) assert.equal((await par(R, `select * from ${t}`)).length, 0, t);
});

test('chaque case n\'ouvre que son domaine, et seulement pour ses techniciens', async () => {
  for (const d of DOM) {
    await regler({ [d]: false });
    const v = await vue(R);
    for (const [t, dom] of Object.entries(TABLES)) assert.equal(v[t], dom === d ? 1 : 0, `${d} -> ${t}`);
    for (const [t, dom] of Object.entries(SOCIETE)) assert.equal((await par(R, `select societe_id from ${t}`)).length, dom === d ? 1 : 0, `${d} -> ${t}`);
  }
  await regler(Object.fromEntries(DOM.map((d) => [d, false])), [T1, T2]);
  for (const [t, n] of Object.entries(await vue(R))) assert.equal(n, 2, t);
  await regler(Object.fromEntries(DOM.map((d) => [d, false])), []);
  for (const [t, n] of Object.entries(await vue(R))) assert.equal(n, 0, t);
});

test('toutes les cases, tous les techniciens : jamais la sécurité sociale, les documents, les membres, le journal', async () => {
  await regler({ interventions: false, conges: true, frais: true, vehicules: true, messages: true, saisies: false, primes: false, permis: false, paie: false, compta: false, facturation: false }, [T1, T2]);
  for (const t of ['secu_sociale', 'documents_tech', 'membres', 'invitations', 'audit', 'techniciens_mail', 'telephones', 'regles_societe', 'modules_societe'])
    assert.equal((await par(R, `select * from ${t}`).catch(() => [])).length, 0, t);
  await assert.rejects(par(R, 'select * from membres_de($1)', [A]), /acces refuse/);
  assert.deepEqual(await par(R, 'select * from responsables_de($1)', [A]), []);
  for (const q of [`select nommer_responsable('${A}', 'x@x.test')`, `select regler_responsable('${A}', '${R}', '{"frais":true}', array['${T2}']::uuid[])`, `select telephone_couper('${T1}')`,
    `select telephone_code_bureau('${T1}')`, `select telephone_regler_mail('${T1}', 'a@b.fr')`]) await assert.rejects(par(R, q), /reserve/, q);
  for (const q of [`insert into responsables_droits values ('${A}', '${R}', 'frais', true)`, `insert into responsables_techniciens values ('${A}', '${R}', '${T2}')`,
    `insert into membres values ('${A}', '${R}', 'admin')`]) await assert.rejects(par(R, q), /permission denied|row-level/, q);
});

test('voir n\'est pas modifier', async () => {
  await regler(Object.fromEntries(DOM.map((d) => [d, false])), [T1, T2]);
  for (const t of [...Object.keys(TABLES), ...Object.keys(SOCIETE)]) {
    const n = await modifiees(R, `update ${t} set societe_id = societe_id`).catch((e) => { assert.match(e.message, /permission denied|interdite|effacement|verrou/, t); return 0; });
    assert.equal(n, 0, t);
    const e = await modifiees(R, `delete from ${t}`).catch((x) => { assert.match(x.message, /permission denied|interdit/, t); return 0; });
    assert.equal(e, 0, t);
  }
  for (const q of [`insert into conges (societe_id, technicien_id, debut, fin, type) values ('${A}', '${T1}', current_date, current_date, 'CP')`,
    `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T1}', 'bureau', 'x')`,
    `insert into releves_km (societe_id, vehicule_id, date, km, source) values ('${A}', '${V1}', current_date, 5, 'saisie')`]) await assert.rejects(par(R, q), /row-level/, q);
});

test('modifier : dans son secteur seulement, sans effacer ni déplacer', async () => {
  await regler({ conges: true, frais: true, vehicules: true, messages: true });
  assert.equal(await modifiees(R, `update conges set statut = 'validee'`), 1);
  await assert.rejects(par(R, `update conges set technicien_id = '${T2}'`), /row-level/);
  await assert.rejects(par(R, `update echeances set vehicule_id = '${V2}'`), /row-level/);
  await assert.rejects(par(R, `update echeances set societe_id = '${B}', vehicule_id = '${VB}'`), /row-level/);
  await par(R, `insert into messages (societe_id, technicien_id, de, texte) values ('${A}', '${T1}', 'bureau', 'ok')`);
  for (const [s, t] of [[A, T2], [B, TB]]) await assert.rejects(par(R, `insert into messages (societe_id, technicien_id, de, texte) values ('${s}', '${t}', 'bureau', 'x')`), /row-level/);
  await par(R, `insert into releves_km (societe_id, vehicule_id, date, km, source) values ('${A}', '${V1}', current_date - 1, 1500, 'saisie')`);
  await assert.rejects(par(R, `insert into releves_km (societe_id, vehicule_id, date, km, source) values ('${A}', '${V2}', current_date, 5, 'saisie')`), /row-level/);
  for (const t of Object.keys(TABLES)) {
    const n = await modifiees(R, `delete from ${t}`).catch((e) => { assert.match(e.message, /permission denied|interdit/, t); return 0; });
    assert.equal(n, 0, t);
  }
});

test('frais : valider ou refuser, jamais changer le montant', async () => {
  await regler({ frais: true });
  for (const q of ['montant_eur = 99', `date = date - 1`, `categorie = 'X'`]) await assert.rejects(par(R, `update frais set ${q}`), /valide ou refuse|reserv|interdit/);
  assert.equal(await modifiees(R, `update frais set statut = 'valide'`), 1);
  assert.equal(await modifiees(ADJ, `update frais set montant_eur = montant_eur where technicien_id = '${T1}'`), 1);   // les autres comme avant
});

test('véhicule rendu : il ne le voit plus', async () => {
  await regler({ vehicules: false });
  assert.equal((await par(R, 'select * from vehicules')).length, 1);
  await db.exec(`update affectations set fin = current_date - 1 where vehicule_id = '${V1}'`);
  assert.equal((await par(R, 'select * from vehicules')).length, 0);
  await db.exec(`update affectations set fin = null where vehicule_id = '${V1}'`);
});

test('qui règle : adjoint, patron, super admin ; changement immédiat', async () => {
  for (const x of [ADJ, GIL, OP]) { await regler({ frais: false }, [T1], x); assert.equal((await par(R, 'select * from frais')).length, 1); await regler({}, [], x); assert.equal((await par(R, 'select * from frais')).length, 0); }
  for (const x of [GES, LEC, UB, R]) await assert.rejects(regler({ frais: false }, [T1], x), /reserve/);
  await assert.rejects(regler({ membres: false }), /check|violates/);
  for (const d of ['paie', 'compta', 'facturation', 'primes', 'permis', 'saisies']) await assert.rejects(regler({ [d]: true }), /check|violates/);
  await assert.rejects(regler({ secu: true }), /check|violates/);
  await assert.rejects(regler({ interventions: true }), /check|violates/);
  await assert.rejects(regler({ frais: false }, [TB]), /foreign key|violates/);
  await assert.rejects(regler({ frais: false }, [T1], ADJ, R2), /inconnu/);
  await assert.rejects(par(ADJ, 'select nommer_responsable($1, $2)', [A, 'a2@x.test']), /deja membre/);
  assert.equal((await par(GIL, 'select * from responsables_de($1)', [A])).length, 1);
  for (const x of [GES, LEC, UB]) assert.deepEqual(await par(x, 'select * from responsables_de($1)', [A]), []);
});

test('invité : entre avec son email confirmé ; retiré : tout se ferme', async () => {
  await db.exec(`delete from auth.users where id = '${R2}'`);
  assert.equal((await par(ADJ, 'select nommer_responsable($1, $2) r', [A, 'neuf@x.test']))[0].r, 'invite');
  await db.exec(`insert into auth.users (id, email) values ('${R2}', 'neuf@x.test')`);
  assert.equal((await par(R2, 'select accepter_invitations() n'))[0].n, 0);
  await db.exec(`update auth.users set email_confirmed_at = now() where id = '${R2}'`);
  assert.equal((await par(R2, 'select accepter_invitations() n'))[0].n, 1);
  await regler({ conges: false }, [T2], ADJ, R2);
  assert.deepEqual((await par(R2, 'select technicien_id t from conges')).map((x) => x.t), [T2]);
  await par(ADJ, 'select retirer_responsable($1, $2)', [A, 'neuf@x.test']);
  for (const t of ['conges', 'societes', 'techniciens', 'responsables_droits']) assert.equal((await par(R2, `select * from ${t}`)).length, 0, t);
});

test('les autres rôles voient exactement comme avant', async () => {
  for (const x of [ADJ, GES, GIL]) for (const [t, n] of Object.entries(await vue(x))) assert.ok(n >= 2, `${t} ${n}`);
  const l = await vue(LEC);
  assert.deepEqual([l.temps, l.frais, l.saisies_modules, l.permis_conduire], [2, 2, 0, 0]);
  assert.equal(l.messages, 0);
  for (const [t, n] of Object.entries(await vue(UB))) assert.equal(n, 1, t);
  assert.ok((await par(R, 'select * from modules_actifs($1)', [A])).length > 5);
  assert.deepEqual(await par(R, 'select * from modules_actifs($1)', [B]), []);
});
