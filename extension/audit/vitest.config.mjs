import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('../', import.meta.url)),
  test: { environment: 'happy-dom', include: ['audit/*.audit.{js,jsx}'] },
  resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } },
};
