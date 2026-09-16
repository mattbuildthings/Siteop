import React, { useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  MapPin,
  Crosshair,
  RefreshCw,
  X,
  Users,
  HardDrive,
  ChevronRight,
  CheckCircle2,
  Archive,
  CloudSun,
  Clock
} from 'lucide-react';
import { ASSIGNABLE_ROLES, Project, ROLE_LABELS, UserProfile, UserRole } from '../lib/types';
import { supabase } from '../lib/supabase';
import { Toast } from '../components/Toast';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  fetchProjectMemberIds,
  isAdmin,
  isManager,
  markUserReviewed,
  setProjectMembership,
  setUserRole
} from '../lib/session';
import { fetchWeather, formatWeather } from '../lib/weather';

interface ProjectsRouteProps {
  projects: Project[];
  profile: UserProfile | null;
  profiles: Record<string, UserProfile>;
  activeProject: Project | null;
  onSelectProject: (projectId: string | null) => void;
  onProjectsChanged: () => void;
  onNavigateToSync: () => void;
}

const BLANK = {
  name: '',
  code: '',
  address: '',
  client_name: '',
  latitude: '',
  longitude: ''
};

export const ProjectsRoute: React.FC<ProjectsRouteProps> = ({
  projects,
  profile,
  profiles,
  activeProject,
  onSelectProject,
  onProjectsChanged,
  onNavigateToSync
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [weatherPreview, setWeatherPreview] = useState<string>('');
  const [showTeam, setShowTeam] = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [membersFor, setMembersFor] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [savingMember, setSavingMember] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info') =>
    setToast({ message, type, open: true });

  const manager = isManager(profile);
  const admin = isAdmin(profile);

  // Show what the automatic weather stamp will look like for these coordinates.
  useEffect(() => {
    const lat = parseFloat(form.latitude);
    const lon = parseFloat(form.longitude);
    if (!showForm || Number.isNaN(lat) || Number.isNaN(lon)) {
      setWeatherPreview('');
      return;
    }
    let cancelled = false;
    fetchWeather(lat, lon).then((w) => {
      if (!cancelled) setWeatherPreview(formatWeather(w));
    });
    return () => {
      cancelled = true;
    };
  }, [form.latitude, form.longitude, showForm]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setShowForm(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.code || '',
      address: p.address || '',
      client_name: p.client_name || '',
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : ''
    });
    setShowForm(true);
  };

  /** Standing on the site is the easiest way to get its coordinates. */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Thiết bị không hỗ trợ định vị.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(5),
          longitude: pos.coords.longitude.toFixed(5)
        }));
        setLocating(false);
        showToast('Đã lấy toạ độ hiện tại.', 'success');
      },
      (err) => {
        setLocating(false);
        showToast('Không lấy được vị trí: ' + err.message, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Vui lòng nhập tên công trình.', 'info');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        client_name: form.client_name.trim() || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null
      };

      if (editing) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editing.id);
        if (error) throw error;
        showToast('Đã cập nhật công trình.', 'success');
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('projects')
          .insert({ ...payload, created_by: userData?.user?.id || null, is_active: true })
          .select()
          .single();
        if (error) throw error;

        // The creator is a member, otherwise a non-manager could create a site
        // and immediately lose sight of it under the membership policy.
        if (data && userData?.user?.id) {
          await supabase
            .from('project_members')
            .insert({ project_id: (data as Project).id, user_id: userData.user.id });
        }

        showToast('Đã tạo công trình.', 'success');
        if (data) onSelectProject((data as Project).id);
      }

      setShowForm(false);
      onProjectsChanged();
    } catch (err: any) {
      showToast('Lỗi khi lưu công trình: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Project) => {
    try {
      const { error } = await supabase.from('projects').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw error;
      showToast(p.is_active ? 'Đã đóng công trình.' : 'Đã mở lại công trình.', 'success');
      onProjectsChanged();
    } catch (err: any) {
      showToast('Lỗi: ' + (err.message || 'Thử lại'), 'error');
    }
  };

  // Goes through siteop_set_user_role() rather than an UPDATE: the role
  // column's UPDATE privilege is revoked from clients, so a direct write no
  // longer works from anywhere -- including a browser console, which is exactly
  // how a user used to be able to make themselves an admin. The function also
  // refuses to remove the last admin, and that refusal surfaces here as a toast
  // rather than an unexplained failure.
  const changeRole = async (userId: string, role: UserRole) => {
    setSavingRole(userId);
    try {
      await setUserRole(userId, role);
      showToast('Đã đổi vai trò.', 'success');
      onProjectsChanged();
    } catch (err: any) {
      showToast('Lỗi đổi vai trò: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setSavingRole(null);
    }
  };

  const approveUser = async (userId: string, role: UserRole) => {
    setSavingRole(userId);
    try {
      await setUserRole(userId, role);
      showToast('Đã cấp quyền. Nhớ phân công vào công trình.', 'success');
      onProjectsChanged();
    } catch (err: any) {
      showToast('Lỗi cấp quyền: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setSavingRole(null);
    }
  };

  // Leaves the account exactly as it is -- a read-only guest on the demo
  // project -- and just takes it off this list.
  const keepAsGuest = async (userId: string) => {
    setSavingRole(userId);
    try {
      await markUserReviewed(userId);
      showToast('Giữ làm khách. Đã bỏ khỏi danh sách tài khoản mới.', 'success');
      onProjectsChanged();
    } catch (err: any) {
      showToast('Lỗi: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setSavingRole(null);
    }
  };

  // Membership for the project whose panel is open. Loaded on demand rather
  // than up front: it is admin-only UI and one site at a time is all that is
  // ever shown.
  const openMembers = async (projectId: string) => {
    if (membersFor === projectId) {
      setMembersFor(null);
      return;
    }
    setMembersFor(projectId);
    setLoadingMembers(true);
    try {
      setMemberIds(await fetchProjectMemberIds(projectId));
    } finally {
      setLoadingMembers(false);
    }
  };

  const toggleMembership = async (projectId: string, userId: string, isMember: boolean) => {
    setSavingMember(userId);
    try {
      await setProjectMembership(projectId, userId, isMember);
      setMemberIds((prev) => (isMember ? [...prev, userId] : prev.filter((id) => id !== userId)));
      showToast(isMember ? 'Đã thêm vào công trình.' : 'Đã gỡ khỏi công trình.', 'success');
    } catch (err: any) {
      showToast('Lỗi phân công: ' + (err.message || 'Thử lại'), 'error');
    } finally {
      setSavingMember(null);
    }
  };

  // New signups get their own section: an account nobody has looked at is a
  // task, not a row to scroll past. They still appear in the team list below --
  // they are already working guests, not applicants.
  const allProfiles = Object.values(profiles);
  const newAccounts = allProfiles.filter((u) => !u.reviewed_at);
  const teamList = allProfiles;

  // Admins already see every project, so offering to "assign" one is noise.
  const assignableUsers = teamList.filter((u) => u.role !== 'admin');

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
          <h2 className="text-xl font-bold text-ink tracking-tight">Công Trình</h2>
          <p className="text-sm text-ink-soft">{projects.length} công trình bạn có quyền xem</p>
        </div>

        {manager && (
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />} className="shrink-0">
            Thêm
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <Building2 className="w-10 h-10 text-ink-faint mx-auto" />
          <p className="text-base font-bold text-ink">Chưa có công trình nào</p>
          <p className="text-sm text-ink-soft">
            {manager
              ? 'Tạo công trình đầu tiên. Mỗi nhật ký, báo cáo ngày và số hiệu đều gắn với một công trình.'
              : 'Bạn chưa được thêm vào công trình nào. Liên hệ quản trị viên để được cấp quyền.'}
          </p>
          {manager && (
            <button onClick={openCreate} className="btn-block">
              <Plus className="w-5 h-5" />
              <span>Tạo công trình</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const isActive = activeProject?.id === p.id;
            return (
              <div
                key={p.id}
                className={`card p-4 space-y-3 transition ${isActive ? 'border-accent' : ''}`}
              >
                <button
                  onClick={() => onSelectProject(p.id)}
                  className="w-full flex items-start justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.code && (
                        <span className="font-mono text-sm font-bold text-accent bg-accent/12 px-2 py-0.5 rounded-[6px] border border-accent/30">
                          {p.code}
                        </span>
                      )}
                      <span className="text-base font-bold text-ink">{p.name}</span>
                      {!p.is_active && (
                        <Badge tone="neutral" className="!h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
                          Đã đóng
                        </Badge>
                      )}
                      {/* So an admin can tell at a glance where new signups
                          land -- otherwise the only way to know is the database. */}
                      {p.is_guest_default && (
                        <Badge tone="info" className="!h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
                          Khách mới vào đây
                        </Badge>
                      )}
                    </div>

                    {p.address && (
                      <p className="text-sm text-ink-soft flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="truncate">{p.address}</span>
                      </p>
                    )}
                    {p.client_name && <p className="text-sm text-ink-soft">Chủ đầu tư: {p.client_name}</p>}

                    <p className="text-xs text-ink-soft flex items-center gap-1.5">
                      <CloudSun className="w-3.5 h-3.5 shrink-0" />
                      {p.latitude != null && p.longitude != null
                        ? `Tự động ghi thời tiết (${p.latitude}, ${p.longitude})`
                        : 'Chưa có toạ độ — nhật ký sẽ không có thời tiết'}
                    </p>
                  </div>

                  {isActive ? (
                    <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-1" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-ink-faint shrink-0 mt-1" />
                  )}
                </button>

                {manager && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(p)}>
                      Sửa
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toggleActive(p)} icon={<Archive className="w-4 h-4" />}>
                      {p.is_active ? 'Đóng' : 'Mở lại'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openMembers(p.id)}
                      icon={<Users className="w-4 h-4" />}
                    >
                      Nhân sự
                    </Button>
                  </div>
                )}

                {/* Who can see this site. Admin-only, and the database agrees:
                    project_members writes are restricted to admins by the
                    siteop_members_write policy, so this panel cannot be used to
                    grant access the caller does not have. A user sees only the
                    sites listed here for them and cannot switch to another. */}
                {manager && membersFor === p.id && (
                  <div className="pt-2 border-t border-border space-y-2">
                    {loadingMembers ? (
                      <p className="text-xs text-ink-soft">Đang tải nhân sự...</p>
                    ) : assignableUsers.length === 0 ? (
                      <p className="text-xs text-ink-soft">
                        Chưa có người dùng nào để phân công. Duyệt tài khoản mới ở mục "Chờ duyệt".
                      </p>
                    ) : (
                      assignableUsers.map((u) => {
                        const isMember = memberIds.includes(u.user_id);
                        return (
                          <label
                            key={u.user_id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-[12px] bg-card-alt border border-border cursor-pointer"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-ink truncate">
                                {u.display_name || 'Không tên'}
                              </span>
                              <span className="block text-xs text-ink-soft">{ROLE_LABELS[u.role]}</span>
                            </span>

                            <input
                              type="checkbox"
                              checked={isMember}
                              disabled={savingMember === u.user_id}
                              onChange={(e) => toggleMembership(p.id, u.user_id, e.target.checked)}
                              className="w-5 h-5 accent-[var(--accent)] shrink-0 cursor-pointer"
                            />
                          </label>
                        );
                      })
                    )}

                    <p className="text-xs text-ink-soft">
                      Chỉ quản trị viên phân công được. Người dùng và khách chỉ thấy công trình họ được phân công.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New signups. Above the team panel and always expanded -- it is the one
          thing on this screen with someone waiting at the other end. They are
          not blocked while they wait: they can already read the demo project. */}
      {admin && newAccounts.length > 0 && (
        <div className="card p-4 space-y-3 border-accent/40">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <Clock className="w-4 h-4 text-accent" />
            Tài khoản mới ({newAccounts.length})
          </span>

          <div className="space-y-2">
            {newAccounts.map((u) => (
              <div key={u.user_id} className="p-2.5 rounded-[12px] bg-card-alt border border-border space-y-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{u.display_name || 'Không tên'}</p>
                  <p className="text-xs text-ink-soft truncate">
                    {ROLE_LABELS[u.role]}
                    {u.company ? ` · ${u.company}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ASSIGNABLE_ROLES.filter((r) => r !== 'guest').map((r) => (
                    <button
                      key={r}
                      disabled={savingRole === u.user_id}
                      onClick={() => approveUser(u.user_id, r)}
                      className="px-3 py-2 rounded-[12px] border border-border text-xs font-bold text-ink hover:border-border-strong transition disabled:opacity-50"
                    >
                      Cấp quyền · {ROLE_LABELS[r]}
                    </button>
                  ))}

                  <button
                    disabled={savingRole === u.user_id}
                    onClick={() => keepAsGuest(u.user_id)}
                    className="px-3 py-2 rounded-[12px] border border-border text-xs font-bold text-ink-soft hover:text-ink hover:border-border-strong transition disabled:opacity-50"
                  >
                    Giữ làm khách
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-ink-soft">
            Tài khoản mới tự vào công trình demo với quyền khách (chỉ xem). Cấp quyền "Người dùng" để họ ghi được nhật
            ký, rồi phân công vào công trình của họ — người dùng chỉ thấy công trình được phân công.
          </p>
        </div>
      )}

      {/* Team & roles — admin only */}
      {admin && (
        <div className="card p-4 space-y-3">
          <button
            onClick={() => setShowTeam((v) => !v)}
            className="w-full flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-ink">
              <Users className="w-4 h-4 text-accent" />
              Nhân sự &amp; phân quyền ({teamList.length})
            </span>
            <ChevronRight className={`w-5 h-5 text-ink-soft transition ${showTeam ? 'rotate-90' : ''}`} />
          </button>

          {showTeam && (
            <div className="space-y-2 pt-2 border-t border-border">
              {teamList.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-[12px] bg-card-alt border border-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{u.display_name || 'Không tên'}</p>
                    {u.company && <p className="text-xs text-ink-soft truncate">{u.company}</p>}
                  </div>

                  <select
                    value={u.role}
                    disabled={savingRole === u.user_id}
                    onChange={(e) => changeRole(u.user_id, e.target.value as UserRole)}
                    className="field px-2.5 py-2 text-sm font-bold cursor-pointer shrink-0"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <p className="text-xs text-ink-soft">
                Khách chỉ xem, không ghi được nhật ký. Người dùng ghi nhật ký trên công trình được phân công. Quản trị
                xem được mọi công trình, quản lý công trình/nhân sự, và mở khóa được nhật ký đã lưu kho.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Admin: Drive export lives here now, not in the tab bar */}
      {manager && (
        <button
          onClick={onNavigateToSync}
          className="card p-4 w-full flex items-center justify-between gap-2 cursor-pointer hover:border-border-strong transition"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <HardDrive className="w-4 h-4 text-accent" />
            Xuất Google Drive &amp; lịch sử đồng bộ
          </span>
          <ChevronRight className="w-5 h-5 text-ink-soft" />
        </button>
      )}

      {/* Create / edit form */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 scrim animate-fade-in">
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-card border border-border rounded-t-[20px] sm:rounded-[20px] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">
                {editing ? 'Sửa công trình' : 'Công trình mới'}
              </h3>
              <button onClick={() => setShowForm(false)} className="icon-btn" aria-label="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="p-name" className="block text-sm font-bold text-ink mb-1">
                  Tên công trình *
                </label>
                <input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nhà phố Vĩnh Hội"
                  className="field w-full px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="p-code" className="block text-sm font-bold text-ink mb-1">
                  Mã công trình
                </label>
                <input
                  id="p-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="VH"
                  maxLength={8}
                  className="field w-full px-3 py-2.5 text-sm font-mono uppercase"
                />
                <p className="text-xs text-ink-soft mt-1">
                  Số hiệu nhật ký đánh theo từng công trình: VH-001, VH-002...
                </p>
              </div>

              <div>
                <label htmlFor="p-addr" className="block text-sm font-bold text-ink mb-1">
                  Địa chỉ
                </label>
                <input
                  id="p-addr"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="field w-full px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="p-client" className="block text-sm font-bold text-ink mb-1">
                  Chủ đầu tư
                </label>
                <input
                  id="p-client"
                  value={form.client_name}
                  onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                  className="field w-full px-3 py-2.5 text-sm"
                />
              </div>

              <div className="space-y-2 p-3 rounded-card bg-card-alt border border-border">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">Toạ độ công trình</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={useCurrentLocation}
                    disabled={locating}
                    icon={locating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                  >
                    Vị trí hiện tại
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={form.latitude}
                    onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                    placeholder="Vĩ độ"
                    inputMode="decimal"
                    className="field w-full px-3 py-2.5 text-sm font-mono"
                  />
                  <input
                    value={form.longitude}
                    onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                    placeholder="Kinh độ"
                    inputMode="decimal"
                    className="field w-full px-3 py-2.5 text-sm font-mono"
                  />
                </div>

                <p className="text-xs text-ink-soft">
                  Dùng để tự động ghi thời tiết vào mỗi nhật ký — không ai phải gõ tay, nên nó luôn có mặt khi cần
                  chứng minh ngày mưa ngừng việc.
                </p>

                {weatherPreview && (
                  <p className="text-sm text-info flex items-center gap-1.5">
                    <CloudSun className="w-4 h-4 shrink-0" />
                    Hiện tại: {weatherPreview}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-border">
              <Button variant="secondary" size="lg" onClick={() => setShowForm(false)} className="flex-1">
                Hủy
              </Button>
              <button onClick={handleSave} disabled={saving} className="btn-block flex-1">
                {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                <span>{saving ? 'Đang lưu...' : 'Lưu'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
