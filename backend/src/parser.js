/**
 * parser.js — Lógica de interpretación de mensajes de WhatsApp
 *
 * Este módulo recibe cada mensaje y decide:
 *   1. Si es relevante (sticker, "yo", "dale", ubicación, señal de actividad)
 *   2. Qué tipo de evento representa
 *   3. Qué acción tomar en la base de datos
 *
 * PRINCIPIO FUNDAMENTAL: este módulo NUNCA envía mensajes. Solo lee y registra.
 */

const { stmts } = require('./db');

// ── Patrones de texto ─────────────────────────────────────────────────────────

// "yo" — respuesta de repartidor disponible
// Acepta: "yo", "Yo", "YO", "yo!", "yo.", "yo " etc., pero no "yo soy" ni "ayola"
const RE_YO = /^\s*yo[.!¡\s]*$/i;

// "dale" — confirmación del administrador
const RE_DALE = /^\s*dale[.!¡\s]*$/i;

// Señales de disponibilidad en el grupo de comunidad
const RE_ACTIVO = /\b(activo|disponible|conecto|conectado|estoy|arranco|listo)\b/i;
const RE_INACTIVO = /\b(inactivo|no estoy|descans|me voy|ya fue|corto|salgo|hasta)\b/i;

// ── ID de pedido ──────────────────────────────────────────────────────────────
let orderCounter = 0;
const generateOrderId = () => {
  orderCounter++;
  return `order_${Date.now()}_${orderCounter}`;
};

// ── Procesador principal ──────────────────────────────────────────────────────

/**
 * Procesa un mensaje de WhatsApp y actualiza la base de datos si corresponde.
 *
 * @param {object} msg         — mensaje de whatsapp-web.js
 * @param {string} groupType   — 'restaurantes' | 'comunidad'
 * @param {boolean} logOnly    — si true, solo registra eventos (Fase 1)
 */
