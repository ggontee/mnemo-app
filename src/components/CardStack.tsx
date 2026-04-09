"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Article } from "@/lib/types";
import { updateCardStatus } from "@/lib/data";
import SwipeCard from "./SwipeCard";
import CommentModal from "./CommentModal";

interface CardStackProps {
  initialArticles: Article[];
  onArticlesChange: (articles: Article[]) => void;
}

export default function CardStack({ initialArticles, onArticlesChange }: CardStackProps) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [commentTarget, setCommentTarget] = useState<Article | null>(null);
  const [isCommentOpen, setIsCommentOpen] = useState(false);

  const pendingArticles = articles.filter((a) => a.status === "pending");

  // 좌측 스와이프: 바로 discard
  // 우측 스와이프: 코멘트 모달 열기
  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (pendingArticles.length === 0) return;
      const current = pendingArticles[0];

      if (direction === "left") {
        performKeep(current.id, "discarded", undefined);
      } else if (direction === "right") {
        setCommentTarget(current);
        setIsCommentOpen(true);
      }
    },
    [pendingArticles]
  );

  // 실제 저장 처리
  const performKeep = useCallback(
    async (id: string, status: "kept" | "discarded", comment?: string) => {
      const updated = articles.map((a) =>
        a.id === id
          ? { ...a, status: status as Article["status"], userComment: comment || a.userComment }
          : a
      );
      setArticles(updated);
      onArticlesChange(updated);

      try {
        await updateCardStatus(id, status, comment);
      } catch (err) {
        console.error("카드 상태 저장 실패:", err);
      }
    },
    [articles, onArticlesChange]
  );

  // 코멘트 확인 → kept 처리
  const handleCommentConfirm = useCallback(
    (comment: string) => {
      if (!commentTarget) return;
      performKeep(commentTarget.id, "kept", comment || undefined);
      setIsCommentOpen(false);
      setCommentTarget(null);
    },
    [commentTarget, performKeep]
  );

  // 코멘트 취소 → 스와이프 취소 (카드 유지)
  const handleCommentCancel = useCallback(() => {
    setIsCommentOpen(false);
    setCommentTarget(null);
  }, []);

  const remaining = pendingArticles.length;
  const total = initialArticles.length;
  const keptCount = articles.filter((a) => a.status === "kept").length;

  if (remaining === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <div className="text-6xl">✨</div>
        <h2 className="text-2xl font-bold text-gray-900">모두 확인했습니다!</h2>
        <p className="text-gray-500">
          총 {total}개 아티클 중 {keptCount}개를 보관했어요.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
        {/* 진행 표시 */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${((total - remaining) / total) * 100}%` }}
            />
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {remaining}개 남음
          </span>
        </div>

        {/* 카드 영역 */}
        <div className="relative w-full aspect-[3/4] max-h-[520px]">
          <AnimatePresence>
            {pendingArticles.slice(0, 2).map((article, i) => (
              <SwipeCard
                key={article.id}
                article={article}
                onSwipe={handleSwipe}
                isTop={i === 0}
                disabled={isCommentOpen}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => handleSwipe("left")}
            disabled={isCommentOpen}
            className="w-16 h-16 rounded-full bg-white border-2 border-red-400 text-red-500 flex items-center justify-center text-2xl shadow-md hover:bg-red-50 hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
            aria-label="버리기"
          >
            ✕
          </button>
          <button
            onClick={() => handleSwipe("right")}
            disabled={isCommentOpen}
            className="w-16 h-16 rounded-full bg-white border-2 border-emerald-400 text-emerald-500 flex items-center justify-center text-2xl shadow-md hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
            aria-label="보관"
          >
            ♥
          </button>
        </div>
      </div>

      {/* 코멘트 모달 */}
      <CommentModal
        article={commentTarget}
        isOpen={isCommentOpen}
        onConfirm={handleCommentConfirm}
        onCancel={handleCommentCancel}
      />
    </>
  );
}
