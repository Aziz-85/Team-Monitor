'use client';

import { useEffect, useState } from 'react';

type Holiday = { id: string; date: string; name: string; isClosed: boolean; createdAt: string };
type EventPeriod = { id: string; name: string; startDate: string; endDate: string; suspendWeeklyOff: boolean; forceWork: boolean; createdAt: string };

export function AdminCalendarClient() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [eventPeriods, setEventPeriods] = useState<EventPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [holidayForm, setHolidayForm] = useState<{ date: string; name: string; isClosed: boolean } | null>(null);
  const [holidayEditId, setHolidayEditId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<{ name: string; startDate: string; endDate: string; suspendWeeklyOff: boolean; forceWork: boolean } | null>(null);
  const [eventEditId, setEventEditId] = useState<string | null>(null);

  const fetchHolidays = async () => {
    const res = await fetch('/api/admin/calendar/holidays');
    if (res.ok) setHolidays(await res.json());
    else if (res.status === 403) setError('Select a boutique in the scope selector.');
  };
  const fetchEventPeriods = async () => {
    const res = await fetch('/api/admin/calendar/event-periods');
    if (res.ok) setEventPeriods(await res.json());
    else if (res.status === 403) setError('Select a boutique in the scope selector.');
  };

  useEffect(() => {
    setError(null);
    Promise.all([fetchHolidays(), fetchEventPeriods()]).finally(() => setLoading(false));
  }, []);

  const saveHoliday = async () => {
    if (!holidayForm || !holidayForm.date || !holidayForm.name.trim()) return;
    const url = '/api/admin/calendar/holidays';
    const body = holidayEditId
      ? { id: holidayEditId, date: holidayForm.date, name: holidayForm.name.trim(), isClosed: holidayForm.isClosed }
      : { date: holidayForm.date, name: holidayForm.name.trim(), isClosed: holidayForm.isClosed };
    const method = holidayEditId ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setHolidayForm(null);
      setHolidayEditId(null);
      await fetchHolidays();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to save holiday');
    }
  };

  const deleteHoliday = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    const res = await fetch(`/api/admin/calendar/holidays?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) await fetchHolidays();
  };

  const saveEventPeriod = async () => {
    if (!eventForm || !eventForm.name.trim() || !eventForm.startDate || !eventForm.endDate) return;
    if (eventForm.startDate > eventForm.endDate) {
      setError('Start date must be before or equal to end date.');
      return;
    }
    const url = '/api/admin/calendar/event-periods';
    const body = eventEditId
      ? { id: eventEditId, name: eventForm.name.trim(), startDate: eventForm.startDate, endDate: eventForm.endDate, suspendWeeklyOff: eventForm.suspendWeeklyOff, forceWork: eventForm.forceWork }
      : { name: eventForm.name.trim(), startDate: eventForm.startDate, endDate: eventForm.endDate, suspendWeeklyOff: eventForm.suspendWeeklyOff, forceWork: eventForm.forceWork };
    const method = eventEditId ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setEventForm(null);
      setEventEditId(null);
      await fetchEventPeriods();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to save event period');
    }
  };

  const deleteEventPeriod = async (id: string) => {
    if (!confirm('Delete this event period?')) return;
    const res = await fetch(`/api/admin/calendar/event-periods?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) await fetchEventPeriods();
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Calendar</h1>
        <p className="mb-6 text-sm text-slate-600">
          Use the boutique selector in the sidebar to choose which branch to manage. Official holidays (closed = non-working; open = working) and event periods (suspend weekly off / force work) apply to the selected boutique.
        </p>

        {error && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        )}

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium text-slate-800">Official Holidays</h2>
          <p className="mb-3 text-xs text-slate-500">Closed = boutique non-working (HOLIDAY). Open = holiday but boutique working; normal weekly off rules apply.</p>
          {holidayForm ? (
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-3">
              <label className="flex flex-col gap-1 text-sm">
                Date
                <input
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((f) => f && { ...f, date: e.target.value })}
                  className="rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  type="text"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm((f) => f && { ...f, name: e.target.value })}
                  placeholder="e.g. Eid AlFitr Day 1"
                  className="min-w-[160px] rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={holidayForm.isClosed}
                  onChange={(e) => setHolidayForm((f) => f && { ...f, isClosed: e.target.checked })}
                  className="rounded"
                />
                Boutique closed
              </label>
              <button
                type="button"
                onClick={saveHoliday}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
              >
                {holidayEditId ? 'Update' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setHolidayForm(null); setHolidayEditId(null); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setHolidayForm({ date: '', name: '', isClosed: true })}
              className="mb-3 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              + Add holiday
            </button>
          )}
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Date</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Name</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Closed</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-end font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-slate-500">No holidays defined.</td></tr>
                ) : (
                  holidays.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{h.date}</td>
                      <td className="px-3 py-2">{h.name}</td>
                      <td className="px-3 py-2">{h.isClosed ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2 text-end">
                        <button
                          type="button"
                          onClick={() => { setHolidayEditId(h.id); setHolidayForm({ date: h.date, name: h.name, isClosed: h.isClosed }); }}
                          className="me-2 text-slate-600 underline hover:text-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHoliday(h.id)}
                          className="text-red-600 underline hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Event Periods */}
        <section>
          <h2 className="mb-3 text-lg font-medium text-slate-800">Event Periods</h2>
          <p className="mb-3 text-xs text-slate-500">Suspend weekly off and/or treat days as workable (e.g. Bridal Week, Ramadan Peak). Day overrides and closed holidays still apply.</p>
          {eventForm ? (
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-3">
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  type="text"
                  value={eventForm.name}
                  onChange={(e) => setEventForm((f) => f && { ...f, name: e.target.value })}
                  placeholder="e.g. Ramadan Peak"
                  className="min-w-[180px] rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Start date
                <input
                  type="date"
                  value={eventForm.startDate}
                  onChange={(e) => setEventForm((f) => f && { ...f, startDate: e.target.value })}
                  className="rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                End date
                <input
                  type="date"
                  value={eventForm.endDate}
                  onChange={(e) => setEventForm((f) => f && { ...f, endDate: e.target.value })}
                  className="rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={eventForm.suspendWeeklyOff}
                  onChange={(e) => setEventForm((f) => f && { ...f, suspendWeeklyOff: e.target.checked })}
                  className="rounded"
                />
                Suspend weekly off
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={eventForm.forceWork}
                  onChange={(e) => setEventForm((f) => f && { ...f, forceWork: e.target.checked })}
                  className="rounded"
                />
                Force work
              </label>
              <button
                type="button"
                onClick={saveEventPeriod}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
              >
                {eventEditId ? 'Update' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setEventForm(null); setEventEditId(null); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEventForm({ name: '', startDate: '', endDate: '', suspendWeeklyOff: true, forceWork: false })}
              className="mb-3 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              + Add event period
            </button>
          )}
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Name</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Start</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">End</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Suspend off</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-start font-medium text-slate-700">Force work</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-end font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {eventPeriods.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-slate-500">No event periods defined.</td></tr>
                ) : (
                  eventPeriods.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2">{s.startDate}</td>
                      <td className="px-3 py-2">{s.endDate}</td>
                      <td className="px-3 py-2">{s.suspendWeeklyOff ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{s.forceWork ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2 text-end">
                        <button
                          type="button"
                          onClick={() => { setEventEditId(s.id); setEventForm({ name: s.name, startDate: s.startDate, endDate: s.endDate, suspendWeeklyOff: s.suspendWeeklyOff, forceWork: s.forceWork }); }}
                          className="me-2 text-slate-600 underline hover:text-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEventPeriod(s.id)}
                          className="text-red-600 underline hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-6 text-xs text-slate-500">
          Day overrides (Force Work / Force Off) and comp day ledger are managed from the Schedule Editor: use the cell actions per employee/day and the comp balance badge per employee.
        </p>
      </div>
    </div>
  );
}
