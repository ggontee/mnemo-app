import { NextRequest, NextResponse } from "next/server";
import { getThemeMOC } from "@/lib/db";

// GET /api/themes/:id/moc — 테마의 Map of Content 자동 생성
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const moc = await getThemeMOC(id);

  return NextResponse.json({
    themeId: id,
    cards: moc.cards.map((c) => ({
      id: c.id,
      title: c.title,
      tags: c.tags,
      createdAt: c.createdAt,
      status: c.status,
    })),
    outputs: moc.outputs.map((o) => ({
      id: o.id,
      outputType: o.outputType,
      createdAt: o.createdAt,
      deepDiveCount: o.deepDives?.length || 0,
    })),
    relatedThemes: moc.relatedThemes,
    topTags: moc.topTags,
  });
}
