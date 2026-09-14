import React from 'react';
import clsx from 'clsx';

/** Ported from .claude/skills/site-ops-design/components/core/Badge.jsx. */
export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'className'> {
  /** `info` is a local addition to the skill's neutral/primary/success/warning/danger set — the app already has an info semantic color to draw on. */
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-card-alt text-ink-soft',
  primary: 'bg-accent-soft text-accent',
  success: 'bg-positive/12 text-positive',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info'
};

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, className, ...rest }) => (
  <span
    className={clsx(
      'inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold uppercase tracking-wide',
      TONE_CLASSES[tone],
      className
    )}
    {...rest}
  >
    {children}
  </span>
);
