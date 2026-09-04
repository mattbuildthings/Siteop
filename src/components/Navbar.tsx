import React from 'react';
import { Mic, BookOpen, Sparkles, RefreshCw, Wifi, WifiOff, LogIn, LogOut, User } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface NavbarProps {
  currentRoute: 'capture' | 'diary' | 'digest' | 'sync';
  onNavigate: (route: 'capture' | 'diary' | 'digest' | 'sync') => void;
  isOnline: boolean;
  offlineCount: number;
  user: SupabaseUser | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

const TABS: Array<{ id: 'capture' | 'diary' | 'digest' | 'sync'; label: string; icon: React.ElementType }> = [
  { id: 'capture', label: 'Ghi Nhận', icon: Mic },
  { id: 'diary', label: 'Nhật Ký', icon: BookOpen },
  { id: 'digest', label: 'Tổng Hợp', icon: Sparkles },
  { id: 'sync', label: 'Đồng Bộ', icon: RefreshCw }
];

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  isOnline,
  offlineCount,
  user,
  onOpenAuth,
  onSignOut
}) => {
  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full bg-[#101319]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-[#293039]">
        <div className="flex items-center gap-2">
          <div className="text-xl font-bold tracking-tight text-[#f3f5f4] flex items-center">
            <span>siteop</span>
            <span className="text-[#6af0b6] text-2xl leading-none">.</span>
          </div>
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#181d24] text-[#77818d] border border-[#303842] uppercase">
            FIELD OS
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Online/Offline Status Indicator */}
          <div
            className={`pill px-2.5 py-1 text-xs font-semibold border ${
              isOnline
                ? 'bg-[#6af0b6]/15 text-[#6af0b6] border-[#6af0b6]/30'
                : 'bg-[#d4bd65]/15 text-[#d4bd65] border-[#d4bd65]/30'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
            {offlineCount > 0 && (
              <span className="bg-[#6af0b6] text-[#101319] font-bold px-1.5 rounded-full text-[10px] leading-4">
                {offlineCount}
              </span>
            )}
          </div>

          {/* Auth Button */}
          {user ? (
            <button
              onClick={onSignOut}
              className="pill px-2.5 py-1.5 text-xs bg-[#181d24] text-[#f3f5f4] border border-[#303842] hover:border-[#6af0b6]/40 transition"
              title={`Logged in as ${user.email}`}
            >
              <User className="w-3.5 h-3.5" />
              <span className="max-w-[70px] truncate hidden sm:inline font-semibold">{user.email}</span>
              <LogOut className="w-3.5 h-3.5 opacity-70" />
            </button>
          ) : (
            <button onClick={onOpenAuth} className="pill btn-primary px-3 py-1.5 text-xs">
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </header>

      {/* Bottom Floating Navigation (4 Tabs: Ghi Nhận / Nhật Ký / Tổng Hợp / Đồng Bộ) */}
      <nav
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md bg-[#0b0d12]/95 backdrop-blur-xl border border-[#293039] rounded-[20px] p-1.5 shadow-2xl"
        aria-label="Điều hướng chính"
      >
        <div className="grid grid-cols-4 gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = currentRoute === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-[14px] transition-all cursor-pointer ${
                  isActive
                    ? 'text-[#6af0b6] font-bold bg-[#6af0b6]/10'
                    : 'text-[#77818d] hover:text-[#f3f5f4] hover:bg-[#181d24]'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                  {isActive && (
                    <span className="absolute -top-1 -right-1.5 w-1.5 h-1.5 rounded-full bg-[#6af0b6] shadow-[0_0_8px_#6af0b6]" />
                  )}
                </div>
                <span className="text-[10px] tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
