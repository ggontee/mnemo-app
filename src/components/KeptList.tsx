"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { Article } from "@/lib/types";
import ArticleDetail from "./ArticleDetail";

interface KeptListProps {
  articles: Article[];
  onArticleUpdate?: (updated: Article) => void;
}

export default function KeptList({ articles, onArticleUpdate }: KeptListProps) {
  const keptArticles = articles.filter((a) => a.status === "kept");

  // 태그를 아티클 수 기준 내림차순 정렬
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    keptArticles.forEach((a) => a.tags.forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    }));
    return counts;
  }, [keptArticles]);

  const allTags = useMemo(
    () => Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]),
    [tagCounts]
  );

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [showTagSearch, setShowTagSearch] = useState(false);
  const [maxVisibleTags, setMaxVisibleTags] = useState<number>(allTags.length);
  const tagContainerRef = useRef<HTMLDivElement>(null);

  // 2줄까지만 보이도록 visible tag 수 계산
  useEffect(() => {
    const container = tagContainerRef.current;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];
    if (children.length <= 1) return; // "전체" 버튼만 있으면 skip

    const firstTop = children[0]?.offsetTop ?? 0;
    let maxCount = 0;

    for (let i = 1; i < children.length; i++) {
      const row = children[i].offsetTop - firstTop;
      // 각 버튼 높이 ~32px, 2줄이면 ~40px 이하 (gap 포함)
      if (row > 44) break;
      maxCount = i; // index (태그 배열 기준 i-1, 전체 버튼이 0번)
    }
    setMaxVisibleTags(maxCount);
  }, [allTags]);

  const visibleTags = allTags.slice(0, maxVisibleTags);
  const hasHiddenTags = allTags.length > maxVisibleTags;

  const searchFilteredTags = tagSearch
    ? allTags.filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()))
    : [];

  const filtered = useMemo(() => {
    const list = selectedTag
      ? keptArticles.filter((a) => a.tags.includes(selectedTag))
      : keptArticles;
    // 최신순 정렬 (createdAt 내림차순)
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [keptArticles, selectedTag]);

  // 일자별 그룹핑
  const groupedByDate = useMemo(() => {
    const groups: { date: string; label: string; articles: Article[] }[] = [];
    const map = new Map<string, Article[]>();

    for (const article of filtered) {
      const d = new Date(article.createdAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(article);
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    for (const [dateKey, arts] of map) {
      let label: string;
      if (dateKey === todayKey) {
        label = "오늘";
      } else if (dateKey === yesterdayKey) {
        label = "어제";
      } else {
        const [y, m, d] = dateKey.split("-");
        label = `${parseInt(m)}월 ${parseInt(d)}일`;
        if (parseInt(y) !== today.getFullYear()) {
          label = `${y}년 ${label}`;
        }
      }
      groups.push({ date: dateKey, label, articles: arts });
    }

    return groups;
  }, [filtered]);

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
          <div className="space-y-2">
            {/* 측정용 숨김 컨테이너 (모든 태그를 렌더해서 2줄 기준 계산) */}
            <div
              ref={tagContainerRef}
              className="flex flex-wrap gap-2 absolute opacity-0 pointer-events-none"
              style={{ width: "calc(100% - 2rem)", maxWidth: "448px" }}
              aria-hidden="true"
            >
              <span className="px-3 py-1.5 text-sm font-medium">전체</span>
              {allTags.map((tag) => (
                <span key={tag} className="px-3 py-1.5 text-sm font-medium">
                  #{tag}
                </span>
              ))}
            </div>

            {/* 실제 표시되는 태그 (2줄 제한) */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSelectedTag(null); setShowTagSearch(false); setTagSearch(""); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  selectedTag === null && !showTagSearch
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                전체
              </button>
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => { setSelectedTag(tag === selectedTag ? null : tag); setShowTagSearch(false); setTagSearch(""); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                    selectedTag === tag
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  #{tag}
                  <span className="ml-1 text-xs opacity-60">{tagCounts[tag]}</span>
                </button>
              ))}
              {hasHiddenTags && (
                <button
                  onClick={() => setShowTagSearch(!showTagSearch)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                    showTagSearch
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  +{allTags.length - maxVisibleTags}개 더
                </button>
              )}
            </div>

            {/* 태그 검색 */}
            {showTagSearch && (
              <div className="relative">
                <input
                  type="text"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="태그 검색..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-gray-300"
                  autoFocus
                />
                {tagSearch && searchFilteredTags.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                    {searchFilteredTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag === selectedTag ? null : tag);
                          setTagSearch("");
                          setShowTagSearch(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          selectedTag === tag ? "text-indigo-700 font-medium" : "text-gray-700"
                        }`}
                      >
                        #{tag}
                        <span className="ml-2 text-xs text-gray-400">{tagCounts[tag]}개</span>
                      </button>
                    ))}
                  </div>
                )}
                {tagSearch && searchFilteredTags.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 px-3 py-2 text-sm text-gray-400">
                    일치하는 태그가 없습니다
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 아티클 리스트 (일자별 그룹) */}
        <div className="flex flex-col gap-5">
          {groupedByDate.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-400">{group.label}</h2>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-300">{group.articles.length}건</span>
              </div>
              <div className="flex flex-col gap-3">
                {group.articles.map((article) => (
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
