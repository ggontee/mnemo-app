import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  getThemeById,
  getCardsByTheme,
  saveOutput,
  updateOutputStatus,
} from "@/lib/db";

const WIKI_BASE = path.resolve(process.cwd(), "data", "wiki");
const OUTPUTS_DIR = path.resolve(process.cwd(), "data", "wiki", "outputs");

async function readThemeWiki(themeId: string): Promise<string | null> {
  const wikiPath = path.join(WIKI_BASE, `${themeId}.md`);
  try {
    return await fs.readFile(wikiPath, "utf-8");
  } catch {
    return null;
  }
}

// --- 섹션 정의 ---

interface Section {
  id: string;
  title: string;
  instruction: string;
}

const RESEARCH_NOTE_SECTIONS: Section[] = [
  {
    id: "verdict",
    title: "핵심 판단",
    instruction: "이 테마의 현재 상태와 방향성을 판단하세요. 핵심 결론을 먼저 제시하고, 왜 그렇게 판단하는지 근거를 간략히 덧붙이세요.",
  },
  {
    id: "evidence",
    title: "근거 분석",
    instruction: "위 판단을 뒷받침하는 시그널들을 분석하세요. 각 시그널이 왜 중요한지, 어떤 맥락에서 의미가 있는지 설명하세요.",
  },
  {
    id: "counter",
    title: "반론 및 리스크",
    instruction: "위 판단에 반하는 시그널이나 리스크를 분석하세요. 어떤 조건에서 판단이 틀릴 수 있는지 구체적으로 서술하세요.",
  },
  {
    id: "connections",
    title: "연결 테마",
    instruction: "다른 테마와의 교차점과 시사점을 분석하세요. 이 테마의 변화가 다른 영역에 미치는 영향을 서술하세요.",
  },
  {
    id: "questions",
    title: "열린 질문",
    instruction: "아직 답이 없는 핵심 질문들을 도출하세요. 각 질문이 왜 중요하고, 어떤 시그널이 나오면 답할 수 있는지 서술하세요.",
  },
  {
    id: "conclusion",
    title: "결론 및 시사점",
    instruction: "전체 분석을 종합하여 결론과 실질적 시사점을 제시하세요. 향후 주목할 포인트를 포함하세요.",
  },
];

const DIGEST_SECTIONS: Section[] = [
  {
    id: "summary",
    title: "핵심 요약",
    instruction: "이번 기간의 핵심을 한두 문장으로 요약하세요.",
  },
  {
    id: "top-signals",
    title: "주요 시그널 TOP 3",
    instruction: "가장 중요한 시그널 3개를 선정하고, 각각 왜 중요한지 설명하세요. 날짜를 포함하세요.",
  },
  {
    id: "trends",
    title: "테마별 변화 추이",
    instruction: "시그널을 강화/약화/신규로 분류하고 트렌드를 분석하세요.",
  },
  {
    id: "crosslinks",
    title: "새로운 연결고리",
    instruction: "시그널 간 교차점과 새로운 패턴을 분석하세요.",
  },
  {
    id: "watchlist",
    title: "다음 주 주목할 사항",
    instruction: "앞으로 주시해야 할 포인트를 정리하세요.",
  },
];

function getSections(outputType: string): Section[] {
  return outputType === "digest" ? DIGEST_SECTIONS : RESEARCH_NOTE_SECTIONS;
}

