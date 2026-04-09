"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ThemeDashboard from "@/components/ThemeDashboard";
import ThemeDetail from "@/components/ThemeDetail";
import ArticleDetail from "@/components/ArticleDetail";
import Navigation from "@/components/Navigation";
import { Theme, Article } from "@/lib/types";
import { fetchThemes, fetchThemeDetail, fetchArticles, generateOutputStreaming, fetchThemeIdsWithOutputs } from "@/lib/data";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default function ThemesPage() {
  const router = useRouter();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [selectedCard, setSelectedCard] = useState<Article | null>(null);
  const [themeCards, setThemeCards] = useState<Article[]>([]);
  const [relatedThemes, setRelatedThemes] = useState<Theme[]>([]);
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [completedThemeIds, setCompletedThemeIds] = useState<Set<string>>(new Set());

  // 아웃풋 생성 상태
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string>("");
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [currentSection, setCurrentSection] = useState<string>("");
  const [sectionProgress, setSectionProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [themesData, articlesData, outputThemeIds] = await Promise.all([
          fetchThemes(),
          fetchArticles(),
          fetchThemeIdsWithOutputs(),
        ]);
        setThemes(themesData);
        setAllArticles(articlesData);
        setCompletedThemeIds(new Set(outputThemeIds));
      } catch (err) {
        console.error("데이터 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleThemeSelect = useCallback(
    async (theme: Theme) => {
      try {
        const { theme: detailedTheme, cards } = await fetchThemeDetail(theme.id);
        setSelectedTheme(detailedTheme);
        setThemeCards(cards);

        const related = themes.filter((t) =>
          detailedTheme.relatedThemes.includes(t.id)
        );
        setRelatedThemes(related);
      } catch (err) {
        console.error("테마 상세 로딩 실패:", err);
      }
    },
    [themes]
  );

  const handleArticleUpdate = useCallback((updated: Article) => {
    setSelectedCard(null);
  }, []);

  const handleGenerateOutput = async (themeId: string, type: "research-note") => {
    setGeneratingFor(themeId);
    setGeneratingType("리서치 노트");
    setGeneratedContent(null);
    setStreamingContent("");
    setCurrentSection("");
    setSectionProgress({ current: 0, total: 0 });
    setIsStreaming(true);

    await generateOutputStreaming(
      { themeIds: [themeId], outputType: type },
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
        onSectionDone: () => {},
        onDone: (_id, content) => {
          setGeneratedContent(content);
          setStreamingContent("");
          setIsStreaming(false);
          setCompletedThemeIds((prev) => new Set([...prev, themeId]));
        },
        onError: (message) => {
          console.error("아웃풋 생성 실패:", message);
          setGeneratedContent("아웃풋 생성에 실패했습니다. 다시 시도해 주세요.");
          setIsStreaming(false);
        },
      }
    );
  };

  const closeOutputModal = () => {
    setGeneratingFor(null);
    setGeneratedContent(null);
    setGeneratingType("");
  };

  if (selectedCard) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ArticleDetail
          article={selectedCard}
          onClose={() => setSelectedCard(null)}
          onArticleUpdate={handleArticleUpdate}
        />
      </div>
    );
  }

  if (selectedTheme) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ThemeDetail
          theme={selectedTheme}
          cards={themeCards}
          relatedThemes={relatedThemes}
          onClose={() => setSelectedTheme(null)}
          onCardSelect={setSelectedCard}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="pt-6 pb-2 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          <span className="text-indigo-600">mn</span>emo
        </h1>
      </header>

      <main className="flex-1 pb-20">
        {loading ? (
          <p className="text-center text-gray-400 text-sm pt-20">불러오는 중...</p>
        ) : (
          <div className="max-w-md mx-auto">
            <ThemeDashboard
              themes={themes}
              onGenerateOutput={handleGenerateOutput}
              generatingFor={generatingFor}
              completedThemeIds={completedThemeIds}
              currentSection={currentSection}
              sectionProgress={sectionProgress}
            />
          </div>
        )}
      </main>

      <Navigation />

      {/* 아웃풋 생성 모달 */}
      <AnimatePresence>
        {generatingFor && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeOutputModal}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-[70] max-h-[80vh] bg-white rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">
                  {generatingType} 생성
                </h3>
                <button
                  onClick={closeOutputModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>

              {/* 모달 콘텐츠 */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {isStreaming && !streamingContent && !generatedContent ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="text-3xl animate-spin">⏳</div>
                    <p className="text-gray-500 text-sm">
                      {generatingType} 준비 중...
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 섹션 진행 표시 */}
                    {isStreaming && sectionProgress.total > 0 && (
                      <div className="mb-4 space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span className="font-medium text-indigo-600">
                            {currentSection}
                          </span>
                          <span>
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

                    {/* 콘텐츠 표시 */}
                    <div className="prose prose-sm max-w-none">
                      <MarkdownRenderer
                        content={generatedContent || streamingContent}
                      />
                      {isStreaming && (
                        <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-0.5" />
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 모달 하단 */}
              {generatedContent && !isStreaming && (
                <div className="px-5 py-3 border-t border-gray-200 flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedContent);
                    }}
                    className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    📋 복사
                  </button>
                  <button
                    onClick={() => {
                      closeOutputModal();
                      router.push("/kept");
                    }}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    📚 보관함에서 보기
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
