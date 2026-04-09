"use client";

import { useState, useEffect } from "react";
import { Article } from "@/lib/types";

interface TagItem {
  tag: string;
  count: number;
}

export default function TagCloud() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagCards, setTagCards] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        setTags(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleTagClick = async (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      setTagCards([]);
      return;
    }
    setSelectedTag(tag);
    setCardsLoading(true);
    try {
      const res = await fetch(`/api/tags?tag=${encodeURIComponent(tag)}`);
      const data = await res.json();
      setTagCards(data.cards || []);
    } catch {
      setTagCards([]);
    } finally {
      setCardsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-6 text-center text-gray-400 text-sm">
        태그 로딩 중...
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-gray-400 text-sm">
        태그가 없습니다
      </div>
    );
  }

  const maxCount = tags[0]?.count || 1;

  return (
    <div className="px-4 py-4">
      {/* 태그 클라우드 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.slice(0, 40).map((item) => {
          const ratio = item.count / maxCount;
          const isSelected = selectedTag === item.tag;
          // 크기: 0.75rem ~ 1.1rem 비례
          const fontSize = 0.75 + ratio * 0.35;

          return (
            <button
              key={item.tag}
              onClick={() => handleTagClick(item.tag)}
              style={{ fontSize: `${fontSize}rem` }}
              className={`px-2.5 py-1 rounded-full border transition-all ${
                isSelected
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {item.tag}
              <span
                className={`ml-1 text-xs ${
                  isSelected ? "text-indigo-200" : "text-gray-400"
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 태그의 카드 목록 */}
      {selectedTag && (
        <div className="border-t border-gray-200 pt-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            🏷️ &ldquo;{selectedTag}&rdquo; 관련 카드 ({tagCards.length}건)
          </h3>
          {cardsLoading ? (
            <div className="text-center text-gray-400 text-sm py-4">
              로딩 중...
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tagCards.map((card) => (
                <div
                  key={card.id}
                  className="bg-white rounded-lg border border-gray-200 p-3"
                >
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {card.title}
                  </p>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {card.summary}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400">
                      {card.sourceName}
                    </span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {new Date(card.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {card.status === "kept" && (
                      <span className="ml-auto text-xs text-green-600">
                        보관됨
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
