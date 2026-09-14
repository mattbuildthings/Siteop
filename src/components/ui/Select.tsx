import React from 'react';

/** Ported from .claude/skills/site-ops-design/components/forms/Select.jsx. */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label?: string;
  options: string[];
}

export const Select: React.FC<SelectProps> = ({ label, options, id, ...rest }) => (
  <label htmlFor={id} className="flex flex-col gap-1.5">
    {label && <span className="text-sm font-medium text-ink">{label}</span>}
    <select
      id={id}
      className="h-11 px-3 text-sm rounded-[8px] bg-surface text-ink border-2 border-border-strong"
      {...rest}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </label>
);
