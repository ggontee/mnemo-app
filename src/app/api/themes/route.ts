import { NextResponse } from "next/server";
import { getAllThemes } from "@/lib/db";

export async function GET() {
  try {
    const themes = await getAllThemes();
    return NextResponse.json(themes);
  } catch (error) {
    console.error("Failed to fetch themes:", error);
    return NextResponse.json(
      { error: "Failed to fetch themes" },
      { status: 500 }
    );
  }
}
