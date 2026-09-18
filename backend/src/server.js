/**
 * server.js — Servidor principal de DeliveryHub Backend
 *
 * Responsabilidades:
 *   1. Conectar a WhatsApp Web mediante QR (solo-lectura, nunca envía mensajes)
 *   2. Escuchar mensajes de los dos grupos configurados
 *   3. Procesar y registrar eventos en SQLite
 *   4. Exponer una API REST para que el panel frontend consulte los datos
 *
 * PRINCIPIO: este proceso NUNCA llama a msg.reply(), client.sendMessage() ni
 * ningún otro método que envíe datos a WhatsApp. Solo escucha y lee.
 */

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const { stmts, initDb } = require('./db');
const { processMessage } = require('./parser');

// ── Configuración ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001');
const GROUP_RESTAURANTES = process.env.GROUP_RESTAURANTES || '';
const GROUP_COMUNIDAD = process.env.GROUP_COMUNIDAD || '';
const LOG_ONLY = process.env.LOG_ONLY !== 'false'; // por defecto Fase 1 (solo log)

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║          DeliveryHub — Backend de Monitoreo              ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Modo: ${LOG_ONLY ? 'SOLO LOG (Fase 1)          ' : 'PROCESAMIENTO COMPLETO (Fase 2)'}          ║`);
console.log(`║  Grupo restaurantes: "${GROUP_RESTAURANTES}"`.padEnd(61) + '║');
console.log(`║  Grupo comunidad:    "${GROUP_COMUNIDAD}"`.padEnd(61) + '║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// ── Cliente de WhatsApp ───────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
  },
});

// Estado de conexión
let waStatus = 'disconnected';
let monitoredGroups = {
  '120363412504783244@g.us': 'restaurantes',
  '120363430049131718@g.us': 'comunidad'
}; // { groupId: 'restaurantes' | 'comunidad' }

client.on('qr', (qr) => {
  waStatus = 'waiting_qr';
  console.log('\n📱 Escaneá este código QR con tu WhatsApp para conectar:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n(El QR expira en ~20 segundos. Si expira, se generará uno nuevo)\n');
});

client.on('loading_screen', (percent) => {
  process.stdout.write(`\r⏳ Iniciando WhatsApp Web: ${percent}%   `);
});

client.on('authenticated', () => {
  waStatus = 'authenticated';
  console.log('\n✅ Autenticado correctamente.');
});

client.on('auth_failure', (msg) => {
  waStatus = 'auth_failed';
  console.error('❌ Error de autenticación:', msg);
});

client.on('ready', async () => {
  waStatus = 'ready';
  console.log('✅ Cliente WhatsApp listo. Buscando grupos...\n');

  // Buscar los grupos configurados por nombre
  let chats = [];
  try {
    chats = await client.getChats();
  } catch (err) {
    console.warn('\n⚠️  No se pudieron cargar todos los chats al inicio debido a un cambio en WhatsApp Web.');
    console.warn('   Los grupos se detectarán automáticamente cuando llegue el primer mensaje.\n');
  }

  let found = 0;
  for (const chat of chats) {
    if (!chat.isGroup) continue;

    if (GROUP_RESTAURANTES && chat.name === GROUP_RESTAURANTES) {
      monitoredGroups[chat.id._serialized] = 'restaurantes';
      console.log(`✅ Grupo RESTAURANTES encontrado: "${chat.name}" (${chat.id._serialized})`);
      found++;
    }
    if (GROUP_COMUNIDAD && chat.name === GROUP_COMUNIDAD) {
      monitoredGroups[chat.id._serialized] = 'comunidad';
      console.log(`✅ Grupo COMUNIDAD encontrado: "${chat.name}" (${chat.id._serialized})`);
      found++;
    }
  }

  if (chats.length > 0) {
    if (found === 0) {
      console.warn('\n⚠️  No se encontró ningún grupo con los nombres configurados en .env');
      console.warn('   Verificá que GROUP_RESTAURANTES y GROUP_COMUNIDAD están escritos exactamente igual al nombre del grupo en WhatsApp.\n');
    } else if (found < 2) {
      console.warn('\n⚠️  Solo se encontró uno de los dos grupos. El otro no está monitoreado.\n');
    } else {
      console.log('\n🎯 Todos los grupos configurados fueron encontrados. Monitoreando...\n');
    }
  }
});

client.on('disconnected', (reason) => {
  waStatus = 'disconnected';
  console.warn('\n⚠️  WhatsApp desconectado:', reason);
  console.warn('   Reiniciando conexión en 10 segundos...\n');
  setTimeout(() => client.initialize(), 10000);
});

// ── Listener principal de mensajes ────────────────────────────────────────────
client.on('message_create', async (msg) => {
  // Intentar detectar el grupo dinámicamente si no lo conocemos
  if (!monitoredGroups[msg.from] && !monitoredGroups[msg.to]) {
    const target = msg.fromMe ? msg.to : msg.from;
    try {
      const chat = await msg.getChat();
      if (chat && chat.isGroup) {
        console.log(`[DEBUG] Recibido mensaje del grupo: "${chat.name}"`);
        if (GROUP_RESTAURANTES && chat.name.trim() === GROUP_RESTAURANTES.trim()) {
          monitoredGroups[target] = 'restaurantes';
          console.log(`\n✅ Grupo RESTAURANTES detectado (vía mensaje): "${chat.name}"`);
        } else if (GROUP_COMUNIDAD && chat.name.trim() === GROUP_COMUNIDAD.trim()) {
          monitoredGroups[target] = 'comunidad';
          console.log(`\n✅ Grupo COMUNIDAD detectado (vía mensaje): "${chat.name}"`);
        }
      } else {
        console.log(`[DEBUG] Recibido mensaje de chat privado o desconocido: ${target}`);
      }
    } catch (e) {
      console.log(`[DEBUG] Error obteniendo chat para ${target}: ${e.message}`);
      console.log(`[DEBUG] Mensaje recibido de ${target}: "${msg.body}"`);
      
      // AUTO-VINCULACIÓN POR COMANDO SECRETO
      if (msg.body === 'TEST-REST') {
        monitoredGroups[target] = 'restaurantes';
        console.log(`\n✅ Grupo RESTAURANTES vinculado por comando a ID: ${target}`);
      } else if (msg.body === 'TEST-COM') {
        monitoredGroups[target] = 'comunidad';
        console.log(`\n✅ Grupo COMUNIDAD vinculado por comando a ID: ${target}`);
      }
    }
  }

  // Ignorar mensajes propios (garantía extra de no-participación) después de la fase de descubrimiento
  if (msg.fromMe) return;

  // Solo procesar mensajes de grupos monitoreados
  const groupType = monitoredGroups[msg.from];
  if (!groupType) {
    return;
  }

  // Delegar al parser
  try {
    await processMessage(msg, groupType, LOG_ONLY);
  } catch (err) {
    console.error('[ERROR en processMessage]', err.message);
  }
});

// Inicializar cliente
// client.initialize() ahora se llama después de initDb()

// ── API REST ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Estado del sistema
app.get('/api/status', (req, res) => {
  res.json({
    whatsapp: waStatus,
    monitoredGroups: Object.entries(monitoredGroups).map(([id, type]) => ({ id, type })),
    logOnly: LOG_ONLY,
    mode: LOG_ONLY ? 'phase1_log_only' : 'phase2_full',
  });
});

// Pedidos (con filtro por rango de fechas)
app.get('/api/orders', (req, res) => {
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const until = req.query.until || new Date().toISOString();
  const orders = stmts.getOrders(since, until);
  res.json(orders);
});

// Repartidores
app.get('/api/drivers', (req, res) => {
  const drivers = stmts.getDrivers();
  res.json(drivers);
});

// Restaurantes
app.get('/api/restaurants', (req, res) => {
  const restaurants = stmts.getRestaurants();
  res.json(restaurants);
});

// Log de eventos crudos (para auditoría / Fase 1)
app.get('/api/events', (req, res) => {
  const since = req.query.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = parseInt(req.query.limit || '200');
  const events = stmts.getEvents(since, limit);
  res.json(events);
});

// Respuestas de un pedido
app.get('/api/orders/:orderId/responses', (req, res) => {
  const responses = stmts.getOrderResponses ? stmts.getOrderResponses(req.params.orderId) : [];
  res.json(responses);
});

// Estadísticas agregadas (para el panel)
app.get('/api/stats', (req, res) => {
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const until = req.query.until || new Date().toISOString();

  const orders = stmts.getOrders(since, until);
  const drivers = stmts.getDrivers();
  const restaurants = stmts.getRestaurants();

  // Agrupar pedidos por restaurante
  const byRestaurant = {};
  orders.forEach(o => {
    if (!byRestaurant[o.restaurant_id]) {
      byRestaurant[o.restaurant_id] = {
        restaurant: restaurants.find(r => r.id === o.restaurant_id) || { id: o.restaurant_id, name: o.restaurant_name },
        orders: 0,
      };
    }
    byRestaurant[o.restaurant_id].orders++;
  });

  // Agrupar pedidos por repartidor + tiempo promedio
  const byDriver = {};
  orders.forEach(o => {
    if (!o.driver_id) return;
    if (!byDriver[o.driver_id]) {
      byDriver[o.driver_id] = {
        driver: drivers.find(d => d.id === o.driver_id) || { id: o.driver_id, name: o.driver_name },
        orders: 0,
        deliveryTimes: [],
      };
    }
    byDriver[o.driver_id].orders++;
    if (o.delivery_time_minutes) byDriver[o.driver_id].deliveryTimes.push(o.delivery_time_minutes);
  });

  const driverStats = Object.values(byDriver).map(d => ({
    ...d.driver,
    orders: d.orders,
    avgDeliveryTime: d.deliveryTimes.length
      ? Math.round(d.deliveryTimes.reduce((a, b) => a + b, 0) / d.deliveryTimes.length)
      : null,
  }));

  res.json({
    totalOrders: orders.length,
    restaurantStats: Object.values(byRestaurant).sort((a, b) => b.orders - a.orders),
    driverStats,
    drivers,
    restaurants,
    orders: orders.slice(0, 500), // últimos 500 para el gráfico de evolución
  });
});

initDb().then(() => {
  client.initialize();

  app.listen(PORT, () => {
    console.log(`\n🚀 API disponible en http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`   GET /api/status        → estado de conexión WhatsApp`);
    console.log(`   GET /api/events        → log crudo de mensajes detectados`);
    console.log(`   GET /api/orders        → pedidos registrados`);
    console.log(`   GET /api/drivers       → repartidores conocidos`);
    console.log(`   GET /api/restaurants   → restaurantes conocidos`);
    console.log(`   GET /api/stats         → estadísticas agregadas para el panel\n`);
  });
}).catch(e => {
  console.error('❌ Error inicializando DB:', e);
});

