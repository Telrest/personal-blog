import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { parseBackendConfig } from './src/lib/backend-config.ts';

const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'PUBLIC_');
parseBackendConfig(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export default defineConfig({
  site: 'https://telrest.github.io',
  base: '/personal-blog',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
