'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { useT } from '@/lib/i18n/useT';
import { DEFAULT_BOUTIQUE_CONFIGURATION, DEFAULT_SHIFT_TEMPLATES, defaultCoveragePolicy } from '@/lib/boutique-config/defaults';
import type {
  BoutiqueConfigurationValues,
  CoveragePolicyValues,
  ShiftTemplateValues,
  SpecialPeriodValues,
} from '@/lib/boutique-config/types';

type Boutique = { id: string; code: string; name: string };

// Display order: Saturday → Friday (JS getDay indices)
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const DAY_KEYS = ['days.sun', 'days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat'];

const TEMPLATE_TYPES = ['MORNING', 'EVENING', 'BRIDGE', 'CUSTOM'] as const;
const SPECIAL_TYPES = ['RAMADAN', 'EID_AL_FITR', 'EID_AL_ADHA', 'NATIONAL_DAY', 'FOUNDING_DAY', 'SEASON', 'CUSTOM'] as const;
const WEEKLY_OFF = ['FIXED', 'FLEXIBLE', 'DEFERRED_ALLOWED'] as const;
const EXTERNAL_PRIORITY = ['BEFORE_WEEKLY_OFF_MOVE', 'AFTER_WEEKLY_OFF_MOVE', 'AFTER_BRIDGE', 'LAST_RESORT'] as const;
const PLANNING = ['MAXIMUM_COVERAGE', 'LOWEST_COST', 'LEAST_BRIDGE', 'LEAST_OVERTIME', 'BALANCED'] as const;

type ApiTemplate = ShiftTemplateValues;
type ApiCoverage = CoveragePolicyValues;
type ApiPeriod = Omit<SpecialPeriodValues, 'startDate' | 'endDate'> & { startDate: string; endDate: string };

function emptyPeriod(): SpecialPeriodValues {
  return {
    name: '',
    type: 'CUSTOM',
    startDate: '',
    endDate: '',
    openTime: '09:30',
    closeTime: '22:00',
    secondOpenTime: null,
    secondCloseTime: null,
    minMorningCoverage: null,
    minEveningCoverage: null,
    minTotalCoverage: null,
    suspendWeeklyOff: false,
    allowExternalSupport: true,
    notes: null,
    isActive: true,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <OpsCard title={title} className="mb-4">
      {children}
    </OpsCard>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-border" />
      {label}
    </label>
  );
}

