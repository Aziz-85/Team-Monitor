'use client';

import { useMemo, useState } from 'react';
import type { EmployeePosition, Role } from '@prisma/client';
import { useT } from '@/lib/i18n/useT';
import { getSidebarGroupedSections } from '@/lib/nav/sidebarShellNav';
import { ROLE_ROUTES } from '@/lib/routeMatrix';

type EmployeeOption = {
  empId: string;
  name: string;
  nameAr: string | null;
  position: EmployeePosition | null;
  boutiqueId: string;
  boutique: { name: string; code: string };
  user: { role: Role; disabled: boolean } | null;
};

type BoutiqueOption = { id: string; code: string; name: string };

const PREVIEW_ROLES: Role[] = ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'AREA_MANAGER'];

const ROLE_META: Record<string, { en: string; ar: string; tone: string; descriptionEn: string; descriptionAr: string }> = {
  EMPLOYEE: { en: 'Sales Employee', ar: 'موظف مبيعات', tone: 'bg-emerald-500', descriptionEn: 'Personal work, sales, target, schedule and assigned tasks.', descriptionAr: 'العمل الشخصي والمبيعات والتارغت والجدول والمهام المسندة.' },
  ASSISTANT_MANAGER: { en: 'Assistant Manager', ar: 'مساعد مدير', tone: 'bg-sky-500', descriptionEn: 'Boutique operations with schedule editing and approved sales views.', descriptionAr: 'تشغيل البوتيك مع تعديل الجدول وقراءات المبيعات المسموحة.' },
  MANAGER: { en: 'Boutique Manager', ar: 'مدير بوتيك', tone: 'bg-violet-600', descriptionEn: 'Full team, boutique reporting, approvals and operational control.', descriptionAr: 'الفريق وتقارير البوتيك والموافقات والتحكم التشغيلي.' },
  AREA_MANAGER: { en: 'Area Manager', ar: 'مدير منطقة', tone: 'bg-amber-500', descriptionEn: 'Multi-boutique performance, comparison and scoped governance.', descriptionAr: 'أداء عدة بوتيكات والمقارنة بينها والحوكمة ضمن النطاق.' },
};

function roleLabel(role: Role, rtl: boolean) {
  const meta = ROLE_META[role];
  return meta ? (rtl ? meta.ar : meta.en) : role;
}

