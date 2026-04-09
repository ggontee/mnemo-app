import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  getCardById,
  upsertCard,
  getAllThemes,
  upsertTheme,
} from "@/lib/db";

const WIKI_BASE = path.resolve(process.cwd(), "data", "wiki");

// Helper: Generate theme ID from name
function generateThemeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Helper: Calculate theme summary based on signal types
function evaluateThemeSummary(signals: string[]): string {
  const reinforcing = signals.filter((s) => s === "reinforcing").length;
  const contradicting = signals.filter((s) => s === "contradicting").length;
  const total = signals.length;

  if (contradicting >= total * 0.4) {
    return "mixed signals with significant contradictions";
  } else if (reinforcing >= total * 0.7) {
    return "consistent signals reinforcing the theme";
  } else if (contradicting > 0) {
    return "predominantly reinforcing with some contradictions";
  } else {
    return "early signals, limited data";
  }
}

// Helper: Read theme wiki file
async function readThemeWiki(themeId: string): Promise<string | null> {
  const wikiPath = path.join(WIKI_BASE, `${themeId}.md`);
  try {
    return await fs.readFile(wikiPath, "utf-8");
  } catch {
    return null;
  }
}

// Helper: Write theme wiki file
async function writeThemeWiki(themeId: string, content: string): Promise<void> {
  await fs.mkdir(WIKI_BASE, { recursive: true });
  const wikiPath = path.join(WIKI_BASE, `${themeId}.md`);
  await fs.writeFile(wikiPath, content, "utf-8");
}

// Helper: Build wiki markdown for theme
function buildThemeWiki(
  themeName: string,
  themeSummary: string,
  signals: Array<{ cardId: string; signalType: string; title: string; date: string }>
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${themeName}`);
  lines.push("");

  // Summary
  lines.push(`## Summary`);
  lines.push(themeSummary);
  lines.push("");

  // Timeline of signals
  if (signals.length > 0) {
    lines.push(`## Signals (${signals.length})`);
    lines.push("");

    const sorted = [...signals].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    for (const signal of sorted) {
      const badge =
        signal.signalType === "reinforcing"
          ? "✓"
          : signal.signalType === "contradicting"
            ? "✗"
            : "•";
      lines.push(
        `${badge} [${signal.date}] ${signal.title} (${signal.cardId})`
      );
    }
    lines.push("");
  }

  // Open questions
  lines.push(`## Open Questions`);
  lines.push("- What are the key unknowns?");
  lines.push("- How does this evolve?");
  lines.push("");

  // Related themes
  lines.push(`## Related Themes`);
  lines.push("- (to be filled)");
  lines.push("");

  return lines.join("\n");
}

// POST /api/wiki/compile
// Body: { cardId: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardId } = body;

    if (!cardId) {
      return NextResponse.json(
        { error: "cardId is required" },
        { status: 400 }
      );
    }

    // 1. Get the card
    const card = await getCardById(cardId);
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // 2. Get all existing themes
    const allThemes = await getAllThemes();

    // 3. Call Claude API to match card to themes (or suggest new)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let matchResult: any;

    if (apiKey) {
      matchResult = await matchCardToThemes(card, allThemes, apiKey);
    } else {
      // Fallback: basic tag overlap matching
      matchResult = fallbackMatchCardToThemes(card, allThemes);
    }

    const { matchedThemes, newTheme } = matchResult;

    // 4. Process matched themes
    for (const matched of matchedThemes) {
      const theme = allThemes.find((t) => t.id === matched.themeId);
      if (!theme) continue;

      // Read existing wiki file
      let wikiContent = await readThemeWiki(theme.id);

      // Add signal to timeline
      if (!wikiContent) {
        // Create new wiki file
        const signals = [
          {
            cardId,
            signalType: matched.signalType,
            title: card.title,
            date: card.createdAt.split("T")[0],
          },
        ];
        wikiContent = buildThemeWiki(theme.name, theme.summary, signals);
      } else {
        // Update existing file with new signal
        const signalLine = `- [${card.createdAt.split("T")[0]}] ${card.title} (${cardId}) - ${matched.signalType}`;
        if (!wikiContent.includes(signalLine)) {
          wikiContent = wikiContent.replace(
            /## Open Questions/,
            `- ${signalLine}\n\n## Open Questions`
          );
        }
      }

      // Re-evaluate summary
      const summary = evaluateThemeSummary([
        ...(theme.signalCount ? ["reinforcing"] : []),
        matched.signalType,
      ]);

      await writeThemeWiki(theme.id, wikiContent);

      // Update theme in DB
      theme.summary = summary;
      theme.signalCount = (theme.signalCount || 0) + 1;
      theme.lastCompiled = new Date().toISOString();
      if (!theme.cardIds) theme.cardIds = [];
      if (!theme.cardIds.includes(cardId)) {
        theme.cardIds.push(cardId);
      }
      await upsertTheme(theme);
    }

    // 5. Process new theme if suggested
    if (newTheme) {
      const newThemeId = generateThemeId(newTheme.name);
      const newThemeObj = {
        id: newThemeId,
        name: newTheme.name,
        summary: newTheme.summary || "New theme, early signals",
        cardIds: [cardId],
        openQuestions: newTheme.openQuestions || [],
        relatedThemes: [],
        wikiPath: path.join(WIKI_BASE, `${newThemeId}.md`),
        lastCompiled: new Date().toISOString(),
        signalCount: 1,
        status: "active" as const,
      };

      const signals = [
        {
          cardId,
          signalType: "reinforcing",
          title: card.title,
          date: card.createdAt.split("T")[0],
        },
      ];

      const wikiContent = buildThemeWiki(newTheme.name, newTheme.summary, signals);
      await writeThemeWiki(newThemeId, wikiContent);
      await upsertTheme(newThemeObj);

      matchedThemes.push({
        themeId: newThemeId,
        signalType: "reinforcing",
      });
    }

    // 6. Update card with theme IDs and signal type
    card.themeIds = matchedThemes.map((m: any) => m.themeId);
    card.signalType = matchedThemes[0]?.signalType || "new";
    await upsertCard(card);

    // 7. Sync to Obsidian wiki folder (optional)
    try {
      // Could add logic here to sync wiki files to Obsidian
    } catch (e) {
      console.error("Obsidian wiki sync failed (non-blocking):", e);
    }

    return NextResponse.json({
      success: true,
      cardId,
      matchedThemes,
      newTheme: newTheme ? newTheme.name : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Wiki compile error:", error);
    return NextResponse.json(
      { error: `Wiki compile failed: ${message}` },
      { status: 500 }
    );
  }
}

