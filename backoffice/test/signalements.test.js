// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés. Reproduction, copie, adaptation ou décompilation, même partielles, interdites sans autorisation écrite de l'auteur (CPI L.122-4, L.122-6, L.335-2 ; voir LICENSE).
// Tests du système de signalements de bugs.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ouvrirBase } from './base.js';

test('Signalements : RLS et permissions', async (t) => {
  const db = await ouvrirBase();

  const userId1 = '00000000-0000-0000-0000-000000000001';
  const userId2 = '00000000-0000-0000-0000-000000000002';
  const superAdminId = '00000000-0000-0000-0000-000000000099';
  const societeId = '10000000-0000-0000-0000-000000000001';

  // Créer les utilisateurs dans auth.users et le super admin dans operateurs
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${userId1}', 'user1@test.local', now()),
      ('${userId2}', 'user2@test.local', now()),
      ('${superAdminId}', 'admin@test.local', now());
    insert into public.societes (id, nom) values ('${societeId}', 'Société 1') on conflict do nothing;
    insert into public.operateurs (user_id) values ('${superAdminId}') on conflict do nothing;
  `);

  // Test 1 : un utilisateur connecté peut créer un signalement
  let result1 = null;
  await db.comme(userId1, async () => {
    const res = await db.query(`
      insert into public.signalements (auteur, ecran, version, gravite, explication)
      values ('${userId1}', 'Tableau de bord', '1.0.0', 'non_urgent', 'Test bug 1')
      returning id;
    `);
    result1 = res.rows[0]?.id;
  });
  assert.ok(result1, 'Utilisateur 1 peut créer un signalement');
  const sigId = result1;

  // Test 2 : l'auteur voit son signalement
  let result2 = 0;
  await db.comme(userId1, async () => {
    const res = await db.query(`select id from public.signalements where auteur = '${userId1}';`);
    result2 = res.rows.length;
  });
  assert.equal(result2, 1, 'L\'auteur voit son signalement');

  // Test 3 : un autre utilisateur ne voit pas le signalement des autres
  let result3 = 0;
  await db.comme(userId2, async () => {
    const res = await db.query(`select id from public.signalements where auteur = '${userId1}';`);
    result3 = res.rows.length;
  });
  assert.equal(result3, 0, 'Un autre utilisateur ne voit pas les signalements des autres');

  // Test 4 : le super admin voit tous les signalements
  let result4 = 0;
  await db.comme(superAdminId, async () => {
    const res = await db.query(`select id from public.signalements;`);
    result4 = res.rows.length;
  });
  assert.equal(result4, 1, 'Le super admin voit tous les signalements');

  // Test 5 : un utilisateur ne peut pas modifier le statut
  let result5 = null;
  await db.comme(userId1, async () => {
    try {
      await db.query(`update public.signalements set statut = 'corrige' where id = '${sigId}';`);
    } catch (e) {
      // Peut échouer ou réussir silencieusement selon la RLS
    }
    const res = await db.query(`select statut from public.signalements where id = '${sigId}';`);
    result5 = res.rows[0]?.statut;
  });
  assert.equal(result5, 'nouveau', 'Utilisateur ne peut pas modifier le statut');

  // Test 6 : seul le super admin peut modifier le statut
  let result6 = null;
  await db.comme(superAdminId, async () => {
    await db.query(`update public.signalements set statut = 'planifie', planifie_le = '2026-12-01' where id = '${sigId}';`);
    const res = await db.query(`select statut, planifie_le from public.signalements where id = '${sigId}';`);
    result6 = res.rows[0];
  });
  assert.equal(result6.statut, 'planifie', 'Super admin peut modifier le statut');
  assert.ok(new Date(result6.planifie_le).toISOString().startsWith('2026-12-01'), 'Super admin peut modifier la date planifiée');

  // Test 7 : impossible de supprimer un signalement
  let result7 = false;
  let countBefore = 0;
  let countAfter = 0;
  await db.comme(superAdminId, async () => {
    const before = await db.query(`select count(*)::int as n from public.signalements where id = '${sigId}';`);
    countBefore = before.rows[0].n;
    try {
      await db.query(`delete from public.signalements where id = '${sigId}';`);
    } catch (err) {
      result7 = err.message.includes('Les signalements ne peuvent pas être supprimés');
    }
    const after = await db.query(`select count(*)::int as n from public.signalements where id = '${sigId}';`);
    countAfter = after.rows[0].n;
  });
  // Le signalement ne doit pas être supprimé, soit par exception soit par silencieuse
  assert.ok(result7 || countAfter === countBefore, 'Impossible de supprimer un signalement');

  // Test 8 : vérifier que le signalement existe toujours
  let result8 = 0;
  await db.comme(superAdminId, async () => {
    const res = await db.query(`select id from public.signalements where id = '${sigId}';`);
    result8 = res.rows.length;
  });
  assert.equal(result8, 1, 'Le signalement existe toujours après tentative de suppression');

  // Test 9 : contrainte d'explication non vide
  let result9 = false;
  await db.comme(userId1, async () => {
    try {
      await db.query(`
        insert into public.signalements (auteur, ecran, version, gravite, explication)
        values ('${userId1}', 'Écran X', '1.0.0', 'urgent', '   ')
        returning id;
      `);
    } catch (err) {
      result9 = err.message.includes('explication_non_vide') || err.message.includes('check');
    }
  });
  assert.ok(result9, 'Contrainte explication_non_vide respectée');

  // Test 10 : contrainte d'explication bornée
  let result10 = false;
  await db.comme(userId1, async () => {
    try {
      const longText = 'a'.repeat(4001);
      await db.query(`
        insert into public.signalements (auteur, ecran, version, gravite, explication)
        values ('${userId1}', 'Écran X', '1.0.0', 'urgent', $1)
        returning id;
      `, [longText]);
    } catch (err) {
      result10 = err.message.includes('explication_bornee') || err.message.includes('check');
    }
  });
  assert.ok(result10, 'Contrainte explication_bornee respectée');

  // Test 11 : captures accessibles seulement par l'auteur et super admin
  let capRes = null;
  await db.comme(userId1, async () => {
    const res = await db.query(`
      insert into public.signalements_captures (signalement_id, chemin)
      values ('${sigId}', '/tmp/capture.jpg')
      returning id;
    `);
    capRes = res.rows[0]?.id;
  });
  assert.ok(capRes, 'L\'auteur peut ajouter une capture');

  let capView1 = 0;
  await db.comme(userId1, async () => {
    const res = await db.query(`select id from public.signalements_captures where signalement_id = '${sigId}';`);
    capView1 = res.rows.length;
  });
  assert.equal(capView1, 1, 'L\'auteur voit sa capture');

  let capView2 = 0;
  await db.comme(userId2, async () => {
    const res = await db.query(`select id from public.signalements_captures where signalement_id = '${sigId}';`);
    capView2 = res.rows.length;
  });
  assert.equal(capView2, 0, 'Un autre utilisateur ne voit pas la capture');

  let capViewAdmin = 0;
  await db.comme(superAdminId, async () => {
    const res = await db.query(`select id from public.signalements_captures where signalement_id = '${sigId}';`);
    capViewAdmin = res.rows.length;
  });
  assert.equal(capViewAdmin, 1, 'Le super admin voit la capture');

  // Test 12 : impossible de supprimer une capture
  let result12 = false;
  let capCountBefore = 0;
  let capCountAfter = 0;
  await db.comme(superAdminId, async () => {
    const before = await db.query(`select count(*)::int as n from public.signalements_captures where signalement_id = '${sigId}';`);
    capCountBefore = before.rows[0].n;
    try {
      await db.query(`delete from public.signalements_captures where signalement_id = '${sigId}';`);
    } catch (err) {
      result12 = err.message.includes('Les signalements ne peuvent pas être supprimés');
    }
    const after = await db.query(`select count(*)::int as n from public.signalements_captures where signalement_id = '${sigId}';`);
    capCountAfter = after.rows[0].n;
  });
  assert.ok(result12 || capCountAfter === capCountBefore, 'Impossible de supprimer une capture');

  // Test 13 : vérifier que la capture existe toujours
  let result13 = 0;
  await db.comme(superAdminId, async () => {
    const res = await db.query(`select id from public.signalements_captures where signalement_id = '${sigId}';`);
    result13 = res.rows.length;
  });
  assert.equal(result13, 1, 'La capture existe toujours après tentative de suppression');

  // Test 14 : anon (visiteur) ne peut rien voir ni faire
  let result14 = 'inconnu';
  await db.comme(null, async () => {
    try {
      const res = await db.query(`select id from public.signalements;`);
      result14 = res.rows.length > 0 ? 'acces' : 'aucun';
    } catch (err) {
      result14 = 'permission';
    }
  });
  assert.equal(result14, 'permission', 'Anon n\'a pas accès aux signalements');

  // Test 15 : vérifier les types d'énums
  let result15 = null;
  await db.comme(userId1, async () => {
    const res = await db.query(`
      insert into public.signalements (auteur, ecran, version, gravite, explication)
      values ('${userId1}', 'Écran Y', '1.0.0', 'critique', 'Bug critique')
      returning gravite, statut;
    `);
    result15 = res.rows[0];
  });
  assert.equal(result15.gravite, 'critique', 'Gravité critique acceptée');
  assert.equal(result15.statut, 'nouveau', 'Statut par défaut est nouveau');
});
