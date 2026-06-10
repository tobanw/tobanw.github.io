import { feedResponse, generateRssFeed, getAllFeedEntries } from "@lib/feed";
import { SITE } from "@lib/site";

export async function GET() {
  const xml = await generateRssFeed({
    title: SITE.name,
    description: SITE.description,
    selfPath: "/rss.xml",
    sitePath: "/",
    entries: await getAllFeedEntries()
  });
  return feedResponse(xml, "rss");
}