// Helper: Match card to themes using Claude API
async function matchCardToThemes(
  card: any,
  themes: any[],
  apiKey: string
): Promise<any> {
  const themesList = themes
    .map((t) => `- ${t.name}: ${t.summary}`)
    .join("\n");

  const prompt = `당신은 시그널 컴파일링 어시스턴트입니다.

주어진 아티클을 기존 테마에 매칭하거나 새로운 테마를 제안해주세요.

## 아티클 정보
- 제목: ${card.title}
- 요약: ${card.summary}
- 태그: ${card.tags.join(", ")}
- 시사점: ${card.implications.join("; ")}

## 기존 테마 목록
${themesList || "(테마 없음)"}

## 응답 형식 (JSON)
{
  "matchedThemes": [
    {
      "themeId": "theme-name",
      "signalType": "reinforcing|contradicting|new",
      "reasoning": "왜 이 테마와 연결되는가?"
    }
  ],
  "newTheme": {
    "name": "새 테마 이름",
    "summary": "요약",
    "openQuestions": ["질문1", "질문2"]
  }
}

하나 이상의 기존 테마에 매칭해야 합니다. 기존 테마로는 부족하면 새로운 테마를 제안하세요.`;

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
        max_tokens: 1024,
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
    const responseText = data.content?.[0]?.text || "{}";

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Map theme names to IDs
    const matchedThemes = (result.matchedThemes || []).map((m: any) => {
      const theme = Object.values({ ...themes }).find(
        (t: any) => t.name === m.themeId || t.id === m.themeId
      ) as any;
      return {
        themeId: theme?.id || m.themeId,
        signalType: m.signalType || "new",
      };
    });

    return {
      matchedThemes: matchedThemes.length > 0 ? matchedThemes : [{ themeId: "", signalType: "new" }],
      newTheme: result.newTheme || null,
    };
  } catch (err) {
    console.error("Claude matching failed:", err);
    return fallbackMatchCardToThemes(card, themes);
  }
}

// Helper: Fallback matching based on tag overlap
function fallbackMatchCardToThemes(card: any, themes: any[]): any {
  const cardTags = new Set(card.tags);
  let bestMatch: any = null;
  let bestScore = 0;

  for (const theme of themes) {
    if (!theme.summary) continue;
    const themeWords = new Set(theme.summary.toLowerCase().split(/\s+/));
    const titleWords = new Set(card.title.toLowerCase().split(/\s+/));

    let overlap = 0;
    for (const word of titleWords) {
      if (themeWords.has(word)) overlap++;
    }

    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = theme;
    }
  }

  if (bestMatch && bestScore > 0) {
    return {
      matchedThemes: [
        {
          themeId: bestMatch.id,
          signalType: "reinforcing",
        },
      ],
      newTheme: null,
    };
  }

  // Suggest new theme based on top tag
  const newTheme = card.tags.length > 0 ? {
    name: `${card.tags[0]} theme`,
    summary: `Signals related to ${card.tags[0]}`,
    openQuestions: [],
  } : null;

  return {
    matchedThemes: [],
    newTheme,
  };
}
