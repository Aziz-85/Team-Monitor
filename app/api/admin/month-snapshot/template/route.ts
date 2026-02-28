import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireRole, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'SUPER_ADMIN']);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw e;
  }

  const dailyRows = [
    ['Date', 'NetSales', 'Invoices', 'Pieces'],
    ['YYYY-MM-01', 0, 0, 0],
    ['YYYY-MM-02', 0, 0, 0],
    ['YYYY-MM-03', 0, 0, 0],
    ['YYYY-MM-04', 0, 0, 0],
    ['YYYY-MM-05', 0, 0, 0],
  ];
  const staffRows = [
    ['EmpId', 'EmployeeName', 'Role', 'Target', 'Sales', 'Invoices', 'Pieces'],
    ['EMP001', 'Example One', 'SALES', 10000, 0, 0, 0],
    ['EMP002', 'Example Two', 'SALES', 8000, 0, 0, 0],
    ['EMP003', 'Example Three', 'SALES', 9000, 0, 0, 0],
  ];

  const wsDaily = XLSX.utils.aoa_to_sheet(dailyRows);
  const wsStaff = XLSX.utils.aoa_to_sheet(staffRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily');
  XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = 'MonthSnapshotTemplate.xlsx';
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    },
  });
}
