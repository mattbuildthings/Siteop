import React from 'react';

/** Ported from .claude/skills/site-ops-design/components/forms/Switch.jsx. */
export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label?: React.ReactNode;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2.5 text-sm text-ink cursor-pointer">
    <span
      onClick={onChange}
      className={'w-10 h-6 rounded-full relative transition-colors ' + (checked ? 'bg-accent' : 'bg-border-strong')}
    >
      <span
        className={
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-[left] ' +
          (checked ? 'left-[18px]' : 'left-0.5')
        }
      />
    </span>
    {label}
  </label>
);
