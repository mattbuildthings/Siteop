import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  /** `danger` for content that reads as a problem (delays, incidents). */
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}

/**
 * A folded row-editor section on the capture review screen. The daily-log
 * content fields (delays, deliveries, equipment, visitors, safety, quantities)
 * add six more editable sections to a screen that already had materials and
 * labor -- collapsed by default keeps the common case (nothing to report)
 * a one-line row instead of six empty tables.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  count,
  defaultOpen = false,
  tone = 'default',
  children
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-3 py-3 text-left cursor-pointer transition ${
          tone === 'danger' ? 'bg-danger/8 hover:bg-danger/12' : 'bg-card-alt hover:bg-paper-soft'
        }`}
      >
        <span className={`text-sm font-bold ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>
          {title}
          {typeof count === 'number' ? ` (${count})` : ''}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${
            tone === 'danger' ? 'text-danger' : 'text-ink-soft'
          }`}
        />
      </button>
      {open && <div className="p-3 space-y-3 border-t border-border">{children}</div>}
    </div>
  );
};
