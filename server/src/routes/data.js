import { Router } from 'express';
import { clientsDb, withTransaction } from '../db.js';
import { requireAuth, requireClient } from '../sessions.js';
import { badRequest, notFound, conflict, forbidden } from '../errors.js';

// Monitoring data for the client verified in this session. Every query is scoped to
// req.auth.clientId, so one client's records can never be read or changed from another.
export const dataRouter = Router();
dataRouter.use(requireAuth, requireClient);

export const RECORD_TYPES = ['feeding', 'sleep', 'diaper', 'medicine', 'growth', 'vaccination', 'temperature', 'breathing', 'skin', 'milestone'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// The display order lists every id of a baby's records, so this must allow years of entries.
const MAX_ITEMS = 100000;
const MAX_ITEM_BYTES = 32 * 1024;
// Rows written per SQL statement, so even the largest request is a few hundred statements
// instead of one per item (which held a shared connection for minutes).
const BATCH = 500;
const batches = (list) => Array.from({ length: Math.ceil(list.length / BATCH) }, (_, i) => list.slice(i * BATCH, (i + 1) * BATCH));

function parseChanges(body, { validateItem }) {
  const { upsert = [], delete: del = [], order = null } = body || {};
  if (!Array.isArray(upsert) || !Array.isArray(del) || (order !== null && !Array.isArray(order))) {
    throw badRequest('invalid_body', 'Expected { upsert: [], delete: [], order: [] }.');
  }
  if (upsert.length > MAX_ITEMS || del.length > MAX_ITEMS || (order && order.length > MAX_ITEMS)) {
    throw badRequest('too_many_items', `At most ${MAX_ITEMS} items per request.`);
  }
  for (const id of [...del, ...(order || [])]) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw badRequest('invalid_id', 'Invalid id.');
  }
  const items = upsert.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !ID_RE.test(item.id)) {
      throw badRequest('invalid_item', 'Each item must be an object with a valid id.');
    }
    const json = JSON.stringify(item);
    if (Buffer.byteLength(json) > MAX_ITEM_BYTES) throw badRequest('item_too_large', 'An item is too large.');
    validateItem?.(item);
    return { id: item.id, item, json };
  });
  return { items, del, order };
}

// Display order: higher position first. Position = length - index, so adding a new entry
// at the top (the common case) leaves every existing row's position unchanged.
function positionsFrom(order) {
  const map = new Map();
  order?.forEach((id, i) => map.set(id, order.length - i));
  return map;
}

async function applyOrder(conn, table, whereSql, whereArgs, order) {
  if (!order) return;
  const wanted = positionsFrom(order);
  const [rows] = await conn.query(`SELECT id, position FROM ${table} WHERE ${whereSql}`, whereArgs);
  const moved = rows.filter((r) => wanted.has(r.id) && wanted.get(r.id) !== r.position);
  for (const part of batches(moved)) {
    await conn.query(
      `UPDATE ${table} SET position = CASE id ${part.map(() => 'WHEN ? THEN ?').join(' ')} END
        WHERE ${whereSql} AND id IN (?)`,
      [...part.flatMap((r) => [r.id, wanted.get(r.id)]), ...whereArgs, part.map((r) => r.id)]
    );
  }
}

async function assertOwnBaby(babyId, clientId) {
  if (!ID_RE.test(babyId)) throw notFound('baby_not_found', 'Baby not found.');
  const [rows] = await clientsDb.query('SELECT client_id FROM babies WHERE id = ?', [babyId]);
  // A baby belonging to another client is reported exactly like a missing one.
  if (!rows[0] || Number(rows[0].client_id) !== Number(clientId)) throw notFound('baby_not_found', 'Baby not found.');
}

// Only the family (client account) may delete a baby or wipe a baby's records. A nurse can add
// and edit entries but never remove a baby's data.
function forbidNurseDelete(req) {
  if (req.auth.role === 'nurse') {
    throw forbidden('nurse_cannot_delete', "Nurses can't delete a baby's data. Ask the family to do it.");
  }
}

function requireType(type) {
  if (!RECORD_TYPES.includes(type)) throw notFound('unknown_type', 'Unknown record type.');
  return type;
}

// ---- Babies ---------------------------------------------------------------

