// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import mermaid from 'astro-mermaid';
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://amoshydra.github.io",
  base: "/blog",
  integrations: [mdx(), sitemap(), mermaid({
    theme: 'forest',
    autoTheme: true
  })],
});
