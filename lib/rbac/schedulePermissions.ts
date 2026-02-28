import type { Role } from '@prisma/client';

export type UserWithSchedulePermission = {
  role: Role;
  canEditSchedule?: boolean;
};

/**
 * صلاحيات تعديل الجدول:
 * - الأدمن والمدير: دائماً يمكنهم التعديل.
 * - مساعد المدير: له صلاحية تعديل الجدول الأسبوعي (نفس صلاحيات الموظف + التعديل). الصلاحية ممنوحة من الدور.
 */
export function canEditSchedule(user: UserWithSchedulePermission): boolean {
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MANAGER') return true;
  // مساعد المدير: صلاحية التعديل من الدور. القيمة الافتراضية في DB = false لذلك نمنح الصلاحية دائماً لظهور الرابط
  if (user.role === 'ASSISTANT_MANAGER') return true;
  return false;
}


export function canApproveWeek(user: UserWithSchedulePermission): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MANAGER';
}
