import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Obsidian vault 경로
const VAULT_BASE = path.join(
  os.homedir(),
  "Library",
  "Mobile Documents",
  "iCloud~md~obsidian",
  "Documents",
  "Henry",
  "Henry",
  "10. 리서치 관련 문서"
);

const CARDS_PATH = path.resolve(process.cwd(), "data", "cards.json");

interface AiQuestion {
  id: string;
  question: string;
  answer?: string;
}

interface Card {
  id: string;
  title: string;
  summary: string;
  soWhat?: string;
  keyPoints?: string[];
  implications: string[];
  tags: string[];
  sourceUrl: string;
  sourceName: string;
  sourceType?: "newsletter" | "video";
  createdAt: string;
  status: string;
  userComment?: string;
  aiQuestions?: AiQuestion[];
  obsidianExported?: boolean;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function cardToMarkdown(card: Card): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`title: "${card.title.replace(/"/g, '\\"')}"`);
  lines.push(`source: ${card.sourceName}`);
  lines.push(`sourceType: ${card.sourceType || "unknown"}`);
  if (card.sourceUrl) {
    lines.push(`sourceUrl: ${card.sourceUrl}`);
  }
  lines.push(`date: ${card.createdAt.split("T")[0]}`);
  lines.push(`tags: [${card.tags.map((t) => `"${t}"`).join(", ")}]`);
  lines.push(`mnemoId: ${card.id}`);
  lines.push("---");
  lines.push("");

  // 요약
  lines.push(`# ${card.title}`);
  lines.push("");
  lines.push(card.summary);
  lines.push("");

  // So What
  if (card.soWhat) {
    lines.push(`> **So What?** ${card.soWhat}`);
    lines.push("");
  }

  // Key Points / 시사점
  const points = card.keyPoints || card.implications;
  if (points && points.length > 0) {
    lines.push(card.keyPoints ? "## Key Points" : "## 시사점");
    lines.push("");
    for (const point of points) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  // 사용자 메모
  if (card.userComment) {
    lines.push("## 내 메모");
    lines.push("");
    lines.push(card.userComment);
    lines.push("");
  }

  // AI Q&A (답변 완료된 것만 포함)
  if (card.aiQuestions && card.aiQuestions.length > 0) {
    const answered = card.aiQuestions.filter((q) => q.answer);
    if (answered.length > 0) {
      lines.push("## AI 리서치");
      lines.push("");
      for (const q of answered) {
        lines.push(`### Q: ${q.question}`);
        lines.push("");
        lines.push(q.answer!);
        lines.push("");
      }
    }
  }

  // 출처 링크
  if (card.sourceUrl) {
    lines.push("---");
    lines.push(`> 원문: [${card.sourceName}](${card.sourceUrl})`);
    lines.push("");
  }

  return lines.join("\n");
}

// POST /api/obsidian — 특정 카드를 Obsidian으로 내보내기
export async function POST(request: NextRequest) {
  try {
    const { cardId } = await request.json();

    const data = await fs.readFile(CARDS_PATH, "utf-8");
    const cards: Card[] = JSON.parse(data);
    const card = cards.find((c) => c.id === cardId);

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // 타겟 폴더에 직접 저장
    await fs.mkdir(VAULT_BASE, { recursive: true });

    // 파일명: 날짜-제목.md
    const dateStr = card.createdAt.split("T")[0];
    const filename = `${dateStr} ${sanitizeFilename(card.title)}.md`;
    const filePath = path.join(VAULT_BASE, filename);

    // MD 생성
    const markdown = cardToMarkdown(card);
    await fs.writeFile(filePath, markdown, "utf-8");

    // 내보내기 상태 기록
    const idx = cards.findIndex((c) => c.id === cardId);
    cards[idx].obsidianExported = true;
    await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      path: filePath,
      filename,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Obsidian export failed: ${message}` },
      { status: 500 }
    );
  }
}

// PUT /api/obsidian — 기존 MD 파일 업데이트 (Q&A 추가 등)
export async function PUT(request: NextRequest) {
  try {
    const { cardId } = await request.json();

    const data = await fs.readFile(CARDS_PATH, "utf-8");
    const cards: Card[] = JSON.parse(data);
    const card = cards.find((c) => c.id === cardId);

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const dateStr = card.createdAt.split("T")[0];
    const filename = `${dateStr} ${sanitizeFilename(card.title)}.md`;
    const filePath = path.join(VAULT_BASE, filename);

    // MD 재생성 (최신 Q&A 포함)
    const markdown = cardToMarkdown(card);
    await fs.writeFile(filePath, markdown, "utf-8");

    return NextResponse.json({ success: true, path: filePath, filename });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Obsidian update failed: ${message}` },
      { status: 500 }
    );
  }
}

// GET /api/obsidian — 내보내기 상태 확인
export async function GET() {
  try {
    const data = await fs.readFile(CARDS_PATH, "utf-8");
    const cards: Card[] = JSON.parse(data);
    const kept = cards.filter((c) => c.status === "kept");
    const exported = kept.filter((c) => c.obsidianExported);

    return NextResponse.json({
      total: kept.length,
      exported: exported.length,
      pending: kept.length - exported.length,
    });
  } catch {
    return NextResponse.json({ total: 0, exported: 0, pending: 0 });
  }
}
