import React from 'react';
import clsx from 'clsx';

/**
 * Ported from .claude/skills/site-ops-design/components/core/Button.jsx.
 * Same variant/size contract as the design-system source; restyled onto
 * this app's own tokens (bg-accent/bg-cta/etc., defined in src/index.css)
 * instead of the skill's raw --color-primary/--color-accent names, so
 * there is one token system, not two.
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2'
};

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  accent: 'bg-cta text-cta-ink hover:bg-cta-hover',
  secondary: 'bg-card text-ink border-2 border-border-strong hover:border-ink-faint',
  ghost: 'bg-transparent text-accent hover:bg-accent-soft',
  danger: 'bg-danger text-white hover:bg-danger-hover'
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon = null,
  disabled,
  children,
  className,
  ...rest
}) => (
  <button
    disabled={disabled}
    className={clsx(
      'inline-flex items-center justify-center font-semibold rounded-[8px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
      SIZE_CLASSES[size],
      VARIANT_CLASSES[variant],
      className
    )}
    {...rest}
  >
    {icon}
    {children}
  </button>
);
