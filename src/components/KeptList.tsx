"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Article } from "@/lib/types";
import ArticleDetail from "./ArticleDetail";

interface KeptListProps {
  articles: Article[];
  onArticleUpdate?: (updated: Article) => void;
}

export default function KeptList({ articles, onArticleUpdate }: KeptListProps) {
  const keptArticles = articles.filter((a) => a.status === "kept");
  const allTags = Array.from(new Set(keptArticles.flatMap((a) => a.tags)));
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const filtered = selectedTag
    ? keptArticles.filter((a) => a.tags.includes(selectedTag))
    : keptArticles;

  const handleArticleUpdate = (updated: Article) => {
    setSelectedArticle(updated);
    onArticleUpdate?.(updated);
  };

  if (keptArticles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 pt-20">
        <div className="text-6xl">📭</div>
        <h2 className="text-xl font-bold text-gray-900">보관된 아티클이 없어요</h2>
        <p className="text-gray-500 text-sm">
          스와이프에서 마음에 드는 아티클을 오른쪽으로 밀어보세요.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 pt-4 pb-24 px-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">
          보관함 <span className="text-indigo-500">{keptArticles.length}</span>
        </h1>

        {/* 태그 필터 */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                selectedTag === null
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              전체
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  selectedTag === tag
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* 아티클 리스트 */}
        <div className="flex flex-col gap-3">
          {filtered.map((article) => (
            <button
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="block w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-base font-semibold text-gray-900 leading-snug flex-1">
                  {article.title}
                </h3>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm text-gray-400 whitespace-nowrap">
                    {article.sourceName}
                  </span>
                  {article.aiQuestions && article.aiQuestions.length > 0 && (
                    <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                      🧠 {article.aiQuestions.length}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-2 line-clamp-2">{article.summary}</p>
              {article.userComment && (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mb-2 truncate">
                  📝 {article.userComment}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs font-medium bg-gray-50 text-gray-500 rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 상세 뷰 */}
      <AnimatePresence>
        {selectedArticle && (
          <ArticleDetail
            article={selectedArticle}
            onClose={() => setSelectedArticle(null)}
            onArticleUpdate={handleArticleUpdate}
          />
        )}
      </AnimatePresence>
    </>
  );
}
