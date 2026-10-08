import { getOfficialLotteryFeed } from "@/lib/loteria-correntina";

export const revalidate = 300;

export async function GET() {
  const feed = await getOfficialLotteryFeed();
  return Response.json(feed, {
    status: feed.ok ? 200 : 503,
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
  });
}
