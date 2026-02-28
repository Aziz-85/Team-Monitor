import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { MeResponse } from '@/types/api';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeResponse> => {
      const { data } = await api.get<MeResponse>('/api/mobile/me');
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
