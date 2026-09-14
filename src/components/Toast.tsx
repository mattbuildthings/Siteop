import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { Toast as DSToast } from './ui/Toast';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isOpen: boolean;
  onClose: () => void;
  duration?: number;
}

const TONE_BY_TYPE = { success: 'success', error: 'danger', info: 'info' } as const;
const ICON_BY_TYPE = { success: CheckCircle2, error: AlertCircle, info: Info } as const;

/** Now built on the design-system Toast (src/components/ui/Toast.tsx) —
 * this wrapper only adds the auto-dismiss timer and the fixed-position
 * placement, keeping the message/type/isOpen/onClose API call sites
 * already depend on. */
export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  isOpen,
  onClose,
  duration = 3000
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [isOpen, duration, onClose]);

  if (!isOpen) return null;

  const Icon = ICON_BY_TYPE[type];

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce-in w-[90%] max-w-sm" role="status">
      <DSToast tone={TONE_BY_TYPE[type]}>
        <Icon className="w-5 h-5 shrink-0" />
        <span>{message}</span>
      </DSToast>
    </div>
  );
};
