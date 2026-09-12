import React from 'react';
import { RefreshCw, AlertCircle, Clock, X } from 'lucide-react';
import { OfflineQueueItem } from '../lib/offlineDb';

interface OfflineQueuePanelProps {
  items: OfflineQueueItem[];
  onRetry: (id: string) => void;
  onClose: () => void;
}

/**
 * Per-item view of the offline queue, opened from the Navbar's offline badge.
 * The badge used to only show a count -- useful to know something is
 * waiting, useless for knowing whether it's stuck. This shows what each
 * queued entry is, whether it's pending/syncing/failed, and a retry button
 * on anything that failed.
 */
export const OfflineQueuePanel: React.FC<OfflineQueuePanelProps> = ({ items, onRetry, onClose }) => {
  return (
    <div className="absolute right-4 top-[52px] z-50 w-[300px] max-h-[65vh] overflow-y-auto bg-card border border-border rounded-[16px] shadow-2xl p-3 space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <span className="text-sm font-bold text-ink">Hàng chờ đồng bộ ({items.length})</span>
        <button onClick={onClose} className="icon-btn icon-btn-sm" aria-label="Đóng">
          <X className="w-4 h-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-soft py-4 text-center">Không có nhật ký nào đang chờ.</p>
      ) : (
        items.map((item) => {
          const parts: string[] = [];
          if (item.voiceBlob) parts.push('Ghi âm');
          if (item.photoBlobs && item.photoBlobs.length > 0) parts.push(`${item.photoBlobs.length} ảnh`);

          return (
            <div key={item.id} className="p-2.5 rounded-[12px] bg-card-alt border border-border space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink truncate">{parts.join(' · ') || 'Nhật ký'}</span>
                {item.status === 'syncing' && <RefreshCw className="w-4 h-4 text-accent animate-spin shrink-0" />}
                {item.status === 'pending' && <Clock className="w-4 h-4 text-ink-soft shrink-0" />}
                {item.status === 'failed' && <AlertCircle className="w-4 h-4 text-danger shrink-0" />}
              </div>

              <p className="text-xs text-ink-soft">
                {new Date(item.createdAt).toLocaleString('vi-VN')}
                {item.workDate ? ` · thi công ${item.workDate}` : ''}
              </p>

              {item.status === 'failed' && (
                <>
                  {item.errorMessage && <p className="text-xs text-danger">{item.errorMessage}</p>}
                  <button
                    onClick={() => onRetry(item.id)}
                    className="text-xs font-bold text-accent underline underline-offset-2 cursor-pointer"
                  >
                    Thử lại
                  </button>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
