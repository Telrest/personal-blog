import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://telrest.github.io',
  base: '/personal-blog',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
