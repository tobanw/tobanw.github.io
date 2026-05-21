import { getCollection, type CollectionEntry } from "astro:content";

export type WritingEntry = CollectionEntry<"writing">;
export type BitEntry = CollectionEntry<"bits">;
export type ProjectEntry = CollectionEntry<"projects">;

export interface ListItem {
  title: string;
  date: Date;
  description?: string;
  url: string;
  badge?: string;
}

export async function getVisibleWriting() {
  const entries = await getCollection("writing", ({ data }) => !data.draft);
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getVisibleBits() {
  const entries = await getCollection("bits", ({ data }) => !data.draft);
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getVisiblePosts() {
  const [writing, bits] = await Promise.all([getVisibleWriting(), getVisibleBits()]);
  return [
    ...writing.map(writingToListItem),
    ...bits.map(bitToListItem)
  ].sort((a, b) => b.date.valueOf() - a.date.valueOf());
}

export async function getFeaturedProjects() {
  const projects = await getCollection("projects");
  return projects
    .filter((project) => project.data.featured)
    .sort(sortProjects);
}

export async function getAllProjects() {
  const projects = await getCollection("projects");
  return projects.sort(sortProjects);
}

export function getWritingUrl(entry: WritingEntry) {
  return `/writing/${slugFromId(entry.id)}/`;
}

export function getBitUrl(entry: BitEntry) {
  return entry.data.permalink;
}

export function writingToListItem(entry: WritingEntry): ListItem {
  return {
    title: entry.data.title,
    date: entry.data.date,
    description: entry.data.description,
    url: getWritingUrl(entry)
  };
}

export function bitToListItem(entry: BitEntry): ListItem {
  return {
    title: entry.data.title,
    date: entry.data.date,
    description: entry.data.description,
    url: getBitUrl(entry),
    badge: "bit"
  };
}

export function getProjectSlug(entry: ProjectEntry) {
  return slugFromId(entry.id);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function datetime(date: Date) {
  return date.toISOString();
}

function sortProjects(a: ProjectEntry, b: ProjectEntry) {
  const yearDiff = (b.data.year ?? 0) - (a.data.year ?? 0);
  if (yearDiff !== 0) return yearDiff;
  return a.data.title.localeCompare(b.data.title);
}

function slugFromId(id: string) {
  return id
    .replace(/\.(md|mdx)$/i, "")
    .split("/")
    .at(-1)!
    .replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

export function legacySlugFromPermalink(permalink: string) {
  return permalink.replace(/^\/blog\//, "").replace(/\/$/, "");
}
