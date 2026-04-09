"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Theme, Article } from "@/lib/types";
import { generateOutputStreaming } from "@/lib/data";
import MarkdownRenderer from "./MarkdownRenderer";
import ThemeMOC from "./ThemeMOC";

interface ThemeDetailProps {
  theme: Theme;
  cards: Article[];
  relatedThemes: Theme[];
  onClose: () => void;
  onCardSelect: (card: Article) => void;
}

export default function ThemeDetail({
  theme,
  cards,
  relatedThemes,
  onClose,
  onCardSelect,
}: ThemeDetailProps) {
  const router = useRouter();
  const [generatingType, setGeneratingType] = useState<
    "digest" | "research-note" | null
  >(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [currentSection, setCurrentSection] = useState<string>("");
  const [sectionProgress, setSectionProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const isStreaming = generatingType !== null;

  const handleGenerateOutput = async (
    type: "digest" | "research-note"
  ) => {
    setGeneratingType(type);
    setGeneratedContent(null);
    setStreamingContent("");
    setCurrentSection("");
    setSectionProgress({ current: 0, total: 0 });

    await generateOutputStreaming(
      { themeIds: [theme.id], outputType: type },
      {
        onStart: (totalSections) => {
          setSectionProgress({ current: 0, total: totalSections });
        },
        onSectionStart: (index, title) => {
          setCurrentSection(title);
          setSectionProgress((prev) => ({ ...prev, current: index + 1 }));
        },
        onChunk: (_index, text) => {
          setStreamingContent((prev) => prev + text);
        },
        onDone: (_id, content) => {
          setGeneratedContent(content);
          setStreamingContent("");
          setGeneratingType(null);
        },
        onError: (message) => {
          console.error("출력 생성 실패:", message);
          setGeneratedContent("출력 생성에 실패했습니다.");
          setGeneratingType(null);
        },
      }
    );
  };

  const getConfidenceIndicator = (signalCount: number) => {
    if (signalCount >= 10) return "🟢";
    if (signalCount >= 5) return "🟡";
    return "🔴";
  };

  const getSignalBadge = (signalType?: string) => {
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
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  const sortedCards = [...cards].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      <div className="max-w-lg mx-auto pb-24">
        <ThemeMOC themeId={theme.id} />
        {/* 헤더 */}
        <div className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ←
          </button>
          <span className="text-sm font-bold text-gray-900 truncate flex-1">
            {theme.name}
          </span>
        </div>

        <div className="px-5 pt-5 space-y-6">
          {/* 종합 판단 */}
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="flex items-start gap-3 mb-2">
              <span className="text-2xl">{getConfidenceIndicator(theme.signalCount)}</span>
              <div>
                <h2 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">
                  종합 판단
                </h2>
                <p className="text-base text-indigo-700 mt-1 leading-relaxed">
                  {theme.summary}
                </p>
              </div>
            </div>
          </div>

          {/* 신호 타임라인 */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              신호 ({cards.length})
            </h2>
            <div className="space-y-2">
              {sortedCards.map((card) => {
                const badge = getSignalBadge(card.signalType);
                return (
                  <button
                    key={card.id}
                    onClick={() => onCardSelect(card)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="pt-0.5">
                        <span className="text-xs text-gray-400">
                          {formatDate(card.createdAt)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                          {card.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {card.sourceName}
                        </p>
                      </div>
                      {badge && (
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badge.color}`}
                        >
                          {badge.text}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 열린 질문 */}
          {theme.openQuestions && theme.openQuestions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                열린 질문
              </h2>
              <div className="space-y-2">
                {theme.openQuestions.map((q: any, i: number) => {
                  const text = typeof q === "string" ? q : q?.question ?? "";
                  return (
                    <div
                      key={typeof q === "string" ? i : q?.id ?? i}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <p className="text-sm text-gray-700">{text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 관련 테마 */}
          {relatedThemes && relatedThemes.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                관련 테마
              </h2>
              <div className="flex flex-wrap gap-2">
                {relatedThemes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => router.push(`/themes/${t.id}`)}
                    className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 출력 생성 */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              출력 생성
            </h2>

            {/* 생성 버튼 — 콘텐츠가 없고 스트리밍 중이 아닐 때 */}
            {!generatedContent && !isStreaming && !streamingContent && (
              <button
                onClick={() => handleGenerateOutput("research-note")}
                className="w-full px-3 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                🔬 리서치 노트 생성
              </button>
            )}

            {/* 스트리밍 중 — 실시간 표시 */}
            {isStreaming && (
              <div className="space-y-3">
                {/* 진행 상태 */}
                {sectionProgress.total > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-indigo-600 flex items-center gap-1.5">
                        <span className="animate-spin">⏳</span>
                        {currentSection}
                      </span>
                      <span className="text-gray-400">
                        {sectionProgress.current}/{sectionProgress.total}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(sectionProgress.current / sectionProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 실시간 콘텐츠 */}
                {streamingContent && (
                  <div className="p-4 bg-white rounded-lg border border-gray-200">
                    <MarkdownRenderer content={streamingContent} />
                    <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-0.5" />
                  </div>
                )}
              </div>
            )}

            {/* 완성된 콘텐츠 */}
            {generatedContent && !isStreaming && (
              <div className="space-y-3">
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <MarkdownRenderer content={generatedContent} />
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedContent);
                    alert("복사되었습니다!");
                  }}
                  className="w-full px-3 py-2.5 text-sm font-medium bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  복사
                </button>
                <button
                  onClick={() => setGeneratedContent(null)}
                  className="w-full px-3 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  다시 생성
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
