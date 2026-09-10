import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * App-wide language switching.
 *
 * The app shipped Vietnamese-only. This introduces the toggle and default
 * (English) starting from the login/sign-up screen; other screens still read
 * their strings directly and get folded into `translations` in later passes.
 * Add a new key here, then read it anywhere via `useLanguage().t('key')`.
 */

export type Language = 'en' | 'vi';

const LANGUAGE_KEY = 'siteop_lang_v1';
const DEFAULT_LANGUAGE: Language = 'en';

type TranslationKey =
  | 'auth.brandTagline'
  | 'auth.loginTitle'
  | 'auth.signupTitle'
  | 'auth.loginSubtitle'
  | 'auth.signupConfirmNotice'
  | 'auth.genericError'
  | 'auth.fullNameLabel'
  | 'auth.fullNameHint'
  | 'auth.fullNamePlaceholder'
  | 'auth.emailLabel'
  | 'auth.passwordLabel'
  | 'auth.submitLogin'
  | 'auth.submitSignup'
  | 'auth.switchToSignup'
  | 'auth.switchToLogin';

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    'auth.brandTagline': 'siteop',
    'auth.loginTitle': 'Sign in to the site diary',
    'auth.signupTitle': 'Create an account',
    'auth.loginSubtitle': 'Every log needs an author. Sign in to write and view logs for the project you cover.',
    'auth.signupConfirmNotice': 'Account created. Please check your email to confirm, then sign in.',
    'auth.genericError': 'Authentication failed',
    'auth.fullNameLabel': 'Full name',
    'auth.fullNameHint': 'This name shows on every log you write.',
    'auth.fullNamePlaceholder': 'Jane Doe',
    'auth.emailLabel': 'Email',
    'auth.passwordLabel': 'Password',
    'auth.submitLogin': 'Sign in',
    'auth.submitSignup': 'Sign up',
    'auth.switchToSignup': "Don't have an account? Sign up",
    'auth.switchToLogin': 'Already have an account? Sign in'
  },
  vi: {
    'auth.brandTagline': 'siteop',
    'auth.loginTitle': 'Đăng nhập nhật ký công trình',
    'auth.signupTitle': 'Tạo tài khoản',
    'auth.loginSubtitle': 'Mỗi nhật ký cần có người ghi nhận. Đăng nhập để ghi và xem nhật ký của công trình bạn phụ trách.',
    'auth.signupConfirmNotice': 'Đã tạo tài khoản. Vui lòng kiểm tra email để xác nhận, sau đó đăng nhập.',
    'auth.genericError': 'Xác thực thất bại',
    'auth.fullNameLabel': 'Họ tên',
    'auth.fullNameHint': 'Tên này hiển thị trên mọi nhật ký bạn ghi.',
    'auth.fullNamePlaceholder': 'Nguyễn Văn A',
    'auth.emailLabel': 'Email',
    'auth.passwordLabel': 'Mật khẩu',
    'auth.submitLogin': 'Đăng nhập',
    'auth.submitSignup': 'Đăng ký',
    'auth.switchToSignup': 'Chưa có tài khoản? Đăng ký',
    'auth.switchToLogin': 'Đã có tài khoản? Đăng nhập'
  }
};

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === 'en' || stored === 'vi') return stored;
  } catch {
    /* blocked storage — fall through to the default */
  }
  return DEFAULT_LANGUAGE;
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      /* blocked storage — the choice just won't persist across reloads */
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);
  const t = useCallback((key: TranslationKey) => translations[language][key] ?? key, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
