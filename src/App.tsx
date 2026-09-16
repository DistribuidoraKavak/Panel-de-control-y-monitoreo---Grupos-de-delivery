import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts';
import { 
  Activity, AlertTriangle, Clock, 
  Store, User, Users, TrendingUp 
} from 'lucide-react';
import { format, differenceInDays, isAfter, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import { MOCK_DRIVERS, MOCK_ORDERS, MOCK_RESTAURANTS } from './mockData';
import './index.css';

type Period = 'day' | 'week' | 'month';

function App() {
  const [period, setPeriod] = useState<Period>('week');

  const now = new Date();

  // Filtrado de pedidos según período
  const filteredOrders = useMemo(() => {
    let startDate: Date;
    if (period === 'day') startDate = startOfDay(now);
    else if (period === 'week') startDate = startOfWeek(now, { weekStartsOn: 1 });
    else startDate = startOfMonth(now);

    return MOCK_ORDERS.filter(order => isAfter(order.timestamp, startDate));
  }, [period]);

  // Estadísticas de restaurantes
  const restaurantStats = useMemo(() => {
    const stats: Record<string, number> = {};
    filteredOrders.forEach(order => {
      stats[order.restaurantId] = (stats[order.restaurantId] || 0) + 1;
    });

    return MOCK_RESTAURANTS.map(rest => ({
      ...rest,
      orders: stats[rest.id] || 0
    })).sort((a, b) => b.orders - a.orders);
  }, [filteredOrders]);

  // Estadísticas de repartidores
  const driverStats = useMemo(() => {
    const stats: Record<string, number> = {};
    filteredOrders.forEach(order => {
      stats[order.driverId] = (stats[order.driverId] || 0) + 1;
    });

    return MOCK_DRIVERS.map(driver => {
      const daysInactive = differenceInDays(now, driver.lastActive);
      return {
        ...driver,
        orders: stats[driver.id] || 0,
        daysInactive,
        needsAlert: daysInactive >= 4
      };
    }).sort((a, b) => {
      if (a.needsAlert !== b.needsAlert) return a.needsAlert ? -1 : 1;
      return b.orders - a.orders;
    });
  }, [filteredOrders]);

  const totalOrders = filteredOrders.length;
  const activeDriversCount = driverStats.filter(d => !d.needsAlert).length;
  const alertDriversCount = driverStats.filter(d => d.needsAlert).length;

  return (
    <div className="app-container">
      {/* Header y Selector de Filtros */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '4px' }}>Panel de Operaciones</h1>
          <p className="text-muted">
            {format(now, "d 'de' MMMM, yyyy", { locale: es })}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn ${period === 'day' ? 'btn-outline active' : 'btn-outline'}`} 
            onClick={() => setPeriod('day')}
          >
            Hoy
          </button>
          <button 
            className={`btn ${period === 'week' ? 'btn-outline active' : 'btn-outline'}`} 
            onClick={() => setPeriod('week')}
          >
            Esta Semana
          </button>
          <button 
            className={`btn ${period === 'month' ? 'btn-outline active' : 'btn-outline'}`} 
            onClick={() => setPeriod('month')}
          >
            Este Mes
          </button>
        </div>
      </header>

      {/* Tarjetas de Resumen (KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '16px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px' }}>
            <Activity size={28} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Pedidos</p>
            <p style={{ fontSize: '1.875rem', fontWeight: 700 }}>{totalOrders}</p>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '16px', backgroundColor: 'var(--success-bg)', color: 'var(--success)', borderRadius: '12px' }}>
            <Users size={28} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Repartidores Activos</p>
            <p style={{ fontSize: '1.875rem', fontWeight: 700 }}>{activeDriversCount}</p>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', border: alertDriversCount > 0 ? '1px solid var(--danger-border)' : '' }}>
          <div style={{ padding: '16px', backgroundColor: alertDriversCount > 0 ? 'var(--danger-bg)' : '#f1f5f9', color: alertDriversCount > 0 ? 'var(--danger)' : 'var(--text-muted)', borderRadius: '12px' }}>
            <AlertTriangle size={28} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Alertas de Inactividad</p>
            <p style={{ fontSize: '1.875rem', fontWeight: 700, color: alertDriversCount > 0 ? 'var(--danger)' : 'inherit' }}>
              {alertDriversCount}
            </p>
          </div>
        </div>
      </div>

      {/* Grilla principal de reportes */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '32px' }}>
        
        {/* Gráfico de Locales */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Store size={20} color="var(--primary)" />
            <h2 style={{ fontSize: '1.125rem' }}>Volumen por Local</h2>
          </div>
          <div style={{ height: '280px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={restaurantStats} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={130} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)' }}
                />
                <Bar dataKey="orders" name="Pedidos" radius={[0, 4, 4, 0]}>
                  {restaurantStats.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--primary)' : '#93c5fd'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Locales */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} color="var(--success)" />
            <h2 style={{ fontSize: '1.125rem' }}>Top Locales</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {restaurantStats.slice(0, 4).map((rest, idx) => (
              <div key={rest.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: idx !== 3 ? '16px' : '0', borderBottom: idx !== 3 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: idx === 0 ? 'var(--primary)' : '#f1f5f9', color: idx === 0 ? 'white' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                    {idx + 1}
                  </div>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>{rest.name}</p>
                    <p className="text-muted" style={{ fontSize: '0.8rem' }}>{rest.location}</p>
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                  {rest.orders}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de Repartidores */}
      <div className="card" style={{ padding: '0' }}>
        <div className="card-header" style={{ margin: '0', padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} color="var(--primary)" />
            Estado del Equipo de Repartidores
          </h2>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Repartidor</th>
                <th>Teléfono</th>
                <th>Pedidos (Período)</th>
                <th>Última Actividad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {driverStats.map((driver) => (
                <tr key={driver.id} className={driver.needsAlert ? 'alert-row' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 500 }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={16} color="var(--text-secondary)" />
                      </div>
                      {driver.name}
                    </div>
                  </td>
                  <td className="text-secondary">{driver.phone}</td>
                  <td style={{ fontWeight: 600 }}>{driver.orders}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: driver.needsAlert ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      <Clock size={14} />
                      {format(driver.lastActive, "d MMM, HH:mm", { locale: es })}
                      <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                        ({driver.daysInactive === 0 ? 'Hoy' : `Hace ${driver.daysInactive} días`})
                      </span>
                    </div>
                  </td>
                  <td>
                    {driver.needsAlert ? (
                      <span className="badge danger">
                        <AlertTriangle size={12} style={{ marginRight: '4px' }} />
                        Inactivo (+4 días)
                      </span>
                    ) : (
                      <span className="badge success">
                        Activo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
