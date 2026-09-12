import React from 'react';

/** Ported from .claude/skills/site-ops-design/components/overlay/Dialog.jsx. */
export interface DialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ title, children, onClose, footer }) => (
  <div className="fixed inset-0 z-50 scrim flex items-center justify-center p-4">
    <div className="bg-surface rounded-[12px] shadow-lg w-full max-w-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="text-lg font-bold text-ink">{title}</div>
        <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none cursor-pointer" aria-label="Đóng">
          ×
        </button>
      </div>
      <div className="text-sm text-ink-soft">{children}</div>
      {footer && <div className="mt-6 flex gap-3 justify-end">{footer}</div>}
    </div>
  </div>
);
