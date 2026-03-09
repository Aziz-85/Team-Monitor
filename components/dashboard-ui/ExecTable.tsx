'use client';

export type ExecTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

export type ExecTableProps = {
  columns: ExecTableColumn[];
  data: Record<string, unknown>[];
  className?: string;
};

export function ExecTable({ columns, data, className = '' }: ExecTableProps) {
  return (
    <div className={`min-w-0 overflow-hidden ${className}`}>
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-surface-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 px-3 text-[11px] font-medium uppercase tracking-wide text-muted ${
                  col.align === 'right' ? 'text-end' : 'text-start'
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
              className="border-b border-border last:border-b-0 hover:bg-surface-subtle"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`max-w-0 py-3 px-3 truncate ${
                    col.align === 'right' ? 'text-end tabular-nums' : 'text-start'
                  } text-foreground`}
                  title={row[col.key] != null ? String(row[col.key]) : undefined}
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
