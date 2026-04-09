"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { generateOutput } from "@/lib/data";

interface OutputGeneratorProps {
  themeIds: string[];
  isOpen: boolean;
  onClose: () => void;
}

type OutputType = "brief" | "memo" | "analysis" | "digest";

export default function OutputGenerator({
  themeIds,
  isOpen,
  onClose,
}: OutputGeneratorProps) {
  const [outputType, setOutputType] = useState<OutputType>("brief");
  const [customPrompt, setCustomPrompt] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateOutput({
        themeIds,
        outputType,
        prompt: customPrompt || undefined,
        dateRange:
          startDate && endDate
            ? { start: startDate, end: endDate }
            : undefined,
      });
      setGeneratedContent(result.content);
    } catch (err) {
      console.error("출력 생성 실패:", err);
      setGeneratedContent("출력 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedContent) {
      navigator.clipboard.writeText(generatedContent);
      alert("복사되었습니다!");
    }
  };

  const handleClose = () => {
    setGeneratedContent(null);
    setCustomPrompt("");
    setStartDate("");
    setEndDate("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-w-lg mx-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="p-6 max-h-[90vh] overflow-y-auto">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">출력 생성</h1>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              {!generatedContent ? (
                <div className="space-y-6">
                  {/* 출력 타입 선택 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      출력 타입
                    </label>
                    <div className="space-y-2">
                      {(
                        [
                          "brief",
                          "memo",
                          "analysis",
                          "digest",
                        ] as OutputType[]
                      ).map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="outputType"
                            value={type}
                            checked={outputType === type}
                            onChange={(e) =>
                              setOutputType(e.target.value as OutputType)
                            }
                            className="w-4 h-4 text-indigo-600"
                          />
                          <span className="text-sm font-medium text-gray-900">
                            {type === "brief"
                              ? "브리핑"
                              : type === "memo"
                                ? "투자 메모"
                                : type === "analysis"
                                  ? "비교 분석"
                                  : "요약본"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 커스텀 프롬프트 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      커스텀 프롬프트 (선택)
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="추가로 포함할 지침을 입력하세요..."
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none"
                      rows={3}
                    />
                  </div>

                  {/* 날짜 범위 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      날짜 범위 (선택)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                        placeholder="시작일"
                      />
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                        placeholder="종료일"
                      />
                    </div>
                  </div>

                  {/* 생성 버튼 */}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGenerating && <span className="animate-spin">⏳</span>}
                    {isGenerating ? "생성 중..." : "생성하기"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 결과 표시 */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {generatedContent}
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex-1 px-4 py-2.5 text-sm font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                    >
                      복사
                    </button>
                    <button
                      onClick={() => setGeneratedContent(null)}
                      className="flex-1 px-4 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      다시 생성
                    </button>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full px-4 py-2.5 text-sm font-medium bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