async function processMessage(msg, groupType, logOnly) {
  const timestamp = new Date(msg.timestamp * 1000).toISOString();
  const senderId = msg.author || msg.from; // author en grupos, from en 1-a-1
  const senderName = msg._data?.notifyName || msg._data?.pushName || null;

  // ── GRUPO RESTAURANTES ─────────────────────────────────────────────────────
  if (groupType === 'restaurantes') {

    // 1. STICKER → nuevo pedido
    if (msg.type === 'sticker') {
      logEvent('sticker', groupType, msg.from, senderId, senderName, '[sticker]', timestamp, msg);

      if (!logOnly) {
        // Registrar el restaurante
        stmts.upsertRestaurant.run({
          id: senderId,
          name: senderName,
          phone: senderId.split('@')[0],
          group_id: msg.from,
          first_seen: timestamp,
          last_seen: timestamp,
        });

        // Crear el pedido
        const orderId = generateOrderId();
        stmts.insertOrder.run({
          id: orderId,
          restaurant_id: senderId,
          created_at: timestamp,
          group_id: msg.from,
        });

        console.log(`[PEDIDO NUEVO] ID: ${orderId} | Local: ${senderName || senderId}`);
      } else {
        console.log(`[LOG] STICKER de ${senderName || senderId} — indicaría nuevo pedido`);
      }
      return;
    }

    // 2. "YO" → repartidor disponible
    const body = (msg.body || '').trim();
    if (msg.type === 'chat' && RE_YO.test(body)) {
      logEvent('yo', groupType, msg.from, senderId, senderName, body, timestamp, msg);

      if (!logOnly) {
        // Registrar el repartidor
        stmts.upsertDriver.run({
          id: senderId,
          name: senderName,
          phone: senderId.split('@')[0],
          last_active: timestamp,
          first_seen: timestamp,
        });

        // Buscar el pedido pendiente más reciente
        const pendingOrder = stmts.getLastPendingOrder.get();
        if (pendingOrder) {
          // Verificar si ya respondió antes (evitar duplicados)
          const existingResp = stmts.db?.prepare(
            'SELECT id FROM order_responses WHERE order_id = ? AND driver_id = ?'
          ).get(pendingOrder.id, senderId);

          if (!existingResp) {
            // ¿Es el primero? → ganador potencial
            const prevResponses = stmts.db?.prepare(
              'SELECT COUNT(*) as cnt FROM order_responses WHERE order_id = ?'
            ).get(pendingOrder.id);
            const isFirst = (prevResponses?.cnt || 0) === 0;

            stmts.insertResponse.run({
              order_id: pendingOrder.id,
              driver_id: senderId,
              responded_at: timestamp,
              won: isFirst ? 1 : 0,
            });

            if (isFirst) {
              // Asignar provisionalmente al primer "yo"
              stmts.assignOrder.run({
                id: pendingOrder.id,
                driver_id: senderId,
                assigned_at: timestamp,
              });
              console.log(`[ASIGNADO PROVISIONAL] Pedido ${pendingOrder.id} → ${senderName || senderId} (primer "yo")`);
            } else {
              console.log(`[YO] ${senderName || senderId} respondió (no primero) al pedido ${pendingOrder.id}`);
            }
          }
        } else {
          console.log(`[YO] ${senderName || senderId} dijo "yo" pero no hay pedido pendiente activo`);
        }
      } else {
        console.log(`[LOG] "YO" de ${senderName || senderId}`);
      }
      return;
    }

    // 3. "DALE" → confirmación del admin
    if (msg.type === 'chat' && RE_DALE.test(body)) {
      logEvent('dale', groupType, msg.from, senderId, senderName, body, timestamp, msg);

      if (!logOnly) {
        const assignedOrder = stmts.getLastAssignedOrder.get();
        if (assignedOrder) {
          console.log(`[DALE] Admin ${senderName || senderId} confirmó pedido ${assignedOrder.id}`);
          // El pedido ya fue asignado al primer "yo", el "dale" confirma
          // (no necesitamos cambiar el driver_id porque ya está asignado al primero)
        }
      } else {
        console.log(`[LOG] "DALE" de ${senderName || senderId}`);
      }
      return;
    }

    // 4. LOCATION → ubicación del local enviada al repartidor
    if (msg.type === 'location') {
      logEvent('location', groupType, msg.from, senderId, senderName, '[location]', timestamp, msg);

      if (!logOnly) {
        const assignedOrder = stmts.getLastAssignedOrder.get();
        if (assignedOrder) {
          stmts.dispatchOrder.run({ id: assignedOrder.id, dispatched_at: timestamp });
          console.log(`[UBICACIÓN] Pedido ${assignedOrder.id} → en camino`);
        }
      } else {
        console.log(`[LOG] LOCATION de ${senderName || senderId}`);
      }
      return;
    }

    // 5. Señales de entrega completada (best-effort)
    const RE_ENTREGADO = /\b(entregado|listo|ok repartidor|llegó|llego|entregó|entrego)\b/i;
    if (msg.type === 'chat' && RE_ENTREGADO.test(body)) {
      logEvent('delivery_signal', groupType, msg.from, senderId, senderName, body, timestamp, msg);
      if (!logOnly) {
        const dispatchedOrder = stmts.db?.prepare(
          "SELECT * FROM orders WHERE status = 'dispatched' ORDER BY dispatched_at DESC LIMIT 1"
        ).get();
        if (dispatchedOrder) {
          stmts.completeOrder.run({ id: dispatchedOrder.id, completed_at: timestamp });
          console.log(`[COMPLETADO] Pedido ${dispatchedOrder.id}`);
        }
      }
      return;
    }
  }

  // ── GRUPO COMUNIDAD ────────────────────────────────────────────────────────
  if (groupType === 'comunidad') {
    const body = (msg.body || '').trim();

    if (msg.type === 'chat' && (RE_ACTIVO.test(body) || RE_INACTIVO.test(body))) {
      const signalType = RE_ACTIVO.test(body) ? 'activo' : 'inactivo';
      logEvent('activity_signal', groupType, msg.from, senderId, senderName, body, timestamp, msg);

      if (!logOnly && signalType === 'activo') {
        stmts.upsertDriver.run({
          id: senderId,
          name: senderName,
          phone: senderId.split('@')[0],
          last_active: timestamp,
          first_seen: timestamp,
        });
        console.log(`[ACTIVO] ${senderName || senderId} se marcó como ${signalType}`);
      } else {
        console.log(`[LOG] ${signalType.toUpperCase()} de ${senderName || senderId}: "${body}"`);
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function logEvent(eventType, groupType, groupId, senderId, senderName, body, timestamp, msg) {
  try {
    stmts.insertEvent.run({
      event_type: eventType,
      group_type: groupType,
      group_id: groupId,
      sender_id: senderId,
      sender_name: senderName,
      body: body,
      timestamp: timestamp,
      raw_data: JSON.stringify({
        type: msg.type,
        hasMedia: msg.hasMedia,
        from: msg.from,
        author: msg.author,
        timestamp: msg.timestamp,
      }),
    });
  } catch (err) {
    console.error('[DB ERROR en logEvent]', err.message);
  }
}

module.exports = { processMessage };
