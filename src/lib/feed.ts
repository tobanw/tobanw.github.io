import mdxRenderer from "@astrojs/mdx/server.js";
import reactRenderer from "@astrojs/react/server.js";
import { render } from "astro:content";
import { experimental_AstroContainer } from "astro/container";
import {
  getBitUrl,
  getVisibleBits,
  getVisibleWriting,
  getWritingUrl,
  type BitEntry,
  type WritingEntry
} from "@lib/content";
import { SITE } from "@lib/site";
import { escapeXml } from "@lib/xml";

type SourceEntry = WritingEntry | BitEntry;

export interface FeedEntry {
  title: string;
  url: string;
  published: Date;
  updated: Date;
  summary: string;
  source: SourceEntry;
}

interface FeedOptions {
  title: string;
  description: string;
  selfPath: string;
  sitePath: string;
  entries: FeedEntry[];
}

export async function getAllFeedEntries() {
  const [writing, bits] = await Promise.all([getVisibleWriting(), getVisibleBits()]);
  return [
    ...writing.map(writingToFeedEntry),
    ...bits.map(bitToFeedEntry)
  ].sort((a, b) => b.published.valueOf() - a.published.valueOf());
}

export async function getWritingFeedEntries() {
  const writing = await getVisibleWriting();
  return writing.map(writingToFeedEntry);
}

export async function generateAtomFeed(options: FeedOptions) {
  const renderedEntries = await renderFeedEntries(options.entries);
  const updated = latestUpdated(renderedEntries);
  const selfUrl = absoluteUrl(options.selfPath);
  const siteUrl = absoluteUrl(options.sitePath);

  const items = renderedEntries
    .map((entry) => {
      const url = absoluteUrl(entry.url);
      return `<entry>
  <title>${escapeXml(entry.title)}</title>
  <link href="${escapeXml(url)}"/>
  <published>${entry.published.toISOString()}</published>
  <updated>${entry.updated.toISOString()}</updated>
  <id>${escapeXml(url)}</id>
  <summary type="html">${escapeXml(entry.summary)}</summary>
  <content type="html" xml:base="${escapeXml(url)}">${escapeXml(entry.content)}</content>
</entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(options.title)}</title>
  <subtitle>${escapeXml(options.description)}</subtitle>
  <link href="${escapeXml(selfUrl)}" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(siteUrl)}"/>
  <updated>${updated.toISOString()}</updated>
  <id>${escapeXml(siteUrl)}</id>
  <author>
    <name>${escapeXml(SITE.name)}</name>
  </author>
${items}
</feed>`;
}

export async function generateRssFeed(options: FeedOptions) {
  const renderedEntries = await renderFeedEntries(options.entries);
  const updated = latestUpdated(renderedEntries);
  const selfUrl = absoluteUrl(options.selfPath);
  const siteUrl = absoluteUrl(options.sitePath);

  const items = renderedEntries
    .map((entry) => {
      const url = absoluteUrl(entry.url);
      return `<item>
  <title>${escapeXml(entry.title)}</title>
  <link>${escapeXml(url)}</link>
  <guid isPermaLink="true">${escapeXml(url)}</guid>
  <pubDate>${entry.published.toUTCString()}</pubDate>
  <description>${escapeXml(entry.summary)}</description>
  <content:encoded>${cdata(entry.content)}</content:encoded>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(options.title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(options.description)}</description>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
    <language>en</language>
    <managingEditor>${escapeXml(SITE.email)} (${escapeXml(SITE.name)})</managingEditor>
${items}
  </channel>
</rss>`;
}

export function feedResponse(xml: string, contentType: "atom" | "rss") {
  return new Response(xml, {
    headers: {
      "Content-Type": `application/${contentType}+xml; charset=utf-8`
    }
  });
}

function writingToFeedEntry(entry: WritingEntry): FeedEntry {
  return {
    title: entry.data.title,
    url: getWritingUrl(entry),
    published: entry.data.date,
    updated: entry.data.updated ?? entry.data.date,
    summary: entry.data.description ?? "",
    source: entry
  };
}

function bitToFeedEntry(entry: BitEntry): FeedEntry {
  return {
    title: entry.data.title,
    url: getBitUrl(entry),
    published: entry.data.date,
    updated: entry.data.date,
    summary: entry.data.description ?? "",
    source: entry
  };
}

async function renderFeedEntries(entries: FeedEntry[]) {
  const container = await experimental_AstroContainer.create();
  container.addServerRenderer({ renderer: mdxRenderer });
  container.addServerRenderer({ renderer: reactRenderer });
  container.addClientRenderer({
    name: "@astrojs/react",
    entrypoint: "@astrojs/react/client.js"
  });

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      content: await renderEntryContent(entry.source, container)
    }))
  );
}

async function renderEntryContent(
  entry: SourceEntry,
  container: Awaited<ReturnType<typeof experimental_AstroContainer.create>>
) {
  const { Content } = await render(entry);
  const html = await container.renderToString(Content);
  return normalizeHtml(html);
}

function normalizeHtml(html: string) {
  return html
    .trim()
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style>astro-island,astro-slot,astro-static-slot\{display:contents\}<\/style>/g, "")
    .replace(/<astro-island\b[^>]*>/gi, "")
    .replace(/<\/astro-island>/gi, "")
    .replace(/<!--astro:end-->/gi, "")
    .replace(/<!--\s*-->/g, "")
    .replace(/\s(href|src)=["']\/(?!\/)([^"']*)["']/g, (_match, attr, path) => {
      return ` ${attr}="${SITE.url}/${path}"`;
    });
}

function latestUpdated(entries: Array<FeedEntry & { content: string }>) {
  const latest = entries.reduce(
    (timestamp, entry) => Math.max(timestamp, entry.updated.valueOf()),
    0
  );
  return latest === 0 ? new Date() : new Date(latest);
}

function absoluteUrl(path: string) {
  return new URL(path, SITE.url).toString();
}

function cdata(value: string) {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}
