import { getVisiblePosts } from "@lib/content";
import { SITE } from "@lib/site";
import { escapeXml } from "@lib/xml";

export async function GET() {
  const entries = await getVisiblePosts();
  const updated = entries[0]?.date.toISOString() ?? new Date().toISOString();

  const items = entries
    .map((entry) => {
      const url = new URL(entry.url, SITE.url).toString();
      const summary = entry.description ?? "";
      return `<entry>
  <title>${escapeXml(entry.title)}</title>
  <link href="${escapeXml(url)}"/>
  <updated>${entry.date.toISOString()}</updated>
  <id>${escapeXml(url)}</id>
  <summary type="html">${escapeXml(summary)}</summary>
</entry>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(SITE.name)}</title>
  <link href="${SITE.url}/atom.xml" rel="self"/>
  <link href="${SITE.url}/"/>
  <updated>${updated}</updated>
  <id>${SITE.url}/</id>
  <author>
    <name>${escapeXml(SITE.name)}</name>
  </author>
${items}
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8"
    }
  });
}
