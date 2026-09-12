import React from 'react';

/** Ported from .claude/skills/site-ops-design/components/navigation/Tabs.jsx. */
export interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange }) => (
  <div className="flex gap-6 border-b border-border">
    {tabs.map((t) => (
      <button
        key={t}
        onClick={() => onChange(t)}
        className={
          'py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer transition-colors ' +
          (t === active ? 'text-accent border-accent' : 'text-ink-soft border-transparent hover:text-ink')
        }
      >
        {t}
      </button>
    ))}
  </div>
);
