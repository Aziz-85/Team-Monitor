'use client';

export type MiniTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

export type MiniTableProps = {
  columns: MiniTableColumn[];
  data: Record<string, unknown>[];
};

export function MiniTable({ columns, data }: MiniTableProps) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2 text-slate-900 ${
                    col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                  }`}
                >
                  {row[col.key] != null ? String(row[col.key]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
