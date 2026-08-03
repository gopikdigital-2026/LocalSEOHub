import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from './lib/i18n';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, background: '#ffffff', minHeight: '100vh', color: '#0f172a', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 16 }}>Runtime Error</h2>
          <pre style={{ color: '#64748b', whiteSpace: 'pre-wrap', fontSize: 13 }}>
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
      <BrowserRouter>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
