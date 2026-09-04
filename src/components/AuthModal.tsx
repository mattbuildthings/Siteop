import React, { useState } from 'react';
import { X, Lock, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Xác thực thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0d12]/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'login' ? 'Đăng nhập Siteop' : 'Tạo tài khoản'}
    >
      <div className="w-full max-w-sm bg-[#181d24] border border-[#293039] rounded-[20px] p-6 relative shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute top-4 right-4 p-1.5 text-[#77818d] hover:text-[#f3f5f4] rounded-[0.6rem] hover:bg-[#1e242d] transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-[14px] bg-[#101319] border border-[#293039] flex items-center justify-center mx-auto mb-3 text-[#6af0b6]">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#f3f5f4]">
            {mode === 'login' ? 'Đăng nhập Siteop' : 'Tạo tài khoản'}
          </h2>
          <p className="text-xs text-[#77818d] mt-1">
            Đăng nhập để lưu nhật ký và đồng bộ Google Drive
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-[12px] bg-[#e16d7d]/15 border border-[#e16d7d]/30 flex items-start gap-2.5 text-xs text-[#e16d7d]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold text-[#f3f5f4] mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#77818d]" />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[#101319] border border-[#303842] rounded-[12px] pl-9 pr-3 py-2.5 text-sm text-[#f3f5f4] placeholder-[#48525e] focus:outline-none focus:border-[#6af0b6] transition"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-semibold text-[#f3f5f4] mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#77818d]" />
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#101319] border border-[#303842] rounded-[12px] pl-9 pr-3 py-2.5 text-sm text-[#f3f5f4] placeholder-[#48525e] focus:outline-none focus:border-[#6af0b6] transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-[12px] bg-[#6af0b6] hover:bg-[#5be0a5] text-[#101319] font-bold text-sm tracking-wide disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-[#101319] border-t-transparent rounded-full animate-spin"></span>
            ) : mode === 'login' ? (
              'Đăng nhập'
            ) : (
              'Đăng ký'
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-xs font-semibold text-[#77818d] underline underline-offset-2 hover:text-[#6af0b6] transition cursor-pointer"
          >
            {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  );
};
