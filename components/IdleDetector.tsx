'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useT } from '@/lib/i18n/useT';

const DEFAULT_IDLE_MINUTES = 720;   // 12 hours
const DEFAULT_WARNING_MINUTES = 718; // warn 2 min before logout

export function IdleDetector() {
  const { t } = useT();
  const [warning, setWarning] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState(DEFAULT_IDLE_MINUTES);
  const [warningMinutes, setWarningMinutes] = useState(DEFAULT_WARNING_MINUTES);
  const timeoutWarningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutLogoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const clearTimers = useCallback(() => {
    if (timeoutWarningRef.current) {
      clearTimeout(timeoutWarningRef.current);
      timeoutWarningRef.current = null;
    }
    if (timeoutLogoutRef.current) {
      clearTimeout(timeoutLogoutRef.current);
      timeoutLogoutRef.current = null;
    }
    setWarning(false);
  }, []);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    const warnMs = warningMinutes * 60 * 1000;
    const logoutMs = idleMinutes * 60 * 1000;

    timeoutWarningRef.current = setTimeout(() => {
      setWarning(true);
    }, warnMs);

    timeoutLogoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } finally {
        window.location.href = '/login?reason=idle';
      }
    }, logoutMs);
  }, [idleMinutes, warningMinutes, clearTimers]);

  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    scheduleTimers();
  }, [scheduleTimers]);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { idleMinutes?: number; idleWarningMinutes?: number }) => {
        if (data.idleMinutes != null) setIdleMinutes(data.idleMinutes);
        if (data.idleWarningMinutes != null) setWarningMinutes(data.idleWarningMinutes);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((ev) => document.addEventListener(ev, onActivity));
    scheduleTimers();
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, onActivity));
      clearTimers();
    };
  }, [onActivity, scheduleTimers, clearTimers]);

  if (!warning) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 start-4 end-4 z-[100] rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900 shadow-lg md:start-1/2 md:end-auto md:w-full md:max-w-md md:-translate-x-1/2"
    >
      {t('idle.warning')}
    </div>
  );
}
