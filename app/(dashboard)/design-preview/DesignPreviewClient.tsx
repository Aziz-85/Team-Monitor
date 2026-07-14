'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './design-preview.module.css';

type Preview = 'live' | 'pulse' | 'flow';
type Theme = 'current' | 'aurora' | 'obsidian';
type DashboardData = {
  snapshot?: {
    sales?: { currentMonthTarget: number; currentMonthActual: number; completionPct: number; remainingGap: number };
    scheduleHealth?: { weekApproved: boolean; todayAmCount: number; todayPmCount: number; coverageViolationsCount: number };
    taskControl?: { totalWeekly: number; completed: number; pending: number; overdue: number; zoneStatusSummary: string };
  };
  teamTable?: { rows: Array<{ empId?: string; employee: string; pct: number; tasksDone: number; zone: string | null }> };
};
type HomeData = {
  date: string;
  roster: { amEmployees: Employee[]; pmEmployees: Employee[]; warnings: string[] };
  coverageValidation?: Array<{ severity: string; message: string }>;
  todayTasks: Array<{ taskName: string; assignedTo: string | null }>;
};
type PerformanceData = {
  monthly: { target: number; sales: number; remaining: number; percent: number };
  daily: { target: number; sales: number; remaining: number; percent: number };
  dailyTrajectory?: Array<{ dateKey: string; targetCumulative: number; actualCumulative: number }>;
};
type Employee = { empId: string; name: string };
type LiveData = { dashboard: DashboardData; home: HomeData; performance: PerformanceData };

const tabs: Array<{ id: Preview; name: string; hint: string }> = [
  { id: 'live', name: 'المتجر الحي', hint: 'الموظفون والتغطية الآن' },
  { id: 'pulse', name: 'النبض البصري', hint: 'المبيعات والأداء الحي' },
  { id: 'flow', name: 'مسار التشغيل', hint: 'الجدول والمهام اليوم' },
];
const pct = (value?: number) => Math.max(0, Math.min(100, Math.round(value ?? 0)));
const initial = (name?: string) => name?.trim().slice(0, 1) || '—';
const money = (value?: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);

function useLiveData() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    Promise.all([
      fetch('/api/dashboard', { cache: 'no-store' }),
      fetch('/api/home', { cache: 'no-store' }),
      fetch('/api/performance/summary', { cache: 'no-store' }),
    ]).then(async responses => {
      const failed = responses.find(response => !response.ok);
      if (failed) throw new Error(String(failed.status));
      const [dashboard, home, performance] = await Promise.all(responses.map(response => response.json()));
      if (!cancelled) setData({ dashboard, home, performance });
    }).catch(() => !cancelled && setError('تعذر تحميل البيانات الحية'));
    return () => { cancelled = true; };
  }, [revision]);
  return { data, error, refresh: () => setRevision(value => value + 1) };
}

function Rail() {
  return <aside className={styles.rail}>
    <div className={styles.logo}>T</div>
    <Link href="/dashboard" title="الرئيسية"><span className={styles.icon}>⌂</span></Link>
    <Link href="/admin/employees" title="الفريق"><span className={styles.icon}>◉</span></Link>
    <Link href="/schedule/view" title="الجدول"><span className={styles.icon}>◷</span></Link>
    <Link href="/tasks" title="المهام"><span className={styles.icon}>✓</span></Link>
    <Link href="/inventory/daily" title="المخزون"><span className={styles.icon}>▦</span></Link>
    <div className={styles.avatar}>AA</div>
  </aside>;
}

function Product({ children, variant }: { children: React.ReactNode; variant: Preview }) {
  return <div className={`${styles.product} ${styles[`product_${variant}`]}`}><Rail /><main className={styles.productMain}>{children}</main></div>;
}

