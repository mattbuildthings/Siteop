import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, FolderCheck, HardDrive, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import { DiaryEntry, SyncLog } from '../lib/types';
import { supabase } from '../lib/supabase';
import { Toast } from '../components/Toast';

interface SyncRouteProps {
  entries: DiaryEntry[];
  onRefresh: () => void;
}

export const SyncRoute: React.FC<SyncRouteProps> = ({ entries, onRefresh }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Fetch last 5 sync logs from Supabase
  const fetchSyncLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(5);

      if (error) {
        console.warn('Sync logs table read warning:', error);
      } else if (data) {
        setLogs(data as SyncLog[]);
      }
    } catch (err) {
      console.warn('Fetch sync logs error:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchSyncLogs();
  }, []);

  // Trigger Manual Sync to Google Drive
  const handleManualSync = async () => {
    setIsSyncing(true);
    setToast({
      message: 'Đang kết nối Vercel API & xuất file Markdown lên Google Drive...',
      type: 'info',
      open: true
    });

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Xuất Google Drive thất bại');
      }

      setToast({
        message: `Xuất thành công! Đã ghi ${result.entries_count || entries.length} nhật ký vào Vault Drive.`,
        type: 'success',
        open: true
      });

      fetchSyncLogs();
      onRefresh();
    } catch (err: any) {
      console.error('Manual sync error:', err);
      setToast({
        message: 'Lỗi đồng bộ: ' + (err.message || 'Kiểm tra cấu hình API Vercel'),
        type: 'error',
        open: true
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Last 5 synced entries preview
  const last5Entries = entries.slice(0, 5);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-5">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Screen Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#f3f5f4] tracking-tight">Quản Trị Đồng Bộ</h2>
          <p className="text-xs text-[#77818d]">Đồng bộ Google Drive Markdown Vault (Matt Admin)</p>
        </div>

        <div className="pill px-2.5 py-1 bg-[#d4bd65]/15 text-[#d4bd65] border border-[#d4bd65]/30">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin Only
        </div>
      </div>

      {/* Sync Card Action */}
      <div className="card p-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-[14px] bg-[#101319] border border-[#293039] flex items-center justify-center mx-auto text-[#6af0b6]">
          <HardDrive className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-[#f3f5f4]">Google Drive Vault Export</h3>
          <p className="text-xs text-[#77818d]">
            Thư mục Folder ID: <code className="text-[#6af0b6] font-mono text-[11px] bg-[#101319] border border-[#293039] px-1.5 py-0.5 rounded">1so41_3Eb...Xo5Xr6</code>
          </p>
        </div>

        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="w-full py-3.5 rounded-card bg-[#6af0b6] hover:bg-[#5be0a5] text-[#101319] font-bold text-sm tracking-wide shadow-[0_0_20px_rgba(106,240,182,0.2)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin text-[#101319]" />
              <span>Đang Xuất Google Drive...</span>
            </>
          ) : (
            <>
              <FolderCheck className="w-5 h-5" />
              <span>Kích Hoạt Sync Now</span>
            </>
          )}
        </button>
      </div>

      {/* Sync Logs Table / History */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-[#293039] pb-2">
          <h3 className="label-micro text-[#f3f5f4]">
            Lịch Sử 5 Lần Sync Gần Nhất
          </h3>
          <button
            onClick={fetchSyncLogs}
            className="p-1 text-[#77818d] hover:text-[#f3f5f4] transition cursor-pointer"
            title="Làm mới log"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingLogs ? (
          <div className="py-4 text-center text-xs text-[#77818d]">Đang tải lịch sử sync...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-xs text-[#77818d]">Chưa có lịch sử đồng bộ trong CSDL</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-[12px] bg-[#12161c] border border-[#293039] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-[#6af0b6] shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[#e16d7d] shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-[#f3f5f4]">
                      {log.status === 'success' ? `Đồng bộ ${log.entries_count || 0} mục` : 'Thất bại'}
                    </p>
                    <p className="text-[10px] text-[#77818d]">
                      {new Date(log.synced_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                {log.error_message && (
                  <span className="text-[10px] text-[#e16d7d] max-w-[120px] truncate" title={log.error_message}>
                    {log.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview 5 Synced Entries */}
      <div className="card p-5 space-y-3">
        <h3 className="label-micro text-[#f3f5f4] border-b border-[#293039] pb-2">
          5 Nhật Ký Mới Nhất Chuẩn Bị Sync
        </h3>

        {last5Entries.length === 0 ? (
          <p className="text-xs text-[#77818d] py-2">Chưa có bản ghi nào.</p>
        ) : (
          <div className="space-y-2">
            {last5Entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="p-2.5 rounded-[12px] bg-[#12161c] border border-[#293039] flex items-center gap-2.5 text-xs"
              >
                <FileText className="w-4 h-4 text-[#77818d] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#f3f5f4] truncate">
                    {entry.transcription || entry.extracted_data?.category || 'Nhật ký không có tiêu đề'}
                  </p>
                  <p className="text-[10px] text-[#77818d]">
                    {new Date(entry.created_at).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
