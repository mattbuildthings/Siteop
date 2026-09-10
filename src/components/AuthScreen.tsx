import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, HardHat, User as UserIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../lib/i18n';

interface AuthScreenProps {
  onSuccess: () => void;
}

/**
 * Full-screen sign-in gate.
 *
 * This used to be a dismissible modal because the app worked signed out --
 * every table was readable and writable by the `anon` role. Now that RLS scopes
 * records by project membership and role, there is nothing to show a visitor,
 * and every entry needs an author to be worth anything as a record.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const { language, setLanguage, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setNoticeMsg(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() || email.split('@')[0] } }
        });
        if (error) throw error;

        // With email confirmation switched on there is no session yet.
        if (!data.session) {
          setNoticeMsg(t('auth.signupConfirmNotice'));
          setMode('login');
        } else {
          onSuccess();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || t('auth.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-paper">
      <div className="w-full max-w-sm card p-6 space-y-5">
        <div className="flex justify-end">
          <div className="inline-flex rounded-full border border-line overflow-hidden text-xs font-bold">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`px-3 py-1 transition cursor-pointer ${
                language === 'en' ? 'bg-accent text-accent-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('vi')}
              aria-pressed={language === 'vi'}
              className={`px-3 py-1 transition cursor-pointer ${
                language === 'vi' ? 'bg-accent text-accent-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              VI
            </button>
          </div>
        </div>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-[14px] bg-accent text-accent-ink flex items-center justify-center mx-auto">
            <HardHat className="w-7 h-7" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-ink flex items-center justify-center">
            <span>{t('auth.brandTagline')}</span>
            <span className="text-accent text-3xl leading-none">.</span>
          </div>
          <h1 className="text-base font-bold text-ink">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}
          </h1>
          <p className="text-sm text-ink-soft">{t('auth.loginSubtitle')}</p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-[12px] bg-danger/12 border border-danger/40 flex items-start gap-2.5 text-sm text-danger">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {noticeMsg && (
          <div className="p-3 rounded-[12px] bg-info/12 border border-info/40 flex items-start gap-2.5 text-sm text-info">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{noticeMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-sm font-bold text-ink mb-1">
                {t('auth.fullNameLabel')}
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
                <input
                  id="auth-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  className="field w-full pl-9 pr-3 py-2.5 text-sm"
                />
              </div>
              <p className="text-xs text-ink-soft mt-1">{t('auth.fullNameHint')}</p>
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-sm font-bold text-ink mb-1">
              {t('auth.emailLabel')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="field w-full pl-9 pr-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-bold text-ink mb-1">
              {t('auth.passwordLabel')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="auth-password"
                type="password"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field w-full pl-9 pr-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-block">
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : mode === 'login' ? (
              t('auth.submitLogin')
            ) : (
              t('auth.submitSignup')
            )}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setErrorMsg(null);
            }}
            className="text-sm font-bold text-ink-soft underline underline-offset-2 hover:text-accent transition cursor-pointer py-2 px-3"
          >
            {mode === 'login' ? t('auth.switchToSignup') : t('auth.switchToLogin')}
          </button>
        </div>
      </div>
    </div>
  );
};
