import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { 
  Activity, AlertTriangle, Clock, Search, Radio,
  Store, Users, CheckCircle, Package, ArrowUpRight, ArrowDownRight, MapPin,
  Download, Calendar, ArrowLeft, ChevronUp, ChevronDown, Timer, Wifi, WifiOff
} from 'lucide-react';
import { 
  format, differenceInDays, startOfDay, endOfDay,
  startOfWeek, startOfMonth,
  subDays, subWeeks, subMonths, endOfWeek, endOfMonth,
  parseISO
} from 'date-fns';
import { es } from 'date-fns/locale';

import {
  getDataSource, setDataSource, fetchDemoStats, fetchLiveStats,
  fetchBackendStatus,
  type DataSource, type StatsResponse, type BackendStatus
} from './api';
import './index.css';

type Period = 'day' | 'week' | 'month' | 'custom';
type Tab = 'overview' | 'restaurants' | 'drivers';
type SortField = 'name' | 'orders' | 'lastActive' | 'avgTime' | 'status';

const getAvatarConfig = (name: string, id: string) => {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const colors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e'];
  const charCodeSum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return { initials, color: colors[charCodeSum % colors.length] };
};

const PRESETS = [
  { label: 'Ayer', getRange: () => { const y = subDays(new Date(), 1); return { s: startOfDay(y), e: endOfDay(y) }; }},
  { label: 'Última semana', getRange: () => { const now = new Date(); const start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); return { s: start, e: endOfWeek(start, { weekStartsOn: 1 }) }; }},
  { label: 'Último mes', getRange: () => { const now = new Date(); const start = startOfMonth(subMonths(now, 1)); return { s: start, e: endOfMonth(start) }; }},
  { label: 'Últimos 7 días', getRange: () => ({ s: startOfDay(subDays(new Date(), 7)), e: endOfDay(new Date()) })},
  { label: 'Últimos 30 días', getRange: () => ({ s: startOfDay(subDays(new Date(), 30)), e: endOfDay(new Date()) })},
];

