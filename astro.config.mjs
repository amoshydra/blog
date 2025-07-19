// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import mermaid from 'astro-mermaid';
import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkToc from 'remark-toc';

// https://astro.build/config
export default defineConfig({
  site: "https://amoshydra.github.io",
  base: "/blog",
  markdown: {
    remarkPlugins: [ [remarkToc, { heading: "contents"} ] ],
    rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'prepend' }]],
  },
  integrations: [
    mdx(),
    sitemap(),
    mermaid({
      theme: 'forest',
      autoTheme: true,
    })
  ],
});
