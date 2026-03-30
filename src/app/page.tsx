"use client";

import { useState, useEffect } from "react";
import CardStack from "@/components/CardStack";
import Navigation from "@/components/Navigation";
import { Article } from "@/lib/types";
import { fetchArticles } from "@/lib/data";

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArticles()
      .then(setArticles)
      .catch((err) => console.error("카드 로딩 실패:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="pt-6 pb-2 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          <span className="text-indigo-600">mn</span>emo
        </h1>
        <p className="text-xs text-gray-400 mt-1">스와이프로 지식을 큐레이션하세요</p>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-24">
        {loading ? (
          <p className="text-gray-400 text-sm">카드를 불러오는 중...</p>
        ) : (
          <CardStack
            initialArticles={articles}
            onArticlesChange={setArticles}
          />
        )}
      </main>

      <Navigation />
    </div>
  );
}
