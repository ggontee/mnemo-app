import { NextResponse } from "next/server";
import { getThemeIdsWithOutputs } from "@/lib/db";

// GET /api/wiki/theme-outputs
// Returns: string[] — themeIds that already have wiki outputs
export async function GET() {
  try {
    const themeIds = await getThemeIdsWithOutputs();
    return NextResponse.json(themeIds);
  } catch (error) {
    console.error("Failed to get theme output status:", error);
    return NextResponse.json([], { status: 500 });
  }
}
