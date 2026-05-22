import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const writing = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/writing" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    math: z.boolean().optional()
  })
});

const bits = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/bits" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    permalink: z.string(),
    latestVersion: z.string().optional(),
    math: z.boolean().optional()
  })
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    url: z.union([z.url(), z.string().regex(/^\/\S*$/)]).optional(),
    repo: z.url().optional(),
    year: z.number().optional(),
    tags: z.array(z.string()).optional(),
    featured: z.boolean().default(false)
  })
});

export const collections = { writing, bits, projects };
