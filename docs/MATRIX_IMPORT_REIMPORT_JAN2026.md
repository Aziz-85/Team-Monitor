# إعادة استيراد يناير 2026 — Matrix Import

## ما تم تنفيذه

1. **مسح البيانات الخاطئة** — تم حذف 75 سجل SalesEntry لشهر يناير 2026 (كان اليوم 01 يعرض 177,450 بدلاً من 47,300).

2. **التصحيحات المطبقة في الكود:**
   - Parser: استخدام `dateKeyUTC` (تقويم UTC) بدلاً من Riyadh لتطابق عرض المصفوفة
   - Sales Import Matrix: scopeId fill-down، اختيار الشهر الصريح، فلترة بالـ dateKey
   - Admin Monthly Matrix: قبول boutique.code (مثل S02) في ScopeId، scopeId fill-down

## خطوات إعادة الاستيراد

### الطريقة 1: Sales → Monthly Import (Matrix)

1. افتح **Sales** → **Monthly Import (Matrix)** (أو من القائمة الجانبية)
2. اختر ملف الإكسل
3. حدد **Import month: 2026-01**
4. فعّل **Force overwrite (including LEDGER)**
5. اضغط **Preview** ثم **Apply**

### الطريقة 2: Admin → Import → Monthly Matrix

1. افتح **Admin** → **Import** → **Monthly Matrix**
2. اختر ملف الإكسل
3. حدد الشهر **2026-01**
4. اضغط **Apply**

### بعد الاستيراد

- حدّث صفحة **Monthly Matrix** (F5)
- تحقق أن عمود **01** يعرض المجموع الصحيح (مثلاً 47,300 إذا كان ذلك في الإكسل)

## التحقق من ملف الإكسل

تأكد أن صف **2026-01-01** في عمود Date يحتوي على المجموع الصحيح لليوم الأول. إذا كان المجموع في الإكسل نفسه خاطئاً، ستظهر الأرقام الخاطئة بعد الاستيراد.
