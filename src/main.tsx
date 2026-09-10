import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './lib/i18n';
import './index.css';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error in Siteop PWA:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-paper text-ink flex items-center justify-center p-6 text-center">
          <div className="max-w-md card p-6 space-y-4">
            <h2 className="text-lg font-bold text-danger">Gặp Lỗi Khi Tải Ứng Dụng</h2>
            <p className="text-xs text-ink-soft">
              {this.state.error?.message || 'Có lỗi xảy ra trong quá trình khởi chạy giao diện.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary px-4 py-2 text-xs"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
