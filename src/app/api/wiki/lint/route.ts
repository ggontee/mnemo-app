import { NextRequest, NextResponse } from "next/server";
import {
  getAllThemes,
  getCardsByTheme,
  upsertTheme,
  saveLintReport,
  getLatestLintReport,
} from "@/lib/db";
import { LintReport } from "@/lib/types";

// Helper: Check if theme is dormant (30+ days no signal)
function isDormant(theme: any): boolean {
  const lastCompiled = new Date(theme.lastCompiled).getTime();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return lastCompiled < thirtyDaysAgo;
}

// Helper: Find unresolved conflicts in theme
async function findUnresolvedConflicts(theme: any): Promise<number> {
  const cards = await getCardsByTheme(theme.id);
  const contradicting = cards.filter((c) => c.signalType === "contradicting");

  // Count if there are unresolved contradicting signals without follow-up
  let conflicts = 0;
  for (const card of contradicting) {
    const followUps = cards.filter(
      (c) =>
        c.createdAt > card.createdAt &&
        (c.signalType === "reinforcing" ||
          (c.summary && c.summary.toLowerCase().includes("resolve")))
    );
    if (followUps.length === 0) {
      conflicts++;
    }
  }

  return conflicts;
}

// Helper: Find answerable open questions
async function findAnswerableQuestions(
  theme: any
): Promise<Array<{ themeId: string; question: string; suggestedCardId: string }>> {
  const cards = await getCardsByTheme(theme.id);
  const answerable: Array<{ themeId: string; question: string; suggestedCardId: string }> = [];

  if (!theme.openQuestions || theme.openQuestions.length === 0) {
    return answerable;
  }

  // Check if any card could answer an open question
  for (const question of theme.openQuestions) {
    for (const card of cards) {
      // Simple heuristic: if question words appear in card content
      const questionWords = question
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 3);
      const cardText = `${card.title} ${card.summary}`.toLowerCase();

      const matches = questionWords.filter((w: string) => cardText.includes(w));
      if (matches.length > 0) {
        answerable.push({
          themeId: theme.id,
          question,
          suggestedCardId: card.id,
        });
        break; // Only one suggestion per question
      }
    }
  }

  return answerable;
}

// Helper: Find new cross-theme connections
async function findNewConnections(
  themes: any[]
): Promise<Array<{ from: string; to: string; reason: string }>> {
  const connections: Array<{ from: string; to: string; reason: string }> = [];

  for (let i = 0; i < themes.length; i++) {
    for (let j = i + 1; j < themes.length; j++) {
      const theme1 = themes[i];
      const theme2 = themes[j];

      // Check if themes have overlapping cards
      const cards1 = new Set(theme1.cardIds || []);
      const cards2 = new Set(theme2.cardIds || []);

      const overlap = [...cards1].filter((c) => cards2.has(c));
      if (overlap.length > 0) {
        connections.push({
          from: theme1.id,
          to: theme2.id,
          reason: `Shared ${overlap.length} signal(s)`,
        });
      }
    }
  }

  return connections;
}

// POST /api/wiki/lint — Run full wiki lint
export async function POST(request: NextRequest) {
  try {
    // 1. Get all themes from DB
    const themes = await getAllThemes();

    // 2. Check each theme
    const dormantThemes: string[] = [];
    const staleThemes: string[] = [];
    let totalConflicts = 0;
    const answerableQuestions: Array<{ themeId: string; question: string; suggestedCardId: string }> = [];

    for (const theme of themes) {
      // Check dormancy
      if (isDormant(theme)) {
        dormantThemes.push(theme.id);

        // Update status to dormant if currently active
        if (theme.status === "active") {
          theme.status = "dormant";
          await upsertTheme(theme);
        }
      }

      // Check for unresolved conflicts
      const conflicts = await findUnresolvedConflicts(theme);
      totalConflicts += conflicts;

      // Check for answerable questions
      const answerable = await findAnswerableQuestions(theme);
      answerableQuestions.push(...answerable);

      // Check if stale (no updates in 60 days)
      const lastCompiled = new Date(theme.lastCompiled).getTime();
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      if (lastCompiled < sixtyDaysAgo) {
        staleThemes.push(theme.id);
      }
    }

    // 3. Check for new cross-theme connections
    const newConnections = await findNewConnections(themes);

    // 4. Generate and save lint report
    const reportId = `lint-${Date.now()}`;
    const lintReport: LintReport = {
      id: reportId,
      createdAt: new Date().toISOString(),
      dormantThemes,
      unresolvedConflicts: totalConflicts,
      answerableQuestions,
      newConnections,
      staleThemes,
    };

    await saveLintReport(lintReport);

    // 5. Return the report
    return NextResponse.json(lintReport);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Wiki lint error:", error);
    return NextResponse.json(
      { error: `Wiki lint failed: ${message}` },
      { status: 500 }
    );
  }
}

// GET /api/wiki/lint — Return most recent lint report
export async function GET() {
  try {
    const latestReport = await getLatestLintReport();

    if (!latestReport) {
      return NextResponse.json(
        { error: "No lint reports found" },
        { status: 404 }
      );
    }

    return NextResponse.json(latestReport);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Get lint report error:", error);
    return NextResponse.json(
      { error: `Failed to get lint report: ${message}` },
      { status: 500 }
    );
  }
}
