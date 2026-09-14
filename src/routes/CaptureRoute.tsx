import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  Camera,
  Trash2,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  Lock,
  FileText,
  Plus,
  CloudSun,
  MapPin,
  AlertTriangle,
  Flag,
  Save,
  X
} from 'lucide-react';
import { ExtractedData, Project, UserProfile, Weather } from '../lib/types';
import { blobToBase64, createEntry, uploadMediaToSupabase } from '../lib/offlineStore';
import { addToOfflineQueue } from '../lib/offlineDb';
import { analyzeAudio, extractFromText } from '../lib/geminiFallback';
import { getNextLogNumber, canWrite, displayName } from '../lib/session';
import { fetchWeather, formatWeather, isAdverseWeather } from '../lib/weather';
import { Toast } from '../components/Toast';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CollapsibleSection } from '../components/CollapsibleSection';

interface CaptureRouteProps {
  isOnline: boolean;
  activeProject: Project | null;
  profile: UserProfile | null;
  onEntrySaved: () => void;
  onGoToProjects: () => void;
}

const CATEGORIES = ['Ép cọc', 'Bê tông', 'Thợ nề', 'Xây tô', 'Điện nước', 'Vật tư', 'An toàn', 'Khác'];

const MAX_PHOTOS = 10;

const emptyExtraction = (): ExtractedData => ({
  category: 'Khác',
  materials: [],
  labor: [],
  summary_bullet: '',
  is_flagged: false
});

type Phase = 'capture' | 'review';

interface RowField {
  key: string;
  placeholder: string;
  span: number; // out of a 6-column grid
  type?: 'text' | 'number';
}

/** Compact multi-field row editor shared by the six content-field sections below. */
const ArrayRowsEditor: React.FC<{
  items: Array<Record<string, any>>;
  fields: RowField[];
  emptyLabel: string;
  onAdd: () => void;
  onUpdate: (idx: number, field: string, value: string) => void;
  onRemove: (idx: number) => void;
}> = ({ items, fields, emptyLabel, onAdd, onUpdate, onRemove }) => (
  <div className="space-y-2">
    {items.length === 0 ? (
      <p className="text-sm text-ink-soft">{emptyLabel}</p>
    ) : (
      items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-6 gap-1.5">
            {fields.map((f) => (
              <input
                key={f.key}
                type={f.type === 'number' ? 'number' : 'text'}
                value={item[f.key] ?? ''}
                onChange={(e) => onUpdate(idx, f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{ gridColumn: `span ${f.span} / span ${f.span}` }}
                className="field px-2.5 py-2 text-sm"
              />
            ))}
          </div>
          <button
            onClick={() => onRemove(idx)}
            className="icon-btn icon-btn-sm hover:text-danger shrink-0"
            aria-label="Xóa dòng"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))
    )}
    <Button variant="secondary" size="sm" onClick={onAdd} icon={<Plus className="w-4 h-4" />}>
      Thêm
    </Button>
  </div>
);

