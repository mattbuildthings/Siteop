import React from 'react';

/**
 * Ported from .claude/skills/site-ops-design/components/feedback/Toast.jsx.
 * The skill only defines primary/success/danger tones; `info` is a local
 * addition since the app already has an info semantic color to draw on.
 */
export interface ToastProps {
  tone?: 'primary' | 'success' | 'danger' | 'info';
  children: React.ReactNode;
}

const TONE_CLASSES: Record<NonNullable<ToastProps['tone']>, string> = {
  primary: 'bg-card-dark text-ink',
  success: 'bg-positive text-white',
  danger: 'bg-danger text-white',
  info: 'bg-info text-white'
};

export const Toast: React.FC<ToastProps> = ({ tone = 'primary', children }) => (
  <div
    className={
      'inline-flex items-center gap-2.5 px-4 py-2.5 rounded-[8px] text-sm font-medium shadow-lg ' + TONE_CLASSES[tone]
    }
  >
    {children}
  </div>
);
