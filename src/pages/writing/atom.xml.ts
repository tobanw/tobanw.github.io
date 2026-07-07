import { feedResponse, generateAtomFeed, getWritingFeedEntries } from "@lib/feed";
import { SITE } from "@lib/site";

const title = `${SITE.name} - Writing`;
const description = "Essays by Toban Wiebe on economics, math, programming, and tools.";

export async function GET() {
  const xml = await generateAtomFeed({
    title,
    description,
    selfPath: "/writing/atom.xml",
    sitePath: "/writing/",
    entries: await getWritingFeedEntries()
  });
  return feedResponse(xml, "atom");
}
