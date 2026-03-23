// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://mcz.pages.dev',
  base: '/',
  integrations: [svelte(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});