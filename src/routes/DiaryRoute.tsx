import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Tag,
  CheckCircle,
  Clock,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Download,
  X,
  Volume2,
  AlertCircle,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Flag
} from 'lucide-react';
import { DiaryEntry, EntryStatus, EntryFlag } from '../lib/types';
import { supabase } from '../lib/supabase';
import { matchVietnameseSearch } from '../lib/vietnamese';
import { Toast } from '../components/Toast';
import { processAudioWithGemini } from '../lib/geminiFallback';
import { blobToBase64, removeFromOfflineQueue } from '../lib/offlineStore';

interface DiaryRouteProps {
  entries: DiaryEntry[];
  onRefresh: () => void;
  onNavigateToSync: () => void;
}

export const DiaryRoute: React.FC<DiaryRouteProps> = ({ entries, onRefresh, onNavigateToSync }) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Selected Entry for Detail Drawer/Modal
  const [activeEntry, setActiveEntry] = useState<DiaryEntry | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Deletion state (single entry & delete all)
  const [entryToDelete, setEntryToDelete] = useState<DiaryEntry | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Tracks which entry (by id) currently has a retry-transcription request in flight
  const [retryingEntryId, setRetryingEntryId] = useState<string | null>(null);

  // Categories list extracted dynamically from entries
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    entries.forEach((e) => {
      if (e.extracted_data?.category) {
        categories.add(e.extracted_data.category);
      }
    });
    return Array.from(categories);
  }, [entries]);

  // Filtered entries memoized
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // 1. Keyword search (diacritic insensitive)
      const textToMatch = `${entry.transcription || ''} ${entry.extracted_data?.category || ''} ${
        entry.extracted_data?.summary_vi || ''
      } ${entry.extracted_data?.job_number || ''}`;

      if (searchQuery && !matchVietnameseSearch(textToMatch, searchQuery)) {
        return false;
      }

      // 2. Category filter
      if (selectedCategory !== 'all') {
        if (entry.extracted_data?.category !== selectedCategory) {
          return false;
        }
      }

      // 3. Status filter
      if (selectedStatus !== 'all') {
        if (entry.status !== selectedStatus) {
          return false;
        }
      }

      // 4. Date Range filter
      if (startDate) {
        const entryDate = new Date(entry.created_at).toISOString().split('T')[0];
        if (entryDate < startDate) return false;
      }

      if (endDate) {
        const entryDate = new Date(entry.created_at).toISOString().split('T')[0];
        if (entryDate > endDate) return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedCategory, selectedStatus, startDate, endDate]);

  // Toggle Entry Status (draft <-> filed)
  const toggleEntryStatus = async (entry: DiaryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: EntryStatus = entry.status === 'draft' ? 'filed' : 'draft';

    try {
      const { error } = await supabase
        .from('diary_entries')
        .update({ status: newStatus })
        .eq('id', entry.id);

      if (error) throw error;

      setToast({
        message: `Đã đổi trạng thái sang "${newStatus === 'filed' ? 'Đã lưu kho' : 'Bản nháp'}"`,
        type: 'success',
        open: true
      });

      if (activeEntry?.id === entry.id) {
        setActiveEntry((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      onRefresh();
    } catch (err: any) {
      setToast({
        message: 'Lỗi cập nhật trạng thái: ' + err.message,
        type: 'error',
        open: true
      });
    }
  };

  // Retry transcription for an entry that has a recording but no transcript
  // (either explicitly failed, or silently failed before error-status handling
  // existed). Re-runs the exact same /api/transcribe -> /api/extract pipeline
  // CaptureRoute uses for new recordings -- no separate backend logic.
  const retryTranscription = async (entry: DiaryEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!entry.voice_url || retryingEntryId) return;

    setRetryingEntryId(entry.id);

    try {
      let audioBase64: string;
      let mimeType = 'audio/mp4';

      if (entry.voice_url.startsWith('data:')) {
        // Old-style inline recording (base64 stored directly in the DB row)
        audioBase64 = entry.voice_url;
        const match = entry.voice_url.match(/^data:([^;]+);base64,/);
        if (match) mimeType = match[1];
      } else {
        // Normal case: a real Supabase Storage URL -- fetch the file back
        const res = await fetch(entry.voice_url);
        if (!res.ok) {
          throw new Error(`Không tải được file ghi âm để thử lại (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        mimeType = blob.type || mimeType;
        audioBase64 = await blobToBase64(blob);
      }

      const result = await processAudioWithGemini(entry.id, audioBase64, mimeType);

      if (result.error) {
        throw new Error(result.error);
      }

      // Reflect the new transcript immediately if this entry's detail is open,
      // rather than waiting on the next onRefresh() round-trip.
      if (activeEntry?.id === entry.id) {
        setActiveEntry((prev) =>
          prev
            ? {
                ...prev,
                transcription: result.text ?? prev.transcription,
                extracted_data: result.extracted_data ?? prev.extracted_data
              }
            : null
        );
      }

      setToast({
        message: 'Đã thử lại chuyển văn bản thành công!',
        type: 'success',
        open: true
      });

      onRefresh();
    } catch (err: any) {
      setToast({
        message: 'Lỗi khi thử lại chuyển văn bản: ' + (err.message || 'Vui lòng thử lại sau'),
        type: 'error',
        open: true
      });
    } finally {
      setRetryingEntryId(null);
    }
  };

  // Helper to extract storage relative path if URL points to 'diary-assets' bucket
  const extractStoragePath = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const marker = '/diary-assets/';
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(url.substring(idx + marker.length));
    }
    return null;
  };

  const deleteStorageAssets = async (entriesToDelete: DiaryEntry[]) => {
    const pathsToDelete: string[] = [];
    entriesToDelete.forEach((entry) => {
      const voicePath = extractStoragePath(entry.voice_url);
      if (voicePath) pathsToDelete.push(voicePath);
      const photoPath = extractStoragePath(entry.photo_url);
      if (photoPath) pathsToDelete.push(photoPath);
    });

    if (pathsToDelete.length > 0) {
      try {
        await supabase.storage.from('diary-assets').remove(pathsToDelete);
      } catch (err) {
        console.warn('Không thể xóa tệp storage liên quan:', err);
      }
    }
  };

  // Confirm single entry deletion
  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;

    setIsDeleting(true);
    try {
      // 1. Remove storage assets (voice / photo)
      await deleteStorageAssets([entryToDelete]);

      // 2. Delete database entry (entry_flags and todo_items CASCADE delete)
      const { error } = await supabase
        .from('diary_entries')
        .delete()
        .eq('id', entryToDelete.id);

      if (error) throw error;

      // 3. Remove from offline queue if it was an offline entry
      if (entryToDelete.id.startsWith('offline_')) {
        removeFromOfflineQueue(entryToDelete.id);
      }

      // 4. Close detail modal if the active entry was the one deleted
      if (activeEntry?.id === entryToDelete.id) {
        setActiveEntry(null);
      }

      setToast({
        message: 'Đã xóa nhật ký thành công',
        type: 'success',
        open: true
      });

      setEntryToDelete(null);
      onRefresh();
    } catch (err: any) {
      console.error('Lỗi khi xóa nhật ký:', err);
      setToast({
        message: 'Lỗi khi xóa nhật ký: ' + (err.message || 'Vui lòng thử lại sau'),
        type: 'error',
        open: true
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm delete all entries
  const handleConfirmDeleteAll = async () => {
    if (entries.length === 0) return;

    setIsDeleting(true);
    try {
      // 1. Remove storage assets for all entries
      await deleteStorageAssets(entries);

      // 2. Delete database entries in batch
      const entryIds = entries.map((e) => e.id);
      const { error } = await supabase
        .from('diary_entries')
        .delete()
        .in('id', entryIds);

      if (error) throw error;

      // 3. Clear any offline entries from queue
      entries.forEach((e) => {
        if (e.id.startsWith('offline_')) {
          removeFromOfflineQueue(e.id);
        }
      });

      setActiveEntry(null);
      setShowDeleteAllConfirm(false);

      setToast({
        message: `Đã xóa toàn bộ ${entryIds.length} nhật ký thành công`,
        type: 'success',
        open: true
      });

      onRefresh();
    } catch (err: any) {
      console.error('Lỗi khi xóa toàn bộ nhật ký:', err);
      setToast({
        message: 'Lỗi khi xóa toàn bộ: ' + (err.message || 'Vui lòng thử lại sau'),
        type: 'error',
        open: true
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Screen Title & Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[#f3f5f4] tracking-tight">Nhật Ký Công Trình</h2>
          <p className="text-xs text-[#77818d]">Danh sách nhật ký đã ghi nhận ({filteredEntries.length})</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {entries.length > 0 && (
            <button
              onClick={() => setShowDeleteAllConfirm(true)}
              className="pill px-2.5 py-1.5 text-[#77818d] hover:text-[#f3f5f4] bg-[#181d24] border border-[#303842] hover:border-[#48525e] transition cursor-pointer"
              title="Xóa toàn bộ dữ liệu nhật ký"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa hết</span>
            </button>
          )}

          <button
            onClick={onNavigateToSync}
            className="pill px-3 py-1.5 bg-[#181d24] text-[#f3f5f4] border border-[#303842] hover:border-[#6af0b6]/40 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Drive</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#77818d]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm từ khóa, thợ nề, xi măng, gạch..."
          className="w-full bg-[#181d24] border border-[#293039] rounded-card pl-10 pr-4 py-2.5 text-sm text-[#f3f5f4] placeholder-[#48525e] focus:outline-none focus:border-[#6af0b6] transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#77818d] hover:text-[#f3f5f4]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters Accordion / Pills */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {/* Category Filter Pills */}
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#6af0b6] text-[#101319] border-[#6af0b6]'
                : 'bg-[#181d24] text-[#77818d] border-[#303842] hover:text-[#f3f5f4]'
            }`}
          >
            Tất cả danh mục
          </button>



          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#6af0b6] text-[#101319] border-[#6af0b6]'
                  : 'bg-[#181d24] text-[#77818d] border-[#303842] hover:text-[#f3f5f4]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] font-semibold text-[#77818d] mb-0.5">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#181d24] border border-[#293039] rounded-card px-2.5 py-1.5 text-[#f3f5f4] focus:outline-none focus:border-[#6af0b6]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#77818d] mb-0.5">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#181d24] border border-[#293039] rounded-card px-2.5 py-1.5 text-[#f3f5f4] focus:outline-none focus:border-[#6af0b6]"
            />
          </div>
        </div>
      </div>

      {/* Diary Entry Cards List */}
      {filteredEntries.length === 0 ? (
        <div className="card p-8 text-center space-y-3 my-4">
          <FileText className="w-10 h-10 text-[#48525e] mx-auto" />
          <p className="text-sm font-semibold text-[#f3f5f4]">Chưa tìm thấy nhật ký nào</p>
          <p className="text-xs text-[#77818d]">
            Thử thay đổi từ khóa tìm kiếm hoặc qua tab Ghi Nhận để tạo nhật ký mới
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const dateStr = new Date(entry.created_at).toLocaleString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            const ext = entry.extracted_data;
            const category = ext?.category || 'Chưa phân loại';
            const flag: EntryFlag | null =
              entry.entry_flag ||
              entry.entry_flags?.find((f) => f.is_flagged) ||
              (ext?.is_flagged
                ? {
                    id: 'ext_' + entry.id,
                    entry_id: entry.id,
                    summary_bullet: ext.summary_bullet || ext.summary_vi || '',
                    is_flagged: true,
                    flag_reason: ext.summary_bullet || ext.summary_vi || null,
                    created_at: entry.created_at
                  }
                : null);
            const isFlagged = Boolean(flag?.is_flagged || ext?.is_flagged);
            const flagReason = flag?.flag_reason || flag?.summary_bullet;

            const snippet =
              entry.transcription && entry.transcription.length > 100
                ? entry.transcription.substring(0, 100) + '...'
                : entry.transcription || 'Chưa có ghi chép văn bản...';
            const needsRetry = !!entry.voice_url && !entry.transcription;
            const isRetrying = retryingEntryId === entry.id;

            return (
              <div
                key={entry.id}
                onClick={() => setActiveEntry(entry)}
                className="p-4 rounded-card bg-[#181d24] border border-[#293039] hover:border-[#3a4452] hover:bg-[#1a2028] active:scale-[0.99] transition-all cursor-pointer space-y-3"
              >
                {/* Header: Date & Status */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#f3f5f4]">
                    <Calendar className="w-3.5 h-3.5 text-[#77818d]" />
                    {dateStr}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Flag / Critical Issue Badge */}
                    {isFlagged && (
                      <span className="pill px-2 py-0.5 bg-[#d4bd65]/15 text-[#d4bd65] border border-[#d4bd65]/35 font-bold flex items-center gap-1">
                        <Flag className="w-3 h-3 fill-current" />
                        <span>Cần Chú Ý</span>
                      </span>
                    )}

                    <button
                      onClick={(e) => toggleEntryStatus(entry, e)}
                      className={`pill px-2.5 py-0.5 border ${
                        entry.status === 'filed'
                          ? 'bg-[#6af0b6]/15 text-[#6af0b6] border-[#6af0b6]/30'
                          : 'bg-[#d4bd65]/15 text-[#d4bd65] border-[#d4bd65]/30'
                      }`}
                    >
                      {entry.status === 'filed' ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> Đã Lưu Kho
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" /> Bản Nháp
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEntryToDelete(entry);
                      }}
                      className="p-1 rounded-[0.5rem] border border-transparent hover:border-[#303842] hover:bg-[#1e242d] text-[#77818d] hover:text-[#f3f5f4] transition cursor-pointer"
                      aria-label="Xóa nhật ký"
                      title="Xóa nhật ký"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="flex gap-3">
                  {entry.photo_url && (
                    <img
                      src={entry.photo_url}
                      alt="Thumbnail"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="w-16 h-16 rounded-[12px] object-cover border border-[#293039] shrink-0 bg-[#101319]"
                    />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-[#f3f5f4] line-clamp-2 leading-relaxed">{snippet}</p>

                    {/* Category & Confidence Badge & Job Number */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="pill px-2 py-0.5 bg-[#101319] border border-[#303842] text-[#f3f5f4]">
                          {category}
                        </span>

                        {ext?.confidence_score !== undefined && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-[#6af0b6] font-mono">
                            <Sparkles className="w-3 h-3" />
                            {(ext.confidence_score * 100).toFixed(0)}% AI
                          </span>
                        )}

                        {needsRetry && (
                          <button
                            onClick={(e) => retryTranscription(entry, e)}
                            disabled={retryingEntryId !== null}
                            className="pill px-2 py-0.5 bg-[#e16d7d]/15 text-[#e16d7d] border border-[#e16d7d]/30 disabled:opacity-50 transition"
                          >
                            {isRetrying ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <AlertCircle className="w-3 h-3" />
                            )}
                            {isRetrying ? 'Đang thử lại...' : 'Chưa có văn bản — Thử lại'}
                          </button>
                        )}
                      </div>

                      {ext?.job_number && (
                        <span className="font-mono text-xs font-bold text-[#6af0b6] bg-[#101319] px-2 py-0.5 rounded-[6px] border border-[#293039] shrink-0 tracking-wider">
                          {ext.job_number}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-[#48525e] self-center shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Entry Detail Modal / Drawer */}
      {activeEntry && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#0b0d12]/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#181d24] border border-[#293039] rounded-t-[20px] sm:rounded-[20px] p-6 space-y-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#293039] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#f3f5f4]">Chi Tiết Nhật Ký</h3>
                  {activeEntry.extracted_data?.job_number && (
                    <span className="font-mono text-xs font-bold text-[#6af0b6] bg-[#101319] px-2 py-0.5 rounded-[6px] border border-[#293039]">
                      {activeEntry.extracted_data.job_number}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#77818d]">
                  {new Date(activeEntry.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
              <button
                onClick={() => setActiveEntry(null)}
                aria-label="Đóng"
                className="p-1.5 text-[#77818d] hover:text-[#f3f5f4] rounded-[0.6rem] hover:bg-[#1e242d] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>



            {/* Photo View */}
            {activeEntry.photo_url && (
              <div className="rounded-[14px] overflow-hidden border border-[#293039]">
                <img
                  src={activeEntry.photo_url}
                  alt="Chi tiết ảnh"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="w-full h-56 object-cover"
                />
              </div>
            )}

            {/* Voice Audio Player */}
            {activeEntry.voice_url && (
              <div className="p-3 rounded-[14px] bg-[#12161c] border border-[#293039] space-y-1">
                <div className="flex items-center gap-2 text-xs text-[#f3f5f4] font-semibold">
                  <Volume2 className="w-4 h-4 text-[#6af0b6]" /> File Ghi Âm Giọng Nói
                </div>
                <audio controls src={activeEntry.voice_url} className="w-full h-8 mt-1" />
              </div>
            )}

            {/* Transcription */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-[#f3f5f4]">Văn bản ghi chép:</label>
                {activeEntry.voice_url && !activeEntry.transcription && (
                  <button
                    onClick={(e) => retryTranscription(activeEntry, e)}
                    disabled={retryingEntryId !== null}
                    className="pill px-2.5 py-1 bg-[#e16d7d]/15 text-[#e16d7d] border border-[#e16d7d]/30 disabled:opacity-50 transition"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${retryingEntryId === activeEntry.id ? 'animate-spin' : ''}`}
                    />
                    {retryingEntryId === activeEntry.id ? 'Đang thử lại...' : 'Thử Lại Chuyển Văn Bản'}
                  </button>
                )}
              </div>
              <p className="p-3 rounded-[14px] bg-[#12161c] border border-[#293039] text-xs text-[#f3f5f4] leading-relaxed whitespace-pre-wrap">
                {activeEntry.transcription || 'Chưa có ghi chép văn bản.'}
              </p>
            </div>

            {/* AI Extracted Information */}
            {activeEntry.extracted_data && (
              <div className="space-y-3 p-4 rounded-[14px] bg-[#12161c] border border-[#293039]">
                <div className="flex items-center justify-between text-xs font-bold text-[#f3f5f4]">
                  <span className="flex items-center gap-1.5 text-[#6af0b6]">
                    <Sparkles className="w-4 h-4" /> Trích Xuất AI Gemini
                  </span>
                  <span className="text-[#77818d]">Category: {activeEntry.extracted_data.category}</span>
                </div>

                {activeEntry.extracted_data.materials?.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-[#d4bd65]">Vật tư:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[#f3f5f4]">
                      {activeEntry.extracted_data.materials.map((m: any, idx: number) => (
                        <li key={idx}>
                          {m.item}: {m.quantity} {m.unit} {m.note ? `(${m.note})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeEntry.extracted_data.labor?.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-[#6af0b6]">Nhân công:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[#f3f5f4]">
                      {activeEntry.extracted_data.labor.map((l: any, idx: number) => (
                        <li key={idx}>
                          {l.role}: {l.count || 1} người {l.hours ? `(${l.hours})` : ''} — {l.note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Metadata Toggle */}
            <div>
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs font-semibold text-[#77818d] hover:text-[#f3f5f4] underline underline-offset-2"
              >
                {showRawJson ? 'Ẩn Metadata JSON' : 'Xem Raw Metadata JSON'}
              </button>

              {showRawJson && (
                <pre className="mt-2 p-3 rounded-[12px] bg-[#101319] border border-[#293039] text-[10px] text-[#6af0b6] font-mono overflow-x-auto max-h-40">
                  {JSON.stringify(activeEntry, null, 2)}
                </pre>
              )}
            </div>

            {/* Delete Entry Action */}
            <div className="pt-2 border-t border-[#293039]">
              <button
                type="button"
                onClick={() => setEntryToDelete(activeEntry)}
                className="w-full pill py-2.5 bg-[#e16d7d]/15 text-[#e16d7d] border border-[#e16d7d]/30 hover:bg-[#e16d7d] hover:text-[#101319] font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa nhật ký này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Entry Confirmation Modal */}
      {entryToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#0b0d12]/80 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-entry-dialog-title"
        >
          <div className="w-full max-w-sm bg-[#181d24] border border-[#293039] rounded-[20px] p-6 space-y-4 relative shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-[#e16d7d]/15 border border-[#e16d7d]/30 text-[#e16d7d] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="delete-entry-dialog-title" className="text-base font-bold text-[#f3f5f4]">
                  Xác nhận xóa nhật ký?
                </h3>
                <p className="text-xs text-[#77818d] leading-relaxed">
                  Nhật ký ghi nhận lúc{' '}
                  <strong className="text-[#f3f5f4]">
                    {new Date(entryToDelete.created_at).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </strong>{' '}
                  cùng toàn bộ dữ liệu âm thanh và hình ảnh liên quan sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#293039]">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                disabled={isDeleting}
                className="pill px-4 py-2 text-xs bg-[#1e242d] text-[#f3f5f4] border border-[#303842] hover:bg-[#252c37] transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="pill px-4 py-2 text-xs bg-[#e16d7d] text-[#101319] border border-[#e16d7d] font-bold hover:opacity-90 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isDeleting ? 'Đang xóa...' : 'Xóa nhật ký'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#0b0d12]/80 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-dialog-title"
        >
          <div className="w-full max-w-sm bg-[#181d24] border border-[#293039] rounded-[20px] p-6 space-y-4 relative shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-[#e16d7d]/15 border border-[#e16d7d]/30 text-[#e16d7d] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="delete-all-dialog-title" className="text-base font-bold text-[#f3f5f4]">
                  Xóa toàn bộ dữ liệu?
                </h3>
                <p className="text-xs text-[#77818d] leading-relaxed">
                  Bạn có chắc chắn muốn xóa toàn bộ{' '}
                  <strong className="text-[#e16d7d] font-bold">{entries.length}</strong> nhật ký công trình?
                  Tất cả các bản ghi, mục việc cần làm và tệp đính kèm sẽ bị xóa vĩnh viễn khỏi hệ thống.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#293039]">
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={isDeleting}
                className="pill px-4 py-2 text-xs bg-[#1e242d] text-[#f3f5f4] border border-[#303842] hover:bg-[#252c37] transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={isDeleting}
                className="pill px-4 py-2 text-xs bg-[#e16d7d] text-[#101319] border border-[#e16d7d] font-bold hover:opacity-90 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isDeleting ? 'Đang xóa...' : `Xóa tất cả (${entries.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
