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

// GFM emits <td> for the first cell of every body row, so screen readers in
// table mode announce each cell's column header but never its row label.
// Promote the first cell to <th scope="row">; the styling keeps it looking like
// the other body cells.
function rehypeTableRowHeaders() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      if (node.type === "element" && node.tagName === "table") {
        for (const section of node.children) {
          if (section.type !== "element" || section.tagName !== "tbody") continue;
          for (const row of section.children) {
            if (row.type !== "element" || row.tagName !== "tr") continue;
            const first = row.children.find((child) => child.type === "element");
            if (first?.tagName === "td") {
              first.tagName = "th";
              first.properties = { ...first.properties, scope: "row" };
            }
          }
        }
      }
      for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}

// Pull request previews are served from a pages.dev host at the domain root
// instead of from github.io/blog, so both values have to be overridable. Every
// internal link already goes through withBase(), which reads BASE_URL, so
// changing the base is enough to make the preview navigable. Production keeps
// the defaults because it sets neither variable.
const site = process.env.SITE_URL ?? "https://amoshydra.github.io";
const base = process.env.BASE_PATH ?? "/blog";

// https://astro.build/config
export default defineConfig({
  site,
  base,
  markdown: {
    remarkPlugins: [ [remarkToc, { heading: "contents"} ] ],
    rehypePlugins: [
      rehypeTableRowHeaders,
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
