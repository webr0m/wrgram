import React from 'react';
import ReactDOM from 'react-dom/client';
import '@wrgram/design-tokens/tokens.css';
import './styles.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './theme/ThemeProvider';
import './theme/themes.css';
import './features/telegram/live.css';
import './brand.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><ThemeProvider><App /></ThemeProvider></ErrorBoundary>
  </React.StrictMode>,
);
