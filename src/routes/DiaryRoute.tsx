import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Calendar,
  CheckCircle,
  Clock,
  ChevronRight,
  FileText,
  Download,
  X,
  Volume2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Flag,
  Lock,
  Unlock,
  User as UserIcon,
  CloudSun,
  MapPin,
  Image as ImageIcon,
  Truck,
  Wrench,
  Users,
  ShieldAlert,
  Ruler
} from 'lucide-react';
import { DiaryEntry, EntryFlag, Project, UserProfile } from '../lib/types';
import { supabase } from '../lib/supabase';
import { matchVietnameseSearch } from '../lib/vietnamese';
import { Toast } from '../components/Toast';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { processAudioWithGemini } from '../lib/geminiFallback';
import { blobToBase64 } from '../lib/offlineStore';
import { removeFromOfflineQueue } from '../lib/offlineDb';
import { canDeleteEntry, canUnlockEntry, displayName, isEntryLocked, isManager } from '../lib/session';
import { formatWeather } from '../lib/weather';

interface DiaryRouteProps {
  entries: DiaryEntry[];
  profiles: Record<string, UserProfile>;
  profile: UserProfile | null;
  userId?: string;
  projects: Project[];
  activeProject: Project | null;
  onRefresh: () => void;
  onNavigateToSync: () => void;
  /** Set when the to-do list's "view source entry" action fires; opens that entry's detail sheet once. */
  openEntryId?: string | null;
  onOpenEntryHandled?: () => void;
}

