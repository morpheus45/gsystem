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

test('l\'opérateur ne voit pas les données du client', async () => {
  await db.comme(OP, async () => {
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