export function RolePreviewCenterClient({ employees, boutiques }: { employees: EmployeeOption[]; boutiques: BoutiqueOption[] }) {
  const { t, isRtl } = useT();
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [employeeId, setEmployeeId] = useState(employees[0]?.empId ?? '');
  const selectedEmployee = employees.find((employee) => employee.empId === employeeId) ?? null;
  const [boutiqueIds, setBoutiqueIds] = useState<string[]>(selectedEmployee ? [selectedEmployee.boutiqueId] : boutiques[0] ? [boutiques[0].id] : []);
  const sections = useMemo(() => getSidebarGroupedSections(role, t), [role, t]);
  const visiblePages = useMemo(
    () => sections.flatMap((section) => section.items.flatMap((item) => item.children?.length ? item.children : [item])),
    [sections]
  );
  const routePrefixes = ROLE_ROUTES[role] ?? [];
  const meta = ROLE_META[role];
  const selectedBoutiques = boutiques.filter((boutique) => boutiqueIds.includes(boutique.id));
  const areaNeedsScope = role === 'AREA_MANAGER' && selectedBoutiques.length < 2;

  const chooseEmployee = (empId: string) => {
    setEmployeeId(empId);
    const employee = employees.find((item) => item.empId === empId);
    if (!employee) return;
    setBoutiqueIds([employee.boutiqueId]);
  };

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    if (nextRole !== 'AREA_MANAGER' && boutiqueIds.length > 1) setBoutiqueIds(boutiqueIds.slice(0, 1));
  };

  const toggleBoutique = (id: string) => {
    if (role !== 'AREA_MANAGER') {
      setBoutiqueIds([id]);
      return;
    }
    setBoutiqueIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <section className="overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(120deg,#0b1f3a,#163c62_58%,#17636b)] p-6 text-white shadow-xl shadow-slate-900/10">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-200">{isRtl ? 'معاينة آمنة للصلاحيات' : 'Safe access preview'}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{isRtl ? 'مركز معاينة الأدوار' : 'Role Preview Center'}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">{isRtl ? 'شاهد ما ستظهره المنصة لكل مستوى وظيفي قبل نشر أي تغيير، من دون انتحال المستخدم أو تعديل بياناته.' : 'See what the platform exposes to every job level before release, without impersonating the user or changing their data.'}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs font-bold text-emerald-200">● {isRtl ? 'وضع قراءة فقط' : 'READ-ONLY MODE'}</p>
            <p className="mt-1 text-xs text-slate-200">{isRtl ? 'لا يتم تغيير الجلسة أو قاعدة البيانات' : 'Session and database remain unchanged'}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-border bg-surface p-5 shadow-sm lg:grid-cols-[1.15fr_1fr_1fr]">
        <label className="space-y-2 text-sm font-semibold text-foreground">
          <span>{isRtl ? 'الموظف المرجعي' : 'Reference employee'}</span>
          <select value={employeeId} onChange={(event) => chooseEmployee(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
            {employees.map((employee) => <option key={employee.empId} value={employee.empId}>{employee.empId} — {isRtl && employee.nameAr ? employee.nameAr : employee.name} · {employee.boutique.code}</option>)}
          </select>
          <span className="block text-xs font-normal text-muted">{selectedEmployee?.user ? `${isRtl ? 'الدور الحالي' : 'Current role'}: ${roleLabel(selectedEmployee.user.role, isRtl)}${selectedEmployee.user.disabled ? ` · ${isRtl ? 'معطّل' : 'Disabled'}` : ''}` : (isRtl ? 'لا يوجد حساب دخول مرتبط' : 'No linked login account')}</span>
        </label>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{isRtl ? 'الدور المراد معاينته' : 'Preview role'}</p>
          <div className="grid grid-cols-2 gap-2">
            {PREVIEW_ROLES.map((item) => <button key={item} type="button" onClick={() => chooseRole(item)} className={`rounded-xl border px-3 py-2 text-start text-xs font-bold transition ${role === item ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent/20' : 'border-border bg-background text-foreground hover:bg-surface-subtle'}`}>{roleLabel(item, isRtl)}</button>)}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{role === 'AREA_MANAGER' ? (isRtl ? 'البوتيكات ضمن النطاق' : 'Boutiques in scope') : (isRtl ? 'البوتيك التشغيلي' : 'Operational boutique')}</p>
          <div className="max-h-32 space-y-1 overflow-auto rounded-xl border border-border bg-background p-2">
            {boutiques.map((boutique) => <label key={boutique.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface-subtle"><input type={role === 'AREA_MANAGER' ? 'checkbox' : 'radio'} checked={boutiqueIds.includes(boutique.id)} onChange={() => toggleBoutique(boutique.id)} /><span>{boutique.name} ({boutique.code})</span></label>)}
          </div>
        </div>
      </section>

      {areaNeedsScope ? <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{isRtl ? 'اختر بوتيكين على الأقل حتى تختبر المقارنات ونطاق مدير المنطقة بصورة واقعية.' : 'Select at least two boutiques to test area comparisons and scope realistically.'}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-3">
              <span className={`h-10 w-2 rounded-full ${meta.tone}`} />
              <div><p className="font-bold text-foreground">{roleLabel(role, isRtl)}</p><p className="text-xs text-muted">{selectedBoutiques.map((item) => item.code).join(' · ') || '—'}</p></div>
            </div>
          </div>
          <div className="space-y-4 p-4">
            {sections.map((section) => <div key={section.key} className="space-y-1"><p className="px-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted">{section.label}</p>{section.items.map((item) => <div key={item.key} className="rounded-xl bg-surface-subtle/70 p-2.5"><p className="text-sm font-bold text-foreground">{item.label}</p>{item.children?.length ? <div className="mt-2 space-y-1 border-s border-border ps-3">{item.children.map((child) => <div key={child.key} className="rounded-lg px-2 py-1.5 text-xs text-foreground/75">{child.label}</div>)}</div> : null}</div>)}</div>)}
          </div>
        </aside>

        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted">{isRtl ? 'الصفحات الظاهرة' : 'Visible pages'}</p><p className="mt-2 text-3xl font-bold text-foreground">{visiblePages.length}</p></div>
            <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted">{isRtl ? 'مسارات الصلاحية' : 'Access prefixes'}</p><p className="mt-2 text-3xl font-bold text-foreground">{routePrefixes.length}</p></div>
            <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted">{isRtl ? 'نطاق البوتيك' : 'Boutique scope'}</p><p className="mt-2 text-3xl font-bold text-foreground">{selectedBoutiques.length}</p></div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-accent">{isRtl ? 'ما الذي يراه هذا الدور؟' : 'What does this role see?'}</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">{roleLabel(role, isRtl)}</h2>
            <p className="mt-2 text-sm text-muted">{isRtl ? meta.descriptionAr : meta.descriptionEn}</p>
            <div className="mt-5 grid gap-2 md:grid-cols-2">
              {visiblePages.map((page) => <div key={`${page.key}-${page.href}`} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5"><span className="text-sm font-medium text-foreground">{page.label}</span><code className="text-[10px] text-muted">{page.href}</code></div>)}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-foreground">{isRtl ? 'حدود الوصول من الخادم' : 'Server access boundaries'}</h2><span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold text-emerald-800">RBAC</span></div>
            <p className="mt-1 text-xs text-muted">{isRtl ? 'هذه المسارات مأخوذة مباشرة من مصفوفة صلاحيات النظام.' : 'These prefixes come directly from the application route permission matrix.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">{routePrefixes.map((route) => <code key={route} className="rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-xs text-foreground">{route}</code>)}</div>
          </section>
        </div>
      </section>
    </main>
  );
}
