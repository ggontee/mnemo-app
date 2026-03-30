import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CARDS_PATH = path.resolve(process.cwd(), "data", "cards.json");

async function readCards() {
  try {
    const data = await fs.readFile(CARDS_PATH, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`[research] cards.json 읽기 실패 (경로: ${CARDS_PATH}):`, error);
    return [];
  }
}

async function writeCards(cards: unknown[]) {
  await fs.mkdir(path.dirname(CARDS_PATH), { recursive: true });
  await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2), "utf-8");
}

// POST /api/research — AI 리서치 실행
// body: { cardId, questionId }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardId, questionId } = body;

  if (!cardId || !questionId) {
    return NextResponse.json({ error: "cardId and questionId required" }, { status: 400 });
  }

  const cards = await readCards();
  const cardIdx = cards.findIndex((c: { id: string }) => c.id === cardId);
  if (cardIdx === -1) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const card = cards[cardIdx];
  const questionIdx = card.aiQuestions?.findIndex(
    (q: { id: string }) => q.id === questionId
  );

  if (questionIdx === undefined || questionIdx === -1) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const question = card.aiQuestions[questionIdx].question;

  // Anthropic API로 리서치 수행
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let answer: string;

  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: buildResearchPrompt(card, question),
            },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.status}`);
      }

      const data = await res.json();
      answer = data.content?.[0]?.text || "리서치 결과를 생성하지 못했습니다.";
    } catch (err) {
      console.error("AI 리서치 실패:", err);
      answer = generateFallbackAnswer(card, question);
    }
  } else {
    // API 키 없을 때 폴백 (로컬 테스트용)
    answer = generateFallbackAnswer(card, question);
  }

  // 결과 저장
  cards[cardIdx].aiQuestions[questionIdx].answer = answer;
  await writeCards(cards);

  // Obsidian MD 업데이트 (Q&A 내용 반영)
  if (cards[cardIdx].obsidianExported) {
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

  return NextResponse.json({
    questionId,
    answer,
  });
}

function buildResearchPrompt(
  card: { title: string; summary: string; implications: string[]; tags: string[]; userComment?: string },
  question: string
): string {
  return `당신은 기술 리서치 어시스턴트입니다.

다음 아티클에 대한 질문에 답변해주세요.

## 아티클 정보
- 제목: ${card.title}
- 요약: ${card.summary}
- 시사점: ${card.implications.join(", ")}
- 태그: ${card.tags.join(", ")}
${card.userComment ? `- 사용자 메모: ${card.userComment}` : ""}

## 질문
${question}

## 답변 규칙
- 한국어로 답변
- 핵심만 간결하게 (3~5 문단)
- 구체적인 사례나 기술명 포함
- 실무에 바로 적용 가능한 인사이트 우선
- 추가로 알아볼 만한 키워드 2~3개를 마지막에 제시`;
}

function generateFallbackAnswer(
  card: { title: string; summary: string; implications: string[]; tags: string[] },
  question: string
): string {
  return `## ${question}

**${card.title}** 관련 리서치 결과입니다.

${card.summary}

### 주요 시사점
${card.implications.map((imp, i) => `${i + 1}. ${imp}`).join("\n")}

### 관련 키워드
${card.tags.map((t) => `\`${t}\``).join(", ")}

> 이 답변은 API 키가 설정되지 않아 카드 데이터 기반으로 생성되었습니다. ANTHROPIC_API_KEY 환경변수를 설정하면 AI 기반 심층 리서치가 가능합니다.`;
}
