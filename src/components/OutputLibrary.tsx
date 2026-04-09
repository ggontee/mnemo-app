"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { WikiOutput, DeepDiveEntry } from "@/lib/types";
import { fetchOutputResearch } from "@/lib/data";
import MarkdownRenderer from "./MarkdownRenderer";

interface OutputLibraryProps {
  outputs: WikiOutput[];
  onDelete: (id: string) => void;
  themeMap?: Record<string, string>; // themeId → theme name
}

const OUTPUT_TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  digest: { label: "다이제스트", emoji: "📰", color: "bg-orange-50 text-orange-700 border-orange-200" },
  "research-note": { label: "리서치 노트", emoji: "🔬", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  // legacy types (하위 호환)
  brief: { label: "브리핑", emoji: "📋", color: "bg-blue-50 text-blue-700 border-blue-200" },
  memo: { label: "메모", emoji: "📝", color: "bg-purple-50 text-purple-700 border-purple-200" },
  analysis: { label: "분석", emoji: "📊", color: "bg-green-50 text-green-700 border-green-200" },
};

function DeepDiveItem({
  entry,
  outputId,
}: {
  entry: DeepDiveEntry;
  outputId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const handleSaveAsCard = async () => {
    if (saveState !== "idle") return;
    setSaveState("saving");

    try {
      const res = await fetch("/api/output-research/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId, deepDiveId: entry.id }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSaveState("saved");
    } catch (err) {
      console.error("카드 저장 실패:", err);
      setSaveState("idle");
    }
  };

  return (
    <div className="border border-indigo-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 bg-indigo-50/50 hover:bg-indigo-50 transition-colors flex items-start gap-2"
      >
        <span className="text-indigo-500 mt-0.5 text-sm shrink-0">
          {isOpen ? "▾" : "▸"}
        </span>
        <span className="text-sm font-medium text-indigo-900 flex-1">
          {entry.question}
        </span>
        {saveState === "saved" && (
          <span className="text-xs text-green-600 shrink-0">✓ 카드 저장됨</span>
        )}
      </button>
      {isOpen && entry.answer && (
        <div className="px-3 py-2 text-sm border-t border-indigo-100 bg-white">
          <MarkdownRenderer content={entry.answer} className="text-sm" />
          {entry.sources && entry.sources.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400">참고:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.sources.map((url, i) => {
                  try {
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-500 hover:underline truncate max-w-[200px]"
                      >
                        {new URL(url).hostname}
                      </a>
                    );
                  } catch {
                    return null;
                  }
                })}
              </div>
            </div>
          )}
          {/* 카드로 저장 버튼 */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSaveAsCard}
              disabled={saveState !== "idle"}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                saveState === "saved"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : saveState === "saving"
                  ? "bg-gray-100 text-gray-400 border border-gray-200"
                  : "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
              }`}
            >
              {saveState === "saved"
                ? "✓ 보관함에 저장됨"
                : saveState === "saving"
                ? "저장 중..."
                : "📌 카드로 저장"}
            </button>
          </div>
        </div>
      )}
      {isOpen && entry.isLoading && (
        <div className="px-3 py-3 flex items-center gap-2 border-t border-indigo-100">
          <div className="animate-spin w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
          <span className="text-xs text-gray-500">웹 검색 + AI 분석 중...</span>
        </div>
      )}
    </div>
  );
}

function DeepDiveSection({
  output,
  onDeepDiveAdded,
}: {
  output: WikiOutput;
  onDeepDiveAdded: (outputId: string, entry: DeepDiveEntry) => void;
}) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const deepDives = output.deepDives || [];

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || isLoading) return;

    const q = question.trim();
    setQuestion("");
    setIsLoading(true);

    // 임시 로딩 엔트리
    const tempEntry: DeepDiveEntry = {
      id: `temp_${Date.now()}`,
      question: q,
      createdAt: new Date().toISOString(),
      isLoading: true,
    };
    onDeepDiveAdded(output.id, tempEntry);

    try {
      const result = await fetchOutputResearch(output.id, q);
      // 로딩 엔트리를 실제 결과로 교체
      onDeepDiveAdded(output.id, { ...result.deepDive, isLoading: false });
    } catch (err) {
      console.error("딥다이브 실패:", err);
      onDeepDiveAdded(output.id, {
        ...tempEntry,
        isLoading: false,
        answer: "딥다이브 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [question, isLoading, output.id, onDeepDiveAdded]);

  return (
    <div className="border-t border-gray-100 bg-gray-50/50">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">🔬</span>
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Deep Dive
          </h4>
          <span className="text-xs text-gray-400">웹 검색 + Opus 4.6</span>
        </div>

        {/* 기존 딥다이브 목록 */}
        {deepDives.length > 0 && (
          <div className="space-y-2 mb-3">
            {deepDives.map((entry) => (
              <DeepDiveItem key={entry.id} entry={entry} outputId={output.id} />
            ))}
          </div>
        )}

        {/* 질문 입력 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="이 문서에 대해 더 알고 싶은 것은?"
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50 bg-white"
          />
          <button
            onClick={handleSubmit}
            disabled={!question.trim() || isLoading}
            className="px-4 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isLoading ? "분석 중..." : "질문"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OutputLibrary({ outputs, onDelete, themeMap = {} }: OutputLibraryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localOutputs, setLocalOutputs] = useState<WikiOutput[]>(outputs);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // outputs prop 변경 시 동기화
  if (outputs !== localOutputs && outputs.length !== localOutputs.length) {
    setLocalOutputs(outputs);
  }

  // 생성 중인 아웃풋이 있으면 5초마다 폴링
  const hasGenerating = localOutputs.some((o) => o.status === "generating");

  useEffect(() => {
    if (!hasGenerating) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/outputs");
        if (res.ok) {
          const fresh: WikiOutput[] = await res.json();
          setLocalOutputs(fresh);
        }
      } catch {}
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasGenerating]);

  const handleDeepDiveAdded = useCallback(
    (outputId: string, entry: DeepDiveEntry) => {
      setLocalOutputs((prev) =>
        prev.map((o) => {
          if (o.id !== outputId) return o;
          const existing = o.deepDives || [];

          // temp 엔트리를 실제 결과로 교체
          if (entry.id.startsWith("temp_")) {
            return { ...o, deepDives: [...existing, entry] };
          }

          // 로딩 완료된 결과: temp 엔트리 교체
          const updated = existing.filter(
            (d) => !(d.isLoading && d.question === entry.question)
          );
          return { ...o, deepDives: [...updated, entry] };
        })
      );
    },
    []
  );

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    if (diff < 60) return `${diff}분 전`;
    if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
    if (diff < 10080) return `${Math.floor(diff / 1440)}일 전`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  const extractTitle = (content: string): string => {
    const headingMatch = content.match(/^#{1,2}\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].trim();
    const firstLine = content.split("\n").find((l) => l.trim().length > 0);
    return firstLine?.trim().substring(0, 60) || "제목 없음";
  };

  const getPreview = (content: string) => {
    const lines = content
      .split("\n")
      .filter(
        (l) =>
          l.trim() &&
          !l.startsWith("#") &&
          !l.startsWith(">") &&
          !l.startsWith("---") &&
          !l.startsWith("- ")
      );
    return lines.slice(0, 2).join(" ").substring(0, 150);
  };

  if (localOutputs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <div className="text-4xl mb-3">📄</div>
        <p className="text-gray-600 text-sm mb-1">아직 생성된 아웃풋이 없습니다</p>
        <p className="text-gray-400 text-xs">Wiki 탭에서 리서치 노트를 생성해보세요</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-3">
      {localOutputs.map((output) => {
        const meta = OUTPUT_TYPE_META[output.outputType] || OUTPUT_TYPE_META["research-note"];
        const isExpanded = expandedId === output.id;
        const isCopied = copiedId === output.id;
        const diveCount = output.deepDives?.length || 0;
        const isGenerating = output.status === "generating";

        return (
          <div
            key={output.id}
            className={`bg-white rounded-xl border overflow-hidden ${
              isGenerating ? "border-indigo-300 shadow-sm shadow-indigo-100" : "border-gray-200"
            }`}
          >
            {/* 생성 중 상태 */}
            {isGenerating ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded border ${meta.color}`}>
                    {meta.emoji} {meta.label}
                  </span>
                  {output.themeIds
                    .map((tid) => themeMap[tid])
                    .filter(Boolean)
                    .map((name, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600"
                      >
                        {name}
                      </span>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
                  <span className="text-sm text-indigo-600 font-medium">생성 중...</span>
                </div>
                <div className="mt-2 w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            ) : (
            /* Header — 완성된 카드 */
            <button
              onClick={() => setExpandedId(isExpanded ? null : output.id)}
              className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
            >
              {/* 제목 */}
              <h3 className="font-bold text-gray-900 text-[15px] leading-snug mb-1.5">
                {extractTitle(output.content)}
              </h3>

              {/* 요약 프리뷰 */}
              {!isExpanded && (
                <p className="text-sm text-gray-500 line-clamp-2 mb-3 leading-relaxed">
                  {getPreview(output.content)}
                </p>
              )}

              {/* 메타 정보 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 text-xs font-medium rounded border ${meta.color}`}>
                  {meta.emoji} {meta.label}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDate(output.createdAt)}
                </span>
                {diveCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                    🔬 딥다이브 {diveCount}
                  </span>
                )}
                {/* 관련 테마 태그 */}
                {output.themeIds
                  .map((tid) => themeMap[tid])
                  .filter(Boolean)
                  .map((name, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600"
                    >
                      {name}
                    </span>
                  ))}
              </div>
            </button>
            )}

            {/* Expanded content */}
            {isExpanded && !isGenerating && (
              <div className="border-t border-gray-100">
                {/* Content */}
                <div className="p-4 max-h-96 overflow-y-auto">
                  <MarkdownRenderer content={output.content} />
                </div>

                {/* Deep Dive Section */}
                <DeepDiveSection
                  output={output}
                  onDeepDiveAdded={handleDeepDiveAdded}
                />

                {/* Action bar */}
                <div className="flex items-center gap-2 p-3 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={() => handleCopy(output.content, output.id)}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      isCopied
                        ? "bg-green-100 text-green-700"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {isCopied ? "✓ 복사됨" : "📋 복사"}
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([output.content], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${output.outputType}-${output.createdAt.split("T")[0]}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    💾 저장
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("이 아웃풋을 삭제하시겠습니까?")) {
                        onDelete(output.id);
                      }
                    }}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    🗑
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
