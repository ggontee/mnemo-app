import { NextRequest, NextResponse } from "next/server";
import { getAllOutputs, getOutputById, deleteOutput } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const output = await getOutputById(id);
      if (!output) {
        return NextResponse.json({ error: "Output not found" }, { status: 404 });
      }
      return NextResponse.json(output);
    }

    const outputs = await getAllOutputs();
    return NextResponse.json(outputs);
  } catch (error) {
    console.error("Failed to fetch outputs:", error);
    return NextResponse.json({ error: "Failed to fetch outputs" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await deleteOutput(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete output:", error);
    return NextResponse.json({ error: "Failed to delete output" }, { status: 500 });
  }
}