export default function App() {
  const [period, setPeriod] = useState<Period>('week');
  const [customStart, setCustomStart] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [showCustomPanel, setShowCustomPanel] = useState(false);

  // Data source: 'demo' (mock) | 'live' (backend API)
  const [dataSource, setDataSourceState] = useState<DataSource>(getDataSource);
  const [liveStats, setLiveStats] = useState<StatsResponse | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [liveError, setLiveError] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [scrolled, setScrolled] = useState(false);
  
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

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

  // Show custom panel when period is 'custom'
  useEffect(() => {
    if (period === 'custom') setShowCustomPanel(true);
    else setShowCustomPanel(false);
  }, [period]);

  // Time boundaries calculation
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    const now = new Date();
    let sDate: Date, eDate: Date = endOfDay(now), pSDate: Date, pEDate: Date;
    if (period === 'day') {
      sDate = startOfDay(now);
      pSDate = startOfDay(subDays(now, 1));
      pEDate = endOfDay(subDays(now, 1));
    } else if (period === 'week') {
      sDate = startOfWeek(now, { weekStartsOn: 1 });
      pSDate = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      pEDate = endOfDay(subDays(sDate, 1));
    } else if (period === 'month') {
      sDate = startOfMonth(now);
      pSDate = startOfMonth(subMonths(now, 1));
      pEDate = endOfDay(subDays(sDate, 1));
    } else {
      sDate = startOfDay(parseISO(customStart));
      eDate = endOfDay(parseISO(customEnd));
      const diff = differenceInDays(eDate, sDate);
      pSDate = startOfDay(subDays(sDate, diff + 1));
      pEDate = endOfDay(subDays(eDate, diff + 1));
    }
    return { startDate: sDate, endDate: eDate, prevStartDate: pSDate, prevEndDate: pEDate };
  }, [period, customStart, customEnd]);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const { s, e } = preset.getRange();
    setCustomStart(format(s, 'yyyy-MM-dd'));
    setCustomEnd(format(e, 'yyyy-MM-dd'));
    setPeriod('custom');
  };

  // ── Toggle data source ─────────────────────────────────────────────────────
  const toggleDataSource = () => {
    const next: DataSource = dataSource === 'demo' ? 'live' : 'demo';
    setDataSource(next);
    setDataSourceState(next);
    setLiveStats(null);
    setLiveError(false);
  };

  // ── Live data fetching ─────────────────────────────────────────────────────
  const loadLiveStats = useCallback(async () => {
    if (dataSource !== 'live') return;
    const result = await fetchLiveStats(startDate, endDate, prevStartDate, prevEndDate);
    if (result) {
      setLiveStats(result);
      setLiveError(false);
    } else {
      setLiveError(true);
    }
  }, [dataSource, startDate, endDate, prevStartDate, prevEndDate]);

  useEffect(() => { loadLiveStats(); }, [loadLiveStats]);

  // Poll backend status every 10s when in live mode
  useEffect(() => {
    if (dataSource !== 'live') { setBackendStatus(null); return; }
    const check = async () => setBackendStatus(await fetchBackendStatus());
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [dataSource]);

  // Auto-refresh live stats every 30s
  useEffect(() => {
    if (dataSource !== 'live') return;
    const id = setInterval(loadLiveStats, 30000);
    return () => clearInterval(id);
  }, [dataSource, loadLiveStats]);

  // ── Compute stats from the active data source ──────────────────────────────
  const activeStats = useMemo(() => {
    if (dataSource === 'live') return liveStats;
    return fetchDemoStats(startDate, endDate, prevStartDate, prevEndDate);
  }, [dataSource, liveStats, startDate, endDate, prevStartDate, prevEndDate]);

  const restaurantStats = activeStats?.restaurantStats ?? [];
  const rawDriverStats = activeStats?.driverStats ?? [];
  const rawOrders = activeStats?.orders ?? [];
  const totalOrders = activeStats?.totalOrders ?? 0;
  const driverStats = rawDriverStats.map(d => ({
    ...d,
    daysInactive: differenceInDays(now, new Date(d.last_active)),
    needsAlert: differenceInDays(now, new Date(d.last_active)) >= 4,
  }));

  const prevTotalOrders = (() => {
    if (dataSource === 'demo') {
      return fetchDemoStats(prevStartDate, prevEndDate, prevStartDate, prevEndDate).totalOrders;
    }
    return 0; // live mode handles this inside fetchLiveStats
  })();

  const prevActiveDriversCount = 0; // best-effort, see api.ts for live handling
  const activeDriversCount = driverStats.filter(d => !d.needsAlert).length;
  const alertDriversCount = driverStats.filter(d => d.needsAlert).length;
  const inactiveRestaurantsCount = restaurantStats.filter(r => r.isInactive || (r.trend ?? 0) <= -50).length;

  // Build chronologically sorted day-by-day chart data
  const ordersByDate = useMemo(() => {
    const dateMap: Record<string, { ts: number; pedidos: number }> = {};
    rawOrders.forEach(o => {
      const ts = new Date(o.timestamp);
      const k = format(ts, 'yyyy-MM-dd');
      if (!dateMap[k]) dateMap[k] = { ts: startOfDay(ts).getTime(), pedidos: 0 };
      dateMap[k].pedidos++;
    });
    return Object.values(dateMap)
      .sort((a, b) => a.ts - b.ts)
      .map(v => ({ date: format(new Date(v.ts), 'dd MMM'), pedidos: v.pedidos }));
  }, [rawOrders]);


  // Insights automáticos
  const autoInsight = useMemo(() => {
    if (totalOrders === 0 || restaurantStats.length === 0 || driverStats.length === 0) return "No hay actividad registrada en este período.";
    const topRest = restaurantStats[0];
    const topDriver = driverStats.slice().sort((a, b) => b.orders - a.orders)[0];
    const fastestDriver = driverStats.filter(d => d.avgDeliveryTime !== null)
      .sort((a, b) => (a.avgDeliveryTime ?? 999) - (b.avgDeliveryTime ?? 999))[0];
    const percent = Math.round((topRest.orders / totalOrders) * 100);
    let text = `${topRest.name} concentró el ${percent}% de los pedidos del período y ${topDriver.name} fue el repartidor más activo con ${topDriver.orders} entregas.`;
    if (fastestDriver?.avgDeliveryTime) text += ` El más rápido fue ${fastestDriver.name} con un promedio de ${fastestDriver.avgDeliveryTime} min.`;
    return text;
  }, [totalOrders, restaurantStats, driverStats]);

  // Sorted/filtered drivers for table
  const displayDrivers = useMemo(() => {
    let result = [...driverStats];
    if (searchQuery) {
      result = result.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    result.sort((a, b) => {
      let valA: string | number, valB: string | number;
      if (sortField === 'name') { valA = a.name; valB = b.name; }
      else if (sortField === 'orders') { valA = a.orders; valB = b.orders; }
      else if (sortField === 'lastActive') { valA = new Date(a.last_active).getTime(); valB = new Date(b.last_active).getTime(); }
      else if (sortField === 'avgTime') { valA = a.avgDeliveryTime ?? 9999; valB = b.avgDeliveryTime ?? 9999; }
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

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (sortAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>) : null;

  // Exportar reporte CSV
  const exportCSV = () => {
    const headers = ['ID Pedido', 'Restaurante', 'Repartidor', 'Fecha', 'Tiempo Entrega (min)', 'Estado'];
    const rows = rawOrders.map(o => {
      const rName = restaurantStats.find(r => r.id === o.restaurantId)?.name || 'N/A';
      const dName = driverStats.find(d => d.id === o.driverId)?.name || 'N/A';
      return [o.id, rName, dName, format(new Date(o.timestamp), 'yyyy-MM-dd HH:mm'), o.deliveryTimeMinutes, o.status];
    });
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `reporte_delivery_${format(startDate, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const renderTrend = (current: number, prev: number) => {
    if (prev === 0) return null;
    const diff = current - prev;
    const pct = Math.round((Math.abs(diff) / prev) * 100);
    const isUp = diff > 0;
    if (diff === 0) return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Sin cambio</span>;
    return (
      <span style={{ fontSize: '0.85rem', color: isUp ? 'var(--status-success)' : 'var(--status-danger)', display: 'inline-flex', alignItems: 'center', marginLeft: '8px' }}>
        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{pct}% vs ant.
      </span>
    );
  };

  // ---- DETAIL VIEWS ----
  if (selectedRestaurantId) {
    const rest = restaurantStats.find(r => r.id === selectedRestaurantId)!;
    const rOrders = rawOrders.filter(o => o.restaurantId === selectedRestaurantId);
    
    const dMap: Record<string, { ts: number; pedidos: number }> = {};
    rOrders.forEach(o => {
      const ts = new Date(o.timestamp);
      const k = format(ts, 'yyyy-MM-dd');
      if (!dMap[k]) dMap[k] = { ts: startOfDay(ts).getTime(), pedidos: 0 };
      dMap[k].pedidos++;
    });
    const rChartData = Object.values(dMap).sort((a,b) => a.ts - b.ts).map(v => ({ date: format(new Date(v.ts), 'dd MMM'), pedidos: v.pedidos }));

    const dCount: Record<string, number> = {};
    rOrders.forEach(o => dCount[o.driverId] = (dCount[o.driverId] || 0) + 1);
    const topDrivers = Object.keys(dCount)
      .map(id => ({ driver: driverStats.find(d => d.id === id) ?? { id, name: id, phone: '' }, count: dCount[id] }))
      .sort((a,b) => b.count - a.count).slice(0, 5);

    return (
      <div className="layout">
        <aside className="sidebar">
          <div className="brand"><div className="brand-icon"><Activity size={24} strokeWidth={2.5}/></div><span className="brand-name">DeliveryHub</span></div>
          <button className="btn btn-outline" onClick={() => setSelectedRestaurantId(null)} style={{ margin: '16px', display: 'flex', gap: '8px' }}>
            <ArrowLeft size={16}/> Volver al Panel
          </button>
        </aside>
        <main className="main-content">
          <div className="content-area animate-enter" style={{ paddingTop: '40px' }}>
            <h1 className="page-title">{rest.name}</h1>
            <p className="text-muted" style={{ marginBottom: '32px' }}><MapPin size={14} style={{ display: 'inline', marginRight: '4px' }}/>{rest.location}</p>
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-title">Evolución de pedidos</div>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)"/>
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }}/>
                    <Line type="monotone" dataKey="pedidos" stroke="var(--brand-600)" strokeWidth={3} dot={{ r: 4, fill: 'var(--brand-600)' }}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Repartidores más frecuentes</div>
              {topDrivers.length === 0 ? <p className="text-muted">No hay pedidos en este período.</p> : topDrivers.map(td => {
                const { initials, color } = getAvatarConfig(td.driver.name, td.driver.id);
                return (
                  <div key={td.driver.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div className="avatar" style={{ backgroundColor: color }}>{initials}</div>
                    <div style={{ flex: 1 }}><p style={{ fontWeight: 600 }}>{td.driver.name}</p></div>
                    <div style={{ fontWeight: 700 }}>{td.count} pedidos</div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (selectedDriverId) {
    const driver = driverStats.find(d => d.id === selectedDriverId)!;
    const dOrders = rawOrders.filter(o => o.driverId === selectedDriverId);
    
    const dMap: Record<string, { ts: number; pedidos: number; totalTime: number }> = {};
    dOrders.forEach(o => {
      const ts = new Date(o.timestamp);
      const k = format(ts, 'yyyy-MM-dd');
      if (!dMap[k]) dMap[k] = { ts: startOfDay(ts).getTime(), pedidos: 0, totalTime: 0 };
      dMap[k].pedidos++;
      dMap[k].totalTime += (o.deliveryTimeMinutes ?? 0);
    });
    const dChartData = Object.values(dMap).sort((a,b) => a.ts - b.ts).map(v => ({
      date: format(new Date(v.ts), 'dd MMM'),
      pedidos: v.pedidos,
      promedio: Math.round(v.totalTime / v.pedidos)
    }));

    const rCount: Record<string, number> = {};
    dOrders.forEach(o => rCount[o.restaurantId] = (rCount[o.restaurantId] || 0) + 1);
    const topRests = Object.keys(rCount)
      .map(id => ({ rest: restaurantStats.find(r => r.id === id) ?? { id, name: id, location: '' }, count: rCount[id] }))
      .sort((a,b) => b.count - a.count).slice(0, 5);

    const { initials, color } = getAvatarConfig(driver.name, driver.id);

    return (
      <div className="layout">
        <aside className="sidebar">
          <div className="brand"><div className="brand-icon"><Activity size={24} strokeWidth={2.5}/></div><span className="brand-name">DeliveryHub</span></div>
          <button className="btn btn-outline" onClick={() => setSelectedDriverId(null)} style={{ margin: '16px', display: 'flex', gap: '8px' }}>
            <ArrowLeft size={16}/> Volver al Panel
          </button>
        </aside>
        <main className="main-content">
          <div className="content-area animate-enter" style={{ paddingTop: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div className="avatar" style={{ backgroundColor: color, width: '64px', height: '64px', fontSize: '1.5rem' }}>{initials}</div>
              <div>
                <h1 className="page-title">{driver.name}</h1>
                <p className="text-muted">{driver.phone} • {driver.needsAlert ? '⚠️ En Alerta' : '✅ Activo'}</p>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px' }}>
                <div className="card" style={{ padding: '16px 24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '2rem', fontWeight: 700 }}>{driver.orders}</p>
                  <p className="text-muted" style={{ fontSize: '0.875rem' }}>Pedidos</p>
                </div>
                {driver.avgDeliveryTime && (
                  <div className="card" style={{ padding: '16px 24px', textAlign: 'center' }}>
                    <p style={{ fontSize: '2rem', fontWeight: 700 }}>{driver.avgDeliveryTime}<span style={{ fontSize: '1rem' }}> min</span></p>
                    <p className="text-muted" style={{ fontSize: '0.875rem' }}>Prom. entrega</p>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div className="card">
                <div className="card-title">Actividad diaria (pedidos)</div>
                <div style={{ height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)"/>
                      <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }}/>
                      <Bar dataKey="pedidos" name="Pedidos" radius={[4,4,0,0]} fill="var(--brand-600)"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Tiempo promedio de entrega (min/día)</div>
                <div style={{ height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)"/>
                      <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }}/>
                      <Line type="monotone" dataKey="promedio" name="Min promedio" stroke="var(--status-warning)" strokeWidth={3} dot={{ r: 4, fill: 'var(--status-warning)' }}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Restaurantes de los que más retira</div>
              {topRests.length === 0 ? <p className="text-muted">Sin pedidos en este período.</p> : topRests.map((tr, i) => (
                <div key={tr.rest.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: i !== topRests.length - 1 ? '12px' : '0', marginBottom: i !== topRests.length - 1 ? '12px' : '0', borderBottom: i !== topRests.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                  <div><p style={{ fontWeight: 600 }}>{tr.rest.name}</p><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><MapPin size={12} style={{display:'inline'}}/> {tr.rest.location}</p></div>
                  <div style={{ fontWeight: 700 }}>{tr.count} pedidos</div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---- MAIN PANEL ----
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Activity size={24} strokeWidth={2.5}/></div>
          <span className="brand-name">DeliveryHub</span>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}><Activity size={18}/> Resumen General</button>
          <button className={`nav-item ${activeTab === 'restaurants' ? 'active' : ''}`} onClick={() => setActiveTab('restaurants')}><Store size={18}/> Locales y Volumen</button>
          <button className={`nav-item ${activeTab === 'drivers' ? 'active' : ''}`} onClick={() => setActiveTab('drivers')}><Users size={18}/> Equipo de Reparto</button>
        </nav>

        {/* Data Source Toggle */}
        <div style={{ marginTop: 'auto', padding: '16px 0', borderTop: '1px solid var(--border-light)' }}>
          <button
            onClick={toggleDataSource}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: 'var(--radius-md)', border: `1px solid ${dataSource === 'live' ? 'var(--status-success-border)' : 'var(--border-light)'}`, background: dataSource === 'live' ? 'var(--status-success-bg)' : 'var(--bg-app)', cursor: 'pointer', transition: 'all 0.2s' }}
            title={dataSource === 'live' ? 'Cambiar a datos de demostración' : 'Cambiar a datos reales (requiere backend)'}
          >
            {dataSource === 'live'
              ? <Wifi size={18} color="var(--status-success)"/>
              : <WifiOff size={18} color="var(--text-muted)"/>
            }
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: dataSource === 'live' ? 'var(--status-success-text)' : 'var(--text-muted)' }}>
                {dataSource === 'live' ? 'Datos en vivo' : 'Modo demo'}
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                {dataSource === 'live' ? 'Clic para usar demo' : 'Clic para conectar'}
              </p>
            </div>
          </button>

          {/* WhatsApp connection status (solo en modo live) */}
          {dataSource === 'live' && (
            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-app)', border: '1px solid var(--border-light)', fontSize: '0.78rem' }}>
              {liveError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-danger)' }}>
                  <AlertTriangle size={14}/> Backend no disponible
                </div>
              )}
              {!liveError && backendStatus && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: backendStatus.whatsapp === 'ready' ? 'var(--status-success)' : 'var(--status-warning)', fontWeight: 500 }}>
                    <Radio size={14}/>
                    WhatsApp: {backendStatus.whatsapp === 'ready' ? 'Conectado' : backendStatus.whatsapp === 'waiting_qr' ? 'Esperando QR' : backendStatus.whatsapp}
                  </div>
                  <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                    Modo: {backendStatus.logOnly ? 'Solo registro' : 'Completo'}
                  </p>
                </div>
              )}
              {!liveError && !backendStatus && (
                <div style={{ color: 'var(--text-muted)' }}>Conectando al backend...</div>
              )}
            </div>
          )}
        </div>
      </aside>

      <main id="main-content" className="main-content">
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
              <Download size={16}/> Exportar Reporte
            </button>
            <div className="toggle-group">
              <button className={`toggle-btn ${period === 'day' ? 'active' : ''}`} onClick={() => setPeriod('day')}>Hoy</button>
              <button className={`toggle-btn ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Semana</button>
              <button className={`toggle-btn ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Mes</button>
              <button className={`toggle-btn ${period === 'custom' ? 'active' : ''}`} onClick={() => setPeriod('custom')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14}/> Rango
              </button>
            </div>
          </div>
        </header>

        {/* Custom date panel with presets */}
        {showCustomPanel && (
          <div style={{ padding: '16px 40px', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
            {/* Preset shortcuts */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center' }}>Accesos rápidos:</span>
              {PRESETS.map(p => (
                <button key={p.label} className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => applyPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Manual range */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>O elegí manualmente:</span>
              <input type="date" className="search-input" style={{ width: 'auto', padding: '8px' }} value={customStart} onChange={e => setCustomStart(e.target.value)}/>
              <span style={{ color: 'var(--text-muted)' }}>hasta</span>
              <input type="date" className="search-input" style={{ width: 'auto', padding: '8px' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)}/>
            </div>
          </div>
        )}

        <div className="content-area animate-enter" style={{ paddingTop: '24px' }}>

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <div className="card" style={{ marginBottom: '24px', backgroundColor: 'var(--brand-50)', borderColor: 'var(--brand-100)' }}>
                <p style={{ color: 'var(--brand-900)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18}/> {autoInsight}
                </p>
              </div>

              <div className="kpi-grid">
                <div className="card">
                  <div className="kpi-icon-wrap" style={{ backgroundColor: 'var(--brand-50)', color: 'var(--brand-600)' }}><Package size={24}/></div>
                  <p className="kpi-label">Volumen Total</p>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <p className="kpi-value">{totalOrders}</p>{renderTrend(totalOrders, prevTotalOrders)}
                  </div>
                </div>
                <div className="card">
                  <div className="kpi-icon-wrap" style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}><Users size={24}/></div>
                  <p className="kpi-label">Repartidores Activos</p>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <p className="kpi-value">{activeDriversCount}</p>{renderTrend(activeDriversCount, prevActiveDriversCount)}
                  </div>
                </div>
                <div className="card" style={{ borderColor: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger-bg)' : 'var(--border-light)' }}>
                  <div className="kpi-icon-wrap" style={{ backgroundColor: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger-bg)' : '#f1f5f9', color: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger)' : 'var(--text-muted)' }}><AlertTriangle size={24}/></div>
                  <p className="kpi-label">Alertas Críticas</p>
                  <p className="kpi-value" style={{ color: (alertDriversCount > 0 || inactiveRestaurantsCount > 0) ? 'var(--status-danger)' : 'inherit' }}>
                    {alertDriversCount + inactiveRestaurantsCount}
                  </p>
                  {alertDriversCount === 0 && inactiveRestaurantsCount === 0 && (
                    <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={14}/> Operación saludable
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div className="card">
                  <div className="card-title"><Store size={18} color="var(--brand-500)"/> Locales de mayor volumen</div>
                  {restaurantStats.slice(0, 4).map((rest, idx) => (
                    <div key={rest.id} onClick={() => setSelectedRestaurantId(rest.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: idx !== 3 ? '16px' : '0', marginBottom: idx !== 3 ? '16px' : '0', borderBottom: idx !== 3 ? '1px solid var(--border-light)' : 'none', cursor: 'pointer' }}>
                      <div>
                        <p style={{ fontWeight: 600, color: 'var(--brand-700)' }}>{rest.name}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rest.location}</p>
                      </div>
                      <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{rest.orders}</p>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="card-title"><AlertTriangle size={18} color="var(--status-danger)"/> Atención Requerida</div>
                  {alertDriversCount === 0 && inactiveRestaurantsCount === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><CheckCircle size={32}/></div>
                      <h4>Todo en orden</h4>
                      <p style={{ fontSize: '0.875rem', marginTop: '4px' }}>No hay locales ni repartidores con baja actividad.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {restaurantStats.filter(r => r.isInactive || (r.trend ?? 0) <= -50).map(r => (
                        <div key={r.id} onClick={() => setSelectedRestaurantId(r.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--status-warning-bg)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                          <div className="avatar" style={{ backgroundColor: 'var(--status-warning)' }}><Store size={16}/></div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, color: 'var(--status-warning-text)' }}>{r.name}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--status-warning-text)', opacity: 0.8 }}>Caída del {Math.abs(r.trend ?? 0)}% en volumen</p>
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
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)"/>
                      <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }}/>
                      <Line type="monotone" dataKey="pedidos" stroke="var(--brand-600)" strokeWidth={3} dot={{ r: 4, fill: 'var(--brand-600)' }}/>
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)"/>
                        <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val.split(' ')[0]}/>
                        <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false}/>
                        <Tooltip cursor={{ fill: 'var(--bg-surface-hover)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-hover)' }}/>
                        <Bar dataKey="orders" name="Pedidos" radius={[4,4,0,0]} barSize={40}>
                          {restaurantStats.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--brand-600)' : 'var(--brand-100)'} style={{ cursor: 'pointer' }} onClick={() => setSelectedRestaurantId(restaurantStats[index].id)}/>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--border-light)', paddingLeft: '24px' }}>
                    <h4 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Crecimiento</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {restaurantStats.map(rest => (
                        <div key={rest.id} onClick={() => setSelectedRestaurantId(rest.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={14} color="var(--text-muted)"/>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-700)' }}>{rest.name.split(' ')[0]}</span>
                          </div>
                          {renderTrend(rest.orders, rest.prevOrders ?? 0)}
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
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-title"><Activity size={18} color="var(--status-success)"/> Top 3 Repartidores del Período</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {driverStats.slice().sort((a,b) => b.orders - a.orders).slice(0,3).map((d, i) => {
                    const { initials, color } = getAvatarConfig(d.name, d.id);
                    return (
                      <div key={d.id} onClick={() => setSelectedDriverId(d.id)} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', cursor: 'pointer', backgroundColor: i === 0 ? 'var(--brand-50)' : 'transparent' }}>
                        <div className="avatar" style={{ backgroundColor: color, width: '48px', height: '48px', fontSize: '1.2rem' }}>{initials}</div>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>{i === 0 ? '🏆 ' : ''}{d.name}</p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.orders} pedidos</p>
                          {d.avgDeliveryTime && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.avgDeliveryTime} min prom.</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Directorio Completo (clic para detalle)</h2>
                  <div className="search-input-wrapper">
                    <Search size={18} className="search-icon"/>
                    <input type="text" className="search-input" placeholder="Buscar por nombre..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/>
                  </div>
                </div>
                <div className="data-table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Repartidor <SortIcon field="name"/></div></th>
                        <th>Contacto</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('orders')}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Pedidos <SortIcon field="orders"/></div></th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avgTime')}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Timer size={14}/> Prom. entrega <SortIcon field="avgTime"/></div></th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('lastActive')}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Última Actividad <SortIcon field="lastActive"/></div></th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Estado <SortIcon field="status"/></div></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayDrivers.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No se encontraron resultados.</td></tr>
                      ) : displayDrivers.map(driver => {
                        const { initials, color } = getAvatarConfig(driver.name, driver.id);
                        return (
                          <tr key={driver.id} onClick={() => setSelectedDriverId(driver.id)} style={{ cursor: 'pointer' }}>
                            <td><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="avatar" style={{ backgroundColor: color }}>{initials}</div><span style={{ fontWeight: 600, color: 'var(--brand-700)' }}>{driver.name}</span></div></td>
                            <td style={{ color: 'var(--text-muted)' }}>{driver.phone}</td>
                            <td><span style={{ fontWeight: 600 }}>{driver.orders}</span></td>
                            <td>
                              {driver.avgDeliveryTime ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-body)' }}>
                                  <Timer size={14} color="var(--text-muted)"/>{driver.avgDeliveryTime} min
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: driver.needsAlert ? 'var(--status-danger)' : 'var(--text-body)' }}>
                                <Clock size={14}/>{format(new Date(driver.last_active), "d MMM, HH:mm", { locale: es })}
                              </div>
                            </td>
                            <td>
                              {driver.needsAlert ? (
                                <span className="badge badge-danger"><AlertTriangle size={12}/>Alerta (+4 días)</span>
                              ) : (
                                <span className="badge badge-success">Activo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
