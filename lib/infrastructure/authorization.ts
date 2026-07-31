import { requireRole } from '@/lib/auth';

export async function requireInfrastructureAdmin() {
  return requireRole(['SUPER_ADMIN']);
}
