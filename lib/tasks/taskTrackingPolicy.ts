import { prisma } from '@/lib/db';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';

export const TASK_TRACKING_LAUNCH_DATE_KEY = 'TASK_TRACKING_LAUNCH_DATE';

export async function getTaskTrackingLaunchDate(): Promise<string> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: TASK_TRACKING_LAUNCH_DATE_KEY },
    select: { valueJson: true },
  });

  if (config?.valueJson) {
    try {
      const value = JSON.parse(config.valueJson);
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    } catch {
      // Fall through to the safe launch-day default.
    }
  }

  return getRiyadhDateKey();
}
