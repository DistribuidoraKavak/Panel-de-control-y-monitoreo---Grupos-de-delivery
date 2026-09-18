/**
 * db.js — Base de datos SQLite para DeliveryHub
 * Usa sql.js (SQLite compilado a WebAssembly — cero dependencias nativas, sin Python/C++ necesarios)
 *
 * Tablas:
 *   restaurants  — locales detectados
 *   drivers      — repartidores detectados
 *   orders       — pedidos con ciclo de vida completo
 *   order_responses — todos los "yo" de un pedido
 *   events       — log crudo para auditoría/debug (Fase 1)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'deliveryhub.db');

let db = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS restaurants (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    phone       TEXT,
    group_id    TEXT,
    first_seen  TEXT DEFAULT (datetime('now')),
    last_seen   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    phone       TEXT NOT NULL,
    last_active TEXT,
    first_seen  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    restaurant_id   TEXT,
    driver_id       TEXT,
    status          TEXT DEFAULT 'pending',
    created_at      TEXT,
    assigned_at     TEXT,
    dispatched_at   TEXT,
    completed_at    TEXT,
    delivery_time_minutes INTEGER,
    group_id        TEXT
  );

  CREATE TABLE IF NOT EXISTS order_responses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL,
    driver_id   TEXT NOT NULL,
    responded_at TEXT NOT NULL,
    won         INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,
    group_type  TEXT,
    group_id    TEXT,
    sender_id   TEXT,
    sender_name TEXT,
    body        TEXT,
    timestamp   TEXT NOT NULL,
    raw_data    TEXT
  );
`;

// ── Inicialización asíncrona ──────────────────────────────────────────────────
async function initDb() {
  const SQL = await initSqlJs();

  // Cargar DB existente o crear nueva
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(SCHEMA);
  persist(); // guardar estado inicial

  console.log(`✅ Base de datos inicializada en ${DB_PATH}`);
  return db;
}

// Persistir DB al disco (sql.js es en memoria, hay que guardar manualmente)
function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Guardar automáticamente cada 5 segundos si hubo cambios
setInterval(persist, 5000);

// ── Helpers de consulta ───────────────────────────────────────────────────────
function run(sql, params = {}) {
  if (!db) throw new Error('DB not initialized');
  db.run(sql, params);
  persist();
}

function get(sql, params = {}) {
  if (!db) return null;
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = {}) {
  if (!db) return [];
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ── API de base de datos (equivalente a los stmts de better-sqlite3) ──────────
const stmts = {
  insertEvent: (params) => run(`
    INSERT INTO events (event_type, group_type, group_id, sender_id, sender_name, body, timestamp, raw_data)
    VALUES (:event_type, :group_type, :group_id, :sender_id, :sender_name, :body, :timestamp, :raw_data)
  `, { ':event_type': params.event_type, ':group_type': params.group_type, ':group_id': params.group_id,
       ':sender_id': params.sender_id, ':sender_name': params.sender_name, ':body': params.body,
       ':timestamp': params.timestamp, ':raw_data': params.raw_data }),

  upsertRestaurant: (params) => run(`
    INSERT INTO restaurants (id, name, phone, group_id, first_seen, last_seen)
    VALUES (:id, :name, :phone, :group_id, :first_seen, :last_seen)
    ON CONFLICT(id) DO UPDATE SET name=COALESCE(excluded.name, name), last_seen=excluded.last_seen
  `, { ':id': params.id, ':name': params.name, ':phone': params.phone, ':group_id': params.group_id,
       ':first_seen': params.first_seen, ':last_seen': params.last_seen }),

  upsertDriver: (params) => run(`
    INSERT INTO drivers (id, name, phone, last_active, first_seen)
    VALUES (:id, :name, :phone, :last_active, :first_seen)
    ON CONFLICT(id) DO UPDATE SET name=COALESCE(excluded.name, name), last_active=excluded.last_active
  `, { ':id': params.id, ':name': params.name, ':phone': params.phone,
       ':last_active': params.last_active, ':first_seen': params.first_seen }),

  insertOrder: (params) => run(`
    INSERT INTO orders (id, restaurant_id, status, created_at, group_id)
    VALUES (:id, :restaurant_id, 'pending', :created_at, :group_id)
  `, { ':id': params.id, ':restaurant_id': params.restaurant_id,
       ':created_at': params.created_at, ':group_id': params.group_id }),

  assignOrder: (params) => run(`
    UPDATE orders SET status='assigned', driver_id=:driver_id, assigned_at=:assigned_at WHERE id=:id
  `, { ':driver_id': params.driver_id, ':assigned_at': params.assigned_at, ':id': params.id }),

  dispatchOrder: (params) => run(`
    UPDATE orders SET status='dispatched', dispatched_at=:dispatched_at WHERE id=:id
  `, { ':dispatched_at': params.dispatched_at, ':id': params.id }),

  completeOrder: (params) => run(`
    UPDATE orders SET status='completed', completed_at=:completed_at,
    delivery_time_minutes=CAST((julianday(:completed_at)-julianday(created_at))*24*60 AS INTEGER) WHERE id=:id
  `, { ':completed_at': params.completed_at, ':id': params.id }),

  insertResponse: (params) => run(`
    INSERT INTO order_responses (order_id, driver_id, responded_at, won)
    VALUES (:order_id, :driver_id, :responded_at, :won)
  `, { ':order_id': params.order_id, ':driver_id': params.driver_id,
       ':responded_at': params.responded_at, ':won': params.won }),

  getLastPendingOrder: () => get(`SELECT * FROM orders WHERE status='pending' ORDER BY created_at DESC LIMIT 1`),
  getLastAssignedOrder: () => get(`SELECT * FROM orders WHERE status='assigned' ORDER BY assigned_at DESC LIMIT 1`),
  getOldestDispatchedOrderForDriver: (driverId) => get(`SELECT * FROM orders WHERE status='dispatched' AND driver_id=:did ORDER BY dispatched_at ASC LIMIT 1`, { ':did': driverId }),
  getOldestAssignedOrderForDriver: (driverId) => get(`SELECT * FROM orders WHERE status='assigned' AND driver_id=:did ORDER BY assigned_at ASC LIMIT 1`, { ':did': driverId }),
  getDriver: (id) => get(`SELECT * FROM drivers WHERE id=:id`, { ':id': id }),
  getRestaurant: (id) => get(`SELECT * FROM restaurants WHERE id=:id`, { ':id': id }),

  // Queries de consulta para la API
  getOrders: (since, until) => all(`
    SELECT o.*, r.name as restaurant_name, d.name as driver_name
    FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id LEFT JOIN drivers d ON o.driver_id=d.id
    WHERE o.created_at >= :since AND o.created_at <= :until ORDER BY o.created_at DESC
  `, { ':since': since, ':until': until }),

  getDrivers: () => all(`SELECT * FROM drivers ORDER BY last_active DESC`),
  getRestaurants: () => all(`SELECT * FROM restaurants ORDER BY last_seen DESC`),

  getEvents: (since, limit) => all(`
    SELECT * FROM events WHERE timestamp >= :since ORDER BY timestamp DESC LIMIT :limit
  `, { ':since': since, ':limit': limit }),

  countResponsesForOrder: (orderId) => get(
    `SELECT COUNT(*) as cnt FROM order_responses WHERE order_id=:id`, { ':id': orderId }
  ),

  getResponseForOrderDriver: (orderId, driverId) => get(
    `SELECT id FROM order_responses WHERE order_id=:oid AND driver_id=:did`,
    { ':oid': orderId, ':did': driverId }
  ),

  getLastDispatchedOrder: () => get(`SELECT * FROM orders WHERE status='dispatched' ORDER BY dispatched_at DESC LIMIT 1`),
};

module.exports = { initDb, stmts };
