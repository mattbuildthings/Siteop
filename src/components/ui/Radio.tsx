import React from 'react';

/** Ported from .claude/skills/site-ops-design/components/forms/Radio.jsx. */
export interface RadioProps {
  label?: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}

export const Radio: React.FC<RadioProps> = ({ label, checked, onChange }) => (
  <label className="inline-flex items-center gap-2.5 text-sm text-ink cursor-pointer">
    <span
      className={
        'w-5 h-5 rounded-full border-2 inline-flex items-center justify-center shrink-0 ' +
        (checked ? 'border-accent' : 'border-border-strong')
      }
    >
      {checked && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
    </span>
    <input type="radio" checked={checked} onChange={onChange} className="hidden" />
    {label}
  </label>
);
