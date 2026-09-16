import React from 'react';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { UserProfile } from '../lib/types';
import { Button } from './ui/Button';

interface PendingApprovalScreenProps {
  profile: UserProfile | null;
  onSignOut: () => void;
}

/**
 * What an unapproved signup sees instead of the app.
 *
 * New accounts land as 'pending' (20260917 migration) and the database returns
 * them no projects, no logs and no to-dos. Without this screen the app would
 * still render its four tabs, all empty, and read as broken software rather
 * than a deliberate "not yet". Saying so plainly is also what stops the person
 * signing up three more times trying to make it work.
 *
 * Refresh re-reads the session rather than polling: approval happens on someone
 * else's schedule, and a background poll would just burn a phone's battery in a
 * site office with no signal.
 */
export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({ profile, onSignOut }) => {
  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center px-4">
      <div className="card p-6 w-full max-w-sm space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-card-alt border border-border flex items-center justify-center mx-auto">
          <Clock className="w-7 h-7 text-accent" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-ink tracking-tight">Tài khoản đang chờ duyệt</h1>
          <p className="text-sm text-ink-soft">
            {profile?.display_name ? `Chào ${profile.display_name}. ` : ''}
            Quản trị viên cần duyệt tài khoản này trước khi bạn ghi hoặc xem được nhật ký công trình.
          </p>
        </div>

        <p className="text-xs text-ink-soft">
          Liên hệ quản trị viên của công trình để được duyệt và phân công vào công trình bạn phụ trách.
        </p>

        <div className="space-y-2 pt-1">
          <Button onClick={() => window.location.reload()} className="w-full justify-center">
            <RefreshCw className="w-4 h-4" />
            Kiểm tra lại
          </Button>

          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-ink-soft hover:text-ink transition py-2"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
};
