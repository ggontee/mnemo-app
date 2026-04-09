import { NextRequest, NextResponse } from "next/server";
import {
  getAllCards,
  getCardsByStatus,
  getCardById,
  upsertCard,
  updateCardStatus,
} from "@/lib/db";
import { Article } from "@/lib/types";

// GET /api/cards
// Query params: ?status=pending|kept|discarded|deferred&themeId=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const themeId = searchParams.get("themeId");

  try {
    let cards: Article[];

    if (status) {
      cards = await getCardsByStatus(status);
    } else {
      cards = await getAllCards();
    }

    if (themeId) {
      cards = cards.filter((c) => c.themeIds?.includes(themeId));
    }

    return NextResponse.json(cards);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch cards: ${message}` },
      { status: 500 }
    );
  }
}

// POST /api/cards — 사용자 직접 질문 추가
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardId, question } = body;

  if (
    !cardId ||
    !question ||
    typeof question !== "string" ||
    question.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "cardId and question are required" },
      { status: 400 }
    );
  }

  try {
    const card = await getCardById(cardId);

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (!card.aiQuestions) {
      card.aiQuestions = [];
    }

    const newQuestion = {
      id: `q-${Date.now()}-user`,
      question: question.trim(),
    };

    card.aiQuestions.push(newQuestion);
    await upsertCard(card);

    // Obsidian MD 동기화 (질문 추가도 반영)
    if (card.obsidianExported) {
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

    return NextResponse.json(card);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to add question: ${message}` },
      { status: 500 }
    );
  }
}

// PATCH /api/cards — 상태 업데이트 + 코멘트 저장
// Body: { id, status, userComment?, deferredUntil? }
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, status, userComment, deferredUntil } = body;

  if (
    !id ||
    !status ||
    !["pending", "kept", "discarded", "deferred"].includes(status)
  ) {
    return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
  }

  try {
    const card = await getCardById(id);

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    card.status = status as any;
    if (userComment !== undefined) {
      card.userComment = userComment;
    }

    if (status === "deferred" && deferredUntil) {
      card.deferredUntil = deferredUntil;
    }

    // kept 상태로 변경 시 빈 질문 배열 초기화 (사용자가 직접 질문 추가)
    if (status === "kept" && !card.aiQuestions) {
      card.aiQuestions = [];
    }

    await upsertCard(card);

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

      // 또한 wiki/compile 호출
      try {
        const baseUrl = request.nextUrl.origin;
        await fetch(`${baseUrl}/api/wiki/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: id }),
        });
      } catch (e) {
        console.error("Wiki compile failed (non-blocking):", e);
      }
    }

    return NextResponse.json(card);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update card: ${message}` },
      { status: 500 }
    );
  }
}
