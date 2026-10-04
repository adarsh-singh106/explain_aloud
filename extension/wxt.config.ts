import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Explain Aloud',
    description: 'Local audio explanations for structured AI responses',
    host_permissions: [
      'http://127.0.0.1:11434/*',
      'http://localhost:11434/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
