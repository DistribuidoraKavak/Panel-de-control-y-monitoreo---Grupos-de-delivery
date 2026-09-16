import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { 
  Activity, AlertTriangle, Clock, Search,
  Store, Users, CheckCircle, Package, ArrowUpRight, ArrowDownRight, MapPin,
  Download, Calendar, ArrowLeft, ChevronUp, ChevronDown
} from 'lucide-react';
import { 
  format, differenceInDays, isAfter, isBefore, startOfDay, startOfWeek, startOfMonth,
  subDays, subWeeks, subMonths, endOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';

import { MOCK_DRIVERS, MOCK_ORDERS, MOCK_RESTAURANTS } from './mockData';
import './index.css';

type Period = 'day' | 'week' | 'month' | 'custom';
type Tab = 'overview' | 'restaurants' | 'drivers';
type SortField = 'name' | 'orders' | 'lastActive' | 'status';

// Helper to get initials and color for Avatar
const getAvatarConfig = (name: string, id: string) => {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const colors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e'];
  const charCodeSum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return { initials, color: colors[charCodeSum % colors.length] };
};

export default function App() {
  const [period, setPeriod] = useState<Period>('week');
  const [customStart, setCustomStart] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [scrolled, setScrolled] = useState(false);
  
  // Detalle views
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

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

  // Time boundaries calculation
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    let sDate = new Date();
    let eDate = endOfDay(now);
    let pSDate = new Date();
    let pEDate = new Date();

    if (period === 'day') {
      sDate = startOfDay(now);
      pSDate = subDays(sDate, 1);
      pEDate = endOfDay(pSDate);
    } else if (period === 'week') {
      sDate = startOfWeek(now, { weekStartsOn: 1 });
      pSDate = subWeeks(sDate, 1);
      pEDate = subDays(sDate, 1);
    } else if (period === 'month') {
      sDate = startOfMonth(now);
      pSDate = subMonths(sDate, 1);
      pEDate = subDays(sDate, 1);
    } else {
      sDate = startOfDay(new Date(customStart));
      eDate = endOfDay(new Date(customEnd));
      const diff = differenceInDays(eDate, sDate);
      pSDate = subDays(sDate, diff + 1);
      pEDate = subDays(eDate, diff + 1);
    }
    return { startDate: sDate, endDate: eDate, prevStartDate: pSDate, prevEndDate: pEDate };
  }, [period, customStart, customEnd, now]);

  // Main filters
  const filteredOrders = useMemo(() => {
    return MOCK_ORDERS.filter(order => isAfter(order.timestamp, startDate) && isBefore(order.timestamp, endDate));
  }, [startDate, endDate]);

  const prevFilteredOrders = useMemo(() => {
    return MOCK_ORDERS.filter(order => isAfter(order.timestamp, prevStartDate) && isBefore(order.timestamp, prevEndDate));
  }, [prevStartDate, prevEndDate]);

  // Derived Stats
  const { 
    restaurantStats, driverStats, 
    totalOrders, prevTotalOrders, 
    activeDriversCount, prevActiveDriversCount, 
    alertDriversCount, inactiveRestaurantsCount,
    ordersByDate
  } = useMemo(() => {
    
    // Agrupar por restaurante
    const rStats: Record<string, number> = {};
    const pRStats: Record<string, number> = {};
    filteredOrders.forEach(o => rStats[o.restaurantId] = (rStats[o.restaurantId] || 0) + 1);
    prevFilteredOrders.forEach(o => pRStats[o.restaurantId] = (pRStats[o.restaurantId] || 0) + 1);

    const rStatsArr = MOCK_RESTAURANTS.map(rest => {
      const current = rStats[rest.id] || 0;
      const prev = pRStats[rest.id] || 0;
      const trend = prev === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - prev) / prev) * 100);
      return { ...rest, orders: current, prevOrders: prev, trend, isInactive: current === 0 && prev > 0 };
    }).sort((a, b) => b.orders - a.orders);

    // Agrupar por repartidor
    const dStats: Record<string, number> = {};
    filteredOrders.forEach(o => dStats[o.driverId] = (dStats[o.driverId] || 0) + 1);
    
    const pDStats: Record<string, number> = {};
    prevFilteredOrders.forEach(o => pDStats[o.driverId] = (pDStats[o.driverId] || 0) + 1);

    const dStatsArr = MOCK_DRIVERS.map(driver => {
      const daysInactive = differenceInDays(now, driver.lastActive);
      return {
        ...driver,
        orders: dStats[driver.id] || 0,
        daysInactive,
        needsAlert: daysInactive >= 4
      };
    });

    // Agrupar por fecha para gráficos de línea (General)
    const dateMap: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const dateStr = format(o.timestamp, 'MMM dd');
      dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
    });
    const ordersByDateArr = Object.keys(dateMap).map(date => ({ date, pedidos: dateMap[date] })).reverse();

    return {
      restaurantStats: rStatsArr,
      driverStats: dStatsArr,
      totalOrders: filteredOrders.length,
      prevTotalOrders: prevFilteredOrders.length,
      activeDriversCount: Object.keys(dStats).length,
      prevActiveDriversCount: Object.keys(pDStats).length,
      alertDriversCount: dStatsArr.filter(d => d.needsAlert).length,
      inactiveRestaurantsCount: rStatsArr.filter(r => r.isInactive || r.trend <= -50).length,
      ordersByDate: ordersByDateArr
    };
  }, [filteredOrders, prevFilteredOrders, now]);

  // Insights automáticos
  const autoInsight = useMemo(() => {
    if (totalOrders === 0) return "No hay actividad registrada en este período.";
    const topRest = restaurantStats[0];
    const topDriver = driverStats.slice().sort((a, b) => b.orders - a.orders)[0];
    const percent = Math.round((topRest.orders / totalOrders) * 100);
    return `El local ${topRest.name} concentró el ${percent}% del volumen de pedidos. Por otro lado, el repartidor más activo fue ${topDriver.name} con ${topDriver.orders} entregas exitosas.`;
  }, [totalOrders, restaurantStats, driverStats]);

  // Orden y búsqueda de repartidores
  const displayDrivers = useMemo(() => {
    let result = [...driverStats];
    if (searchQuery) {
      result = result.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    result.sort((a, b) => {
      let valA, valB;
      if (sortField === 'name') { valA = a.name; valB = b.name; }
      else if (sortField === 'orders') { valA = a.orders; valB = b.orders; }
      else if (sortField === 'lastActive') { valA = a.lastActive.getTime(); valB = b.lastActive.getTime(); }
      else { // status
        if (a.needsAlert !== b.needsAlert) return sortAsc ? (a.needsAlert ? 1 : -1) : (a.needsAlert ? -1 : 1);
        valA = a.orders; valB = b.orders;
      }
      
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [driverStats, searchQuery, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  // Exportar reporte CSV
  const exportCSV = () => {
    const headers = ['ID Pedido', 'Restaurante', 'Repartidor', 'Fecha', 'Estado'];
    const rows = filteredOrders.map(o => {
      const rName = MOCK_RESTAURANTS.find(r => r.id === o.restaurantId)?.name || 'N/A';
      const dName = MOCK_DRIVERS.find(d => d.id === o.driverId)?.name || 'N/A';
      return [o.id, rName, dName, format(o.timestamp, 'yyyy-MM-dd HH:mm'), o.status];
    });
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_delivery_${format(startDate, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Vistas de detalle
  if (selectedRestaurantId) {
    const rest = restaurantStats.find(r => r.id === selectedRestaurantId)!;
    const rOrders = filteredOrders.filter(o => o.restaurantId === selectedRestaurantId);
    
    // Aggregation for restaurant line chart
    const dMap: Record<string, number> = {};
    rOrders.forEach(o => {
      const dStr = format(o.timestamp, 'MMM dd');
      dMap[dStr] = (dMap[dStr] || 0) + 1;
    });
    const rChartData = Object.keys(dMap).map(d => ({ date: d, pedidos: dMap[d] })).reverse();

    // Top drivers for this restaurant
    const dCount: Record<string, number> = {};
    rOrders.forEach(o => dCount[o.driverId] = (dCount[o.driverId] || 0) + 1);
    const topDrivers = Object.keys(dCount)
      .map(id => ({ driver: MOCK_DRIVERS.find(d => d.id === id)!, count: dCount[id] }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);

    return (
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon"><Activity size={24} strokeWidth={2.5} /></div>
            <span className="brand-name">DeliveryHub</span>
          </div>
          <button className="btn btn-outline" onClick={() => setSelectedRestaurantId(null)} style={{ margin: '16px', display: 'flex', gap: '8px' }}>
            <ArrowLeft size={16} /> Volver al Panel
          </button>
        </aside>
        <main className="main-content">
          <div className="content-area animate-enter" style={{ paddingTop: '40px' }}>
            <h1 className="page-title">{rest.name}</h1>
            <p className="text-muted" style={{ marginBottom: '32px' }}>
              <MapPin size={14} style={{ display: 'inline', marginRight: '4px' }}/>{rest.location}
            </p>
            
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-title">Evolución de pedidos del local</div>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }} />
                    <Line type="monotone" dataKey="pedidos" stroke="var(--brand-600)" strokeWidth={3} dot={{ r: 4, fill: 'var(--brand-600)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Repartidores más frecuentes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {topDrivers.length === 0 ? <p className="text-muted">No hay pedidos en este período.</p> : null}
                {topDrivers.map(td => {
                  const { initials, color } = getAvatarConfig(td.driver.name, td.driver.id);
                  return (
                    <div key={td.driver.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="avatar" style={{ backgroundColor: color }}>{initials}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600 }}>{td.driver.name}</p>
                      </div>
                      <div style={{ fontWeight: 700 }}>{td.count} pedidos</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (selectedDriverId) {
    const driver = driverStats.find(d => d.id === selectedDriverId)!;
    const dOrders = filteredOrders.filter(o => o.driverId === selectedDriverId);
    
    // Aggregation for driver line chart
    const dMap: Record<string, number> = {};
    dOrders.forEach(o => {
      const dStr = format(o.timestamp, 'MMM dd');
      dMap[dStr] = (dMap[dStr] || 0) + 1;
    });
    const dChartData = Object.keys(dMap).map(d => ({ date: d, pedidos: dMap[d] })).reverse();

    // Top restaurants for this driver
    const rCount: Record<string, number> = {};
    dOrders.forEach(o => rCount[o.restaurantId] = (rCount[o.restaurantId] || 0) + 1);
    const topRests = Object.keys(rCount)
      .map(id => ({ rest: MOCK_RESTAURANTS.find(r => r.id === id)!, count: rCount[id] }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);
      
    const { initials, color } = getAvatarConfig(driver.name, driver.id);

    return (
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon"><Activity size={24} strokeWidth={2.5} /></div>
            <span className="brand-name">DeliveryHub</span>
          </div>
          <button className="btn btn-outline" onClick={() => setSelectedDriverId(null)} style={{ margin: '16px', display: 'flex', gap: '8px' }}>
            <ArrowLeft size={16} /> Volver al Panel
          </button>
        </aside>
        <main className="main-content">
          <div className="content-area animate-enter" style={{ paddingTop: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
              <div className="avatar" style={{ backgroundColor: color, width: '64px', height: '64px', fontSize: '1.5rem' }}>{initials}</div>
              <div>
                <h1 className="page-title">{driver.name}</h1>
                <p className="text-muted">{driver.phone} • {driver.needsAlert ? 'En Alerta' : 'Activo'}</p>
              </div>
            </div>
            
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-title">Consistencia de trabajo</div>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }} />
                    <Line type="stepAfter" dataKey="pedidos" stroke="var(--status-success)" strokeWidth={3} dot={{ r: 4, fill: 'var(--status-success)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Restaurantes de los que más retira</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {topRests.length === 0 ? <p className="text-muted">No ha tomado pedidos en este período.</p> : null}
                {topRests.map(tr => (
                  <div key={tr.rest.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
                    <div>
                      <p style={{ fontWeight: 600 }}>{tr.rest.name}</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><MapPin size={12} style={{display:'inline'}}/> {tr.rest.location}</p>
                    </div>
                    <div style={{ fontWeight: 700 }}>{tr.count} pedidos</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // TREND CALC HELPER
  const renderTrend = (current: number, prev: number) => {
    if (prev === 0) return null;
    const diff = current - prev;
    const pct = Math.round((Math.abs(diff) / prev) * 100);
    const isUp = diff > 0;
    const isNeutral = diff === 0;
    if (isNeutral) return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Mismo volumen</span>;
    return (
      <span style={{ fontSize: '0.85rem', color: isUp ? 'var(--status-success)' : 'var(--status-danger)', display: 'inline-flex', alignItems: 'center', marginLeft: '8px' }}>
        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {pct}% vs ant.
      </span>
    );
  };

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
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-outline" onClick={exportCSV} style={{ display: 'flex', gap: '6px' }}>
              <Download size={16} /> Exportar Reporte
            </button>

            <div className="toggle-group" style={{ display: 'flex', alignItems: 'center' }}>
              <button className={`toggle-btn ${period === 'day' ? 'active' : ''}`} onClick={() => setPeriod('day')}>Hoy</button>
              <button className={`toggle-btn ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Semana</button>
              <button className={`toggle-btn ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Mes</button>
              <button className={`toggle-btn ${period === 'custom' ? 'active' : ''}`} onClick={() => setPeriod('custom')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14}/> Rango
              </button>
            </div>
          </div>
        </header>

        {period === 'custom' && (
          <div style={{ padding: '16px 40px', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Rango personalizado:</span>
            <input type="date" className="search-input" style={{ width: 'auto', padding: '8px' }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span>hasta</span>
            <input type="date" className="search-input" style={{ width: 'auto', padding: '8px' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}

        <div className="content-area animate-enter" style={{ paddingTop: '24px' }}>
          
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* Insight Text */}
              <div className="card" style={{ marginBottom: '24px', backgroundColor: 'var(--brand-50)', borderColor: 'var(--brand-100)' }}>
                <p style={{ color: 'var(--brand-900)', fontWeight: 500, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} /> {autoInsight}
                </p>
              </div>

              {/* KPIs */}
              <div className="kpi-grid">
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="kpi-icon-wrap" style={{ backgroundColor: 'var(--brand-50)', color: 'var(--brand-600)' }}>
                        <Package size={24} />
                      </div>
                      <p className="kpi-label">Volumen Total</p>
                      <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <p className="kpi-value">{totalOrders}</p>
                        {renderTrend(totalOrders, prevTotalOrders)}
                      </div>
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
                      <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <p className="kpi-value">{activeDriversCount}</p>
                        {renderTrend(activeDriversCount, prevActiveDriversCount)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ borderColor: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger-bg)' : 'var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="kpi-icon-wrap" style={{ backgroundColor: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger-bg)' : '#f1f5f9', color: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger)' : 'var(--text-muted)' }}>
                        <AlertTriangle size={24} />
                      </div>
                      <p className="kpi-label">Alertas Críticas</p>
                      <p className="kpi-value" style={{ color: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger)' : 'inherit' }}>
                        {alertDriversCount + inactiveRestaurantsCount}
                      </p>
                    </div>
                  </div>
                  {alertDriversCount === 0 && inactiveRestaurantsCount === 0 && (
                    <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={14} /> Operación saludable
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
                      <div key={rest.id} onClick={() => setSelectedRestaurantId(rest.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: idx !== 3 ? '16px' : '0', borderBottom: idx !== 3 ? '1px solid var(--border-light)' : 'none', cursor: 'pointer' }}>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--brand-700)' }}>{rest.name}</p>
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
                  {alertDriversCount === 0 && inactiveRestaurantsCount === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><CheckCircle size={32} /></div>
                      <h4>Todo en orden</h4>
                      <p style={{ fontSize: '0.875rem', marginTop: '4px' }}>No hay locales ni repartidores con baja actividad.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {restaurantStats.filter(r => r.isInactive || r.trend <= -50).map(r => (
                        <div key={r.id} onClick={() => setSelectedRestaurantId(r.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--status-warning-bg)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                          <div className="avatar" style={{ backgroundColor: 'var(--status-warning)' }}><Store size={16}/></div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, color: 'var(--status-warning-text)' }}>{r.name}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--status-warning-text)', opacity: 0.8 }}>Caída del {Math.abs(r.trend)}% en volumen</p>
                          </div>
                        </div>
                      ))}
                      {driverStats.filter(d => d.needsAlert).map(d => {
                        const { initials, color } = getAvatarConfig(d.name, d.id);
                        return (
                          <div key={d.id} onClick={() => setSelectedDriverId(d.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--status-danger-bg)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
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
            <>
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-title"><Activity size={18} color="var(--brand-500)"/> Evolución global del volumen (Día a Día)</div>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ordersByDate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }} />
                      <Line type="monotone" dataKey="pedidos" stroke="var(--brand-600)" strokeWidth={3} dot={{ r: 4, fill: 'var(--brand-600)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-title"><Store size={18} color="var(--brand-500)"/> Comparativa de Locales (clic para detalle)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '32px', marginTop: '24px' }}>
                  <div style={{ height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={restaurantStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                        <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val.split(' ')[0]} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: 'var(--bg-surface-hover)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }} />
                        <Bar dataKey="orders" name="Pedidos" radius={[4, 4, 0, 0]} barSize={40}>
                          {restaurantStats.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--brand-600)' : 'var(--brand-100)'} style={{ cursor: 'pointer' }} onClick={() => setSelectedRestaurantId(restaurantStats[index].id)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div style={{ borderLeft: '1px solid var(--border-light)', paddingLeft: '24px' }}>
                    <h4 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Crecimiento</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {restaurantStats.map((rest) => (
                        <div key={rest.id} onClick={() => setSelectedRestaurantId(rest.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={14} color="var(--text-muted)" />
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-700)' }}>{rest.name.split(' ')[0]}</span>
                          </div>
                          {renderTrend(rest.orders, rest.prevOrders)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: DRIVERS */}
          {activeTab === 'drivers' && (
            <>
              {/* Visual Ranking */}
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-title"><Activity size={18} color="var(--status-success)"/> Top 3 Repartidores del Período</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {driverStats.slice().sort((a,b) => b.orders - a.orders).slice(0,3).map((d, i) => {
                    const { initials, color } = getAvatarConfig(d.name, d.id);
                    return (
                      <div key={d.id} onClick={() => setSelectedDriverId(d.id)} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', cursor: 'pointer', backgroundColor: i === 0 ? 'var(--brand-50)' : 'transparent' }}>
                        <div className="avatar" style={{ backgroundColor: color, width: '48px', height: '48px', fontSize: '1.2rem' }}>{initials}</div>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {i === 0 && <span style={{ color: '#f59e0b' }}>🏆</span>} {d.name}
                          </p>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{d.orders} pedidos entregados</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Directorio Completo (clic para detalle)</h2>
                  
                  <div className="search-input-wrapper">
                    <Search size={18} className="search-icon" />
                    <input 
                      type="text" 
                      className="search-input" 
                      placeholder="Buscar por nombre..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="data-table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Repartidor {sortField === 'name' && (sortAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}</div>
                        </th>
                        <th>Contacto</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('orders')}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Pedidos Tomados {sortField === 'orders' && (sortAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}</div>
                        </th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lastActive')}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Última Actividad {sortField === 'lastActive' && (sortAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}</div>
                        </th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Estado Operativo {sortField === 'status' && (sortAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayDrivers.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            No se encontraron resultados.
                          </td>
                        </tr>
                      ) : (
                        displayDrivers.map((driver) => {
                          const { initials, color } = getAvatarConfig(driver.name, driver.id);
                          return (
                            <tr key={driver.id} onClick={() => setSelectedDriverId(driver.id)} style={{ cursor: 'pointer' }}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div className="avatar" style={{ backgroundColor: color }}>{initials}</div>
                                  <span style={{ fontWeight: 600, color: 'var(--brand-700)' }}>{driver.name}</span>
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
            </>
          )}

        </div>
      </main>
    </div>
  );
}
