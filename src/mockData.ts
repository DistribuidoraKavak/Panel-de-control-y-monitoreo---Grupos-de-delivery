import { subDays, subHours } from 'date-fns';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  lastActive: Date;
  status: 'active' | 'inactive';
}

export interface Restaurant {
  id: string;
  name: string;
  location: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  driverId: string;
  timestamp: Date;
  status: 'completed';
  deliveryTimeMinutes: number;
}

const now = new Date();

export const MOCK_DRIVERS: Driver[] = [
  { id: 'd1', name: 'Carlos Gomez', phone: '+5491100000001', lastActive: subHours(now, 2), status: 'active' },
  { id: 'd2', name: 'Miguel Torres', phone: '+5491100000002', lastActive: subHours(now, 5), status: 'active' },
  { id: 'd3', name: 'Juan Perez', phone: '+5491100000003', lastActive: subDays(now, 5), status: 'inactive' }, // 5 días inactivo (ALERTA)
  { id: 'd4', name: 'Andres Rios', phone: '+5491100000004', lastActive: subDays(now, 1), status: 'active' },
  { id: 'd5', name: 'Lucas Martin', phone: '+5491100000005', lastActive: subDays(now, 6), status: 'inactive' }, // 6 días inactivo (ALERTA)
  { id: 'd6', name: 'Sebastian Ruiz', phone: '+5491100000006', lastActive: subHours(now, 1), status: 'active' },
];

export const MOCK_RESTAURANTS: Restaurant[] = [
  { id: 'r1', name: 'Burger King Centro', location: 'Centro' },
  { id: 'r2', name: 'Pizzeria Napoli', location: 'Sur' },
  { id: 'r3', name: 'Sushi pop', location: 'Norte' },
  { id: 'r4', name: 'Empanadas El Noble', location: 'Oeste' },
  { id: 'r5', name: 'Tacos Mexico', location: 'Centro' },
];

// Generar historial de órdenes (últimos 90 días)
export const generateMockOrders = (): Order[] => {
  const orders: Order[] = [];
  const daysToGenerate = 90;
  
  for (let i = 0; i <= daysToGenerate; i++) {
    const currentDate = subDays(now, i);
    // Número aleatorio de pedidos por día: entre 20 y 80
    const ordersToday = Math.floor(Math.random() * 60) + 20;

    for (let j = 0; j < ordersToday; j++) {
      // Pick random active driver (only those active recently)
      const activeDrivers = MOCK_DRIVERS.filter(d => d.status === 'active');
      const driver = activeDrivers[Math.floor(Math.random() * activeDrivers.length)];
      
      // Pick random restaurant with weighted probability (some have more orders)
      const weights = [0.4, 0.2, 0.15, 0.15, 0.1];
      const r = Math.random();
      let cumulative = 0;
      let restaurantId = 'r1';
      for (let k = 0; k < weights.length; k++) {
        cumulative += weights[k];
        if (r <= cumulative) {
          restaurantId = MOCK_RESTAURANTS[k].id;
          break;
        }
      }

      // Base delivery time per driver to simulate faster/slower drivers
      const baseDriverTime = driver.id.charCodeAt(1) % 3 === 0 ? 30 : (driver.id.charCodeAt(1) % 2 === 0 ? 15 : 22);
      const deliveryTimeMinutes = baseDriverTime + Math.floor(Math.random() * 20);

      orders.push({
        id: `o_${i}_${j}`,
        restaurantId,
        driverId: driver.id,
        timestamp: subHours(currentDate, Math.floor(Math.random() * 24)),
        status: 'completed',
        deliveryTimeMinutes
      });
    }
  }

  return orders;
};

export const MOCK_ORDERS = generateMockOrders();
