import { NextRequest, NextResponse } from "next/server";
import {
  getAllThemes,
  getCardsByTheme,
} from "@/lib/db";

// Helper: Calculate date range based on period
function getDateRange(period: "weekly" | "monthly"): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  if (period === "weekly") {
    start.setDate(end.getDate() - 7);
  } else {
    start.setDate(end.getDate() - 30);
  }

  return { start, end };
}

// Helper: Summarize signal changes for a theme
function summarizeSignalChanges(
  theme: any,
  cardsInPeriod: any[]
): { theme: string; newSignals: number; types: string[] } {
  const types = [...new Set(cardsInPeriod.map((c) => c.signalType))];
  return {
    theme: theme.name,
    newSignals: cardsInPeriod.length,
    types,
  };
}

// Helper: Build digest prompt
function buildDigestPrompt(
  period: string,
  themeSummaries: Array<{ theme: string; newSignals: number; types: string[] }>,
  totalSignals: number
): string {
  const themesText = themeSummaries
    .map((s) => `- ${s.theme}: ${s.newSignals} signal(s) (${s.types.join(", ")})`)
    .join("\n");

  return `당신은 시그널 다이제스트 작성 어시스턴트입니다.

${period === "weekly" ? "지난 주" : "지난 달"}의 시그널 변화를 종합하여 다이제스트를 작성해주세요.

## 기간별 신호 요약
총 신호: ${totalSignals}개

${themesText}

## 요구사항
- 한국어로 작성
- 최대 2페이지
- 주요 변화 3개 강조
- 각 테마별 시그널 유형 분석
- 테마 간 새로운 연결고리 도출
- 향후 주목할 사항 포함

## 형식
# ${period === "weekly" ? "주간" : "월간"} 시그널 다이제스트

## Executive Summary
(2-3문단)

## 테마별 분석
각 테마별로 신호 변화 정리

## 신규 연결고리
테마 간 새로운 관계 발견

## 향후 주목`;
}

// POST /api/digest
// Body: { period: "weekly" | "monthly", channel?: "email" | "slack" }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { period, channel } = body;

    if (!["weekly", "monthly"].includes(period)) {
      return NextResponse.json(
        { error: "period must be 'weekly' or 'monthly'" },
        { status: 400 }
      );
    }

    // 1. Calculate date range
    const { start, end } = getDateRange(period);

    // 2. Get themes updated in that range
    const allThemes = await getAllThemes();
    const themeSummaries: Array<{ theme: string; newSignals: number; types: string[] }> = [];
    let totalSignals = 0;

    for (const theme of allThemes) {
      const cards = await getCardsByTheme(theme.id);

      // Filter cards in date range
      const cardsInPeriod = cards.filter((c) => {
        const cardDate = new Date(c.createdAt).getTime();
        return cardDate >= start.getTime() && cardDate <= end.getTime();
      });

      if (cardsInPeriod.length > 0) {
        const summary = summarizeSignalChanges(theme, cardsInPeriod);
        themeSummaries.push(summary);
        totalSignals += cardsInPeriod.length;
      }
    }

    if (totalSignals === 0) {
      return NextResponse.json(
        { message: "No signals in the given period" },
        { status: 200 }
      );
    }

    // 3. Call Claude API (or fallback) to generate digest
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let digestContent: string;

    if (apiKey) {
      digestContent = await generateDigestWithClaude(
        period,
        themeSummaries,
        totalSignals,
        apiKey
      );
    } else {
      digestContent = generateFallbackDigest(
        period,
        themeSummaries,
        totalSignals
      );
    }

    // 4. Return the digest markdown
    return NextResponse.json({
      period,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      totalSignals,
      content: digestContent,
      channel: channel || "web",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Digest generation error:", error);
    return NextResponse.json(
      { error: `Digest generation failed: ${message}` },
      { status: 500 }
    );
  }
}

// Helper: Generate digest using Claude API
async function generateDigestWithClaude(
  period: string,
  themeSummaries: Array<{ theme: string; newSignals: number; types: string[] }>,
  totalSignals: number,
  apiKey: string
): Promise<string> {
  const prompt = buildDigestPrompt(period, themeSummaries, totalSignals);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-1-20250805",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || "Failed to generate digest";
  } catch (err) {
    console.error("Claude digest generation error:", err);
    return generateFallbackDigest(period, themeSummaries, totalSignals);
  }
}

// Helper: Fallback template-based digest generation
function generateFallbackDigest(
  period: string,
  themeSummaries: Array<{ theme: string; newSignals: number; types: string[] }>,
  totalSignals: number
): string {
  const lines: string[] = [];
  const periodLabel = period === "weekly" ? "주간" : "월간";

  lines.push(`# ${periodLabel} 시그널 다이제스트`);
  lines.push("");
  lines.push(
    `**기간**: ${new Date().toLocaleDateString("ko-KR")} (생성 자동)`
  );
  lines.push("");

  lines.push("## Executive Summary");
  lines.push("");
  lines.push(
    `이 ${periodLabel} 동안 총 **${totalSignals}개의 신호**가 수집되었습니다.`
  );
  lines.push(
    `${themeSummaries.length}개 테마에서 신규 신호가 발생했으며, 주로 다음 유형으로 구성되어 있습니다:`
  );
  lines.push("");

  // List themes and signals
  lines.push("## 테마별 신호 분석");
  lines.push("");

  for (const summary of themeSummaries) {
    lines.push(`### ${summary.theme}`);
    lines.push(`- 신호 수: ${summary.newSignals}개`);
    lines.push(
      `- 신호 유형: ${summary.types.join(", ") || "mixed"}`
    );
    lines.push("");
  }

  lines.push("## 주요 변화");
  lines.push("");
  lines.push("1. 신호 수량의 증가");
  lines.push(
    `   - ${period === "weekly" ? "지난 주" : "지난 달"} ${totalSignals}개 신호 수집`
  );
  lines.push("");
  lines.push("2. 테마 다양성");
  lines.push(
    `   - ${themeSummaries.length}개 테마에서 신규 신호 발생`
  );
  lines.push("");
  lines.push("3. 신호 유형 분포");
  const allTypes = new Set<string>();
  themeSummaries.forEach((s) => s.types.forEach((t) => allTypes.add(t)));
  [...allTypes].forEach((t) => {
    lines.push(`   - ${t}: ${themeSummaries.filter((s) => s.types.includes(t)).length}개 테마`);
  });
  lines.push("");

  lines.push("## 향후 주목 사항");
  lines.push("");
  lines.push("- 신호 추세 계속 모니터링");
  lines.push("- 테마 간 새로운 연결고리 발굴");
  lines.push("- 미답변 질문 우선순위 검토");
  lines.push("");

  lines.push(`**다음 업데이트**: ${period === "weekly" ? "7일" : "30일"} 후`);
  lines.push(
    "> 이 다이제스트는 자동 생성되었습니다. API 키가 설정되지 않아 템플릿 형식으로 작성되었습니다."
  );

  return lines.join("\n");
}
