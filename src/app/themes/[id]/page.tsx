"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ThemeDetail from "@/components/ThemeDetail";
import ArticleDetail from "@/components/ArticleDetail";
import Navigation from "@/components/Navigation";
import { Theme, Article } from "@/lib/types";
import { fetchThemeDetail, fetchThemes, fetchArticles } from "@/lib/data";

export default function ThemeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const themeId = params.id as string;

  const [theme, setTheme] = useState<Theme | null>(null);
  const [cards, setCards] = useState<Article[]>([]);
  const [relatedThemes, setRelatedThemes] = useState<Theme[]>([]);
  const [selectedCard, setSelectedCard] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [detailedData, themesData] = await Promise.all([
          fetchThemeDetail(themeId),
          fetchThemes(),
        ]);

        setTheme(detailedData.theme);
        setCards(detailedData.cards);

        // 관련 테마 찾기
        const related = themesData.filter((t) =>
          detailedData.theme.relatedThemes.includes(t.id)
        );
        setRelatedThemes(related);
      } catch (err) {
        console.error("테마 상세 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [themeId]);

  const handleArticleUpdate = useCallback((updated: Article) => {
    setSelectedCard(null);
    setCards((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  }, []);

  const handleClose = () => {
    router.back();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-400 text-sm mb-4">테마를 찾을 수 없습니다.</p>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ThemeDetail
        theme={theme}
        cards={cards}
        relatedThemes={relatedThemes}
        onClose={handleClose}
        onCardSelect={setSelectedCard}
      />
    </div>
  );
}
