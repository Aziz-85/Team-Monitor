'use client';

export type EmployeeOption = { empId: string; name: string };

/** First name if unique in list; otherwise full name */
function displayName(name: string, allNames: string[]): string {
  const first = name.split(/\s+/)[0] ?? name;
  const sameFirst = allNames.filter((n) => (n.split(/\s+/)[0] ?? n) === first);
  return sameFirst.length > 1 ? name : first;
}

export function EmployeeSelect({
  value,
  onChange,
  allowEmpty,
  label,
  employees,
  disabled,
}: {
  value: string;
  onChange: (empId: string) => void;
  allowEmpty?: boolean;
  label: string;
  employees: EmployeeOption[];
  disabled?: boolean;
}) {
  const allNames = employees.map((e) => e.name);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
      >
        {allowEmpty && <option value="">—</option>}
        {employees.map((emp) => (
          <option key={emp.empId} value={emp.empId}>
            {displayName(emp.name, allNames)} ({emp.empId})
          </option>
        ))}
      </select>
    </div>
  );
}