function LiveStore({ data }: { data: LiveData }) {
  const roster = [...data.home.roster.amEmployees, ...data.home.roster.pmEmployees]
    .filter((employee, index, all) => all.findIndex(item => item.empId === employee.empId) === index);
  const issues = data.home.coverageValidation?.length ?? 0;
  const coverage = pct(100 - issues * 12);
  const sales = pct(data.performance.monthly.percent);
  return <Product variant="live">
    <header className={styles.productHeader}><div><span className={styles.liveDot} /><b>الفرع التشغيلي</b><small>{data.home.date} · مباشر</small></div><div className={styles.headerFaces}>{roster.slice(0, 3).map(e => <span key={e.empId}>{initial(e.name)}</span>)}<span>+{Math.max(0, roster.length - 3)}</span></div></header>
    <div className={styles.liveLayout}>
      <section className={styles.floor}>
        <div className={`${styles.zone} ${styles.zoneA}`}><span>المنطقة A</span></div><div className={`${styles.zone} ${styles.zoneB}`}><span>المنطقة B</span></div><div className={`${styles.zone} ${styles.zoneC}`}><span>المنطقة C</span></div><div className={`${styles.zone} ${issues ? styles.zoneRisk : styles.zoneA}`}><b>{issues || '✓'}</b></div>
        {roster.slice(0, 4).map((employee, index) => <Link href="/admin/employees" title={employee.name} key={employee.empId} className={`${styles.person} ${styles[`p${index + 1}`]}`}>{initial(employee.name)}<i /></Link>)}
      </section>
      <aside className={styles.liveSide}><div className={styles.ringGrid}>
        <Link href="/sales/summary" className={styles.ring} style={{ '--pct': `${sales}%` } as React.CSSProperties}><b>{sales}%</b><small>بيع</small></Link>
        <Link href="/schedule/view" className={styles.ring} style={{ '--pct': `${roster.length ? 100 : 0}%` } as React.CSSProperties}><b>{roster.length}</b><small>مجدول</small></Link>
        <Link href="/schedule/edit" className={styles.ring} style={{ '--pct': `${coverage}%` } as React.CSSProperties}><b>{coverage}%</b><small>تغطية</small></Link>
      </div><div className={styles.visualAlert}><span>{issues}</span><i>→</i><b>{data.dashboard.snapshot?.taskControl?.pending ?? 0}</b><Link href="/schedule/edit">فتح المعالجة</Link></div></aside>
    </div>
    <div className={styles.shiftTimeline}>{roster.slice(0, 4).map((employee, index) => <Link href="/schedule/view" key={employee.empId}><span title={employee.name}>{initial(employee.name)}</span><i style={{ width: `${92 - index * 13}%` }} /><b /></Link>)}<em>الآن</em></div>
  </Product>;
}

function Pulse({ data }: { data: LiveData }) {
  const performance = data.performance;
  const trajectory = performance.dailyTrajectory ?? [];
  const max = Math.max(1, ...trajectory.flatMap(point => [point.actualCumulative, point.targetCumulative]));
  const points = trajectory.length > 1 ? trajectory.map((point, index) => `${(index / (trajectory.length - 1)) * 700},${220 - (point.actualCumulative / max) * 190}`).join(' ') : '0,215 700,20';
  const task = data.dashboard.snapshot?.taskControl;
  const schedule = data.dashboard.snapshot?.scheduleHealth;
  const team = data.dashboard.teamTable?.rows ?? [];
  return <Product variant="pulse">
    <header className={styles.productHeader}><div><b>نبض الفرع</b><small>بيانات حية</small></div><strong className={styles.health}>{(schedule?.coverageViolationsCount ?? 0) ? 'يحتاج انتباه ●' : 'مستقر ●'}</strong></header>
    <div className={styles.pulseHero}><Link href="/sales/summary" className={styles.bigNumber}><small>ر.س</small><strong>{money(performance.monthly.sales)}</strong><span>{pct(performance.monthly.percent)}% من الهدف</span></Link><svg viewBox="0 0 700 230" role="img" aria-label="مسار المبيعات الفعلي"><polyline className={styles.salesPath} points={points} /><path className={styles.targetPath} d="M0 220 L700 44" /></svg></div>
    <div className={styles.orbits}>
      <Link href="/tasks" className={styles.orbit}><b>{task?.totalWeekly ? pct((task.completed / task.totalWeekly) * 100) : 0}%</b><span>✓</span><small>المهام</small></Link>
      <Link href="/schedule/view" className={styles.orbit}><b>{pct(100 - (schedule?.coverageViolationsCount ?? 0) * 12)}%</b><span>◉</span><small>التغطية</small></Link>
      <Link href="/schedule/view" className={styles.orbit}><b>{(schedule?.todayAmCount ?? 0) + (schedule?.todayPmCount ?? 0)}</b><span>●</span><small>الورديات</small></Link>
      <div className={styles.rankBars}>{team.slice(0, 5).map(row => <i key={row.empId ?? row.employee} style={{ height: `${Math.max(12, pct(row.pct))}%` }} title={`${row.employee}: ${pct(row.pct)}%`} />)}</div>
    </div>
    <div className={styles.branchSignals}>{team.slice(0, 4).map(row => <Link href="/executive/employees" key={row.empId ?? row.employee} className={row.pct < 75 ? styles.signalRisk : ''}><i /><b>{pct(row.pct)}</b><small>{row.employee}</small></Link>)}</div>
  </Product>;
}

