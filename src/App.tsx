import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts';
import { 
  Activity, AlertTriangle, Clock, Search,
  Store, Users, CheckCircle, Package, ArrowUpRight, ArrowDownRight, MapPin
} from 'lucide-react';
import { format, differenceInDays, isAfter, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import { MOCK_DRIVERS, MOCK_ORDERS, MOCK_RESTAURANTS } from './mockData';
import './index.css';

type Period = 'day' | 'week' | 'month';
type Tab = 'overview' | 'restaurants' | 'drivers';

// Helper to get initials and color for Avatar
const getAvatarConfig = (name: string, id: string) => {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const colors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e'];
  const charCodeSum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return { initials, color: colors[charCodeSum % colors.length] };
};

export default function App() {
  const [period, setPeriod] = useState<Period>('week');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  const now = new Date();

  // Scroll effect for header
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      setScrolled(target.scrollTop > 10);
    };
    const mainContent = document.getElementById('main-content');
    mainContent?.addEventListener('scroll', handleScroll);
    return () => mainContent?.removeEventListener('scroll', handleScroll);
  }, []);

  // Filter orders by period
  const filteredOrders = useMemo(() => {
    let startDate: Date;
    if (period === 'day') startDate = startOfDay(now);
    else if (period === 'week') startDate = startOfWeek(now, { weekStartsOn: 1 });
    else startDate = startOfMonth(now);
    return MOCK_ORDERS.filter(order => isAfter(order.timestamp, startDate));
  }, [period]);

  // Restaurant Stats
  const restaurantStats = useMemo(() => {
    const stats: Record<string, number> = {};
    filteredOrders.forEach(order => {
      stats[order.restaurantId] = (stats[order.restaurantId] || 0) + 1;
    });

    return MOCK_RESTAURANTS.map(rest => {
      const orders = stats[rest.id] || 0;
      // Mock trend for visual completeness based on ID
      const trendValue = (rest.id.charCodeAt(1) % 5) * 4 - 5; 
      return {
        ...rest,
        orders,
        trend: trendValue
      };
    }).sort((a, b) => b.orders - a.orders);
  }, [filteredOrders]);

  // Driver Stats
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
    });
  }, [filteredOrders]);

  // Search and Sort Drivers for Table
  const displayDrivers = useMemo(() => {
    let result = [...driverStats];
    if (searchQuery) {
      result = result.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    // Sort: Alerts first, then by orders
    result.sort((a, b) => {
      if (a.needsAlert !== b.needsAlert) return a.needsAlert ? -1 : 1;
      return b.orders - a.orders;
    });
    return result;
  }, [driverStats, searchQuery]);

  const totalOrders = filteredOrders.length;
  const activeDriversCount = driverStats.filter(d => !d.needsAlert).length;
  const alertDriversCount = driverStats.filter(d => d.needsAlert).length;

  return (
    <div className="layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={24} strokeWidth={2.5} />
          </div>
          <span className="brand-name">DeliveryHub</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button 
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Activity size={18} /> Resumen General
          </button>
          <button 
            className={`nav-item ${activeTab === 'restaurants' ? 'active' : ''}`}
            onClick={() => setActiveTab('restaurants')}
          >
            <Store size={18} /> Locales y Volumen
          </button>
          <button 
            className={`nav-item ${activeTab === 'drivers' ? 'active' : ''}`}
            onClick={() => setActiveTab('drivers')}
          >
            <Users size={18} /> Equipo de Reparto
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main id="main-content" className="main-content">
        
        {/* Sticky Header */}
        <header className={`header ${scrolled ? 'scrolled' : ''}`}>
          <div>
            <h1 className="page-title">
              {activeTab === 'overview' && 'Resumen Operativo'}
              {activeTab === 'restaurants' && 'Análisis de Locales'}
              {activeTab === 'drivers' && 'Monitoreo de Repartidores'}
            </h1>
            <p className="page-subtitle">Actualizado al {format(now, "d 'de' MMMM", { locale: es })}</p>
          </div>
          
          <div className="toggle-group">
            <button className={`toggle-btn ${period === 'day' ? 'active' : ''}`} onClick={() => setPeriod('day')}>Hoy</button>
            <button className={`toggle-btn ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Esta Semana</button>
            <button className={`toggle-btn ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Este Mes</button>
          </div>
        </header>

        <div className="content-area animate-enter">
          
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* KPIs */}
              <div className="kpi-grid">
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="kpi-icon-wrap" style={{ backgroundColor: 'var(--brand-50)', color: 'var(--brand-600)' }}>
                        <Package size={24} />
                      </div>
                      <p className="kpi-label">Volumen Total</p>
                      <p className="kpi-value">{totalOrders}</p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="kpi-icon-wrap" style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
                        <Users size={24} />
                      </div>
                      <p className="kpi-label">Repartidores Activos</p>
                      <p className="kpi-value">{activeDriversCount}</p>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ borderColor: alertDriversCount > 0 ? 'var(--status-danger-bg)' : 'var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="kpi-icon-wrap" style={{ backgroundColor: alertDriversCount > 0 ? 'var(--status-danger-bg)' : '#f1f5f9', color: alertDriversCount > 0 ? 'var(--status-danger)' : 'var(--text-muted)' }}>
                        <AlertTriangle size={24} />
                      </div>
                      <p className="kpi-label">Alertas Críticas (+4 días)</p>
                      <p className="kpi-value" style={{ color: alertDriversCount > 0 ? 'var(--status-danger)' : 'inherit' }}>
                        {alertDriversCount}
                      </p>
                    </div>
                  </div>
                  {alertDriversCount === 0 && (
                    <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={14} /> Equipo al día
                    </p>
                  )}
                </div>
              </div>

              {/* Sub-grid Overview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div className="card">
                  <div className="card-title"><Store size={18} color="var(--brand-500)"/> Locales de mayor volumen</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {restaurantStats.slice(0, 4).map((rest, idx) => (
                      <div key={rest.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: idx !== 3 ? '16px' : '0', borderBottom: idx !== 3 ? '1px solid var(--border-light)' : 'none' }}>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>{rest.name}</p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rest.location}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{rest.orders}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="card">
                  <div className="card-title"><AlertTriangle size={18} color="var(--status-danger)"/> Atención Requerida</div>
                  {alertDriversCount === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><CheckCircle size={32} /></div>
                      <h4>Todo en orden</h4>
                      <p style={{ fontSize: '0.875rem', marginTop: '4px' }}>No hay repartidores con alertas de inactividad.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {driverStats.filter(d => d.needsAlert).map(d => {
                        const { initials, color } = getAvatarConfig(d.name, d.id);
                        return (
                          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--status-danger-bg)', borderRadius: 'var(--radius-md)' }}>
                            <div className="avatar" style={{ backgroundColor: color }}>{initials}</div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 600, color: 'var(--status-danger-text)' }}>{d.name}</p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--status-danger-text)', opacity: 0.8 }}>Inactivo hace {d.daysInactive} días</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB: RESTAURANTS */}
          {activeTab === 'restaurants' && (
            <div className="card">
              <div className="card-title"><Store size={18} color="var(--brand-500)"/> Distribución de Pedidos por Local</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '32px', marginTop: '24px' }}>
                <div style={{ height: '400px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={restaurantStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val.split(' ')[0]} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{ fill: 'var(--bg-surface-hover)' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }}
                      />
                      <Bar dataKey="orders" name="Pedidos" radius={[4, 4, 0, 0]} barSize={40}>
                        {restaurantStats.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--brand-600)' : 'var(--brand-100)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div style={{ borderLeft: '1px solid var(--border-light)', paddingLeft: '24px' }}>
                  <h4 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Tendencias</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {restaurantStats.map((rest) => (
                      <div key={rest.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MapPin size={14} color="var(--text-muted)" />
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{rest.name.split(' ')[0]}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', fontWeight: 600, color: rest.trend >= 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                          {rest.trend > 0 ? <ArrowUpRight size={16} /> : (rest.trend < 0 ? <ArrowDownRight size={16} /> : null)}
                          {Math.abs(rest.trend)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DRIVERS */}
          {activeTab === 'drivers' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Directorio y Estado</h2>
                
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input 
                    type="text" 
                    className="search-input" 
                    placeholder="Buscar repartidor por nombre..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="data-table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Repartidor</th>
                      <th>Contacto</th>
                      <th>Pedidos Tomados</th>
                      <th>Última Actividad</th>
                      <th>Estado Operativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayDrivers.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                          No se encontraron repartidores con ese nombre.
                        </td>
                      </tr>
                    ) : (
                      displayDrivers.map((driver) => {
                        const { initials, color } = getAvatarConfig(driver.name, driver.id);
                        return (
                          <tr key={driver.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div className="avatar" style={{ backgroundColor: color }}>{initials}</div>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{driver.name}</span>
                              </div>
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>{driver.phone}</td>
                            <td>
                              <span style={{ fontWeight: 600 }}>{driver.orders}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: driver.needsAlert ? 'var(--status-danger)' : 'var(--text-body)' }}>
                                <Clock size={14} />
                                {format(driver.lastActive, "d MMM, HH:mm", { locale: es })}
                              </div>
                            </td>
                            <td>
                              {driver.needsAlert ? (
                                <span className="badge badge-danger">
                                  <AlertTriangle size={12} />
                                  Alerta (+4 días)
                                </span>
                              ) : (
                                <span className="badge badge-success">
                                  Activo
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
