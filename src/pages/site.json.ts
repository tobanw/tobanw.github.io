import { getVisiblePosts } from "@lib/content";

export async function GET() {
  const entries = await getVisiblePosts();
  return Response.json(
    entries.map((entry) => ({
      date: entry.date.toISOString(),
      title: entry.title,
      type: entry.badge ?? "writing",
      url: entry.url
    }))
  );
}
