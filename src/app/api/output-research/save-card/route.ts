import { NextRequest, NextResponse } from "next/server";
import { getOutputById, upsertCard } from "@/lib/db";
import { Article } from "@/lib/types";

// POST /api/output-research/save-card — 딥다이브 결과를 카드로 승격
// body: { outputId, deepDiveId }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { outputId, deepDiveId } = body;

  if (!outputId || !deepDiveId) {
    return NextResponse.json(
      { error: "outputId and deepDiveId are required" },
      { status: 400 }
    );
  }

  const output = await getOutputById(outputId);
  if (!output) {
    return NextResponse.json({ error: "Output not found" }, { status: 404 });
  }

  const deepDive = output.deepDives?.find((d) => d.id === deepDiveId);
  if (!deepDive) {
    return NextResponse.json({ error: "Deep dive not found" }, { status: 404 });
  }

  if (!deepDive.answer) {
    return NextResponse.json(
      { error: "Deep dive has no answer yet" },
      { status: 400 }
    );
  }

  // 딥다이브 결과를 카드로 변환
  const cardId = `dd_card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const card: Article = {
    id: cardId,
    title: deepDive.question,
    summary: extractSummary(deepDive.answer),
    implications: extractImplications(deepDive.answer),
    tags: ["deep-dive", `output:${output.outputType}`],
    sourceUrl: deepDive.sources?.[0] || "",
    sourceName: "Deep Dive",
    sourceType: "newsletter", // 기존 타입 호환
    createdAt: new Date().toISOString(),
    status: "kept",
    userComment: `[Deep Dive] ${output.outputType} 아웃풋에서 생성`,
    aiQuestions: [],
    themeIds: output.themeIds || [],
  };

  await upsertCard(card);

  return NextResponse.json({
    success: true,
    cardId,
    title: card.title,
  });
}

// 답변에서 첫 단락을 요약으로 추출
function extractSummary(answer: string): string {
  const lines = answer
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">"));
  const summary = lines.slice(0, 3).join(" ").replace(/\*\*/g, "");
  return summary.length > 300 ? summary.slice(0, 300) + "..." : summary;
}

// 답변에서 시사점 추출 (리스트 항목 또는 주요 문장)
function extractImplications(answer: string): string[] {
  const lines = answer.split("\n");
  const implications: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // 번호 매김 또는 불릿 리스트 항목 추출
    const match = trimmed.match(/^(?:\d+\.\s*|[-*]\s+)(.+)/);
    if (match && match[1].length > 10) {
      implications.push(match[1].replace(/\*\*/g, "").trim());
      if (implications.length >= 5) break;
    }
  }

  // 리스트가 부족하면 문장 단위로 보충
  if (implications.length < 2) {
    const sentences = answer
      .replace(/\n/g, " ")
      .split(/[.。]\s+/)
      .filter((s) => s.trim().length > 15)
      .slice(0, 3);
    return sentences.map((s) => s.replace(/\*\*/g, "").trim() + ".");
  }

  return implications;
}
