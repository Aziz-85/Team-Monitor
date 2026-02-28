-- Data migration: مساعد المدير يملك صلاحية تعديل الجدول افتراضياً (الأدمن يستطيع سحبها لاحقاً).
UPDATE "User" SET "canEditSchedule" = true WHERE role = 'ASSISTANT_MANAGER';
