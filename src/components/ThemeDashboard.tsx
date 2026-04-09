"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Theme } from "@/lib/types";
import TagCloud from "./TagCloud";

interface ThemeDashboardProps {
  themes: Theme[];
  onGenerateOutput: (themeId: string, type: "research-note") => void;
  generatingFor?: string | null;
  completedThemeIds?: Set<string>;
  currentSection?: string;
  sectionProgress?: { current: number; total: number };
}

type WikiTypeFilter = "all" | "narrative" | "concept" | "company" | "tags";

const WIKI_TYPE_META: Record<
  string,
  { label: string; emoji: string; color: string; bgColor: string }
> = {
  narrative: {
    label: "내러티브",
    emoji: "📝",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 border-indigo-200",
  },
  concept: {
    label: "개념",
    emoji: "💡",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
  },
  company: {
    label: "기업",
    emoji: "🏢",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 border-emerald-200",
  },
};

export default function ThemeDashboard({
  themes,
  onGenerateOutput,
  generatingFor,
  completedThemeIds = new Set(),
  currentSection = "",
  sectionProgress = { current: 0, total: 0 },
}: ThemeDashboardProps) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<WikiTypeFilter>("all");

  // 아웃풋 완료된 테마 제외 (생성 중인 테마는 유지)
  const pendingThemes = themes.filter(
    (t) => !completedThemeIds.has(t.id) || t.id === generatingFor
  );

  const filteredThemes =
    typeFilter === "all" || typeFilter === "tags"
      ? pendingThemes
      : pendingThemes.filter((t) => (t.wikiType || "narrative") === typeFilter);

  const typeCounts = {
    all: pendingThemes.length,
    narrative: pendingThemes.filter(
      (t) => (t.wikiType || "narrative") === "narrative"
    ).length,
    concept: pendingThemes.filter((t) => t.wikiType === "concept").length,
    company: pendingThemes.filter((t) => t.wikiType === "company").length,
  };

  const getLastUpdatedLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    if (diff < 60) return `${diff}분 전`;
    if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
    if (diff < 10080) return `${Math.floor(diff / 1440)}일 전`;
    return date.toLocaleDateString("ko-KR");
  };

  const getWikiType = (theme: Theme): string => theme.wikiType || "narrative";

  const filters: { type: WikiTypeFilter; label: string; count?: number }[] = [
    { type: "all", label: "전체", count: typeCounts.all },
    { type: "narrative", label: "📝 내러티브", count: typeCounts.narrative },
    { type: "concept", label: "💡 개념", count: typeCounts.concept },
    { type: "company", label: "🏢 기업", count: typeCounts.company },
    { type: "tags", label: "🏷️ 태그" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900">
          위키 <span className="text-indigo-600">{pendingThemes.length}</span>
        </h1>
      </div>

      {/* 타입 필터 */}
      <div className="px-4 py-3 flex gap-2 border-b border-gray-200 overflow-x-auto">
        {filters.map((f) => {
          const isActive = typeFilter === f.type;
          return (
            <button
              key={f.type}
              onClick={() => setTypeFilter(f.type)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className="opacity-70 ml-1">{f.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 콘텐츠 */}
      {typeFilter === "tags" ? (
        <TagCloud />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {filteredThemes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-600 text-sm">
                아직 위키가 없습니다. 카드를 보관하면 자동으로 위키가 생성됩니다.
              </p>
            </div>
          ) : (
            filteredThemes.map((theme) => {
              const wt = getWikiType(theme);
              const meta = WIKI_TYPE_META[wt] || WIKI_TYPE_META.narrative;

              return (
                <div
                  key={theme.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/themes/${theme.id}`)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && router.push(`/themes/${theme.id}`)
                  }
                  className="w-full text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="text-lg mt-0.5">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900 leading-snug">
                            {theme.name}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
                          {theme.summary}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 flex-wrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border ${meta.bgColor} ${meta.color} font-medium`}
                    >
                      {meta.label}
                    </span>
                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                      신호 {theme.signalCount}개
                    </span>
                    <span>{getLastUpdatedLabel(theme.lastCompiled)}</span>
                  </div>

                  {generatingFor === theme.id ? (
                    <div className="w-full px-2.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-indigo-600 flex items-center gap-1.5">
                          <span className="animate-spin">⏳</span>
                          {currentSection || "준비 중..."}
                        </span>
                        {sectionProgress.total > 0 && (
                          <span className="text-xs text-indigo-400">
                            {sectionProgress.current}/{sectionProgress.total}
                          </span>
                        )}
                      </div>
                      {sectionProgress.total > 0 && (
                        <div className="w-full h-1 bg-indigo-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${(sectionProgress.current / sectionProgress.total) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateOutput(theme.id, "research-note");
                      }}
                      disabled={!!generatingFor}
                      className={`w-full px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        generatingFor
                          ? "border border-gray-200 text-gray-400 cursor-not-allowed"
                          : "border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      }`}
                    >
                      🔬 리서치 노트
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
