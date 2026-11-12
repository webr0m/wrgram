import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrandIcon } from './BrandIcon';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('WRGram', error, info.componentStack); }
  render() {
    if (this.state.failed) return (
      <main className="fatal-error">
        <div className="brand-mark wrgram-brand"><BrandIcon /></div>
        <h1>No pudimos abrir este espacio.</h1>
        <p>Recarga la página para volver a intentarlo. Tus notas locales no se borrarán.</p>
        <button className="primary-button" onClick={() => window.location.reload()}>Volver a cargar</button>
      </main>
    );
    return this.props.children;
  }
}
