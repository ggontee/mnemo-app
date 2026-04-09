import { NextRequest, NextResponse } from "next/server";
import { getAllTags, getCardsByTag } from "@/lib/db";

// GET /api/tags — 전체 태그 목록 (카운트 포함)
// GET /api/tags?tag=xxx — 특정 태그의 카드 목록
export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag");

  if (tag) {
    const cards = await getCardsByTag(tag);
    return NextResponse.json({ tag, cards, count: cards.length });
  }

  const tags = await getAllTags();
  return NextResponse.json(tags);
}
