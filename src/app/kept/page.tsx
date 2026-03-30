"use client";

import { useState, useEffect, useCallback } from "react";
import KeptList from "@/components/KeptList";
import Navigation from "@/components/Navigation";
import { Article } from "@/lib/types";
import { fetchArticles } from "@/lib/data";

export default function KeptPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArticles()
      .then(setArticles)
      .catch((err) => console.error("카드 로딩 실패:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleArticleUpdate = useCallback((updated: Article) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  }, []);

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
          <KeptList articles={articles} onArticleUpdate={handleArticleUpdate} />
        )}
      </main>

      <Navigation />
    </div>
  );
}
