import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { I18nProvider } from './lib/i18n';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#f87171', marginBottom: 16 }}>Runtime Error</h2>
          <pre style={{ color: '#fca5a5', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {(this.state.error as Error).message}
            {'\n\n'}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>
);
