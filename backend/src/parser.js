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



// ── ID de pedido ──────────────────────────────────────────────────────────────
let orderCounter = 0;
const generateOrderId = () => {
  orderCounter++;
  return `order_${Date.now()}_${orderCounter}`;
};

// ── Procesador principal ──────────────────────────────────────────────────────

function cleanText(text) {
  // Remover caracteres invisibles y limpiar espacios
  return text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
}

/**
 * Procesa un mensaje de WhatsApp y actualiza la base de datos si corresponde.
 */
async function processMessage(msg, groupType, logOnly) {
  const timestamp = new Date(msg.timestamp * 1000).toISOString();
  const senderId = msg.author || msg.from; 
  const senderName = msg._data?.notifyName || msg._data?.pushName || null;

  // Ignorar mensajes eliminados
  if (msg.type === 'revoked' || msg.type === 'e2e_notification') return;

  // ── GRUPO RESTAURANTES ─────────────────────────────────────────────────────
  if (groupType === 'restaurantes') {
    const body = cleanText(msg.body || '');
    const mentionedIds = msg.mentionedIds || [];
    const hasMention = mentionedIds.length > 0;

    // "YO" - Reclamo de pedido
    // Regex flexible: permite emojis, repeticiones de letras, pero rechaza nombres que contienen "yo" adentro.
    const RE_YO = /^\s*([^a-z0-9]*)(y+o+|v+o+y+|m+i+o+|y+o+\s+v+o+y+)([^a-z0-9]*)\s*$/i;
    const isYo = RE_YO.test(body);

    // "DALE" - Confirmación del administrador
    const RE_DALE = /^\s*([^a-z0-9]*)(d+a+l+e+|o+k+|c+o+n+f+i+r+m+a+d+o+)([^a-z0-9]*)\s*$/i;
    const isConfirmText = RE_DALE.test(body);
    const isConfirm = isConfirmText || hasMention;

    // "ENTREGADO" - Señal de entrega
    const RE_ENTREGADO = /\b(entregad[oa]s?|listo|ok repartidor|lleg[oó]|entreg[oó]|dejado)\b/i;
    const isDelivery = RE_ENTREGADO.test(body) && !isYo && !isConfirmText;

    // Inferir roles basados en la base de datos (historial)
    const knownDriver = stmts.getDriver(senderId);
    const knownRestaurant = stmts.getRestaurant(senderId);

    // Detección de "Nuevo Pedido" (Cualquier mensaje no-comando de alguien que no es repartidor conocido)
    let isNewOrder = false;
    if (!isYo && !isConfirm && !isDelivery && msg.type !== 'location') {
      // Todo mensaje (sticker, imagen o texto) que no sea un comando explícito 
      // se considera un nuevo pedido. Esto permite que cualquier persona actúe 
      // como restaurante sin depender de roles fijos o historial.
      isNewOrder = true;
    }

    // 1. NUEVO PEDIDO
    if (isNewOrder) {
      logEvent('nuevo_pedido', groupType, msg.from, senderId, senderName, msg.type, timestamp, msg);
      if (!logOnly) {
        stmts.upsertRestaurant({
          id: senderId, name: senderName, phone: senderId.split('@')[0], group_id: msg.from,
          first_seen: timestamp, last_seen: timestamp,
        });
        const orderId = generateOrderId();
        stmts.insertOrder({ id: orderId, restaurant_id: senderId, created_at: timestamp, group_id: msg.from });
        console.log(`[PEDIDO NUEVO] ID: ${orderId} | Local: ${senderName || senderId}`);
      }
      return;
    }

    // 2. "YO" → repartidor disponible
    if (msg.type === 'chat' && isYo) {
      logEvent('yo', groupType, msg.from, senderId, senderName, body, timestamp, msg);
      if (!logOnly) {
        stmts.upsertDriver({ id: senderId, name: senderName, phone: senderId.split('@')[0], last_active: timestamp, first_seen: timestamp });
        const pendingOrder = stmts.getLastPendingOrder();
        if (pendingOrder) {
          const existingResp = stmts.getResponseForOrderDriver(pendingOrder.id, senderId);
          if (!existingResp) {
            const prevResponses = stmts.countResponsesForOrder(pendingOrder.id);
            const isFirst = (prevResponses?.cnt || 0) === 0;
            stmts.insertResponse({ order_id: pendingOrder.id, driver_id: senderId, responded_at: timestamp, won: isFirst ? 1 : 0 });
            if (isFirst) {
              stmts.assignOrder({ id: pendingOrder.id, driver_id: senderId, assigned_at: timestamp });
              console.log(`[ASIGNADO PROVISIONAL] Pedido ${pendingOrder.id} → ${senderName || senderId}`);
            }
          }
        }
      }
      return;
    }

    // 3. CONFIRMACIÓN ("DALE" o "@Mencion")
    if (msg.type === 'chat' && isConfirm) {
      logEvent('dale', groupType, msg.from, senderId, senderName, body, timestamp, msg);
      if (!logOnly) {
        const targetOrder = stmts.getLastAssignedOrder() || stmts.getLastPendingOrder();
        if (targetOrder) {
          if (hasMention) {
            // Confirmación explícita a un repartidor específico
            const driverToAssign = mentionedIds[0];
            stmts.assignOrder({ id: targetOrder.id, driver_id: driverToAssign, assigned_at: timestamp });
            console.log(`[CONFIRMADO MENCION] Admin asignó explicitamente a ${driverToAssign} al pedido ${targetOrder.id}`);
          } else {
            console.log(`[CONFIRMADO] Admin confirmó pedido ${targetOrder.id}`);
          }
        }
      }
      return;
    }

    // 4. LOCATION → ubicación del local enviada al repartidor
    if (msg.type === 'location') {
      logEvent('location', groupType, msg.from, senderId, senderName, '[location]', timestamp, msg);
      if (!logOnly) {
        const assignedOrder = stmts.getLastAssignedOrder();
        if (assignedOrder) {
          stmts.dispatchOrder({ id: assignedOrder.id, dispatched_at: timestamp });
          console.log(`[UBICACIÓN] Pedido ${assignedOrder.id} → en camino`);
        }
      }
      return;
    }

    // 5. ENTREGADO → Señal de entrega completada
    if (msg.type === 'chat' && isDelivery) {
      logEvent('delivery_signal', groupType, msg.from, senderId, senderName, body, timestamp, msg);
      if (!logOnly) {
        // Un repartidor puede tener múltiples pedidos. Completamos el más antiguo que esté despachado.
        const oldestDispatched = stmts.getOldestDispatchedOrderForDriver(senderId);
        if (oldestDispatched) {
          stmts.completeOrder({ id: oldestDispatched.id, completed_at: timestamp });
          console.log(`[COMPLETADO] Pedido ${oldestDispatched.id}`);
        } else {
          // Fallback: si no hay despachados, quizás nunca se envió la location. Completamos el más antiguo asignado.
          const oldestAssigned = stmts.getOldestAssignedOrderForDriver(senderId);
          if (oldestAssigned) {
            stmts.completeOrder({ id: oldestAssigned.id, completed_at: timestamp });
            console.log(`[COMPLETADO FALLBACK] Pedido ${oldestAssigned.id}`);
          }
        }
      }
      return;
    }
  }

  // ── GRUPO COMUNIDAD ────────────────────────────────────────────────────────
  if (groupType === 'comunidad') {
    if (msg.type !== 'chat') return; // Ignorar ubicaciones, stickers o multimedia aquí
    const body = cleanText(msg.body || '');
    const bodyLower = body.toLowerCase();

    // 1. Cambio de turno de administradores
    const isShiftChange = /(termina|acaba)\s+(el\s+)?turno/i.test(bodyLower) && /(comienza|empieza)\s+(el\s+)?(mio|mío)/i.test(bodyLower);
    if (isShiftChange) {
      logEvent('admin_shift', groupType, msg.from, senderId, senderName, body, timestamp, msg);
      if (!logOnly) console.log(`[TURNO ADMIN] ${senderName || senderId} inició su turno como administrador.`);
      return;
    }

    // Ignorar si es una pregunta general o charlatanería obvia (quienes activos?, alguien para...?)
    if (bodyLower.includes('quienes') || bodyLower.includes('alguien') || bodyLower.includes('?')) return;

    // 2. Señales de actividad/inactividad en 1ra persona
    const RE_ACTIVO = /\b(?:yo\s+|me\s+)?(reactiv[oa]+|activ[oa]+|conect[oa]+|disponible)\b(?!s)/i;
    const RE_INACTIVO = /\b(?:yo\s+|me\s+)?(desactiv[oa]+|desconect[oa]+|desenchuf[oa]+|a\s+mimir|descansar)\b(?!s)/i;
    const RE_THIRD_PERSON = /\b(?:le|te|se|quien)\s+(reactiv[oa]+|activ[oa]+|conect[oa]+|desactiv[oa]+|desconect[oa]+)\b/i;

    if (RE_THIRD_PERSON.test(bodyLower)) return; // Ignorar "le activo" o "se activa"

    let signalType = null;
    if (RE_ACTIVO.test(bodyLower)) signalType = 'activo';
    else if (RE_INACTIVO.test(bodyLower)) signalType = 'inactivo';

    if (signalType) {
      logEvent('activity_signal', groupType, msg.from, senderId, senderName, body, timestamp, msg);
      if (!logOnly) {
        stmts.upsertDriver({ id: senderId, name: senderName, phone: senderId.split('@')[0], last_active: timestamp, first_seen: timestamp });
        
        if (signalType === 'activo') {
          stmts.startDriverSession(senderId, timestamp);
        } else {
          stmts.endDriverSession(senderId, timestamp);
        }
        console.log(`[${signalType.toUpperCase()}] ${senderName || senderId} (Sesión ${signalType === 'activo' ? 'iniciada' : 'cerrada'})`);
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function logEvent(eventType, groupType, groupId, senderId, senderName, body, timestamp, msg) {
  try {
    stmts.insertEvent({
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