export function BoutiqueConfigurationClient() {
  const { t } = useT();
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: 'success' | 'error' | 'warning'; message: string } | null>(null);

  const [config, setConfig] = useState<BoutiqueConfigurationValues>({ ...DEFAULT_BOUTIQUE_CONFIGURATION });
  const [templates, setTemplates] = useState<ShiftTemplateValues[]>(DEFAULT_SHIFT_TEMPLATES.map((x) => ({ ...x })));
  const [coverage, setCoverage] = useState<CoveragePolicyValues[]>(defaultCoveragePolicy());
  const [periods, setPeriods] = useState<SpecialPeriodValues[]>([]);

  const setConfigField = <K extends keyof BoutiqueConfigurationValues>(key: K, value: BoutiqueConfigurationValues[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const loadBoutiques = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/boutique-configuration');
      const data = await res.json();
      const list: Boutique[] = Array.isArray(data.boutiques) ? data.boutiques : [];
      setBoutiques(list);
      if (list.length && !boutiqueId) setBoutiqueId(list[0].id);
    } catch {
      setFeedback({ variant: 'error', message: t('boutiqueConfig.loadFailed') });
    }
  }, [boutiqueId, t]);

  const loadConfig = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      setFeedback(null);
      try {
        const res = await fetch(`/api/admin/boutique-configuration?boutiqueId=${encodeURIComponent(id)}`);
        const data = await res.json();
        const hasConfig = Boolean(data.config);
        setUsingDefaults(!hasConfig);
        setConfig(hasConfig ? { ...DEFAULT_BOUTIQUE_CONFIGURATION, ...data.config } : { ...DEFAULT_BOUTIQUE_CONFIGURATION });
        const tpl: ApiTemplate[] = Array.isArray(data.shiftTemplates) ? data.shiftTemplates : [];
        setTemplates(tpl.length ? tpl.map((x) => ({ ...x })) : DEFAULT_SHIFT_TEMPLATES.map((x) => ({ ...x })));
        const cov: ApiCoverage[] = Array.isArray(data.coveragePolicy) ? data.coveragePolicy : [];
        setCoverage(cov.length ? cov.map((x) => ({ ...x })) : defaultCoveragePolicy());
        const per: ApiPeriod[] = Array.isArray(data.specialPeriods) ? data.specialPeriods : [];
        setPeriods(
          per.map((p) => ({
            ...p,
            startDate: (p.startDate ?? '').slice(0, 10),
            endDate: (p.endDate ?? '').slice(0, 10),
          }))
        );
      } catch {
        setFeedback({ variant: 'error', message: t('boutiqueConfig.loadFailed') });
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    loadBoutiques();
  }, [loadBoutiques]);

  useEffect(() => {
    if (boutiqueId) loadConfig(boutiqueId);
  }, [boutiqueId, loadConfig]);

  async function handleSave() {
    if (!boutiqueId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/boutique-configuration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, config, shiftTemplates: templates, coveragePolicy: coverage, specialPeriods: periods }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.details) && data.details.length ? `: ${data.details[0].field} — ${data.details[0].message}` : '';
        setFeedback({ variant: 'error', message: `${t('boutiqueConfig.saveFailed')}${detail}` });
        return;
      }
      setUsingDefaults(false);
      setFeedback({ variant: 'success', message: t('boutiqueConfig.saved') });
      await loadConfig(boutiqueId);
    } catch {
      setFeedback({ variant: 'error', message: t('boutiqueConfig.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function handleInitialize() {
    if (!boutiqueId) return;
    setSaving(true);
    try {
      await fetch('/api/admin/boutique-configuration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId }),
      });
      await loadConfig(boutiqueId);
      setFeedback({ variant: 'success', message: t('boutiqueConfig.saved') });
    } finally {
      setSaving(false);
    }
  }

  async function handleBackfillAll() {
    setSaving(true);
    try {
      await fetch('/api/admin/boutique-configuration/backfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setFeedback({ variant: 'success', message: t('boutiqueConfig.backfillDone') });
      if (boutiqueId) await loadConfig(boutiqueId);
    } finally {
      setSaving(false);
    }
  }

  const orderedCoverage = DAY_ORDER.map((day) => coverage.find((c) => c.dayOfWeek === day)).filter((c): c is CoveragePolicyValues => Boolean(c));

  function updateCoverage(day: number, patch: Partial<CoveragePolicyValues>) {
    setCoverage((prev) => prev.map((c) => (c.dayOfWeek === day ? { ...c, ...patch } : c)));
  }

  function updateTemplate(index: number, patch: Partial<ShiftTemplateValues>) {
    setTemplates((prev) => prev.map((tpl, i) => (i === index ? { ...tpl, ...patch } : tpl)));
  }

  function updatePeriod(index: number, patch: Partial<SpecialPeriodValues>) {
    setPeriods((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            {t('boutiqueConfig.title')}
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {t('boutiqueConfig.experimentalBadge')}
            </span>
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('boutiqueConfig.subtitle')}</p>
        </div>
        <Button variant="secondary" onClick={handleBackfillAll} disabled={saving}>
          {t('boutiqueConfig.runBackfill')}
        </Button>
      </div>

      {feedback && (
        <FeedbackBanner variant={feedback.variant} message={feedback.message} className="mb-4" onDismiss={() => setFeedback(null)} />
      )}

      {/* A. Boutique Selector */}
      <Section title={t('boutiqueConfig.selectBoutique')}>
        <div className="max-w-md">
          <Select
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            options={[
              { value: '', label: t('boutiqueConfig.selectBoutiquePlaceholder') },
              ...boutiques.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` })),
            ]}
          />
        </div>
        {usingDefaults && boutiqueId && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-amber-700">{t('boutiqueConfig.usingDefaults')}</p>
            <Button variant="secondary" onClick={handleInitialize} disabled={saving}>
              {t('boutiqueConfig.initialize')}
            </Button>
          </div>
        )}
      </Section>

      {loading ? (
        <OpsCard>
          <p className="text-sm text-muted">…</p>
        </OpsCard>
      ) : (
        boutiqueId && (
          <>
            {/* B. Operating Hours */}
            <Section title={t('boutiqueConfig.sections.operatingHours')}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Input label={t('boutiqueConfig.hours.timezone')} value={config.timezone} onChange={(e) => setConfigField('timezone', e.target.value)} />
                <Input label={t('boutiqueConfig.hours.normalOpen')} type="time" value={config.normalOpenTime} onChange={(e) => setConfigField('normalOpenTime', e.target.value)} />
                <Input label={t('boutiqueConfig.hours.normalClose')} type="time" value={config.normalCloseTime} onChange={(e) => setConfigField('normalCloseTime', e.target.value)} />
                <Input label={t('boutiqueConfig.hours.fridayOpen')} type="time" value={config.fridayOpenTime} onChange={(e) => setConfigField('fridayOpenTime', e.target.value)} />
                <Input label={t('boutiqueConfig.hours.fridayClose')} type="time" value={config.fridayCloseTime} onChange={(e) => setConfigField('fridayCloseTime', e.target.value)} />
              </div>
            </Section>

            {/* C. Shift Templates */}
            <Section title={t('boutiqueConfig.sections.shiftTemplates')}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.name')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.code')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.type')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.start')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.end')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.secondStart')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.secondEnd')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.active')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.templates.default')}</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((tpl, i) => (
                      <tr key={i} className="border-b border-border align-middle">
                        <td className="px-2 py-1.5"><Input value={tpl.name} onChange={(e) => updateTemplate(i, { name: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><Input value={tpl.code} onChange={(e) => updateTemplate(i, { code: e.target.value })} /></td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={tpl.type}
                            onChange={(e) => updateTemplate(i, { type: e.target.value as ShiftTemplateValues['type'] })}
                            options={TEMPLATE_TYPES.map((v) => ({ value: v, label: t(`boutiqueConfig.types.${v}`) }))}
                          />
                        </td>
                        <td className="px-2 py-1.5"><Input type="time" value={tpl.startTime} onChange={(e) => updateTemplate(i, { startTime: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><Input type="time" value={tpl.endTime} onChange={(e) => updateTemplate(i, { endTime: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><Input type="time" value={tpl.secondStartTime ?? ''} onChange={(e) => updateTemplate(i, { secondStartTime: e.target.value || null })} /></td>
                        <td className="px-2 py-1.5"><Input type="time" value={tpl.secondEndTime ?? ''} onChange={(e) => updateTemplate(i, { secondEndTime: e.target.value || null })} /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={tpl.isActive} onChange={(e) => updateTemplate(i, { isActive: e.target.checked })} className="h-4 w-4" /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={tpl.isDefault} onChange={(e) => updateTemplate(i, { isDefault: e.target.checked })} className="h-4 w-4" /></td>
                        <td className="px-2 py-1.5 text-center">
                          <Button variant="ghost" onClick={() => setTemplates((prev) => prev.filter((_, idx) => idx !== i))}>×</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() =>
                  setTemplates((prev) => [
                    ...prev,
                    { code: '', name: '', type: 'CUSTOM', startTime: '09:30', endTime: '17:30', secondStartTime: null, secondEndTime: null, isDefault: false, isActive: true, sortOrder: prev.length + 1 },
                  ])
                }
              >
                {t('boutiqueConfig.templates.add')}
              </Button>
            </Section>

            {/* D. Coverage Rules */}
            <Section title={t('boutiqueConfig.sections.coverage')}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-2 py-2">{t('boutiqueConfig.coverage.day')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.coverage.minMorning')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.coverage.minEvening')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.coverage.minTotal')}</th>
                      <th className="px-2 py-2">{t('boutiqueConfig.coverage.active')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedCoverage.map((c) => (
                      <tr key={c.dayOfWeek} className="border-b border-border">
                        <td className="px-2 py-1.5 font-medium">{t(DAY_KEYS[c.dayOfWeek])}</td>
                        <td className="px-2 py-1.5 w-28"><Input type="number" min={0} value={c.minMorning} onChange={(e) => updateCoverage(c.dayOfWeek, { minMorning: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1.5 w-28"><Input type="number" min={0} value={c.minEvening} onChange={(e) => updateCoverage(c.dayOfWeek, { minEvening: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1.5 w-28"><Input type="number" min={0} value={c.minTotal ?? ''} onChange={(e) => updateCoverage(c.dayOfWeek, { minTotal: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={c.isActive} onChange={(e) => updateCoverage(c.dayOfWeek, { isActive: e.target.checked })} className="h-4 w-4" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* E. Weekly Off Policy */}
              <Section title={t('boutiqueConfig.sections.weeklyOff')}>
                <div className="grid gap-4">
                  <Select
                    label={t('boutiqueConfig.weeklyOff.policy')}
                    value={config.weeklyOffPolicy}
                    onChange={(e) => setConfigField('weeklyOffPolicy', e.target.value as BoutiqueConfigurationValues['weeklyOffPolicy'])}
                    options={WEEKLY_OFF.map((v) => ({ value: v, label: t(`boutiqueConfig.weeklyOff.${v}`) }))}
                  />
                  <Input label={t('boutiqueConfig.weeklyOff.recoveryDay')} value={config.preferredWeeklyOffRecoveryDay} onChange={(e) => setConfigField('preferredWeeklyOffRecoveryDay', e.target.value)} />
                  <Checkbox label={t('boutiqueConfig.weeklyOff.allowDeferral')} checked={config.allowWeeklyOffDeferral} onChange={(v) => setConfigField('allowWeeklyOffDeferral', v)} />
                  <Input label={t('boutiqueConfig.weeklyOff.maxDeferred')} type="number" min={0} value={config.maxDeferredWeeklyOffPerWeek} onChange={(e) => setConfigField('maxDeferredWeeklyOffPerWeek', Number(e.target.value))} />
                </div>
              </Section>

              {/* F. Bridge / Split Policy */}
              <Section title={t('boutiqueConfig.sections.bridge')}>
                <div className="grid gap-4">
                  <Checkbox label={t('boutiqueConfig.bridge.allow')} checked={config.allowBridgeShift} onChange={(v) => setConfigField('allowBridgeShift', v)} />
                  <Input label={t('boutiqueConfig.bridge.maxDays')} type="number" min={0} value={config.maxBridgeDaysPerEmployeePerWeek} onChange={(e) => setConfigField('maxBridgeDaysPerEmployeePerWeek', Number(e.target.value))} />
                </div>
              </Section>

              {/* G. External Support */}
              <Section title={t('boutiqueConfig.sections.externalSupport')}>
                <div className="grid gap-4">
                  <Checkbox label={t('boutiqueConfig.external.allow')} checked={config.allowExternalSupport} onChange={(v) => setConfigField('allowExternalSupport', v)} />
                  <Select
                    label={t('boutiqueConfig.external.priority')}
                    value={config.externalSupportPriority}
                    onChange={(e) => setConfigField('externalSupportPriority', e.target.value as BoutiqueConfigurationValues['externalSupportPriority'])}
                    options={EXTERNAL_PRIORITY.map((v) => ({ value: v, label: t(`boutiqueConfig.external.${v}`) }))}
                  />
                </div>
              </Section>

              {/* H. Overtime */}
              <Section title={t('boutiqueConfig.sections.overtime')}>
                <div className="grid gap-4">
                  <Checkbox label={t('boutiqueConfig.overtime.allow')} checked={config.allowOvertime} onChange={(v) => setConfigField('allowOvertime', v)} />
                  <Input label={t('boutiqueConfig.overtime.maxHours')} type="number" min={0} value={config.maxOvertimeHoursPerEmployeePerDay} onChange={(e) => setConfigField('maxOvertimeHoursPerEmployeePerDay', Number(e.target.value))} />
                </div>
              </Section>
            </div>

            {/* I. Holidays & Special Periods */}
            <Section title={t('boutiqueConfig.sections.specialPeriods')}>
              {periods.length === 0 && <p className="mb-3 text-sm text-muted">{t('boutiqueConfig.special.empty')}</p>}
              <div className="space-y-4">
                {periods.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                      <Input label={t('boutiqueConfig.special.name')} value={p.name} onChange={(e) => updatePeriod(i, { name: e.target.value })} />
                      <Select
                        label={t('boutiqueConfig.special.type')}
                        value={p.type}
                        onChange={(e) => updatePeriod(i, { type: e.target.value as SpecialPeriodValues['type'] })}
                        options={SPECIAL_TYPES.map((v) => ({ value: v, label: t(`boutiqueConfig.specialTypes.${v}`) }))}
                      />
                      <Input label={t('boutiqueConfig.special.startDate')} type="date" value={p.startDate} onChange={(e) => updatePeriod(i, { startDate: e.target.value })} />
                      <Input label={t('boutiqueConfig.special.endDate')} type="date" value={p.endDate} onChange={(e) => updatePeriod(i, { endDate: e.target.value })} />
                      <Input label={t('boutiqueConfig.special.open')} type="time" value={p.openTime} onChange={(e) => updatePeriod(i, { openTime: e.target.value })} />
                      <Input label={t('boutiqueConfig.special.close')} type="time" value={p.closeTime} onChange={(e) => updatePeriod(i, { closeTime: e.target.value })} />
                      <Input label={t('boutiqueConfig.special.secondOpen')} type="time" value={p.secondOpenTime ?? ''} onChange={(e) => updatePeriod(i, { secondOpenTime: e.target.value || null })} />
                      <Input label={t('boutiqueConfig.special.secondClose')} type="time" value={p.secondCloseTime ?? ''} onChange={(e) => updatePeriod(i, { secondCloseTime: e.target.value || null })} />
                      <Input label={t('boutiqueConfig.special.minMorning')} type="number" min={0} value={p.minMorningCoverage ?? ''} onChange={(e) => updatePeriod(i, { minMorningCoverage: e.target.value === '' ? null : Number(e.target.value) })} />
                      <Input label={t('boutiqueConfig.special.minEvening')} type="number" min={0} value={p.minEveningCoverage ?? ''} onChange={(e) => updatePeriod(i, { minEveningCoverage: e.target.value === '' ? null : Number(e.target.value) })} />
                      <Input label={t('boutiqueConfig.special.minTotal')} type="number" min={0} value={p.minTotalCoverage ?? ''} onChange={(e) => updatePeriod(i, { minTotalCoverage: e.target.value === '' ? null : Number(e.target.value) })} />
                      <Input label={t('boutiqueConfig.special.notes')} value={p.notes ?? ''} onChange={(e) => updatePeriod(i, { notes: e.target.value || null })} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <Checkbox label={t('boutiqueConfig.special.suspendWeeklyOff')} checked={p.suspendWeeklyOff} onChange={(v) => updatePeriod(i, { suspendWeeklyOff: v })} />
                      <Checkbox label={t('boutiqueConfig.special.allowExternal')} checked={p.allowExternalSupport} onChange={(v) => updatePeriod(i, { allowExternalSupport: v })} />
                      <Checkbox label={t('boutiqueConfig.special.active')} checked={p.isActive} onChange={(v) => updatePeriod(i, { isActive: v })} />
                      <Button variant="ghost" onClick={() => setPeriods((prev) => prev.filter((_, idx) => idx !== i))}>
                        {t('boutiqueConfig.special.remove')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="secondary" className="mt-3" onClick={() => setPeriods((prev) => [...prev, emptyPeriod()])}>
                {t('boutiqueConfig.special.add')}
              </Button>
            </Section>

            {/* J. Planning Strategy */}
            <Section title={t('boutiqueConfig.sections.planning')}>
              <div className="max-w-md">
                <Select
                  label={t('boutiqueConfig.planning.strategy')}
                  value={config.planningStrategy}
                  onChange={(e) => setConfigField('planningStrategy', e.target.value as BoutiqueConfigurationValues['planningStrategy'])}
                  options={PLANNING.map((v) => ({ value: v, label: t(`boutiqueConfig.planning.${v}`) }))}
                />
              </div>
            </Section>

            {/* K. Save Changes */}
            <div className="sticky bottom-0 mt-4 flex justify-end gap-3 border-t border-border bg-background/80 py-3 backdrop-blur">
              <Button onClick={handleSave} disabled={saving}>
                {t('boutiqueConfig.save')}
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
