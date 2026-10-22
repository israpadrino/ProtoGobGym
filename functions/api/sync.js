const ARRAY_KEYS = {
  members: 'code',
  history: 'id',
  products: 'id',
  sales: 'folio',
  membershipPayments: 'folio',
  cashiers: 'id',
  restockGrants: 'id',
  restockHistory: 'id',
  cashierShiftCuts: 'id',
  ownerNotifications: 'id',
  lowStockNotified: null
};

function recordKey(value, key, index) {
  if (key === null) return String(value);
  if (value && typeof value === 'object') {
    if (value[key] != null) return String(value[key]);
    if (key === 'id') {
      if (value.ts) return `${value.ts}:${value.code || value.cashierId || value.productId || value.cashierName || value.productName || index}`;
      if (value.hash) return `${value.hash}:${value.expiresAt || ''}`;
      if (value.cashierId && value.endedAt) return `${value.cashierId}:${value.endedAt}`;
    }
  }
  return `legacy:${index}:${JSON.stringify(value)}`;
}

function mergeArray(existing, incoming, key) {
  const records = new Map();
  for (const [index, value] of (Array.isArray(existing) ? existing : []).entries()) {
    records.set(recordKey(value, key, index), value);
  }
  for (const [index, value] of (Array.isArray(incoming) ? incoming : []).entries()) {
    const id = recordKey(value, key, index);
    const previous = records.get(id);
    if (previous?.updatedAt && (!value.updatedAt || Date.parse(previous.updatedAt) > Date.parse(value.updatedAt))) continue;
    records.set(id, value);
  }
  return [...records.values()];
}

function mergeState(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value) || Array.isArray(merged[key])) {
      merged[key] = mergeArray(merged[key], value, Object.hasOwn(ARRAY_KEYS, key) ? ARRAY_KEYS[key] : 'id');
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function getState(db) {
  const row = await db.prepare(
    'SELECT state_json, revision FROM gym_app_state WHERE id = ?'
  ).bind('main').first();
  return row ? { state: JSON.parse(row.state_json), revision: row.revision } : { state: null, revision: 0 };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'Falta enlazar la base D1 con el binding DB.' }, 503);
  try {
    const result = await getState(env.DB);
    const since = Number(new URL(request.url).searchParams.get('since') || 0);
    if (since >= result.revision) return jsonResponse({ state: null, revision: result.revision });
    return jsonResponse(result);
  } catch (error) {
    console.error('No se pudo leer el estado compartido de GYM Access:', error);
    return jsonResponse({ error: 'No se pudo leer el estado compartido.' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'Falta enlazar la base D1 con el binding DB.' }, 503);
  let body;
  try {
    const text = await request.text();
    if (text.length > 5 * 1024 * 1024) return jsonResponse({ error: 'El estado excede el límite de 5 MB.' }, 413);
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'El cuerpo debe ser JSON válido.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
    return jsonResponse({ error: 'Falta el objeto state.' }, 400);
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await getState(env.DB);
      const state = mergeState(current.state, body.state);
      const serialized = JSON.stringify(state);
      const result = current.revision === 0
        ? await env.DB.prepare(`
            INSERT OR IGNORE INTO gym_app_state (id, state_json, revision, updated_at)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
          `).bind('main', serialized).run()
        : await env.DB.prepare(`
            UPDATE gym_app_state
            SET state_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND revision = ?
          `).bind(serialized, 'main', current.revision).run();

      if (result.meta.changes === 1) return jsonResponse(await getState(env.DB));
    }
    return jsonResponse({ error: 'El estado cambió en paralelo; vuelve a intentar.' }, 409);
  } catch (error) {
    console.error('No se pudo guardar el estado compartido de GYM Access:', error);
    return jsonResponse({ error: 'No se pudo guardar el estado compartido.' }, 500);
  }
}
