import { Pool, PoolClient } from 'pg';

import { AppState, DEFAULT_DEVICE_TYPE, Device, DeviceType, emptyState } from './layout-types';

let pool: Pool | null = null;
let schemaReady = false;

export function hasPostgresConfig(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
      (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE)
  );
}

function getConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;

  if (!host || !user || !password || !database) {
    throw new Error('Missing Postgres connection environment variables.');
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}`;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString()
    });
  }
  return pool;
}

async function ensureSchema(client: PoolClient) {
  if (schemaReady) {
    return;
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS floors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image_data_url TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      device_type TEXT NOT NULL,
      x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL,
      linked_device_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    );

    CREATE TABLE IF NOT EXISTS layout_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      selected_floor_id TEXT,
      selected_device_id TEXT
    );
  `);

  schemaReady = true;
}

function sanitizeDeviceType(value: string): DeviceType {
  return (value || DEFAULT_DEVICE_TYPE) as DeviceType;
}

export async function readLayout(): Promise<AppState> {
  const client = await getPool().connect();

  try {
    await ensureSchema(client);

    const [floorsResult, devicesResult, selectedResult] = await Promise.all([
      client.query('SELECT id, name, image_data_url FROM floors ORDER BY name ASC'),
      client.query(
        'SELECT id, floor_id, name, notes, device_type, x, y, linked_device_ids FROM devices ORDER BY name ASC'
      ),
      client.query('SELECT selected_floor_id, selected_device_id FROM layout_state WHERE id = 1')
    ]);

    const floors = floorsResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      imageDataUrl: row.image_data_url as string
    }));

    const devices: Device[] = devicesResult.rows.map((row) => ({
      id: row.id as string,
      floorId: row.floor_id as string,
      name: row.name as string,
      notes: row.notes as string,
      type: sanitizeDeviceType(row.device_type as string),
      x: Number(row.x),
      y: Number(row.y),
      linkedDeviceIds: (row.linked_device_ids as string[]) ?? []
    }));

    const selected = selectedResult.rows[0];

    return {
      floors,
      devices,
      selectedFloorId: selected?.selected_floor_id ?? undefined,
      selectedDeviceId: selected?.selected_device_id ?? undefined
    };
  } finally {
    client.release();
  }
}

export async function writeLayout(state: AppState): Promise<AppState> {
  const client = await getPool().connect();

  try {
    await ensureSchema(client);
    await client.query('BEGIN');

    await client.query('DELETE FROM devices');
    await client.query('DELETE FROM floors');

    for (const floor of state.floors) {
      await client.query('INSERT INTO floors(id, name, image_data_url) VALUES ($1, $2, $3)', [
        floor.id,
        floor.name,
        floor.imageDataUrl
      ]);
    }

    for (const device of state.devices) {
      await client.query(
        `INSERT INTO devices(id, floor_id, name, notes, device_type, x, y, linked_device_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          device.id,
          device.floorId,
          device.name,
          device.notes,
          device.type,
          device.x,
          device.y,
          device.linkedDeviceIds
        ]
      );
    }

    await client.query(
      `INSERT INTO layout_state(id, selected_floor_id, selected_device_id)
       VALUES (1, $1, $2)
       ON CONFLICT (id)
       DO UPDATE SET selected_floor_id = EXCLUDED.selected_floor_id, selected_device_id = EXCLUDED.selected_device_id`,
      [state.selectedFloorId ?? null, state.selectedDeviceId ?? null]
    );

    await client.query('COMMIT');
    return state;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function getEmptyState() {
  return emptyState;
}
