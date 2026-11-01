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

// Pull request previews are served from a pages.dev host at the domain root
// instead of from github.io/blog, so both values have to be overridable. Every
// internal link already goes through withBase(), which reads BASE_URL, so
// changing the base is enough to make the preview navigable. Production keeps
// the defaults because it sets neither variable.
const site = process.env.SITE_URL ?? "https://amoshydra.github.io";
const base = process.env.BASE_PATH ?? "/blog";

// Post content links to its own assets with the production base baked in
// ("/blog/posts/foo/bar.webp"), because that is the path authors see on the live
// site. A preview build is mounted at a different base, so rewrite those paths
// to whatever base this build actually uses. Absolute URLs are left alone: a
// link to the published site should keep pointing at the published site.
function rehypeRebaseContent() {
  const prefix = "/blog";
  const rebased = base.replace(/\/$/, "");
  // Production already uses the prefix; rewriting would be a no-op.
  if (rebased === prefix) return () => {};

  return (tree) => {
    const rebase = (value) =>
      typeof value === "string" &&
      (value === prefix || value.startsWith(prefix + "/"))
        ? rebased + value.slice(prefix.length)
        : value;

    const walk = (node) => {
      if (!node) return;

      // Standard hast elements, produced by markdown syntax (![](..), [](..)).
      if (node.properties) {
        for (const key of ["href", "src"]) {
          node.properties[key] = rebase(node.properties[key]);
        }
      }

      // Raw HTML inside MDX survives as JSX nodes, which keep their attributes
      // in an array instead of a properties object.
      if (Array.isArray(node.attributes)) {
        for (const attr of node.attributes) {
          if (attr.name === "href" || attr.name === "src") {
            attr.value = rebase(attr.value);
          }
        }
      }

      if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
  };
}

// https://astro.build/config
export default defineConfig({
  site,
  base,
  markdown: {
    remarkPlugins: [ [remarkToc, { heading: "contents"} ] ],
    rehypePlugins: [
      rehypeRebaseContent,
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
