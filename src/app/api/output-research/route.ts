import { NextRequest, NextResponse } from "next/server";
import { getOutputById, updateOutputDeepDives } from "@/lib/db";
import { DeepDiveEntry } from "@/lib/types";

// POST /api/output-research — 아웃풋 딥다이브 (웹 검색 + Opus 4.6)
// body: { outputId, question }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { outputId, question } = body;

  if (!outputId || !question) {
    return NextResponse.json(
      { error: "outputId and question are required" },
      { status: 400 }
    );
  }

  const output = await getOutputById(outputId);
  if (!output) {
    return NextResponse.json({ error: "Output not found" }, { status: 404 });
  }

  const deepDiveId = `dd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let answer: string;
  let sources: string[] = [];

  if (apiKey) {
    try {
      // Step 1: 웹 검색으로 관련 자료 수집
      const searchResults = await performWebSearch(apiKey, question, output.content);

      // Step 2: 검색 결과 + 아웃풋 컨텍스트로 Opus 4.6 딥다이브
      const result = await performDeepDive(
        apiKey,
        question,
        output.content,
        output.outputType,
        searchResults
      );
      answer = result.answer;
      sources = result.sources;
    } catch (err) {
      console.error("딥다이브 실패:", err);
      answer = generateFallbackAnswer(question, output.content);
    }
  } else {
    answer = generateFallbackAnswer(question, output.content);
  }

  // 딥다이브 결과를 DB에 저장
  const newEntry: DeepDiveEntry = {
    id: deepDiveId,
    question,
    answer,
    sources: sources.length > 0 ? sources : undefined,
    createdAt: new Date().toISOString(),
  };

  const existingDives = output.deepDives || [];
  const updatedDives = [...existingDives, newEntry];

  await updateOutputDeepDives(outputId, updatedDives);

  return NextResponse.json({
    deepDive: newEntry,
    totalDives: updatedDives.length,
  });
}

// 웹 검색 수행 (Anthropic API의 web_search tool 활용)
async function performWebSearch(
  apiKey: string,
  question: string,
  outputContent: string
): Promise<string> {
  try {
    // 컨텍스트에서 핵심 키워드 추출하여 검색 쿼리 구성
    const contentPreview = outputContent.slice(0, 500);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
          },
        ],
        messages: [
          {
            role: "user",
            content: `다음 질문에 답하기 위한 최신 정보를 웹에서 검색해주세요.

질문: ${question}

관련 컨텍스트:
${contentPreview}

검색 결과를 요약하고 출처 URL을 포함해주세요. 한국어로 답변하세요.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`웹 검색 API 오류: ${res.status}`);
      return "";
    }

    const data = await res.json();
    // 텍스트 블록들을 결합
    const textBlocks = data.content?.filter((b: any) => b.type === "text") || [];
    return textBlocks.map((b: any) => b.text).join("\n\n");
  } catch (err) {
    console.error("웹 검색 실패:", err);
    return "";
  }
}

// Opus 4.6으로 딥다이브 분석
async function performDeepDive(
  apiKey: string,
  question: string,
  outputContent: string,
  outputType: string,
  searchContext: string
): Promise<{ answer: string; sources: string[] }> {
  const prompt = buildDeepDivePrompt(question, outputContent, outputType, searchContext);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 5000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  const answer = data.content?.[0]?.text || "딥다이브 결과를 생성하지 못했습니다.";

  // 답변에서 URL 소스 추출
  const urlRegex = /https?:\/\/[^\s\)]+/g;
  const urls = answer.match(urlRegex) || [];
  const sources = [...new Set(urls)].slice(0, 5);

  return { answer, sources };
}

function buildDeepDivePrompt(
  question: string,
  outputContent: string,
  outputType: string,
  searchContext: string
): string {
  const typeLabel: Record<string, string> = {
    digest: "다이제스트",
    "research-note": "리서치 노트",
    // legacy
    brief: "브리핑",
    memo: "메모",
    analysis: "분석 리포트",
  };

  return `당신은 심층 리서치 전문가입니다. 사용자의 지식 관리 시스템에 저장된 ${typeLabel[outputType] || "문서"}를 기반으로 깊이 있는 분석을 제공합니다.

## 원본 문서 내용
${outputContent.slice(0, 4000)}

${searchContext ? `## 최신 웹 검색 결과\n${searchContext.slice(0, 3000)}` : ""}

## 사용자 질문
${question}

## 답변 규칙
- **한국어**로 답변
- 원본 문서 내용과 웹 검색 결과를 종합하여 분석
- 핵심 인사이트를 구조화하여 제시 (마크다운 형식)
- 구체적인 사례, 수치, 기술명 포함
- 실무에 바로 적용 가능한 인사이트 우선
- 상반된 시각이나 리스크가 있다면 함께 언급
- 참고 URL이 있다면 마크다운 링크로 포함
- 추가로 탐구할 만한 주제 2~3개를 마지막에 제안`;
}

function generateFallbackAnswer(question: string, content: string): string {
  const preview = content.slice(0, 500);
  return `## ${question}

원본 문서의 관련 내용을 요약합니다:

${preview}

> API 키가 설정되지 않아 기본 답변을 생성했습니다. ANTHROPIC_API_KEY 환경변수를 설정하면 웹 검색 + AI 기반 심층 분석이 가능합니다.`;
}
