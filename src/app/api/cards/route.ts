import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// process.cwd()는 Next.js에서 프로젝트 루트를 가리킴 (mnemo-app/)
const CARDS_PATH = path.resolve(process.cwd(), "data", "cards.json");

async function readCards() {
  try {
    const data = await fs.readFile(CARDS_PATH, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // 파일이 없으면 빈 배열로 새로 생성 (더미 데이터로 덮어쓰지 않음!)
    console.error(`[cards] cards.json 읽기 실패 (경로: ${CARDS_PATH}):`, error);
    try {
      await fs.mkdir(path.dirname(CARDS_PATH), { recursive: true });
      await fs.writeFile(CARDS_PATH, "[]", "utf-8");
      console.warn("[cards] 빈 cards.json을 새로 생성했습니다.");
    } catch (writeError) {
      console.error("[cards] cards.json 생성도 실패:", writeError);
    }
    return [];
  }
}

async function writeCards(cards: unknown[]) {
  // 쓰기 전 디렉토리 존재 확인
  await fs.mkdir(path.dirname(CARDS_PATH), { recursive: true });
  await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2), "utf-8");
}

// GET /api/cards
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let cards = await readCards();

  if (status) {
    cards = cards.filter((c: { status: string }) => c.status === status);
  }

  return NextResponse.json(cards);
}

// POST /api/cards — 사용자 직접 질문 추가
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardId, question } = body;

  if (!cardId || !question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "cardId and question are required" }, { status: 400 });
  }

  const cards = await readCards();
  const idx = cards.findIndex((c: { id: string }) => c.id === cardId);

  if (idx === -1) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  if (!cards[idx].aiQuestions) {
    cards[idx].aiQuestions = [];
  }

  const newQuestion = {
    id: `q-${Date.now()}-user`,
    question: question.trim(),
  };

  cards[idx].aiQuestions.push(newQuestion);
  await writeCards(cards);

  // Obsidian MD 동기화 (질문 추가도 반영)
  if (cards[idx].obsidianExported) {
    try {
      const baseUrl = request.nextUrl.origin;
      await fetch(`${baseUrl}/api/obsidian`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
    } catch (e) {
      console.error("Obsidian update failed (non-blocking):", e);
    }
  }

  return NextResponse.json(cards[idx]);
}

// PATCH /api/cards — 상태 업데이트 + 코멘트 저장
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, status, userComment } = body;

  if (!id || !status || !["pending", "kept", "discarded"].includes(status)) {
    return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
  }

  const cards = await readCards();
  const idx = cards.findIndex((c: { id: string }) => c.id === id);

  if (idx === -1) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  cards[idx].status = status;
  if (userComment !== undefined) {
    cards[idx].userComment = userComment;
  }

  // kept 상태로 변경 시 빈 질문 배열 초기화 (사용자가 직접 질문 추가)
  if (status === "kept" && !cards[idx].aiQuestions) {
    cards[idx].aiQuestions = [];
  }

  await writeCards(cards);

  // kept 상태로 변경 시 Obsidian MD 자동 내보내기
  if (status === "kept") {
    try {
      const baseUrl = request.nextUrl.origin;
      await fetch(`${baseUrl}/api/obsidian`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id }),
      });
    } catch (e) {
      console.error("Obsidian export failed (non-blocking):", e);
    }
  }

  return NextResponse.json(cards[idx]);
}

// 아티클 내용 기반 AI 예상 질문 생성 (로컬 로직, API 키 불필요)
function generateQuestions(card: {
  title: string;
  summary: string;
  implications: string[];
  tags: string[];
  sourceType?: string;
  userComment?: string;
}): { id: string; question: string }[] {
  const questions: { id: string; question: string }[] = [];

  // 핵심 주제 기반 질문
  questions.push({
    id: `q-${Date.now()}-1`,
    question: `"${card.title}"의 핵심 기술/개념을 더 깊이 이해하려면 무엇을 알아야 할까?`,
  });

  // implications 기반 질문
  if (card.implications.length > 0) {
    questions.push({
      id: `q-${Date.now()}-2`,
      question: `${card.implications[0]} — 이것이 실제로 어떤 변화를 가져올 수 있을까?`,
    });
  }

  // 실무 적용 질문
  questions.push({
    id: `q-${Date.now()}-3`,
    question: `이 내용을 현재 프로젝트나 업무에 어떻게 적용할 수 있을까?`,
  });

  // 사용자 코멘트 기반 질문
  if (card.userComment) {
    questions.push({
      id: `q-${Date.now()}-4`,
      question: `내 메모 "${card.userComment.slice(0, 40)}..." 와 관련해서 더 알아볼 것은?`,
    });
  }

  // 비교/대안 질문
  if (card.tags.length > 0) {
    questions.push({
      id: `q-${Date.now()}-5`,
      question: `${card.tags[0]} 분야에서 이와 비교할 만한 대안이나 경쟁 기술은?`,
    });
  }

  return questions;
}
