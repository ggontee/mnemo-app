"use client";

import { Article } from "@/lib/types";

interface ArticleCardProps {
  article: Article;
}

function getSignalBadge(signalType?: string) {
  switch (signalType) {
    case "reinforcing":
      return { text: "[+]", color: "bg-emerald-100 text-emerald-700" };
    case "contradicting":
      return { text: "[⚠️]", color: "bg-amber-100 text-amber-700" };
    case "new":
      return { text: "[NEW]", color: "bg-blue-100 text-blue-700" };
    default:
      return null;
  }
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const signalBadge = getSignalBadge(article.signalType);

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      {/* 테마 태그 (있으면) */}
      {article.themeIds && article.themeIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.themeIds.map((themeId) => (
            <span
              key={themeId}
              className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full"
            >
              #{themeId}
            </span>
          ))}
        </div>
      )}

      {/* 출처 & 날짜 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-indigo-600">{article.sourceName}</span>
          {signalBadge && (
            <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${signalBadge.color}`}>
              {signalBadge.text}
            </span>
          )}
        </div>
        <span>{article.createdAt}</span>
      </div>

      {/* 제목 */}
      <h2 className="text-2xl font-bold text-gray-900 leading-snug">
        {article.title}
      </h2>

      {/* 한줄 요약 */}
      <p className="text-base text-gray-600 leading-relaxed">
        {article.summary}
      </p>

      {/* So What — 있으면 표시 */}
      {article.soWhat && (
        <p className="text-base font-medium text-indigo-700 bg-indigo-50 rounded-lg px-4 py-2.5">
          {article.soWhat}
        </p>
      )}

      {/* 구분선 */}
      <hr className="border-gray-200" />

      {/* Key Points (신규) 또는 Implications (기존) */}
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
          {article.keyPoints ? "Key Points" : "Implications"}
        </h3>
        <ul className="space-y-2.5">
          {(article.keyPoints || article.implications).map((point, i) => (
            <li key={i} className="flex gap-2 text-base text-gray-700 leading-relaxed">
              <span className="text-indigo-400 font-bold mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 태그 */}
      <div className="flex flex-wrap gap-2">
        {article.tags.map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-1 text-sm font-medium bg-gray-100 text-gray-600 rounded-full"
          >
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
}
