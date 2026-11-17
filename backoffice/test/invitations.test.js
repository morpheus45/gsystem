// Phase 1 : l'opérateur crée les sociétés, les admins invitent, l'invité accepte.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from './base.js';

const OP = '00000000-0000-0000-0000-0000000000f1';   // opérateur (toi)
const AD = '00000000-0000-0000-0000-0000000000f2';   // futur admin du client
const IN = '00000000-0000-0000-0000-0000000000f3';   // inconnu, email non confirmé
const MA = '00000000-0000-0000-0000-0000000000f4';   // malin : autre email
let db, S;
const un = async (sql) => (await db.query(sql)).rows[0];

before(async () => {
  db = await ouvrirBase();
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values
    ('${OP}', 'op@exemple.test', now()), ('${AD}', 'Admin@Client.test', now()),
    ('${IN}', 'admin@client.test', null), ('${MA}', 'autre@exemple.test', now());
    insert into operateurs values ('${OP}');`);
});

test('seul un opérateur crée une société', async () => {
  await db.comme(MA, async () => {
    await assert.rejects(db.query(`select creer_societe('Pirate', 'autre@exemple.test')`), /operateur/);
  });
  S = await db.comme(OP, async () => (await un(`select creer_societe('Client fictif', 'admin@client.test') as id`)).id);
  assert.ok(S);
  assert.equal((await un(`select count(*)::int n from societes where id = '${S}'`)).n, 1);
});

test('super admin (opérateur) : voit et modifie toutes les sociétés, actions journalisées', async () => {
  await db.comme(OP, async () => {
    assert.equal((await un(`select count(*)::int n from societes`)).n, 1);
    await db.query(`update societes set nom = 'Client fictif renomme' where id = '${S}'`);
    assert.equal((await un(`select nom from societes where id = '${S}'`)).nom, 'Client fictif renomme');
    assert.ok((await un(`select count(*)::int n from invitations where societe_id = '${S}'`)).n >= 1);
  });
  assert.equal((await un(`select count(*)::int n from audit where par = '${OP}' and table_nom = 'invitations'`)).n, 1);
});

test('un simple utilisateur ne peut pas se nommer super admin', async () => {
  await db.comme(MA, async () => {
    await assert.rejects(db.query(`insert into operateurs values ('${MA}')`), /permission denied/);
    assert.equal((await un(`select count(*)::int n from societes`)).n, 0);
  });
});

test('email non confirmé : l\'invitation n\'est pas acceptée', async () => {
  await db.comme(IN, async () => {
    assert.equal((await un(`select accepter_invitations() as n`)).n, 0);
    assert.equal((await un(`select count(*)::int n from societes`)).n, 0);
  });
});

test('un autre email ne peut pas prendre l\'invitation', async () => {
  await db.comme(MA, async () => {
    assert.equal((await un(`select accepter_invitations() as n`)).n, 0);
  });
});

test('le bon email confirmé devient admin (majuscules ignorées), une seule fois', async () => {
  await db.comme(AD, async () => {
    assert.equal((await un(`select accepter_invitations() as n`)).n, 1);
    assert.equal((await un(`select accepter_invitations() as n`)).n, 0);
    assert.equal((await un(`select role from membres where societe_id = '${S}'`)).role, 'admin');
  });
});

test('l\'admin invite dans sa société, pas ailleurs ; un rôle lecture ne peut pas inviter', async () => {
  const autre = await db.comme(OP, async () => (await un(`select creer_societe('Autre fictive', 'x@exemple.test') as id`)).id);
  await db.comme(AD, async () => {
    await db.query(`insert into invitations (societe_id, email, role) values ('${S}', 'lecteur@client.test', 'lecture')`);
    await assert.rejects(db.query(`insert into invitations (societe_id, email, role)
      values ('${autre}', 'pirate@exemple.test', 'admin')`), /row-level security/);
    assert.deepEqual((await db.query(`select email, role from membres_de('${S}') order by email`)).rows,
      [{ email: 'admin@client.test', role: 'admin' }]);
  });
  await db.exec(`insert into membres values ('${S}', '${MA}', 'lecture')`);
  await db.comme(MA, async () => {
    await assert.rejects(db.query(`insert into invitations (societe_id, email, role)
      values ('${S}', 'y@exemple.test', 'admin')`), /row-level security/);
    assert.equal((await db.query(`select * from invitations`)).rows.length, 0);
    await assert.rejects(db.query(`select * from membres_de('${autre}')`), /acces refuse/);
  });
});

test('super admin : supprime une société entière sans données réelles ; personne d\'autre', async () => {
  const X = await db.comme(OP, async () => (await un(`select creer_societe('A supprimer fictive', 'z@exemple.test') as id`)).id);
  await db.exec(`insert into techniciens (id, societe_id, nom) values ('00000000-0000-0000-0000-0000000000e1', '${X}', 'Tech X');
    insert into vehicules (id, societe_id, plaque) values ('00000000-0000-0000-0000-0000000000e2', '${X}', 'XX-001-XX');
    insert into echeances (societe_id, vehicule_id, type, date) values ('${X}', '00000000-0000-0000-0000-0000000000e2', 'CT', '2027-01-01');
    insert into membres values ('${X}', '${MA}', 'admin');`);
  await db.comme(MA, async () => {
    await assert.rejects(db.query(`select supprimer_societe('${X}')`), /super admin/);
  });
  await db.comme(OP, () => db.query(`select supprimer_societe('${X}')`));
  for (const t of ['societes', 'techniciens', 'temps', 'vehicules', 'echeances', 'membres', 'invitations']) {
    const col = t === 'societes' ? 'id' : 'societe_id';
    assert.equal((await un(`select count(*)::int n from ${t} where ${col} = '${X}'`)).n, 0, t);
  }
});

test('le passe-droit de suppression ne sert à rien hors super admin', async () => {
  const Y = await db.comme(OP, async () => (await un(`select creer_societe('Verrou fictive', 'v@exemple.test') as id`)).id);
  const P = '00000000-0000-0000-0000-0000000000c9';
  await db.exec(`insert into membres values ('${Y}', '${MA}', 'admin');
    insert into techniciens (id, societe_id, nom) values ('00000000-0000-0000-0000-0000000000e3', '${Y}', 'Tech Y');
    insert into temps (societe_id, technicien_id, cle_source, date, type_mission)
      values ('${Y}', '00000000-0000-0000-0000-0000000000e3', 'y1', '2026-03-05', 'INST');`);
  await db.comme(OP, async () => {
    await db.query(`insert into periodes_paie (id, societe_id, debut, fin) values ('${P}', '${Y}', '2026-02-21', '2026-03-20')`);
    await db.query(`update periodes_paie set statut = 'validee' where id = '${P}'`);
    await db.query(`update periodes_paie set statut = 'exportee' where id = '${P}'`);
  });
  await db.comme(MA, async () => {
    await db.query(`select set_config('app.suppression_societe', '${Y}', false)`);
    await assert.rejects(db.query(`delete from temps where cle_source = 'y1'`), /effacement interdit/);
    await assert.rejects(db.query(`delete from periodes_paie where id = '${P}'`), /verrouillee/);
  });
  await db.exec(`select set_config('app.suppression_societe', '', false)`);
});
