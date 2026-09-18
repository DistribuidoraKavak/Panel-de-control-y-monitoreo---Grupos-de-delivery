/**
 * api.ts — Capa de abstracción de datos para DeliveryHub
 *
 * Esta capa determina si el panel muestra:
 *   - DEMO: datos de prueba (mockData) → sin dependencias externas
 *   - LIVE: datos reales de la API del backend
 *
 * Para cambiar de modo, el usuario usa el toggle en el panel.
 * El modo elegido se persiste en localStorage.
 */

import { startOfDay, startOfWeek, startOfMonth, endOfDay, parseISO } from 'date-fns';
import { MOCK_DRIVERS, MOCK_ORDERS, MOCK_RESTAURANTS } from './mockData';

const BACKEND_URL = 'http://localhost:3001';
const STORAGE_KEY = 'deliveryhub_data_source';

// ── Tipos compartidos ─────────────────────────────────────────────────────────
export interface DriverData {
  id: string;
  name: string;
  phone: string;
  last_active: string; // ISO string
  orders: number;
  avgDeliveryTime: number | null;
}

export interface RestaurantData {
  id: string;
  name: string;
  location?: string;
  orders: number;
  prevOrders?: number;
  trend?: number;
  isInactive?: boolean;
}

export interface OrderData {
  id: string;
  restaurantId: string;
  driverId: string;
  timestamp: string; // ISO string
  status: string;
  deliveryTimeMinutes?: number;
}

export interface StatsResponse {
  totalOrders: number;
  prevTotalOrders?: number;
  restaurantStats: RestaurantData[];
  driverStats: DriverData[];
  orders: OrderData[];
}

// ── Data Source helpers ───────────────────────────────────────────────────────
export type DataSource = 'demo' | 'live';

export const getDataSource = (): DataSource => {
  return (localStorage.getItem(STORAGE_KEY) as DataSource) || 'demo';
};

export const setDataSource = (source: DataSource) => {
  localStorage.setItem(STORAGE_KEY, source);
};

// ── Backend status ────────────────────────────────────────────────────────────
export interface BackendStatus {
  whatsapp: string;
  monitoredGroups: { id: string; type: string }[];
  logOnly: boolean;
  mode: string;
}

export const fetchBackendStatus = async (): Promise<BackendStatus | null> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
};

// ── Date range helper ─────────────────────────────────────────────────────────
export type Period = 'day' | 'week' | 'month' | 'custom';

export const getDateRange = (
  period: Period,
  customStart: string,
  customEnd: string,
  now = new Date()
) => {
  let startDate: Date, endDate: Date;

  if (period === 'day') {
    startDate = startOfDay(now);
    endDate = endOfDay(now);
  } else if (period === 'week') {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
    endDate = endOfDay(now);
  } else if (period === 'month') {
    startDate = startOfMonth(now);
    endDate = endOfDay(now);
  } else {
    startDate = startOfDay(parseISO(customStart));
    endDate = endOfDay(parseISO(customEnd));
  }

  return { startDate, endDate };
};

