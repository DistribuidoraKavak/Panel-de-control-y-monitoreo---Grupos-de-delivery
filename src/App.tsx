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

  // Filtro de órdenes según el período seleccionado
  const filteredOrders = useMemo(() => {
    let startDate: Date;
    if (period === 'day') startDate = startOfDay(now);
    else if (period === 'week') startDate = startOfWeek(now, { weekStartsOn: 1 });
    else startDate = startOfMonth(now);

    return MOCK_ORDERS.filter(order => isAfter(order.timestamp, startDate));
  }, [period]);

  // Actividad por restaurante
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

  // Actividad por repartidor
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
    <div className="w-full flex" style={{ width: '100%' }}>
      {/* Sidebar Navigation */}
      <aside className="glass-panel" style={{ width: '280px', margin: '16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-gradient" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem' }}>
            <Activity size={24} color="#3b82f6" />
            Control Hub
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Monitoreo en tiempo real
          </p>
        </div>
        
        <nav style={{ padding: '20px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn-ghost active" style={{ justifyContent: 'flex-start', padding: '12px' }}>
            <Activity size={18} /> Resumen General
          </button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px' }}>
            <Store size={18} /> Locales
          </button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px', position: 'relative' }}>
            <Users size={18} /> Repartidores
            {alertDriversCount > 0 && (
              <span style={{ position: 'absolute', right: '12px', background: 'var(--danger)', color: 'white', borderRadius: '99px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                {alertDriversCount}
              </span>
            )}
          </button>
        </nav>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 'bold' }}>
              D
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Dueño</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Admin panel</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '16px 32px 32px 16px', overflowY: 'auto' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '2rem' }}>Panel de Monitoreo</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Visión general de la operación — {format(now, "d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          
          <div className="glass-panel" style={{ display: 'flex', padding: '4px', gap: '4px' }}>
            <button 
              className={`btn ${period === 'day' ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={() => setPeriod('day')}
            >
              Hoy
            </button>
            <button 
              className={`btn ${period === 'week' ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={() => setPeriod('week')}
            >
              Esta Semana
            </button>
            <button 
              className={`btn ${period === 'month' ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={() => setPeriod('month')}
            >
              Este Mes
            </button>
          </div>
        </header>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
          <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Total Pedidos</p>
                <h2 style={{ fontSize: '2.5rem', margin: 0 }}>{totalOrders}</h2>
              </div>
              <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', color: '#3b82f6' }}>
                <Activity size={24} />
              </div>
            </div>
          </div>

          <div className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Repartidores Activos</p>
                <h2 style={{ fontSize: '2.5rem', margin: 0 }}>{activeDriversCount}</h2>
              </div>
              <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: '#10b981' }}>
                <Users size={24} />
              </div>
            </div>
          </div>

          <div className="card animate-fade-in" style={{ animationDelay: '0.3s', border: alertDriversCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Alertas de Inactividad</p>
                <h2 style={{ fontSize: '2.5rem', margin: 0, color: alertDriversCount > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                  {alertDriversCount}
                </h2>
              </div>
              <div style={{ padding: '12px', background: alertDriversCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)', borderRadius: '12px', color: alertDriversCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                <AlertTriangle size={24} />
              </div>
            </div>
            {alertDriversCount > 0 && (
              <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} /> {alertDriversCount} repartidores con +4 días inactivos
              </p>
            )}
          </div>
        </div>

        {/* Charts & Tables Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          
          {/* Actividad de Restaurantes */}
          <div className="glass-panel animate-fade-in" style={{ padding: '24px', animationDelay: '0.4s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Store size={20} color="#3b82f6" /> 
                Actividad por Local
              </h3>
            </div>
            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={restaurantStats} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={120} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    contentStyle={{ backgroundColor: 'var(--bg-surface-solid)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
                  />
                  <Bar dataKey="orders" name="Pedidos Generados" radius={[0, 4, 4, 0]}>
                    {restaurantStats.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : 'rgba(59, 130, 246, 0.4)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ranking List */}
          <div className="glass-panel animate-fade-in" style={{ padding: '24px', animationDelay: '0.5s' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
              <TrendingUp size={20} color="#10b981" /> 
              Top Restaurantes
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {restaurantStats.slice(0, 5).map((rest, idx) => (
                <div key={rest.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: idx !== 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: idx === 0 ? 'var(--primary)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500 }}>{rest.name}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rest.location}</p>
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {rest.orders}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Repartidores Status */}
          <div className="glass-panel animate-fade-in" style={{ padding: '24px', gridColumn: '1 / -1', animationDelay: '0.6s', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={20} color="#8b5cf6" /> 
                Monitoreo de Repartidores
              </h3>
            </div>
            
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Repartidor</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Contacto</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Pedidos (Período)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Última Actividad</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map((driver) => (
                    <tr key={driver.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s', backgroundColor: driver.needsAlert ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                      <td style={{ padding: '16px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={18} color="var(--text-secondary)" />
                        </div>
                        {driver.name}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                        {driver.phone}
                      </td>
                      <td style={{ padding: '16px', fontWeight: 600 }}>
                        {driver.orders}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: driver.needsAlert ? '#ef4444' : 'var(--text-secondary)' }}>
                          <Clock size={16} />
                          {format(driver.lastActive, "d MMM, HH:mm", { locale: es })}
                          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                            ({driver.daysInactive === 0 ? 'Hoy' : `Hace ${driver.daysInactive} días`})
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
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

      </main>
    </div>
  );
}

export default App;
