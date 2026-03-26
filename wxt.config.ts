import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  extensionApi: 'chrome',
  manifest: {
    name: 'rockitt',
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* https://api.elevenlabs.io https://*.workers.dev https://livekit.rtc.elevenlabs.io https://*.livekit.rtc.elevenlabs.io wss://api.elevenlabs.io wss://livekit.rtc.elevenlabs.io wss://*.livekit.rtc.elevenlabs.io;",
    },
    description: 'Voice-first web answers from a side panel.',
    permissions: ['sidePanel', 'storage', 'scripting', 'tabs'],
    host_permissions: [
      'http://*/*',
      'https://*/*',
      'https://api.elevenlabs.io/*',
      'https://*.workers.dev/*',
      'https://livekit.rtc.elevenlabs.io/*',
      'https://*.livekit.rtc.elevenlabs.io/*',
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
