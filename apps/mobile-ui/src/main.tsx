import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './audit-fixes.css';
import './visual-polish.css';
import './inbox.css';
import './chat-customization.css';
import { acceptState, installDesignTransport } from './bridge';
if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1') {
  const { fixture, designRequest } = await import('./preview'); acceptState(fixture); installDesignTransport(designRequest);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
