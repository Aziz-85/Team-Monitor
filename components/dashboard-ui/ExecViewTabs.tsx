'use client';

export type ExecPageView = 'Executive' | 'Operator' | 'Investor';

export type ExecViewTabsProps = {
  value: ExecPageView;
  onChange: (view: ExecPageView) => void;
  'aria-label'?: string;
};

export function ExecViewTabs({
  value,
  onChange,
  'aria-label': ariaLabel = 'View',
}: ExecViewTabsProps) {
  const tabs: { id: ExecPageView; label: string }[] = [
    { id: 'Executive', label: 'Executive' },
    { id: 'Operator', label: 'Operator' },
    { id: 'Investor', label: 'Investor' },
  ];
  return (
    <nav
      className="flex min-w-0 border-b border-border"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`min-w-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-foreground font-semibold text-foreground'
                : 'border-transparent text-muted hover:border-border hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
