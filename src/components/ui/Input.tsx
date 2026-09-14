import React from 'react';

/** Ported from .claude/skills/site-ops-design/components/forms/Input.jsx. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, id, ...rest }) => (
  <label htmlFor={id} className="flex flex-col gap-1.5">
    {label && <span className="text-sm font-medium text-ink">{label}</span>}
    <input
      id={id}
      className={
        'h-11 px-3 text-sm rounded-[8px] bg-surface text-ink outline-none border-2 ' +
        (error ? 'border-danger' : 'border-border-strong focus:border-accent')
      }
      {...rest}
    />
    {error && <span className="text-xs text-danger">{error}</span>}
  </label>
);
