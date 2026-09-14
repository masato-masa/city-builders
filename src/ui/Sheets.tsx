import type { ReactNode } from 'react';

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{title}</h2>
        {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
