// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import mermaid from 'astro-mermaid';
import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSlug from 'rehype-slug';
import remarkToc from 'remark-toc';

import expressiveCode from "astro-expressive-code";

// Wrap every markdown table in a horizontally scrollable container so wide
// tables stay readable on phones instead of being squeezed into the column.
function rehypeResponsiveTables() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        if (child.type === "element" && child.tagName === "table") {
          return {
            type: "element",
            tagName: "div",
            properties: { className: ["table-scroll"] },
            children: [child],
          };
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://amoshydra.github.io",
  base: "/blog",
  markdown: {
    remarkPlugins: [ [remarkToc, { heading: "contents"} ] ],
    rehypePlugins: [
      rehypeResponsiveTables,
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'prepend' }],
      // External links open in a new tab; footnotes keep their in-page back-refs.
      [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
    ],
  },
  integrations: [
    expressiveCode(),
    mdx(),
    sitemap(),
    mermaid({
      theme: 'forest',
      autoTheme: true,
      // Keep a fixed, readable text size and let the SVG keep its natural
      // width; wide diagrams scroll/pan instead of shrinking to fit.
      mermaidConfig: {
        flowchart: { useMaxWidth: false, htmlLabels: true },
        sequence: { useMaxWidth: false },
        // A gantt is laid out to a fixed width rather than the container, so
        // give it a generous one; the pan/zoom viewport scrolls the result.
        gantt: { useMaxWidth: false, useWidth: 1600 },
        themeVariables: { fontSize: '16px' },
      },
    })
  ],
});
