import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isOpen: boolean;
  onClose: () => void;
  duration?: number;
}

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

  const styles =
    type === 'success'
      ? { bg: 'bg-accent/15 border-accent/30', text: 'text-accent', Icon: CheckCircle2 }
      : type === 'error'
      ? { bg: 'bg-danger/15 border-danger/30', text: 'text-danger', Icon: AlertCircle }
      : { bg: 'bg-info/15 border-info/30', text: 'text-info', Icon: Info };

  const { bg, text, Icon } = styles;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce-in w-[90%] max-w-sm" role="status">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-card border bg-card ${bg}`}>
        <Icon className={`w-5 h-5 shrink-0 ${text}`} />
        <span className="text-xs font-semibold text-ink">{message}</span>
      </div>
    </div>
  );
};
