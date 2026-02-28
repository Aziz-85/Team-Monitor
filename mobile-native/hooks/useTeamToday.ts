import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { initDb, getTeamSnapshot, saveTeamSnapshot } from '@/lib/sqlite';
import type { TeamTodayResponse } from '@/types/api';

export function useTeamToday() {
  const [offlineSnapshot, setOfflineSnapshot] = useState<TeamTodayResponse | null>(null);

  useEffect(() => {
    initDb()
      .then(() => getTeamSnapshot())
      .then((raw) => {
        if (raw) {
          try {
            setOfflineSnapshot(JSON.parse(raw) as TeamTodayResponse);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});
  }, []);

  const query = useQuery({
    queryKey: ['team-today'],
    queryFn: async (): Promise<TeamTodayResponse> => {
      const { data } = await api.get<TeamTodayResponse>('/api/mobile/team/today');
      await initDb();
      await saveTeamSnapshot(JSON.stringify(data));
      return data;
    },
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const data = query.data ?? (query.isError ? offlineSnapshot : null);
  const isOffline = query.isError && !!offlineSnapshot;

  return {
    data,
    isOffline: !!isOffline,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