function buildSectionPrompt(
  section: Section,
  wikiContext: string,
  cardSummaries: string,
  cardCount: number,
  prevSections: string,
): string {
  return `다음 테마에 대해 "${section.title}" 섹션을 작성하세요.

## 테마 정보
${wikiContext}

## 관련 신호들 (${cardCount}개)
${cardSummaries}
${prevSections ? `\n## 이전 섹션 (참고용 — 내용 반복 금지)\n${prevSections}` : ""}

## 지시사항
${section.instruction}

## 요구사항
- 한국어로 작성
- "## ${section.title}" 헤딩으로 시작
- 근거 기반의 분석 (주장에는 시그널 인용)
- 이전 섹션과 내용 중복 금지
- 깊이 있고 구조적인 서술`;
}

// --- 섹션별 Claude API 호출 (스트리밍) ---

async function generateSectionStreaming(
  prompt: string,
  apiKey: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(event.delta.text);
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  return fullText;
}

// --- 데이터 수집 헬퍼 ---

async function collectThemeData(themeIds: string[], dateRange?: { start: string; end: string }) {
  const wikiContents: string[] = [];
  const allCards: any[] = [];

  for (const themeId of themeIds) {
    const theme = await getThemeById(themeId);
    if (!theme) continue;

    const wikiContent = await readThemeWiki(themeId);
    if (wikiContent) wikiContents.push(wikiContent);

    const cards = await getCardsByTheme(themeId);
    allCards.push(...cards);
  }

  if (allCards.length === 0) {
    for (const themeId of themeIds) {
      const theme = await getThemeById(themeId);
      if (theme && theme.cardIds.length > 0) {
        const { getThemeCards } = await import("@/lib/db");
        const cards = await getThemeCards(themeId);
        allCards.push(...cards);
      }
    }
  }

  let filteredCards = allCards;
  if (dateRange && dateRange.start && dateRange.end) {
    const startDate = new Date(dateRange.start).getTime();
    const endDate = new Date(dateRange.end).getTime();
    filteredCards = allCards.filter((c) => {
      const cardDate = new Date(c.createdAt).getTime();
      return cardDate >= startDate && cardDate <= endDate;
    });
  }

  const wikiContext = wikiContents.length > 0
    ? wikiContents.join("\n\n---\n\n")
    : themeIds.map((id) => `테마 ID: ${id}`).join("\n");

  const cardSummaries = filteredCards
    .map((c) => `- ${c.title}: ${c.summary}`)
    .join("\n");

  return { wikiContext, cardSummaries, filteredCards };
}

// --- POST: 섹션별 순차 생성 + SSE 스트리밍 ---

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { themeIds, outputType, prompt: customPrompt, dateRange } = body;

  if (!themeIds || !Array.isArray(themeIds) || themeIds.length === 0) {
    return NextResponse.json({ error: "themeIds array is required" }, { status: 400 });
  }

  if (!["digest", "research-note"].includes(outputType)) {
    return NextResponse.json({ error: "Invalid outputType" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: 기존 방식 (비스트리밍)
    const { wikiContext, filteredCards } = await collectThemeData(themeIds, dateRange);
    const content = generateFallbackContent(outputType, wikiContext, filteredCards);
    const outputId = `output-${Date.now()}`;
    await saveOutput({ id: outputId, themeIds, outputType, content, createdAt: new Date().toISOString() });
    return NextResponse.json({ id: outputId, outputType, content });
  }

  // SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const outputId = `output-${Date.now()}`;

      try {
        const { wikiContext, cardSummaries, filteredCards } = await collectThemeData(themeIds, dateRange);
        const sections = getSections(outputType);
        let fullContent = "";
        let completedSections = "";

        // 문서 제목 생성
        const themeNames: string[] = [];
        for (const tid of themeIds) {
          const t = await getThemeById(tid);
          if (t) themeNames.push(t.name);
        }
        const docTitle = `# ${themeNames.join(" × ")} — ${outputType === "digest" ? "다이제스트" : "리서치 노트"}\n\n`;
        fullContent += docTitle;

        // DB에 "generating" 상태로 즉시 저장
        await saveOutput({
          id: outputId,
          themeIds,
          outputType: outputType as "digest" | "research-note",
          content: docTitle,
          createdAt: new Date().toISOString(),
          prompt: customPrompt,
          status: "generating",
        });

        send("chunk", { index: -1, text: docTitle });
        send("start", { totalSections: sections.length });

        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          send("section-start", { index: i, title: section.title });

          const prompt = customPrompt && i === 0
            ? customPrompt
            : buildSectionPrompt(section, wikiContext, cardSummaries, filteredCards.length, completedSections);

          const sectionText = await generateSectionStreaming(prompt, apiKey, (chunk) => {
            send("chunk", { index: i, text: chunk });
          });

          fullContent += (i > 0 ? "\n\n" : "") + sectionText;
          completedSections += `\n\n${sectionText}`;

          send("section-done", { index: i, title: section.title });
        }

        // 완료 — status를 complete로, 전체 content 업데이트
        await updateOutputStatus(outputId, "complete", fullContent);

        await fs.mkdir(OUTPUTS_DIR, { recursive: true });
        const outputPath = path.join(OUTPUTS_DIR, `${new Date().toISOString().split("T")[0]}-${outputType}.md`);
        await fs.writeFile(outputPath, fullContent, "utf-8");

        send("done", { id: outputId, content: fullContent });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Wiki generate streaming error:", error);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Fallback template (API 키 없을 때)
function generateFallbackContent(outputType: string, wikiContext: string, cards: any[]): string {
  const lines: string[] = [];
  lines.push(`# ${outputType.toUpperCase()} Report`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  if (outputType === "digest") {
    lines.push("## 주간 다이제스트", "", `### 이번 기간 시그널 (${cards.length}개)`, "");
    for (const card of cards.slice(0, 10)) {
      lines.push(`- [${card.createdAt.split("T")[0]}] **${card.title}**: ${card.summary}`);
    }
    lines.push("", "### 주목할 변화", "- (API 키 미설정으로 자동 분석 불가)");
  } else {
    lines.push("## 리서치 노트", "", "### 핵심 판단", `${cards.length}개 시그널 기반 분석 필요`, "");
    lines.push("### 관련 시그널");
    for (const card of cards.slice(0, 5)) {
      lines.push(`- **${card.title}**: ${card.summary}`);
    }
    lines.push("", "### 열린 질문", "- (API 키 미설정으로 자동 분석 불가)");
  }

  lines.push("", "> Generated with fallback template (API key not configured)");
  return lines.join("\n");
}
