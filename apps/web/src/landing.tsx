import React from 'react';
import ReactDOM from 'react-dom/client';
import '@wrgram/design-tokens/tokens.css';
import './brand.css';
import './landing/landing.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './landing/LandingPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><LandingPage /></ErrorBoundary></React.StrictMode>,
);