dataRouter.get('/babies', async (req, res) => {
  const [rows] = await clientsDb.query(
    'SELECT id, details FROM babies WHERE client_id = ? ORDER BY position DESC, created_at ASC',
    [req.auth.clientId]
  );
  res.json({ items: rows.map((r) => ({ ...r.details, id: r.id })) });
});

dataRouter.patch('/babies', async (req, res) => {
  const clientId = req.auth.clientId;
  const { items, del, order } = parseChanges(req.body, {
    validateItem: (b) => {
      if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120) {
        throw badRequest('invalid_baby', 'Each baby needs a name.');
      }
    },
  });
  if (del.length) forbidNurseDelete(req);
  const pos = positionsFrom(order);

  await withTransaction(clientsDb, async (conn) => {
    if (items.length) {
      const [owned] = await conn.query('SELECT id, client_id FROM babies WHERE id IN (?) FOR UPDATE', [items.map((i) => i.id)]);
      if (owned.some((b) => Number(b.client_id) !== Number(clientId))) {
        throw conflict('id_conflict', 'This baby could not be saved. Please try again.');
      }
      for (const part of batches(items)) {
        await conn.query(
          `INSERT INTO babies (id, client_id, name, details, position) VALUES ?
           ON DUPLICATE KEY UPDATE name = VALUES(name), details = VALUES(details), position = VALUES(position)`,
          [part.map(({ id, item, json }) => [id, clientId, item.name.trim(), json, pos.get(id) ?? 0])]
        );
      }
    }
    // Deleting a baby also deletes its monitoring records (ON DELETE CASCADE).
    for (const part of batches(del)) {
      await conn.query('DELETE FROM babies WHERE client_id = ? AND id IN (?)', [clientId, part]);
    }
    await applyOrder(conn, 'babies', 'client_id = ?', [clientId], order);
  });
  res.json({ saved: items.length, deleted: del.length });
});

// "Clear all data": removes every baby and record of this client.
dataRouter.delete('/babies', async (req, res) => {
  forbidNurseDelete(req);
  const [result] = await clientsDb.query('DELETE FROM babies WHERE client_id = ?', [req.auth.clientId]);
  res.json({ deleted: result.affectedRows });
});

// ---- Monitoring records ---------------------------------------------------

dataRouter.get('/babies/:babyId/records/:type', async (req, res) => {
  const type = requireType(req.params.type);
  await assertOwnBaby(req.params.babyId, req.auth.clientId);
  const [rows] = await clientsDb.query(
    `SELECT data FROM monitoring_records WHERE baby_id = ? AND record_type = ?
      ORDER BY position DESC, created_at DESC`,
    [req.params.babyId, type]
  );
  res.json({ items: rows.map((r) => r.data) });
});

dataRouter.patch('/babies/:babyId/records/:type', async (req, res) => {
  const type = requireType(req.params.type);
  const { babyId } = req.params;
  await assertOwnBaby(babyId, req.auth.clientId);
  const { items, del, order } = parseChanges(req.body, {});
  const pos = positionsFrom(order);

  await withTransaction(clientsDb, async (conn) => {
    for (const part of batches(items)) {
      await conn.query(
        `INSERT INTO monitoring_records (baby_id, record_type, id, data, position, updated_by) VALUES ?
         ON DUPLICATE KEY UPDATE data = VALUES(data), position = VALUES(position), updated_by = VALUES(updated_by)`,
        [part.map(({ id, json }) => [babyId, type, id, json, pos.get(id) ?? 0, req.auth.userId])]
      );
    }
    for (const part of batches(del)) {
      await conn.query(
        'DELETE FROM monitoring_records WHERE baby_id = ? AND record_type = ? AND id IN (?)',
        [babyId, type, part]
      );
    }
    await applyOrder(conn, 'monitoring_records', 'baby_id = ? AND record_type = ?', [babyId, type], order);
  });
  res.json({ saved: items.length, deleted: del.length });
});

dataRouter.delete('/babies/:babyId/records/:type', async (req, res) => {
  forbidNurseDelete(req);
  const type = requireType(req.params.type);
  await assertOwnBaby(req.params.babyId, req.auth.clientId);
  const [result] = await clientsDb.query(
    'DELETE FROM monitoring_records WHERE baby_id = ? AND record_type = ?',
    [req.params.babyId, type]
  );
  res.json({ deleted: result.affectedRows });
});