export const DiaryRoute: React.FC<DiaryRouteProps> = ({
  entries,
  profiles,
  profile,
  userId,
  projects,
  activeProject,
  onRefresh,
  onNavigateToSync,
  openEntryId,
  onOpenEntryHandled
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [scopeToActiveProject, setScopeToActiveProject] = useState(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [activeEntry, setActiveEntry] = useState<DiaryEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<DiaryEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryingEntryId, setRetryingEntryId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // File/lock sign-off dialog
  const [fileTarget, setFileTarget] = useState<DiaryEntry | null>(null);
  const [signOffName, setSignOffName] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info') =>
    setToast({ message, type, open: true });

  const projectsById = useMemo(() => {
    const map: Record<string, Project> = {};
    projects.forEach((p) => (map[p.id] = p));
    return map;
  }, [projects]);

  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    entries.forEach((e) => {
      if (e.extracted_data?.category) categories.add(e.extracted_data.category);
    });
    return Array.from(categories);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Scope to the site selected in the header — the common case is
      // "what happened on my site", not "everything everywhere".
      if (scopeToActiveProject && activeProject) {
        if (entry.entry_meta?.project_id !== activeProject.id) return false;
      }

      const textToMatch = `${entry.transcription || ''} ${entry.extracted_data?.category || ''} ${
        entry.extracted_data?.summary_vi || ''
      } ${entry.entry_meta?.log_number || ''} ${displayName(profiles[entry.created_by || ''])}`;

      if (searchQuery && !matchVietnameseSearch(textToMatch, searchQuery)) return false;

      if (selectedCategory !== 'all' && entry.extracted_data?.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && entry.status !== selectedStatus) return false;

      if (flaggedOnly) {
        const flagged =
          entry.entry_flags?.some((f) => f.is_flagged) || entry.extracted_data?.is_flagged || false;
        if (!flagged) return false;
      }

      const entryDate = entry.entry_meta?.work_date || new Date(entry.created_at).toISOString().split('T')[0];
      if (startDate && entryDate < startDate) return false;
      if (endDate && entryDate > endDate) return false;

      return true;
    });
  }, [
    entries,
    profiles,
    searchQuery,
    selectedCategory,
    selectedStatus,
    flaggedOnly,
    startDate,
    endDate,
    scopeToActiveProject,
    activeProject
  ]);

  /** Group by the day the work happened so the list reads like a diary. */
  const groupedEntries = useMemo(() => {
    const groups: Array<{ date: string; items: DiaryEntry[] }> = [];
    const byDate: Record<string, DiaryEntry[]> = {};

    filteredEntries.forEach((e) => {
      const d = e.entry_meta?.work_date || new Date(e.created_at).toISOString().split('T')[0];
      (byDate[d] = byDate[d] || []).push(e);
    });

    Object.keys(byDate)
      .sort((a, b) => (a < b ? 1 : -1))
      .forEach((date) => groups.push({ date, items: byDate[date] }));

    return groups;
  }, [filteredEntries]);

  // Jump-to-entry from the weekly to-do list. Runs once entries has loaded
  // the target; if the id never shows up (still fetching, or stale) this is
  // simply a no-op rather than an error.
  useEffect(() => {
    if (!openEntryId) return;
    const found = entries.find((e) => e.id === openEntryId);
    if (found) {
      setActiveEntry(found);
      onOpenEntryHandled?.();
    }
  }, [openEntryId, entries, onOpenEntryHandled]);

  // --- File / lock ---------------------------------------------------------
  // Filing is what turns a note into a record: content, time and author are
  // frozen from here on. The database enforces this with a trigger, so this
  // button is the affordance, not the security boundary. signOff is a typed
  // name captured in the dialog below -- a deliberate confirmation act, kept
  // separate from locked_by/locked_at which are just the system's own log of
  // who clicked the button and when.
  const fileEntry = async (entry: DiaryEntry, signOff: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isEntryLocked(entry)) return;

    const now = new Date().toISOString();
    try {
      // Order matters: the guard trigger on diary_entries rejects updates to an
      // entry that entry_meta already reports as locked, so the status has to be
      // written before the lock lands, not after.
      const { error } = await supabase.from('diary_entries').update({ status: 'filed' }).eq('id', entry.id);
      if (error) throw error;

      const { error: metaErr } = await supabase.from('entry_meta').upsert(
        {
          entry_id: entry.id,
          locked_at: now,
          locked_by: userId ?? null,
          signed_off_by: userId ?? null,
          signed_off_name: signOff,
          signed_off_at: now
        },
        { onConflict: 'entry_id' }
      );
      if (metaErr) throw metaErr;

      showToast('Đã lưu kho & khóa nhật ký. Bản ghi này không sửa được nữa.', 'success');
      setActiveEntry(null);
      setFileTarget(null);
      onRefresh();
    } catch (err: any) {
      showToast('Lỗi khi lưu kho: ' + (err.message || 'Thử lại'), 'error');
    }
  };

  const unlockEntry = async (entry: DiaryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // The trigger rejects this for anyone who isn't an admin and writes an
      // entry_revisions row so the unlock itself is on the record.
      const { error: metaErr } = await supabase
        .from('entry_meta')
        .update({ locked_at: null, locked_by: null })
        .eq('entry_id', entry.id);
      if (metaErr) throw metaErr;

      const { error } = await supabase.from('diary_entries').update({ status: 'draft' }).eq('id', entry.id);
      if (error) throw error;

      showToast('Đã mở khóa. Việc mở khóa này được ghi vào lịch sử thay đổi.', 'info');
      setActiveEntry(null);
      onRefresh();
    } catch (err: any) {
      showToast('Không mở khóa được: ' + (err.message || 'Chỉ quản lý mới mở khóa được'), 'error');
    }
  };

  const retryTranscription = async (entry: DiaryEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!entry.voice_url || retryingEntryId) return;

    setRetryingEntryId(entry.id);
    try {
      let audioBase64: string;
      let mimeType = 'audio/mp4';

      if (entry.voice_url.startsWith('data:')) {
        audioBase64 = entry.voice_url;
        const match = entry.voice_url.match(/^data:([^;]+);base64,/);
        if (match) mimeType = match[1];
      } else {
        const res = await fetch(entry.voice_url);
        if (!res.ok) throw new Error(`Không tải được file ghi âm để thử lại (HTTP ${res.status})`);
        const blob = await res.blob();
        mimeType = blob.type || mimeType;
        audioBase64 = await blobToBase64(blob);
      }

      const result = await processAudioWithGemini(entry.id, audioBase64, mimeType);
      if (result.error) throw new Error(result.error);

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

      showToast('Đã thử lại chuyển văn bản thành công!', 'success');
      onRefresh();
    } catch (err: any) {
      showToast('Lỗi khi thử lại chuyển văn bản: ' + (err.message || 'Vui lòng thử lại sau'), 'error');
    } finally {
      setRetryingEntryId(null);
    }
  };

  const extractStoragePath = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const marker = '/diary-assets/';
    const idx = url.indexOf(marker);
    return idx !== -1 ? decodeURIComponent(url.substring(idx + marker.length)) : null;
  };

  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;

    setIsDeleting(true);
    try {
      const paths: string[] = [];
      const voicePath = extractStoragePath(entryToDelete.voice_url);
      if (voicePath) paths.push(voicePath);
      (entryToDelete.entry_photos || []).forEach((p) => {
        const path = extractStoragePath(p.photo_url);
        if (path) paths.push(path);
      });
      const coverPath = extractStoragePath(entryToDelete.photo_url);
      if (coverPath && !paths.includes(coverPath)) paths.push(coverPath);

      if (paths.length > 0) {
        try {
          await supabase.storage.from('diary-assets').remove(paths);
        } catch (err) {
          console.warn('Không thể xóa tệp storage liên quan:', err);
        }
      }

      const { error } = await supabase.from('diary_entries').delete().eq('id', entryToDelete.id);
      if (error) throw error;

      if (entryToDelete.id.startsWith('offline_')) await removeFromOfflineQueue(entryToDelete.id);
      if (activeEntry?.id === entryToDelete.id) setActiveEntry(null);

      showToast('Đã xóa nhật ký', 'success');
      setEntryToDelete(null);
      onRefresh();
    } catch (err: any) {
      showToast('Lỗi khi xóa nhật ký: ' + (err.message || 'Vui lòng thử lại sau'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const STATUS_FILTERS: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'Tất cả' },
    { id: 'draft', label: 'Bản nháp' },
    { id: 'filed', label: 'Đã lưu kho' }
  ];

  const formatDayLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const base = date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
    if (isToday) return `Hôm nay · ${base}`;
    if (isYesterday) return `Hôm qua · ${base}`;
    return base;
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink tracking-tight">Nhật Ký Công Trình</h2>
          <p className="text-sm text-ink-soft">
            {filteredEntries.length} nhật ký
            {scopeToActiveProject && activeProject ? ` · ${activeProject.name}` : ' · tất cả công trình'}
          </p>
        </div>

        {isManager(profile) && (
          <Button variant="secondary" size="sm" onClick={onNavigateToSync} icon={<Download className="w-4 h-4" />} className="shrink-0">
            Xuất
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm từ khóa, thợ nề, xi măng, tên người ghi..."
          className="field w-full pl-10 pr-11 py-2.5 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn icon-btn-sm"
            aria-label="Xóa tìm kiếm"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {activeProject && (
            <button
              onClick={() => setScopeToActiveProject((v) => !v)}
              className={`px-3 py-2 rounded-full text-sm font-bold shrink-0 border transition cursor-pointer ${
                scopeToActiveProject
                  ? 'bg-accent text-accent-ink border-accent'
                  : 'bg-card text-ink-soft border-border-subtle hover:text-ink'
              }`}
            >
              {activeProject.code || activeProject.name}
            </button>
          )}

          <button
            onClick={() => setFlaggedOnly((v) => !v)}
            className={`px-3 py-2 rounded-full text-sm font-bold shrink-0 border transition cursor-pointer flex items-center gap-1.5 ${
              flaggedOnly
                ? 'bg-warning text-paper border-warning'
                : 'bg-card text-ink-soft border-border-subtle hover:text-ink'
            }`}
          >
            <Flag className="w-4 h-4" /> Cần chú ý
          </button>

          {STATUS_FILTERS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStatus(s.id)}
              className={`px-3 py-2 rounded-full text-sm font-bold shrink-0 border transition cursor-pointer ${
                selectedStatus === s.id
                  ? 'bg-ink text-paper border-ink'
                  : 'bg-card text-ink-soft border-border-subtle hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-2 rounded-full text-sm font-bold shrink-0 border transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-accent text-accent-ink border-accent'
                : 'bg-card text-ink-soft border-border-subtle hover:text-ink'
            }`}
          >
            Tất cả hạng mục
          </button>

          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-2 rounded-full text-sm font-bold shrink-0 border transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-accent text-accent-ink border-accent'
                  : 'bg-card text-ink-soft border-border-subtle hover:text-ink'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-ink-soft mb-1">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="field w-full px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-ink-soft mb-1">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="field w-full px-2.5 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* List */}
      {filteredEntries.length === 0 ? (
        <div className="card p-8 text-center space-y-3 my-4">
          <FileText className="w-10 h-10 text-ink-faint mx-auto" />
          <p className="text-base font-bold text-ink">Chưa tìm thấy nhật ký nào</p>
          <p className="text-sm text-ink-soft">
            Thử đổi bộ lọc, hoặc qua tab Ghi Nhận để tạo nhật ký mới cho công trình này.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedEntries.map((group) => (
            <div key={group.date} className="space-y-3">
              <div className="flex items-center gap-2 sticky top-[104px] z-10 bg-paper py-1">
                <span className="label-micro">{formatDayLabel(group.date)}</span>
                <span className="flex-1 h-px bg-border" />
                <span className="text-xs font-bold text-ink-soft">{group.items.length}</span>
              </div>

              {group.items.map((entry) => {
                const ext = entry.extracted_data;
                const category = ext?.category || 'Chưa phân loại';
                const meta = entry.entry_meta;
                const locked = isEntryLocked(entry);
                const author = profiles[entry.created_by || ''];
                const project = meta?.project_id ? projectsById[meta.project_id] : null;

                const flag: EntryFlag | null =
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
                const isFlagged = Boolean(flag?.is_flagged);

                const snippet =
                  entry.transcription && entry.transcription.length > 110
                    ? entry.transcription.substring(0, 110) + '...'
                    : entry.transcription || 'Chưa có ghi chép văn bản...';

                const needsRetry = !!entry.voice_url && !entry.transcription;
                const isRetrying = retryingEntryId === entry.id;
                const photoCount = entry.entry_photos?.length || (entry.photo_url ? 1 : 0);

                return (
                  <div
                    key={entry.id}
                    onClick={() => setActiveEntry(entry)}
                    className="p-4 rounded-card bg-card border border-border hover:border-border-strong active:scale-[0.99] transition-all cursor-pointer space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {meta?.log_number && (
                          <span className="font-mono text-sm font-bold text-accent bg-accent/12 px-2 py-0.5 rounded-[6px] border border-accent/30 shrink-0">
                            {meta.log_number}
                          </span>
                        )}
                        <span className="text-sm text-ink-soft truncate">
                          {new Date(entry.created_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isFlagged && (
                          <Badge tone="warning" className="gap-1 !h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
                            <Flag className="w-3.5 h-3.5 fill-current" />
                            <span className="hidden xs:inline">Chú ý</span>
                          </Badge>
                        )}

                        {locked ? (
                          <Badge
                            tone="primary"
                            className="gap-1 !h-auto !px-2.5 !py-1 !normal-case !tracking-normal"
                            title={`Đã khóa lúc ${new Date(meta!.locked_at!).toLocaleString('vi-VN')}`}
                          >
                            <Lock className="w-3.5 h-3.5" /> Đã khóa
                          </Badge>
                        ) : (
                          <Badge tone="warning" className="gap-1 !h-auto !px-2.5 !py-1 !normal-case !tracking-normal">
                            <Clock className="w-3.5 h-3.5" /> Nháp
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      {entry.photo_url && (
                        <div className="relative shrink-0">
                          <img
                            src={entry.photo_url}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="w-16 h-16 rounded-[12px] object-cover border border-border bg-card-alt"
                          />
                          {photoCount > 1 && (
                            <span className="absolute -bottom-1 -right-1 pill px-1.5 py-0 bg-ink text-paper text-xs">
                              <ImageIcon className="w-3 h-3" />
                              {photoCount}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm text-ink line-clamp-2 leading-relaxed">{snippet}</p>

                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge tone="neutral" className="!h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
                            {category}
                          </Badge>

                          {project && !scopeToActiveProject && (
                            <Badge tone="info" className="gap-1 !h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
                              <MapPin className="w-3 h-3" />
                              {project.code || project.name}
                            </Badge>
                          )}

                          {needsRetry && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={(e) => retryTranscription(entry, e)}
                              disabled={retryingEntryId !== null}
                              icon={isRetrying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            >
                              {isRetrying ? 'Đang thử lại...' : 'Chưa có văn bản'}
                            </Button>
                          )}
                        </div>

                        {/* Attribution. A daily log with no author is not a record. */}
                        <div className="flex items-center gap-1.5 text-xs text-ink-soft">
                          <UserIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{displayName(author)}</span>
                          {meta?.weather && (
                            <>
                              <span className="text-border-strong">·</span>
                              <CloudSun className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{formatWeather(meta.weather)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-5 h-5 text-ink-faint self-center shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Detail sheet */}
      {activeEntry &&
        (() => {
          const meta = activeEntry.entry_meta;
          const locked = isEntryLocked(activeEntry);
          const author = profiles[activeEntry.created_by || ''];
          const project = meta?.project_id ? projectsById[meta.project_id] : null;
          const photos =
            activeEntry.entry_photos && activeEntry.entry_photos.length > 0
              ? activeEntry.entry_photos
              : activeEntry.photo_url
              ? [{ id: 'cover', entry_id: activeEntry.id, photo_url: activeEntry.photo_url, sort_order: 0 }]
              : [];

          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 scrim animate-fade-in">
              <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-card border border-border rounded-t-[20px] sm:rounded-[20px] p-5 space-y-5 shadow-2xl">
                <div className="flex items-start justify-between border-b border-border pb-3 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-ink">Chi Tiết Nhật Ký</h3>
                      {meta?.log_number && (
                        <span className="font-mono text-sm font-bold text-accent bg-accent/12 px-2 py-0.5 rounded-[6px] border border-accent/30">
                          {meta.log_number}
                        </span>
                      )}
                      {locked && (
                        <Badge tone="primary" className="gap-1 !h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
                          <Lock className="w-3.5 h-3.5" /> Đã khóa
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-ink-soft mt-1">
                      {new Date(activeEntry.created_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveEntry(null)}
                    aria-label="Đóng"
                    className="icon-btn shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Record header: who, where, when, what weather */}
                <div className="card-alt p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-ink">
                    <UserIcon className="w-4 h-4 text-ink-soft shrink-0" />
                    <span className="font-bold">{displayName(author)}</span>
                    {author?.company && <span className="text-ink-soft">· {author.company}</span>}
                  </div>
                  {project && (
                    <div className="flex items-center gap-2 text-ink-soft">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>
                        {project.code ? `${project.code} · ` : ''}
                        {project.name}
                      </span>
                    </div>
                  )}
                  {meta?.work_date && (
                    <div className="flex items-center gap-2 text-ink-soft">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>Ngày thi công: {meta.work_date}</span>
                    </div>
                  )}
                  {meta?.weather && (
                    <div className="flex items-center gap-2 text-ink-soft">
                      <CloudSun className="w-4 h-4 shrink-0" />
                      <span>{formatWeather(meta.weather)}</span>
                    </div>
                  )}
                  {locked && meta?.locked_at && (
                    <div className="flex items-center gap-2 text-accent">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Lưu kho lúc {new Date(meta.locked_at).toLocaleString('vi-VN')}</span>
                    </div>
                  )}
                  {meta?.signed_off_name && (
                    <div className="flex items-center gap-2 text-accent">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>
                        Ký xác nhận: {meta.signed_off_name}
                        {meta.signed_off_at ? ` · ${new Date(meta.signed_off_at).toLocaleString('vi-VN')}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Photo gallery */}
                {photos.length > 0 && (
                  <div className="space-y-2">
                    <span className="label-micro">Ảnh hiện trường ({photos.length})</span>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setLightbox(p.photo_url)}
                          className="rounded-[12px] overflow-hidden border border-border cursor-pointer"
                        >
                          <img
                            src={p.photo_url}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="w-full h-24 object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeEntry.voice_url && (
                  <div className="p-3 rounded-[14px] bg-surface border border-border space-y-1">
                    <div className="flex items-center gap-2 text-sm text-ink font-bold">
                      <Volume2 className="w-4 h-4 text-accent" /> File ghi âm gốc
                    </div>
                    <audio controls src={activeEntry.voice_url} className="w-full mt-1" />
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="label-micro">Văn bản ghi chép</span>
                    {activeEntry.voice_url && !activeEntry.transcription && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => retryTranscription(activeEntry, e)}
                        disabled={retryingEntryId !== null}
                        icon={<RefreshCw className={`w-4 h-4 ${retryingEntryId === activeEntry.id ? 'animate-spin' : ''}`} />}
                      >
                        {retryingEntryId === activeEntry.id ? 'Đang thử lại...' : 'Thử lại'}
                      </Button>
                    )}
                  </div>
                  <p className="p-3 rounded-[14px] bg-surface border border-border text-sm text-ink leading-relaxed whitespace-pre-wrap">
                    {activeEntry.transcription || 'Chưa có ghi chép văn bản.'}
                  </p>
                </div>

                {activeEntry.extracted_data && (
                  <div className="space-y-3 p-4 rounded-[14px] bg-surface border border-border">
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span className="text-ink">Hạng mục</span>
                      <Badge tone="neutral" className="!h-auto !px-2.5 !py-0.5 !normal-case !tracking-normal">
                        {activeEntry.extracted_data.category}
                      </Badge>
                    </div>

                    {(activeEntry.extracted_data.materials?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-warning">Vật tư:</span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.materials.map((m, idx) => (
                            <li key={idx}>
                              {m.item}: {m.quantity} {m.unit} {m.note ? `(${m.note})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(activeEntry.extracted_data.labor?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-accent">Nhân công:</span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.labor.map((l, idx) => (
                            <li key={idx}>
                              {l.role}: {l.count || 1} người {l.hours ? `(${l.hours})` : ''}
                              {l.note ? ` — ${l.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(activeEntry.extracted_data.delays?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-danger flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" /> Chậm trễ / Sự cố:
                        </span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.delays!.map((d, idx) => (
                            <li key={idx}>
                              {d.cause}
                              {d.duration ? ` — ${d.duration}` : ''}
                              {d.note ? ` (${d.note})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(activeEntry.extracted_data.deliveries?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5" /> Vật tư nhận về:
                        </span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.deliveries!.map((d, idx) => (
                            <li key={idx}>
                              {d.item}: {d.quantity} {d.supplier ? `— ${d.supplier}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(activeEntry.extracted_data.equipment?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" /> Thiết bị / Máy móc:
                        </span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.equipment!.map((eq, idx) => (
                            <li key={idx}>
                              {eq.name}
                              {eq.hours_used ? ` — hoạt động ${eq.hours_used}` : ''}
                              {eq.idle_hours ? `, chờ ${eq.idle_hours}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(activeEntry.extracted_data.visitors?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Khách đến công trình:
                        </span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.visitors!.map((v, idx) => (
                            <li key={idx}>
                              {v.name}
                              {v.role ? ` (${v.role})` : ''}
                              {v.purpose ? ` — ${v.purpose}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activeEntry.extracted_data.safety &&
                      (activeEntry.extracted_data.safety.toolbox_talk ||
                        activeEntry.extracted_data.safety.observations ||
                        activeEntry.extracted_data.safety.incidents) && (
                        <div className="text-sm space-y-1">
                          <span className="font-bold text-ink flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5" /> An toàn:
                          </span>
                          <ul className="list-disc pl-5 space-y-0.5 text-ink">
                            {activeEntry.extracted_data.safety.toolbox_talk && (
                              <li>Họp đầu giờ: {activeEntry.extracted_data.safety.toolbox_talk}</li>
                            )}
                            {activeEntry.extracted_data.safety.observations && (
                              <li>Quan sát: {activeEntry.extracted_data.safety.observations}</li>
                            )}
                            {activeEntry.extracted_data.safety.incidents && (
                              <li className="text-danger">
                                Sự cố: {activeEntry.extracted_data.safety.incidents}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                    {(activeEntry.extracted_data.quantities?.length || 0) > 0 && (
                      <div className="text-sm space-y-1">
                        <span className="font-bold text-info flex items-center gap-1.5">
                          <Ruler className="w-3.5 h-3.5" /> Khối lượng (Kế hoạch / Thực tế):
                        </span>
                        <ul className="list-disc pl-5 space-y-0.5 text-ink">
                          {activeEntry.extracted_data.quantities!.map((q, idx) => (
                            <li key={idx}>
                              {q.item}: {q.installed || '—'} / {q.planned || '—'} {q.unit}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {meta?.reviewed_at && (
                      <p className="text-xs text-ink-soft flex items-center gap-1.5 pt-1 border-t border-border">
                        <CheckCircle className="w-3.5 h-3.5 text-accent shrink-0" />
                        Đã được người ghi kiểm tra trước khi lưu
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-border space-y-2">
                  {!locked && (
                    <button
                      onClick={() => {
                        setSignOffName((prev) => prev || displayName(profile));
                        setFileTarget(activeEntry);
                      }}
                      className="btn-block"
                    >
                      <Lock className="w-5 h-5" />
                      <span>Lưu kho &amp; khóa nhật ký</span>
                    </button>
                  )}

                  {locked && canUnlockEntry(profile) && (
                    <button
                      onClick={(e) => unlockEntry(activeEntry, e)}
                      className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-card bg-card-alt text-ink border border-border-subtle font-bold text-sm hover:border-border-strong transition cursor-pointer"
                    >
                      <Unlock className="w-5 h-5" />
                      <span>Mở khóa (ghi vào lịch sử)</span>
                    </button>
                  )}

                  {canDeleteEntry(activeEntry, profile, userId) && (
                    <button
                      type="button"
                      onClick={() => setEntryToDelete(activeEntry)}
                      className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-card bg-danger/12 text-danger border border-danger/40 hover:bg-danger hover:text-white font-bold text-sm transition cursor-pointer"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>Xóa nhật ký này</span>
                    </button>
                  )}

                  {locked && !canUnlockEntry(profile) && (
                    <p className="text-xs text-ink-soft text-center">
                      Nhật ký đã lưu kho là bản ghi chính thức — chỉ quản trị viên mới sửa được.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Sign-off dialog — required to file/lock an entry */}
      {fileTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 scrim animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signoff-dialog-title"
        >
          <div className="w-full max-w-sm bg-card border border-border rounded-[20px] p-5 space-y-4 shadow-2xl">
            <div className="space-y-1">
              <h3 id="signoff-dialog-title" className="text-base font-bold text-ink">
                Xác nhận &amp; Lưu kho
              </h3>
              <p className="text-sm text-ink-soft">
                Ký xác nhận nội dung nhật ký đúng sự thật trước khi khóa lại. Sau khi lưu kho, chỉ quản trị viên mới mở khóa được.
              </p>
            </div>
            <div>
              <label htmlFor="diary-signoff" className="block text-sm font-bold text-ink mb-1">
                Người ký xác nhận
              </label>
              <input
                id="diary-signoff"
                value={signOffName}
                onChange={(e) => setSignOffName(e.target.value)}
                className="field w-full px-3 py-2.5 text-sm font-bold"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setFileTarget(null)}>
                Hủy
              </Button>
              <Button
                onClick={(e) => {
                  if (!signOffName.trim()) return;
                  fileEntry(fileTarget, signOffName.trim(), e);
                }}
                disabled={!signOffName.trim()}
                icon={<Lock className="w-4 h-4" />}
              >
                Lưu kho &amp; khóa
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 scrim animate-fade-in"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-[85vh] rounded-[14px] border border-border" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 icon-btn bg-card border border-border"
            aria-label="Đóng ảnh"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {entryToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 scrim animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-entry-dialog-title"
        >
          <div className="w-full max-w-sm bg-card border border-border rounded-[20px] p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-[12px] bg-danger/12 border border-danger/40 text-danger flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="delete-entry-dialog-title" className="text-base font-bold text-ink">
                  Xác nhận xóa nhật ký?
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed">
                  Nhật ký{' '}
                  <strong className="text-ink">{entryToDelete.entry_meta?.log_number || ''}</strong> ghi lúc{' '}
                  <strong className="text-ink">
                    {new Date(entryToDelete.created_at).toLocaleString('vi-VN')}
                  </strong>{' '}
                  cùng toàn bộ ảnh và ghi âm sẽ bị xóa vĩnh viễn.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setEntryToDelete(null)} disabled={isDeleting}>
                Hủy
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                icon={isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              >
                {isDeleting ? 'Đang xóa...' : 'Xóa'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