function Flow({ data }: { data: LiveData }) {
  const task = data.dashboard.snapshot?.taskControl;
  const schedule = data.dashboard.snapshot?.scheduleHealth;
  const roster = [...data.home.roster.amEmployees, ...data.home.roster.pmEmployees];
  const taskPct = task?.totalWeekly ? pct((task.completed / task.totalWeekly) * 100) : 0;
  return <Product variant="flow">
    <header className={styles.productHeader}><div><b>اليوم</b><small>{data.home.date}</small></div><div className={styles.dayScore}><b>{taskPct}%</b><small>مكتمل</small></div></header>
    <div className={styles.flowSummary}><Link href="/schedule/view"><b>{roster.length}</b><span>◉</span></Link><Link href="/tasks"><b>{task?.completed ?? 0}</b><span>✓</span></Link><Link href="/sales/daily"><b>{money(data.performance.daily.sales)}</b><span>↗</span></Link></div>
    <div className={styles.flowBoard}><div className={styles.hours}>{['9', '11', '1', '3', '5', '7', '9'].map(hour => <span key={hour}>{hour}</span>)}</div>
      <Link href="/schedule/view" className={styles.flowRow}><span className={styles.flowIcon}>◉</span><i className={styles.shiftOne} /><b>{roster.length}</b></Link>
      <Link href="/tasks" className={styles.flowRow}><span className={styles.flowIcon}>✓</span><i className={styles.shiftTwo} /><i className={styles.taskMarks}>{data.home.todayTasks.slice(0, 4).map(() => '●').join(' ')}</i></Link>
      <Link href="/inventory/daily" className={styles.flowRow}><span className={styles.flowIcon}>▦</span><i className={styles.shiftThree} /><b>{task?.zoneStatusSummary ?? '—'}</b></Link>
      <Link href="/schedule/edit" className={`${styles.flowRow} ${styles.flowRisk}`}><span className={styles.flowIcon}>!</span><i /><b>{schedule?.coverageViolationsCount ?? 0}</b></Link><div className={styles.nowLine}><span>الآن</span></div>
    </div>
    <div className={styles.actionDock}><div className={styles.actionPeople}>{data.home.roster.pmEmployees.slice(0, 2).map(employee => <span key={employee.empId}>{initial(employee.name)}</span>)}</div><i>→</i><div className={styles.actionMoon}>☾ PM</div><Link href="/schedule/edit">معالجة</Link></div>
  </Product>;
}

export function DesignPreviewClient() {
  const [active, setActive] = useState<Preview>('live');
  const [theme, setTheme] = useState<Theme>('current');
  const { data, error, refresh } = useLiveData();
  const updated = useMemo(() => data ? new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '', [data]);
  useEffect(() => {
    const saved = window.localStorage.getItem('team-monitor-preview-theme');
    if (saved === 'current' || saved === 'aurora' || saved === 'obsidian') setTheme(saved);
  }, []);
  const chooseTheme = (next: Theme) => {
    setTheme(next);
    window.localStorage.setItem('team-monitor-preview-theme', next);
  };
  return <div className={`${styles.page} ${styles[`theme_${theme}`]}`} dir="rtl">
    <header className={styles.pageHeader}><div><span>DESIGN LAB · LIVE</span><h1>اختر اتجاه Team Monitor</h1><p>{data ? `متصل بالبيانات الحية · ${updated}` : error || 'تحميل البيانات الحية…'}</p></div><div className={styles.pageActions}><button onClick={refresh}>تحديث</button><Link href="/dashboard">العودة للنظام</Link></div></header>
    <div className={styles.themePicker} role="group" aria-label="اختيار الثيم">
      <button onClick={() => chooseTheme('current')} aria-pressed={theme === 'current'}><i className={styles.currentSwatch} /><span><b>الثيم الحالي</b><small>Executive Clean</small></span></button>
      <button onClick={() => chooseTheme('aurora')} aria-pressed={theme === 'aurora'}><i className={styles.auroraSwatch} /><span><b>Aurora</b><small>Expressive Light</small></span></button>
      <button onClick={() => chooseTheme('obsidian')} aria-pressed={theme === 'obsidian'}><i className={styles.obsidianSwatch} /><span><b>Obsidian</b><small>Precision Dark</small></span></button>
    </div>
    <div className={styles.tabs} role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={active === tab.id} onClick={() => setActive(tab.id)} className={active === tab.id ? styles.selected : ''}><b>{tab.name}</b><small>{tab.hint}</small></button>)}</div>
    {!data && <div className={styles.loading}>{error ? <><b>{error}</b><button onClick={refresh}>إعادة المحاولة</button></> : <><i /><span>تحميل الأداء والجدول والمهام…</span></>}</div>}
    {data && active === 'live' && <LiveStore data={data} />}{data && active === 'pulse' && <Pulse data={data} />}{data && active === 'flow' && <Flow data={data} />}
    <footer className={styles.note}>بيانات حية للقراءة · اضغط العناصر للانتقال إلى صفحات النظام الفعلية</footer>
  </div>;
}
