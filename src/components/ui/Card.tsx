import React from 'react';
import clsx from 'clsx';

/** Ported from .claude/skills/site-ops-design/components/core/Card.jsx. */
export interface CardProps {
  children: React.ReactNode;
  padding?: string;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, padding = 'p-6', className }) => (
  <div className={clsx('bg-surface border border-border rounded-[12px] shadow-sm', padding, className)}>
    {children}
  </div>
);
