import React from 'react';
import {
  Mic,
  BookOpen,
  Sparkles,
  Building2,
  Wifi,
  WifiOff,
  LogOut,
  Sun,
  Moon,
  ChevronDown,
  MapPin
} from 'lucide-react';
import { Project, ROLE_LABELS, UserProfile } from '../lib/types';
import { initials } from '../lib/session';

export type RouteId = 'capture' | 'diary' | 'digest' | 'projects' | 'sync';

interface NavbarProps {
  currentRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  isOnline: boolean;
  offlineCount: number;
  profile: UserProfile | null;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (projectId: string | null) => void;
}

// Sync is an admin action people touch once a week -- it does not deserve a
// quarter of the primary navigation. It now lives inside Công Trình instead.
const TABS: Array<{ id: RouteId; label: string; icon: React.ElementType }> = [
  { id: 'capture', label: 'Ghi Nhận', icon: Mic },
  { id: 'diary', label: 'Nhật Ký', icon: BookOpen },
  { id: 'digest', label: 'Tổng Hợp', icon: Sparkles },
  { id: 'projects', label: 'Công Trình', icon: Building2 }
];

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  isOnline,
  offlineCount,
  profile,
  onSignOut,
  theme,
  onToggleTheme,
  projects,
  activeProject,
  onSelectProject
}) => {
  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full bg-paper/95 backdrop-blur-md border-b border-border">
        <div className="px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-lg font-bold tracking-tight text-ink flex items-center shrink-0">
              <span>siteop</span>
              <span className="text-accent text-2xl leading-none">.</span>
            </div>

            {profile && (
              <span
                className="pill px-2 py-0.5 bg-card-alt text-ink-soft border border-border uppercase text-xs"
                title={`Vai trò: ${ROLE_LABELS[profile.role]}`}
              >
                {ROLE_LABELS[profile.role]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className={`pill px-2.5 py-1 font-semibold border ${
                isOnline
                  ? 'bg-accent/12 text-accent border-accent/40'
                  : 'bg-warning/12 text-warning border-warning/40'
              }`}
              title={isOnline ? 'Đã kết nối' : 'Mất kết nối — nhật ký lưu trên máy'}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span className="hidden xs:inline">{isOnline ? 'Online' : 'Offline'}</span>
              {offlineCount > 0 && (
                <span className="bg-warning text-paper font-bold px-1.5 rounded-full text-xs leading-5">
                  {offlineCount}
                </span>
              )}
            </div>

            <button
              onClick={onToggleTheme}
              className="icon-btn icon-btn-sm border border-border"
              title={theme === 'dark' ? 'Chuyển sang nền sáng (dùng ngoài trời)' : 'Chuyển sang nền tối'}
              aria-label="Đổi giao diện sáng/tối"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {profile && (
              <button
                onClick={onSignOut}
                className="icon-btn icon-btn-sm border border-border gap-1.5 px-2"
                title={`${profile.display_name || ''} — Đăng xuất`}
                aria-label="Đăng xuất"
              >
                <span className="w-6 h-6 rounded-full bg-accent text-accent-ink text-xs font-bold flex items-center justify-center shrink-0">
                  {initials(profile)}
                </span>
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Active site. Every log belongs to a site, so the choice is always on
            screen rather than buried in the capture form. */}
        <div className="px-4 pb-2.5">
          <div className="relative">
            <MapPin
              className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                activeProject ? 'text-accent' : 'text-warning'
              }`}
            />
            <select
              value={activeProject?.id || ''}
              onChange={(e) => onSelectProject(e.target.value || null)}
              aria-label="Chọn công trình"
              className="field w-full appearance-none pl-9 pr-9 py-2 text-sm font-bold cursor-pointer"
            >
              <option value="">
                {projects.length === 0 ? '— Chưa có công trình nào —' : '— Chọn công trình —'}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ` : ''}
                  {p.name}
                  {p.is_active ? '' : ' (đã đóng)'}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
          </div>
        </div>
      </header>

      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md bg-card border border-border rounded-[20px] p-1.5 shadow-lg"
        aria-label="Điều hướng chính"
      >
        <div className="grid grid-cols-4 gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = currentRoute === id || (id === 'projects' && currentRoute === 'sync');
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] rounded-[14px] transition-all cursor-pointer ${
                  isActive
                    ? 'text-accent-ink font-bold bg-accent'
                    : 'text-ink-soft hover:text-ink hover:bg-card-alt'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs tracking-tight font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
