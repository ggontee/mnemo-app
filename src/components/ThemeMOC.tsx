"use client";

import { useState, useEffect } from "react";

interface MOCData {
  themeId: string;
  cards: { id: string; title: string; tags: string[]; createdAt: string; status: string }[];
  outputs: { id: string; outputType: string; createdAt: string; deepDiveCount: number }[];
  relatedThemes: { id: string; name: string; sharedTags: string[] }[];
  topTags: string[];
}

const OUTPUT_TYPE_LABEL: Record<string, string> = {
  digest: "다이제스트",
  "research-note": "리서치 노트",
  // legacy
  brief: "브리핑",
  memo: "메모",
  analysis: "분석",
};

export default function ThemeMOC({ themeId }: { themeId: string }) {
  const [moc, setMoc] = useState<MOCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/themes/${themeId}/moc`)
      .then((r) => r.json())
      .then((data) => {
        setMoc(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [themeId]);

  if (loading) return null;
  if (!moc || (moc.cards.length === 0 && moc.outputs.length === 0)) return null;

  return (
    <div className="mx-4 mb-4 border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🗺️</span>
          <span className="text-sm font-semibold text-gray-800">
            Map of Content
          </span>
          <span className="text-xs text-gray-400">
            카드 {moc.cards.length} · 아웃풋 {moc.outputs.length} · 연결 {moc.relatedThemes.length}
          </span>
        </div>
        <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {/* 주요 태그 */}
          {moc.topTags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                주요 태그
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {moc.topTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 관련 테마 */}
          {moc.relatedThemes.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                연관 위키
              </h4>
              <div className="space-y-1.5">
                {moc.relatedThemes.map((rt) => (
                  <a
                    key={rt.id}
                    href={`/themes/${rt.id}`}
                    className="block px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {rt.name}
                    </span>
                    <div className="flex gap-1 mt-1">
                      {rt.sharedTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 아웃풋 목록 */}
          {moc.outputs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                생성된 아웃풋
              </h4>
              <div className="space-y-1">
                {moc.outputs.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-sm"
                  >
                    <span className="text-gray-700">
                      {OUTPUT_TYPE_LABEL[o.outputType] || o.outputType}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {o.deepDiveCount > 0 && (
                        <span className="text-indigo-500">
                          🔬 {o.deepDiveCount}
                        </span>
                      )}
                      <span>
                        {new Date(o.createdAt).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 최근 카드 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              최근 카드 (상위 5건)
            </h4>
            <div className="space-y-1">
              {moc.cards.slice(0, 5).map((card) => (
                <div
                  key={card.id}
                  className="px-3 py-2 rounded-lg bg-gray-50 text-sm"
                >
                  <span className="text-gray-800">{card.title}</span>
                  <div className="flex gap-1 mt-1">
                    {card.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-gray-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
