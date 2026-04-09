import { Article, Theme, DeepDiveEntry } from "./types";

const API_BASE = "/api/cards";
const THEMES_API = "/api/themes";
const WIKI_API = "/api/wiki";

/** 전체 카드 조회 */
export async function fetchArticles(): Promise<Article[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("Failed to fetch cards");
  return res.json();
}

/** pending 카드만 조회 */
export async function fetchPendingArticles(): Promise<Article[]> {
  const res = await fetch(`${API_BASE}?status=pending`);
  if (!res.ok) throw new Error("Failed to fetch pending cards");
  return res.json();
}

/** kept 카드만 조회 */
export async function fetchKeptArticles(): Promise<Article[]> {
  const res = await fetch(`${API_BASE}?status=kept`);
  if (!res.ok) throw new Error("Failed to fetch kept cards");
  return res.json();
}

/** 카드 상태 업데이트 + 코멘트 저장 */
export async function updateCardStatus(
  id: string,
  status: "kept" | "discarded" | "deferred",
  userComment?: string,
  deferredUntil?: string
): Promise<Article> {
  const res = await fetch(API_BASE, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status, userComment, deferredUntil }),
  });
  if (!res.ok) throw new Error("Failed to update card status");
  return res.json();
}

/** 모든 테마 조회 */
export async function fetchThemes(): Promise<Theme[]> {
  const res = await fetch(THEMES_API);
  if (!res.ok) throw new Error("Failed to fetch themes");
  return res.json();
}

/** 특정 테마 상세 조회 */
export async function fetchThemeDetail(
  id: string
): Promise<{ theme: Theme; cards: Article[] }> {
  const res = await fetch(`${THEMES_API}/${id}`);
  if (!res.ok) throw new Error("Failed to fetch theme");
  return res.json();
}

/** 출력 생성 (레거시 — 비스트리밍) */
export async function generateOutput(params: {
  themeIds: string[];
  outputType: string;
  prompt?: string;
  dateRange?: { start: string; end: string };
}): Promise<{ content: string }> {
  const res = await fetch(`${WIKI_API}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to generate output");
  return res.json();
}

/** 출력 생성 (스트리밍 — SSE) */
export interface StreamCallbacks {
  onStart?: (totalSections: number) => void;
  onSectionStart?: (index: number, title: string) => void;
  onChunk?: (index: number, text: string) => void;
  onSectionDone?: (index: number, title: string) => void;
  onDone?: (id: string, content: string) => void;
  onError?: (message: string) => void;
}

export async function generateOutputStreaming(
  params: {
    themeIds: string[];
    outputType: string;
    prompt?: string;
    dateRange?: { start: string; end: string };
  },
  callbacks: StreamCallbacks,
): Promise<void> {
  const res = await fetch(`${WIKI_API}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    callbacks.onError?.(`HTTP ${res.status}`);
    return;
  }

  const contentType = res.headers.get("content-type") || "";

  // 비스트리밍 fallback (API 키 없을 때 JSON 응답)
  if (contentType.includes("application/json")) {
    const json = await res.json();
    callbacks.onDone?.(json.id, json.content);
    return;
  }

  // SSE 파싱
  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError?.("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      let eventType = "";
      let dataStr = "";

      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        if (line.startsWith("data: ")) dataStr = line.slice(6);
      }

      if (!eventType || !dataStr) continue;

      try {
        const data = JSON.parse(dataStr);
        switch (eventType) {
          case "start":
            callbacks.onStart?.(data.totalSections);
            break;
          case "section-start":
            callbacks.onSectionStart?.(data.index, data.title);
            break;
          case "chunk":
            callbacks.onChunk?.(data.index, data.text);
            break;
          case "section-done":
            callbacks.onSectionDone?.(data.index, data.title);
            break;
          case "done":
            callbacks.onDone?.(data.id, data.content);
            break;
          case "error":
            callbacks.onError?.(data.message);
            break;
        }
      } catch {
        // skip malformed
      }
    }
  }
}

/** 아웃풋이 존재하는 테마 ID 목록 조회 */
export async function fetchThemeIdsWithOutputs(): Promise<string[]> {
  const res = await fetch(`${WIKI_API}/theme-outputs`);
  if (!res.ok) return [];
  return res.json();
}

/** 사용자 직접 질문 추가 */
export async function addCustomQuestion(
  cardId: string,
  question: string
): Promise<Article> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, question }),
  });
  if (!res.ok) throw new Error("Failed to add question");
  return res.json();
}

/** AI 리서치 실행 (카드용) */
export async function fetchResearch(
  cardId: string,
  questionId: string
): Promise<{ questionId: string; answer: string }> {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, questionId }),
  });
  if (!res.ok) throw new Error("Failed to fetch research");
  return res.json();
}

/** 아웃풋 딥다이브 실행 (웹 검색 + Opus 4.6) */
export async function fetchOutputResearch(
  outputId: string,
  question: string
): Promise<{ deepDive: DeepDiveEntry; totalDives: number }> {
  const res = await fetch("/api/output-research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputId, question }),
  });
  if (!res.ok) throw new Error("Failed to fetch output research");
  return res.json();
}
