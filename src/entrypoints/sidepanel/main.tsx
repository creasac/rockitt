import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './style.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Unable to find the side panel root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