export const CaptureRoute: React.FC<CaptureRouteProps> = ({
  isOnline,
  activeProject,
  profile,
  onEntrySaved,
  onGoToProjects
}) => {
  const [phase, setPhase] = useState<Phase>('capture');

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Photos — a jobsite entry is rarely one picture.
  const [photos, setPhotos] = useState<Array<{ blob: Blob; url: string }>>([]);

  // Log context
  const [workDate, setWorkDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Review state (the human-confirm step)
  const [transcript, setTranscript] = useState('');
  const [extraction, setExtraction] = useState<ExtractedData>(emptyExtraction());
  const [signOffName, setSignOffName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readOnly = !canWrite(profile);

  const showToast = (message: string, type: 'success' | 'error' | 'info') =>
    setToast({ message, type, open: true });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Weather -------------------------------------------------------------
  // Stamped automatically from the site's coordinates. Nobody types it, so it
  // is always present and always consistent -- which is the whole point when a
  // delay claim is argued from these logs a year later.
  const loadWeather = useCallback(async () => {
    if (!activeProject?.latitude || !activeProject?.longitude) {
      setWeather(null);
      return;
    }
    setWeatherLoading(true);
    const w = await fetchWeather(activeProject.latitude, activeProject.longitude, workDate);
    setWeather(w);
    setWeatherLoading(false);
  }, [activeProject, workDate]);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  // --- Recording -----------------------------------------------------------
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = 'audio/aac';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(finalBlob);
        setAudioUrl(URL.createObjectURL(finalBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      showToast('Vui lòng cấp quyền truy cập Micro trên Safari/Chrome.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const clearAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlayingAudio(false);
  };

  const togglePlayAudio = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  // --- Photos --------------------------------------------------------------
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      showToast(`Tối đa ${MAX_PHOTOS} ảnh cho mỗi nhật ký.`, 'info');
      return;
    }

    const accepted = files.slice(0, room);
    setPhotos((prev) => [...prev, ...accepted.map((f) => ({ blob: f, url: URL.createObjectURL(f) }))]);

    if (files.length > room) {
      showToast(`Chỉ thêm được ${room} ảnh nữa (tối đa ${MAX_PHOTOS}).`, 'info');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // --- Reset ---------------------------------------------------------------
  const resetAll = () => {
    clearAudio();
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setTranscript('');
    setExtraction(emptyExtraction());
    setSignOffName('');
    setPhase('capture');
  };

  // --- Step: analyse then review ------------------------------------------
  const handleAnalyze = async () => {
    if (!audioBlob && photos.length === 0) {
      showToast('Vui lòng thu âm hoặc chọn ít nhất 1 ảnh trước khi tiếp tục.', 'info');
      return;
    }

    if (!activeProject) {
      showToast('Vui lòng chọn công trình ở thanh trên cùng trước khi lưu nhật ký.', 'info');
      return;
    }

    // No signal: queue the raw capture and review it when the entry syncs.
    if (!isOnline) {
      await saveOfflineDraft();
      return;
    }

    setSignOffName((prev) => prev || displayName(profile));

    if (!audioBlob) {
      // Photos only — nothing to transcribe, go straight to review.
      setTranscript('');
      setExtraction(emptyExtraction());
      setPhase('review');
      return;
    }

    setIsAnalyzing(true);
    try {
      const base64 = await blobToBase64(audioBlob);
      const result = await analyzeAudio(base64, audioBlob.type);

      if (result.error) throw new Error(result.error);

      setTranscript(result.text || '');
      setExtraction({ ...emptyExtraction(), ...(result.extracted_data || {}) });
      setPhase('review');
    } catch (err: any) {
      console.error('Analysis failed:', err);
      showToast('Lỗi khi xử lý ghi âm: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** Re-run extraction after the user corrects the transcript. */
  const handleReExtract = async () => {
    if (!transcript.trim()) return;
    setIsReExtracting(true);
    try {
      const result = await extractFromText(transcript);
      if (result.error) throw new Error(result.error);
      setExtraction({ ...emptyExtraction(), ...(result.extracted_data || {}) });
      showToast('Đã trích xuất lại theo văn bản đã sửa.', 'success');
    } catch (err: any) {
      showToast('Lỗi trích xuất lại: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setIsReExtracting(false);
    }
  };

  // --- Save ----------------------------------------------------------------
  // Queues the raw Blobs directly in IndexedDB -- no base64 round-trip, so
  // nothing is inflated and nothing is capped at localStorage's ~5MB.
  const saveOfflineDraft = async () => {
    setIsSaving(true);
    try {
      await addToOfflineQueue({
        voiceBlob: audioBlob ?? undefined,
        photoBlobs: photos.map((p) => p.blob),
        audioMimeType: audioBlob?.type,
        photoMimeType: photos[0]?.blob.type,
        projectId: activeProject?.id ?? null,
        workDate,
        weather
      });

      showToast('Đã lưu vào máy — sẽ tự đồng bộ và chờ kiểm tra khi có mạng.', 'success');
      resetAll();
      onEntrySaved();
    } catch (err: any) {
      showToast(err.message || 'Không lưu được vào bộ nhớ máy.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (fileAndLock: boolean) => {
    if (!activeProject) {
      showToast('Vui lòng chọn công trình trước khi lưu.', 'info');
      return;
    }

    if (fileAndLock && !signOffName.trim()) {
      showToast('Vui lòng nhập tên người ký xác nhận trước khi lưu kho.', 'info');
      return;
    }

    setIsSaving(true);
    try {
      const logNumber = await getNextLogNumber(activeProject);

      let voiceUrl: string | null = null;
      if (audioBlob) {
        voiceUrl = await uploadMediaToSupabase(audioBlob, 'voice-memos', 'voice.mp4');
      }

      const photoUrls: string[] = [];
      for (const p of photos) {
        photoUrls.push(await uploadMediaToSupabase(p.blob, 'photos', 'photo.jpg'));
      }

      const result = await createEntry({
        voiceUrl,
        photoUrls,
        transcription: transcript.trim() || null,
        extractedData: extraction,
        projectId: activeProject.id,
        logNumber,
        workDate,
        weather,
        fileAndLock,
        reviewed: true,
        signedOffName: fileAndLock ? signOffName.trim() : null
      });

      if ('error' in result) throw new Error(result.error);

      showToast(
        fileAndLock
          ? `Đã lưu kho & khóa nhật ký ${logNumber}. Bản ghi này không sửa được nữa.`
          : `Đã lưu nháp ${logNumber}. Nhớ lưu kho khi hoàn tất.`,
        'success'
      );

      resetAll();
      onEntrySaved();
    } catch (err: any) {
      console.error('Save error:', err);
      showToast('Lỗi khi lưu: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Editable extraction rows -------------------------------------------
  const updateMaterial = (idx: number, field: string, value: string) => {
    setExtraction((prev) => ({
      ...prev,
      materials: prev.materials.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    }));
  };

  const updateLabor = (idx: number, field: string, value: string) => {
    setExtraction((prev) => ({
      ...prev,
      labor: prev.labor.map((l, i) =>
        i === idx ? { ...l, [field]: field === 'count' ? Number(value) || 0 : value } : l
      )
    }));
  };

  // Generic row editing for the six daily-log content fields below. Each is a
  // loosely-typed array of small records, so one add/update/remove triple
  // covers all of them instead of six hand-written copies of the materials/
  // labor pattern above.
  type ArrayFieldKey = 'delays' | 'deliveries' | 'equipment' | 'visitors' | 'quantities';

  const addArrayRow = (key: ArrayFieldKey, blank: Record<string, string>) => {
    setExtraction((prev) => ({ ...prev, [key]: [...((prev[key] as any[]) || []), blank] }));
  };

  const updateArrayRow = (key: ArrayFieldKey, idx: number, field: string, value: string) => {
    setExtraction((prev) => ({
      ...prev,
      [key]: ((prev[key] as any[]) || []).map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    }));
  };

  const removeArrayRow = (key: ArrayFieldKey, idx: number) => {
    setExtraction((prev) => ({ ...prev, [key]: ((prev[key] as any[]) || []).filter((_, i) => i !== idx) }));
  };

  const updateSafety = (field: 'toolbox_talk' | 'observations' | 'incidents', value: string) => {
    setExtraction((prev) => ({ ...prev, safety: { ...prev.safety, [field]: value } }));
  };

  const weatherLine = formatWeather(weather);

  // -------------------------------------------------------------------------
  if (readOnly) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-8 pb-28">
        <div className="card p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-warning mx-auto" />
          <h2 className="text-base font-bold text-ink">Tài khoản chỉ xem</h2>
          <p className="text-sm text-ink-soft">
            Vai trò của bạn chỉ được xem nhật ký, không ghi nhận mới. Liên hệ quản trị viên nếu bạn cần quyền ghi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* ------------------------------ CAPTURE ------------------------------ */}
      {phase === 'capture' && (
        <>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-ink tracking-tight">Ghi Nhận Nhật Ký Ngày</h2>
            <p className="text-sm text-ink-soft">Thu âm → thêm ảnh → kiểm tra rồi lưu kho</p>
          </div>

          {/* Site + date + auto weather */}
          {!activeProject ? (
            <div className="card p-4 space-y-3 border-warning/50">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">Chưa chọn công trình</p>
                  <p className="text-sm text-ink-soft">
                    Mỗi nhật ký phải thuộc về một công trình. Chọn ở thanh trên cùng, hoặc tạo công trình mới.
                  </p>
                </div>
              </div>
              <button onClick={onGoToProjects} className="btn-block">
                <Plus className="w-5 h-5" />
                <span>Tạo công trình</span>
              </button>
            </div>
          ) : (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <MapPin className="w-4 h-4 text-accent shrink-0" />
                <span className="truncate">
                  {activeProject.code ? `${activeProject.code} · ` : ''}
                  {activeProject.name}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label htmlFor="work-date" className="text-sm font-bold text-ink-soft shrink-0">
                  Ngày thi công
                </label>
                <input
                  id="work-date"
                  type="date"
                  value={workDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="field px-3 py-2 text-sm font-bold"
                />
              </div>
              <p className="text-xs text-ink-soft">
                Ghi lúc 5 giờ chiều về việc sáng nay? Chọn đúng ngày việc đã xảy ra.
              </p>

              {/* Weather stamp */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <CloudSun
                    className={`w-5 h-5 shrink-0 ${isAdverseWeather(weather) ? 'text-warning' : 'text-info'}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">
                      {weatherLoading
                        ? 'Đang lấy thời tiết...'
                        : weatherLine || 'Không có toạ độ công trình'}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {weatherLine
                        ? 'Tự động ghi kèm nhật ký'
                        : 'Thêm toạ độ ở tab Công Trình để tự ghi thời tiết'}
                    </p>
                  </div>
                </div>
                {activeProject.latitude != null && (
                  <button
                    onClick={loadWeather}
                    className="icon-btn icon-btn-sm border border-border"
                    aria-label="Lấy lại thời tiết"
                    title="Lấy lại thời tiết"
                  >
                    <RefreshCw className={`w-4 h-4 ${weatherLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {isAdverseWeather(weather) && (
                <div className="flex items-start gap-2 p-2.5 rounded-[12px] bg-warning/12 border border-warning/40 text-sm text-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Thời tiết xấu — nhớ ghi rõ hạng mục bị gián đoạn và thời gian dừng việc.</span>
                </div>
              )}
            </div>
          )}

          <div className="card p-5 space-y-6">
            {/* STEP 1 — VOICE */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="w-6 h-6 rounded-full bg-card-alt text-accent flex items-center justify-center text-xs font-bold border border-border">
                    1
                  </span>
                  Thu Âm Giọng Nói
                </span>
                <Badge tone="primary" className="font-mono text-sm normal-case tracking-normal h-auto px-2.5 py-1">
                  {formatTime(recordingTime)}
                </Badge>
              </div>

              {/* A script beats a blank record button: better dictation in,
                  better extraction out. */}
              {!audioUrl && !isRecording && (
                <div className="p-3 rounded-[12px] bg-card-alt border border-border text-sm text-ink-soft space-y-1">
                  <p className="font-bold text-ink">Nói theo thứ tự này:</p>
                  <p>Hạng mục → số thợ và giờ công → việc đã xong → vật tư nhận → sự cố / chậm trễ.</p>
                </div>
              )}

              <div className="flex flex-col items-center justify-center py-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isAnalyzing || isSaving}
                    className="group relative w-28 h-28 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    aria-label="Bắt đầu thu âm"
                  >
                    <Mic className="w-12 h-12 text-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="relative w-28 h-28 rounded-full bg-danger flex items-center justify-center active-pulse active:scale-95 transition-all cursor-pointer"
                    aria-label="Dừng thu âm"
                  >
                    <div className="w-full h-full rounded-full flex flex-col items-center justify-center gap-1">
                      <Square className="w-9 h-9 text-white fill-white" />
                      <span className="text-xs font-black text-white tracking-wider">DỪNG THU</span>
                    </div>
                  </button>
                )}
              </div>

              {audioUrl && !isRecording && (
                <div className="p-3 rounded-card bg-surface border border-border flex items-center justify-between gap-3">
                  <button
                    onClick={togglePlayAudio}
                    className="w-11 h-11 rounded-[0.7rem] bg-accent text-accent-ink flex items-center justify-center shrink-0 font-bold hover:bg-accent-hover transition cursor-pointer"
                    aria-label={isPlayingAudio ? 'Tạm dừng' : 'Nghe lại'}
                  >
                    {isPlayingAudio ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    )}
                  </button>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-ink">Bản ghi sẵn sàng</p>
                    <p className="text-xs text-ink-soft">Thời lượng: {formatTime(recordingTime)}</p>
                  </div>
                  <button onClick={clearAudio} className="icon-btn hover:text-danger" title="Xóa ghi âm">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <audio
                    ref={audioPlayerRef}
                    src={audioUrl}
                    onEnded={() => setIsPlayingAudio(false)}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* STEP 2 — PHOTOS */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="w-6 h-6 rounded-full bg-card-alt text-accent flex items-center justify-center text-xs font-bold border border-border">
                    2
                  </span>
                  Ảnh Hiện Trường
                </span>
                <Badge
                  tone={photos.length >= MAX_PHOTOS ? 'warning' : 'neutral'}
                  className="!h-auto !px-2.5 !py-1 !normal-case !tracking-normal"
                >
                  {photos.length}/{MAX_PHOTOS} ảnh
                </Badge>
              </div>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, idx) => (
                    <div key={p.url} className="relative rounded-[12px] overflow-hidden border border-border">
                      <img src={p.url} alt={`Ảnh ${idx + 1}`} className="w-full h-24 object-cover" />
                      {idx === 0 && (
                        <span className="absolute bottom-1 left-1 pill px-1.5 py-0 bg-accent text-accent-ink text-xs">
                          Ảnh bìa
                        </span>
                      )}
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 w-8 h-8 rounded-[8px] bg-card/90 border border-border text-danger flex items-center justify-center hover:bg-danger hover:text-white transition cursor-pointer"
                        aria-label={`Xóa ảnh ${idx + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {photos.length < MAX_PHOTOS ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing || isSaving}
                  className="w-full h-24 rounded-card border border-dashed border-border-subtle hover:border-accent bg-card-alt hover:bg-paper-soft flex flex-col items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-7 h-7 text-ink" />
                  <span className="text-sm text-ink font-bold">
                    {photos.length === 0 ? 'Chạm để chụp hoặc chọn ảnh — tối đa 10' : 'Thêm ảnh'}
                  </span>
                  {photos.length > 0 && (
                    <span className="text-xs text-ink-soft">Còn thêm được {MAX_PHOTOS - photos.length} ảnh</span>
                  )}
                </button>
              ) : (
                <p className="text-xs text-ink-soft text-center">Đã đạt tối đa {MAX_PHOTOS} ảnh cho nhật ký này.</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            {/* STEP 3 — REVIEW */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm font-bold text-ink mb-1">
                <span className="w-6 h-6 rounded-full bg-accent text-accent-ink flex items-center justify-center text-xs font-bold">
                  3
                </span>
                Kiểm Tra &amp; Lưu
              </div>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing || isSaving || (!audioBlob && photos.length === 0) || !activeProject}
                className="btn-block"
              >
                {isAnalyzing || isSaving ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>{isAnalyzing ? 'Đang nghe & trích xuất...' : 'Đang lưu...'}</span>
                  </>
                ) : isOnline ? (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Xử lý AI &amp; Kiểm tra</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Lưu vào máy (offline)</span>
                  </>
                )}
              </button>

              <p className="text-xs text-ink-soft text-center">
                {isOnline
                  ? 'Bạn sẽ được xem và sửa nội dung AI trích xuất trước khi nhật ký được lưu.'
                  : 'Không có mạng — nhật ký lưu trên máy và sẽ được xử lý khi kết nối lại.'}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------ REVIEW ------------------------------- */}
      {phase === 'review' && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => setPhase('capture')} className="icon-btn border border-border" aria-label="Quay lại">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink tracking-tight">Kiểm Tra Trước Khi Lưu</h2>
              <p className="text-sm text-ink-soft truncate">
                Sửa những gì AI nghe sai — bản lưu kho không sửa lại được.
              </p>
            </div>
          </div>

          {/* Context summary */}
          <div className="card-alt p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <MapPin className="w-4 h-4 text-accent shrink-0" />
              <span className="truncate">
                {activeProject?.code ? `${activeProject.code} · ` : ''}
                {activeProject?.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Ngày thi công: {workDate}</span>
            </div>
            {weatherLine && (
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <CloudSun className="w-4 h-4 shrink-0" />
                <span>{weatherLine}</span>
              </div>
            )}
          </div>

          {/* Transcript */}
          <div className="card p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold text-ink">Văn bản ghi âm</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReExtract}
                disabled={isReExtracting || !transcript.trim()}
                icon={<RefreshCw className={`w-4 h-4 ${isReExtracting ? 'animate-spin' : ''}`} />}
              >
                Trích xuất lại
              </Button>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              placeholder="Không có ghi âm — bạn có thể gõ nội dung nhật ký ở đây."
              className="field w-full px-3 py-2.5 text-sm leading-relaxed resize-y"
            />
            <p className="text-xs text-ink-soft">
              Sửa tên vật tư, số lượng hoặc tên thợ nếu AI nghe nhầm, rồi bấm "Trích xuất lại".
            </p>
          </div>

          {/* Structured extraction — editable */}
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                AI đề xuất — bạn xác nhận
              </h3>
            </div>

            <div>
              <label htmlFor="cat" className="block text-sm font-bold text-ink mb-1">
                Hạng mục
              </label>
              <select
                id="cat"
                value={extraction.category}
                onChange={(e) => setExtraction((p) => ({ ...p, category: e.target.value }))}
                className="field w-full px-3 py-2.5 text-sm font-bold cursor-pointer"
              >
                {Array.from(new Set([extraction.category, ...CATEGORIES])).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Materials */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label-micro">Vật tư ({extraction.materials.length})</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setExtraction((p) => ({ ...p, materials: [...p.materials, { item: '', quantity: '', unit: '' }] }))
                  }
                  icon={<Plus className="w-4 h-4" />}
                >
                  Thêm
                </Button>
              </div>

              {extraction.materials.length === 0 ? (
                <p className="text-sm text-ink-soft">Không có vật tư nào được nhận diện.</p>
              ) : (
                extraction.materials.map((m, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-6 gap-1.5">
                      <input
                        value={m.item || ''}
                        onChange={(e) => updateMaterial(idx, 'item', e.target.value)}
                        placeholder="Vật tư"
                        className="field col-span-3 px-2.5 py-2 text-sm"
                      />
                      <input
                        value={m.quantity || ''}
                        onChange={(e) => updateMaterial(idx, 'quantity', e.target.value)}
                        placeholder="SL"
                        className="field col-span-2 px-2.5 py-2 text-sm"
                      />
                      <input
                        value={m.unit || ''}
                        onChange={(e) => updateMaterial(idx, 'unit', e.target.value)}
                        placeholder="ĐV"
                        className="field col-span-1 px-2 py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() =>
                        setExtraction((p) => ({ ...p, materials: p.materials.filter((_, i) => i !== idx) }))
                      }
                      className="icon-btn icon-btn-sm hover:text-danger shrink-0"
                      aria-label="Xóa dòng vật tư"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Labor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label-micro">Nhân công ({extraction.labor.length})</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExtraction((p) => ({ ...p, labor: [...p.labor, { role: '', count: 1, hours: '' }] }))}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Thêm
                </Button>
              </div>

              {extraction.labor.length === 0 ? (
                <p className="text-sm text-ink-soft">Không có nhân công nào được nhận diện.</p>
              ) : (
                extraction.labor.map((l, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-6 gap-1.5">
                      <input
                        value={l.role || ''}
                        onChange={(e) => updateLabor(idx, 'role', e.target.value)}
                        placeholder="Vị trí thợ"
                        className="field col-span-3 px-2.5 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={l.count ?? ''}
                        onChange={(e) => updateLabor(idx, 'count', e.target.value)}
                        placeholder="Số"
                        className="field col-span-1 px-2 py-2 text-sm"
                      />
                      <input
                        value={l.hours || ''}
                        onChange={(e) => updateLabor(idx, 'hours', e.target.value)}
                        placeholder="Giờ công"
                        className="field col-span-2 px-2.5 py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => setExtraction((p) => ({ ...p, labor: p.labor.filter((_, i) => i !== idx) }))}
                      className="icon-btn icon-btn-sm hover:text-danger shrink-0"
                      aria-label="Xóa dòng nhân công"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Content fields — collapsed by default; opens itself when the
                AI already found something so it isn't missed on review. */}
            <CollapsibleSection
              title="Chậm trễ / Sự cố"
              count={extraction.delays?.length || 0}
              tone="danger"
              defaultOpen={(extraction.delays?.length || 0) > 0}
            >
              <ArrayRowsEditor
                items={extraction.delays || []}
                fields={[
                  { key: 'cause', placeholder: 'Nguyên nhân chậm trễ / sự cố', span: 4 },
                  { key: 'duration', placeholder: 'Thời gian dừng', span: 2 }
                ]}
                emptyLabel="Không có chậm trễ hoặc sự cố nào."
                onAdd={() => addArrayRow('delays', { cause: '', duration: '' })}
                onUpdate={(idx, f, v) => updateArrayRow('delays', idx, f, v)}
                onRemove={(idx) => removeArrayRow('delays', idx)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Vật tư nhận về"
              count={extraction.deliveries?.length || 0}
              defaultOpen={(extraction.deliveries?.length || 0) > 0}
            >
              <ArrayRowsEditor
                items={extraction.deliveries || []}
                fields={[
                  { key: 'item', placeholder: 'Vật tư nhận về', span: 3 },
                  { key: 'quantity', placeholder: 'Số lượng', span: 2 },
                  { key: 'supplier', placeholder: 'Nhà cung cấp', span: 1 }
                ]}
                emptyLabel="Không có vật tư nào được giao trong ngày."
                onAdd={() => addArrayRow('deliveries', { item: '', quantity: '', supplier: '' })}
                onUpdate={(idx, f, v) => updateArrayRow('deliveries', idx, f, v)}
                onRemove={(idx) => removeArrayRow('deliveries', idx)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Thiết bị / Máy móc"
              count={extraction.equipment?.length || 0}
              defaultOpen={(extraction.equipment?.length || 0) > 0}
            >
              <ArrayRowsEditor
                items={extraction.equipment || []}
                fields={[
                  { key: 'name', placeholder: 'Tên thiết bị', span: 3 },
                  { key: 'hours_used', placeholder: 'Giờ hoạt động', span: 2 },
                  { key: 'idle_hours', placeholder: 'Giờ chờ', span: 1 }
                ]}
                emptyLabel="Không có thiết bị nào được ghi nhận."
                onAdd={() => addArrayRow('equipment', { name: '', hours_used: '', idle_hours: '' })}
                onUpdate={(idx, f, v) => updateArrayRow('equipment', idx, f, v)}
                onRemove={(idx) => removeArrayRow('equipment', idx)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Khách đến công trình"
              count={extraction.visitors?.length || 0}
              defaultOpen={(extraction.visitors?.length || 0) > 0}
            >
              <ArrayRowsEditor
                items={extraction.visitors || []}
                fields={[
                  { key: 'name', placeholder: 'Tên khách', span: 3 },
                  { key: 'role', placeholder: 'Vai trò', span: 1 },
                  { key: 'purpose', placeholder: 'Mục đích đến', span: 2 }
                ]}
                emptyLabel="Không có khách nào đến công trình."
                onAdd={() => addArrayRow('visitors', { name: '', role: '', purpose: '' })}
                onUpdate={(idx, f, v) => updateArrayRow('visitors', idx, f, v)}
                onRemove={(idx) => removeArrayRow('visitors', idx)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="An toàn lao động"
              defaultOpen={Boolean(
                extraction.safety?.toolbox_talk || extraction.safety?.observations || extraction.safety?.incidents
              )}
            >
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-bold text-ink-soft mb-1">Họp an toàn đầu giờ</label>
                  <textarea
                    value={extraction.safety?.toolbox_talk || ''}
                    onChange={(e) => updateSafety('toolbox_talk', e.target.value)}
                    rows={2}
                    className="field w-full px-2.5 py-2 text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-soft mb-1">Quan sát an toàn</label>
                  <textarea
                    value={extraction.safety?.observations || ''}
                    onChange={(e) => updateSafety('observations', e.target.value)}
                    rows={2}
                    className="field w-full px-2.5 py-2 text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-danger mb-1">Sự cố / tai nạn</label>
                  <textarea
                    value={extraction.safety?.incidents || ''}
                    onChange={(e) => updateSafety('incidents', e.target.value)}
                    rows={2}
                    className="field w-full px-2.5 py-2 text-sm resize-y"
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Khối lượng thi công (Kế hoạch / Thực tế)"
              count={extraction.quantities?.length || 0}
              defaultOpen={(extraction.quantities?.length || 0) > 0}
            >
              <ArrayRowsEditor
                items={extraction.quantities || []}
                fields={[
                  { key: 'item', placeholder: 'Hạng mục', span: 3 },
                  { key: 'planned', placeholder: 'Kế hoạch', span: 1 },
                  { key: 'installed', placeholder: 'Thực tế', span: 1 },
                  { key: 'unit', placeholder: 'ĐV', span: 1 }
                ]}
                emptyLabel="Không có khối lượng thi công nào được ghi nhận."
                onAdd={() => addArrayRow('quantities', { item: '', planned: '', installed: '', unit: '' })}
                onUpdate={(idx, f, v) => updateArrayRow('quantities', idx, f, v)}
                onRemove={(idx) => removeArrayRow('quantities', idx)}
              />
            </CollapsibleSection>

            {/* Flag */}
            <button
              onClick={() => setExtraction((p) => ({ ...p, is_flagged: !p.is_flagged }))}
              className={`w-full flex items-center gap-2.5 p-3 rounded-card border transition cursor-pointer ${
                extraction.is_flagged
                  ? 'bg-warning/12 border-warning/50 text-warning'
                  : 'bg-card-alt border-border text-ink-soft'
              }`}
            >
              <Flag className={`w-5 h-5 shrink-0 ${extraction.is_flagged ? 'fill-current' : ''}`} />
              <span className="text-sm font-bold text-left">
                {extraction.is_flagged ? 'Đã gắn cờ Cần Chú Ý' : 'Gắn cờ Cần Chú Ý'}
              </span>
            </button>
            <p className="text-xs text-ink-soft -mt-2">
              Mục gắn cờ sẽ tự vào danh sách To-Do tuần và phần "Cần chú ý" của báo cáo ngày.
            </p>
          </div>

          {/* Sign-off — a deliberate act, not just whoever happened to be
              logged in. Only required when filing (locking); a draft can
              still be handed off to someone else to review and sign later. */}
          <div className="card p-4 space-y-2">
            <label htmlFor="signoff" className="block text-sm font-bold text-ink">
              Người ký xác nhận
            </label>
            <input
              id="signoff"
              value={signOffName}
              onChange={(e) => setSignOffName(e.target.value)}
              placeholder="Họ tên người xác nhận"
              className="field w-full px-3 py-2.5 text-sm font-bold"
            />
            <p className="text-xs text-ink-soft">
              Tên này được ghi lại cùng thời gian khi lưu kho, xác nhận nội dung nhật ký là đúng sự thật.
            </p>
          </div>

          {/* Save actions */}
          <div className="space-y-2">
            <button onClick={() => handleSave(true)} disabled={isSaving} className="btn-block">
              {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              <span>{isSaving ? 'Đang lưu...' : 'Xác nhận, Lưu Kho & Khóa'}</span>
            </button>

            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-card bg-card-alt text-ink border border-border-subtle font-bold text-sm hover:border-border-strong transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              <span>Lưu nháp (còn sửa được)</span>
            </button>

            <p className="text-xs text-ink-soft text-center px-2">
              Lưu kho sẽ khóa nhật ký lại: giữ nguyên nội dung, thời gian và người ghi. Chỉ quản trị viên mở khóa được.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
