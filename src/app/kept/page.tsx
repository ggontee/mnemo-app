"use client";

import { useState, useEffect, useCallback } from "react";
import KeptList from "@/components/KeptList";
import OutputLibrary from "@/components/OutputLibrary";
import Navigation from "@/components/Navigation";
import { Article, WikiOutput, Theme } from "@/lib/types";
import { fetchArticles, fetchThemes } from "@/lib/data";

type LibraryTab = "outputs" | "cards";

export default function KeptPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [outputs, setOutputs] = useState<WikiOutput[]>([]);
  const [themeMap, setThemeMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<LibraryTab>("outputs");

  useEffect(() => {
    Promise.all([
      fetchArticles().catch(() => []),
      fetch("/api/outputs").then(r => r.json()).catch(() => []),
      fetchThemes().catch(() => []),
    ])
      .then(([arts, outs, themes]: [Article[], WikiOutput[], Theme[]]) => {
        setArticles(arts);
        setOutputs(outs);
        const map: Record<string, string> = {};
        for (const t of themes) {
          map[t.id] = t.name;
        }
        setThemeMap(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleArticleUpdate = useCallback((updated: Article) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  }, []);

  const handleDeleteOutput = useCallback(async (id: string) => {
    try {
      await fetch("/api/outputs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setOutputs((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      console.error("Failed to delete output:", err);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="pt-6 pb-2 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          <span className="text-indigo-600">mn</span>emo
        </h1>
      </header>

      {/* Tab switcher */}
      <div className="px-4 py-3 flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("outputs")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "outputs"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          📄 아웃풋 {outputs.length > 0 && <span className="opacity-70">{outputs.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab("cards")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "cards"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🃏 보관 카드
        </button>
      </div>

      <main className="flex-1 pb-20">
        {loading ? (
          <p className="text-center text-gray-400 text-sm pt-20">불러오는 중...</p>
        ) : activeTab === "outputs" ? (
          <OutputLibrary outputs={outputs} onDelete={handleDeleteOutput} themeMap={themeMap} />
        ) : (
          <KeptList articles={articles} onArticleUpdate={handleArticleUpdate} />
        )}
      </main>

      <Navigation />
    </div>
  );
}
