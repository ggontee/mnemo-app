import { NextRequest, NextResponse } from "next/server";
import { getThemeById, getThemeCards } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: themeId } = await params;
    const theme = await getThemeById(themeId);

    if (!theme) {
      return NextResponse.json(
        { error: "Theme not found" },
        { status: 404 }
      );
    }

    const cards = await getThemeCards(themeId);

    return NextResponse.json({ theme, cards });
  } catch (error) {
    console.error("Failed to fetch theme:", error);
    return NextResponse.json(
      { error: "Failed to fetch theme" },
      { status: 500 }
    );
  }
}
