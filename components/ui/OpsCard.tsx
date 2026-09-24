import { ReactNode } from 'react';

export function OpsCard({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`app-card w-full min-w-0 max-w-full p-4 md:p-6 ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center gap-3 border-b border-border/60 pb-3">
          <span className="h-5 w-1 rounded-full bg-accent" aria-hidden />
          <h2 className="text-[15px] font-bold tracking-tight text-foreground">{title}</h2>
        </div>
      ) : null}
      {children}
    </div>
  );
}
