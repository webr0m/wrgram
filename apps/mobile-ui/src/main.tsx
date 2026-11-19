import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './audit-fixes.css';
import './visual-polish.css';
import './inbox.css';
import './chat-customization.css';
import './mobile-navigation.css';
import './chat-options.css';
import './message-quotes.css';
import { acceptState, installDesignTransport } from './bridge';
if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1') {
  const { fixture, designRequest } = await import('./preview');
  // `?preview=1&platform=desktop` pinta la rama de Windows: sin esto, el ratón del diseño solo veía la de Android.
  const shell = new URLSearchParams(location.search).get('platform');
  const platform = shell === 'desktop' || shell === 'android' || shell === 'web' ? shell : fixture.platform;
  acceptState({ ...fixture, platform }); installDesignTransport(designRequest);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