// ── DEMO DATA (mock) ──────────────────────────────────────────────────────────
export const fetchDemoStats = (startDate: Date, endDate: Date, prevStartDate: Date, prevEndDate: Date): StatsResponse => {
  const inRange = MOCK_ORDERS.filter(o =>
    o.timestamp >= startDate && o.timestamp <= endDate
  );
  const inPrevRange = MOCK_ORDERS.filter(o =>
    o.timestamp >= prevStartDate && o.timestamp <= prevEndDate
  );

  // Restaurantes
  const rStats: Record<string, number> = {};
  const prStats: Record<string, number> = {};
  inRange.forEach(o => rStats[o.restaurantId] = (rStats[o.restaurantId] || 0) + 1);
  inPrevRange.forEach(o => prStats[o.restaurantId] = (prStats[o.restaurantId] || 0) + 1);

  const restaurantStats: RestaurantData[] = MOCK_RESTAURANTS.map(r => {
    const current = rStats[r.id] || 0;
    const prev = prStats[r.id] || 0;
    const trend = prev === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - prev) / prev) * 100);
    return { id: r.id, name: r.name, location: r.location, orders: current, prevOrders: prev, trend, isInactive: current === 0 && prev > 0 };
  }).sort((a, b) => b.orders - a.orders);

  // Repartidores
  const dStats: Record<string, number> = {};
  const dTimes: Record<string, number[]> = {};
  inRange.forEach(o => {
    dStats[o.driverId] = (dStats[o.driverId] || 0) + 1;
    if (!dTimes[o.driverId]) dTimes[o.driverId] = [];
    dTimes[o.driverId].push(o.deliveryTimeMinutes);
  });

  const driverStats: DriverData[] = MOCK_DRIVERS.map(d => {
    const times = dTimes[d.id] || [];
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
    return {
      id: d.id,
      name: d.name,
      phone: d.phone,
      last_active: d.lastActive.toISOString(),
      orders: dStats[d.id] || 0,
      avgDeliveryTime: avg,
    };
  });

  const orders: OrderData[] = inRange.map(o => ({
    id: o.id,
    restaurantId: o.restaurantId,
    driverId: o.driverId,
    timestamp: o.timestamp.toISOString(),
    status: o.status,
    deliveryTimeMinutes: o.deliveryTimeMinutes,
  }));

  return { totalOrders: inRange.length, prevTotalOrders: inPrevRange.length, restaurantStats, driverStats, orders };
};

// ── LIVE DATA (backend API) ───────────────────────────────────────────────────
export const fetchLiveStats = async (
  startDate: Date,
  endDate: Date,
  prevStartDate: Date,
  prevEndDate: Date
): Promise<StatsResponse | null> => {
  try {
    const [currentRes, prevRes, driversRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/stats?since=${startDate.toISOString()}&until=${endDate.toISOString()}`),
      fetch(`${BACKEND_URL}/api/stats?since=${prevStartDate.toISOString()}&until=${prevEndDate.toISOString()}`),
      fetch(`${BACKEND_URL}/api/drivers`),
    ]);

    if (!currentRes.ok || !prevRes.ok || !driversRes.ok) return null;

    const current = await currentRes.json();
    const prev = await prevRes.json();
    const allDrivers: DriverData[] = await driversRes.json();

    // Enriquecer restaurantes con tendencia del período anterior
    const prevRestMap: Record<string, number> = {};
    (prev.restaurantStats || []).forEach((r: any) => {
      const rId = r.restaurant?.id || r.id;
      if (rId) prevRestMap[rId] = r.orders;
    });

    const restaurantStats: RestaurantData[] = (current.restaurantStats || []).map((r: any) => {
      const id = r.restaurant?.id || r.id;
      const name = r.restaurant?.name || r.name;
      const location = r.restaurant?.location || r.location;
      const orders = r.orders;
      
      const prevOrders = prevRestMap[id] || 0;
      const trend = prevOrders === 0 ? (orders > 0 ? 100 : 0) : Math.round(((orders - prevOrders) / prevOrders) * 100);
      return { id, name, location, orders, prevOrders, trend, isInactive: orders === 0 && prevOrders > 0 };
    });

    // Enriquecer repartidores con datos de last_active de todos los conductores conocidos
    const driverStatsMap: Record<string, number> = {};
    (current.driverStats || []).forEach((d: DriverData) => driverStatsMap[d.id] = d.orders);

    const driverStats: DriverData[] = allDrivers.map((d: DriverData) => ({
      ...d,
      orders: driverStatsMap[d.id] || 0,
      avgDeliveryTime: current.driverStats?.find((ds: DriverData) => ds.id === d.id)?.avgDeliveryTime ?? null,
    }));

    const orders: OrderData[] = (current.orders || []).map((o: any) => ({
      ...o,
      timestamp: o.created_at || o.timestamp, // Mapear el created_at de la DB al timestamp del frontend
    }));

    return { totalOrders: current.totalOrders, prevTotalOrders: prev.totalOrders, restaurantStats, driverStats, orders };
  } catch {
    return null;
  }
};

// ── Log de eventos (solo para modo LIVE, vista de auditoría) ─────────────────
export const fetchEvents = async (since?: string) => {
  const url = since
    ? `${BACKEND_URL}/api/events?since=${since}`
    : `${BACKEND_URL}/api/events`;
  const res = await fetch(url);
  return res.ok ? res.json() : [];
};
