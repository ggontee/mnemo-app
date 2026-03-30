import { Article } from "./types";

const API_BASE = "/api/cards";

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
  status: "kept" | "discarded",
  userComment?: string
): Promise<Article> {
  const res = await fetch(API_BASE, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status, userComment }),
  });
  if (!res.ok) throw new Error("Failed to update card status");
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

/** AI 리서치 실행 */
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
