import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  // Load Markdown and MDX files in the `src/content/posts/` directory.
  // AGENTS.md and CLAIMS-REVIEW.md files are maintainer notes, not posts.
  loader: glob({
    base: "./content/posts",
    pattern: ["**/*.{md,mdx}", "!**/AGENTS.md", "!**/CLAIMS-REVIEW.md"],
  }),
  // Type-check frontmatter using a schema
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      // Transform string to Date object
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image(),
    }),
});

export const collections = { posts };
