import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  initDb,
  getManagerDashboardSnapshot,
  saveManagerDashboardSnapshot,
} from '@/lib/sqlite';
import type { ManagerDashboardResponse } from '@/types/api';
import type { Role } from '@/types/api';

const MANAGER_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

/** When true and __DEV__, fetch target source debug endpoint and log to console. */
const DEV_LOG_TARGET_SOURCE = true;

function isManagerRole(role: Role): boolean {
  return MANAGER_ROLES.includes(role);
}

export function useManagerDashboard(role: Role) {
  const [offlineSnapshot, setOfflineSnapshot] = useState<ManagerDashboardResponse | null>(null);

  useEffect(() => {
    if (!isManagerRole(role)) return;
    initDb()
      .then(() => getManagerDashboardSnapshot())
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as ManagerDashboardResponse;
            setOfflineSnapshot(parsed);
          } catch {
            // ignore invalid stored json
          }
        }
      })
      .catch(() => {});
  }, [role]);

  const query = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: async (): Promise<ManagerDashboardResponse> => {
      const { data } = await api.get<ManagerDashboardResponse>(
        '/api/mobile/dashboard/manager'
      );
      await initDb();
      await saveManagerDashboardSnapshot(JSON.stringify(data));
      if (typeof __DEV__ !== 'undefined' && __DEV__ && DEV_LOG_TARGET_SOURCE) {
        try {
          const res = await api.get<{
            date: string;
            boutiqueId: string;
            dailyTarget: number;
            source: { kind: string; table?: string; recordIds?: string[]; notes?: string };
            computed: { monthlyTarget?: number; calendarDays?: number; formula?: string };
          }>(`/api/mobile/dashboard/targets/source?date=${encodeURIComponent(data.date)}`);
          console.log('[ManagerDashboard] target source:', JSON.stringify(res.data, null, 2));
        } catch {
          // ignore debug fetch errors
        }
      }
      return data;
    },
    enabled: isManagerRole(role),
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const data = query.data ?? (query.isError ? offlineSnapshot : null);
  const isOffline = query.isError && !!offlineSnapshot;

  return {
    data,
    offlineSnapshot: query.isError ? offlineSnapshot : null,
    isOffline: !!isOffline,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
