import React from 'react';
import { Check } from 'lucide-react';

/** Ported from .claude/skills/site-ops-design/components/forms/Checkbox.jsx. */
export interface CheckboxProps {
  label?: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange }) => (
  <label className="inline-flex items-center gap-2.5 text-sm text-ink cursor-pointer">
    <span
      className={
        'w-5 h-5 rounded-[4px] border-2 inline-flex items-center justify-center shrink-0 ' +
        (checked ? 'bg-accent border-accent' : 'bg-surface border-border-strong')
      }
    >
      {checked && <Check className="w-3 h-3 text-accent-ink" strokeWidth={3} />}
    </span>
    <input type="checkbox" checked={checked} onChange={onChange} className="hidden" />
    {label}
  </label>
);
