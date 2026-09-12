import React, { useState } from 'react';

/** Ported from .claude/skills/site-ops-design/components/feedback/Tooltip.jsx. */
export interface TooltipProps {
  label: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ label, children }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-ink text-paper text-xs px-2 py-1 rounded-[4px] whitespace-nowrap">
          {label}
        </span>
      )}
    </span>
  );
};
