import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  extensionApi: 'chrome',
  manifest: {
    name: 'rockitt',
    description: 'Voice-first web answers from a side panel.',
    permissions: ['sidePanel', 'storage'],
    host_permissions: [
      'https://api.elevenlabs.io/*',
      'https://api.firecrawl.dev/*',
    ],
    icons: {
      16: 'rockitt.png',
      32: 'rockitt.png',
      48: 'rockitt.png',
      128: 'rockitt.png',
    },
    action: {
      default_title: 'Open rockitt',
      default_icon: {
        16: 'rockitt.png',
        32: 'rockitt.png',
        48: 'rockitt.png',
      },
    },
  },
  vite: () => ({
    plugins: [react()],
  }),
});
