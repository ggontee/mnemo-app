"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Article, AiQuestion } from "@/lib/types";
import { fetchResearch, addCustomQuestion } from "@/lib/data";

interface ArticleDetailProps {
  article: Article;
  onClose: () => void;
  onArticleUpdate: (updated: Article) => void;
}

export default function ArticleDetail({
  article,
  onClose,
  onArticleUpdate,
}: ArticleDetailProps) {
  const [loadingQuestionId, setLoadingQuestionId] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState("");
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  const handleAddQuestion = async () => {
    if (!customQuestion.trim() || isAddingQuestion) return;

    setIsAddingQuestion(true);
    try {
      const updated = await addCustomQuestion(article.id, customQuestion.trim());
      onArticleUpdate(updated);
      setCustomQuestion("");
    } catch (err) {
      console.error("질문 추가 실패:", err);
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const handleQuestionClick = async (q: AiQuestion) => {
    // 이미 답변이 있으면 토글만
    if (q.answer) return;

    setLoadingQuestionId(q.id);
    try {
      const result = await fetchResearch(article.id, q.id);
      // 로컬 상태 업데이트
      const updatedQuestions = article.aiQuestions?.map((aq) =>
        aq.id === q.id ? { ...aq, answer: result.answer } : aq
      );
      onArticleUpdate({ ...article, aiQuestions: updatedQuestions });
    } catch (err) {
      console.error("리서치 실패:", err);
    } finally {
      setLoadingQuestionId(null);
    }
  };

  const sourceTypeLabel =
    article.sourceType === "video" ? "▶ Video" : "✉ Newsletter";
  const sourceTypeColor =
    article.sourceType === "video"
      ? "bg-red-100 text-red-700"
      : "bg-blue-100 text-blue-700";

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      <div className="max-w-lg mx-auto pb-24">
        {/* 헤더 */}
        <div className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ←
          </button>
          <span className="text-sm font-medium text-gray-900 truncate flex-1">
            {article.title}
          </span>
        </div>

        <div className="px-5 pt-5 space-y-6">
          {/* 소스 정보 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${sourceTypeColor}`}>
              {sourceTypeLabel}
            </span>
            <span className="text-sm text-gray-500">{article.sourceName}</span>
            <span className="text-sm text-gray-300">|</span>
            <span className="text-sm text-gray-400">{article.createdAt}</span>
          </div>

          {/* 제목 */}
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">
            {article.title}
          </h1>

          {/* 원본 URL */}
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-3 bg-indigo-50 rounded-xl text-base text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <span className="text-lg">🔗</span>
            <span className="font-medium">원본 보기</span>
            <span className="text-sm text-indigo-400 truncate flex-1 text-right">
              {article.sourceUrl.replace(/^https?:\/\//, "").slice(0, 40)}...
            </span>
          </a>

          {/* 요약 */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Summary
            </h2>
            <p className="text-base text-gray-700 leading-relaxed">{article.summary}</p>
          </div>

          {/* So What */}
          {article.soWhat && (
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <h2 className="text-sm font-semibold text-indigo-500 uppercase tracking-wider mb-1">
                So What?
              </h2>
              <p className="text-base font-medium text-indigo-700">{article.soWhat}</p>
            </div>
          )}

          {/* Key Points / Implications */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {article.keyPoints ? "Key Points" : "Implications"}
            </h2>
            <div className="space-y-2.5">
              {(article.keyPoints || article.implications).map((point, i) => (
                <div key={i} className="flex gap-2 text-base text-gray-700 leading-relaxed">
                  <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 사용자 코멘트 */}
          {article.userComment && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-2">
                내 메모
              </h2>
              <p className="text-base text-gray-700">{article.userComment}</p>
            </div>
          )}

          {/* 태그 */}
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 text-sm font-medium bg-gray-100 text-gray-600 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>

          {/* AI 예상 질문 & 리서치 */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              🧠 Deep Dive
            </h2>
            <p className="text-sm text-gray-400 mb-3">
              질문을 탭하면 AI가 리서치 결과를 생성합니다
            </p>

            {article.aiQuestions && article.aiQuestions.length > 0 && (
              <div className="space-y-3 mb-4">
                {article.aiQuestions.map((q) => (
                  <QuestionItem
                    key={q.id}
                    question={q}
                    isLoading={loadingQuestionId === q.id}
                    onClick={() => handleQuestionClick(q)}
                  />
                ))}
              </div>
            )}

            {/* 사용자 직접 질문 입력 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddQuestion();
                  }
                }}
                placeholder="궁금한 점을 직접 입력하세요..."
                className="flex-1 px-4 py-2.5 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-gray-300"
                disabled={isAddingQuestion}
              />
              <button
                onClick={handleAddQuestion}
                disabled={!customQuestion.trim() || isAddingQuestion}
                className="px-4 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {isAddingQuestion ? "..." : "추가"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// 개별 질문 아이템 컴포넌트
function QuestionItem({
  question,
  isLoading,
  onClick,
}: {
  question: AiQuestion;
  isLoading: boolean;
  onClick: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasAnswer = !!question.answer;

  const handleClick = () => {
    if (hasAnswer) {
      setIsExpanded(!isExpanded);
    } else {
      onClick();
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        <span className="text-base mt-0.5 shrink-0">
          {isLoading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : hasAnswer ? (
            isExpanded ? "▼" : "▶"
          ) : (
            "💡"
          )}
        </span>
        <span className="text-base text-gray-800 leading-snug flex-1">
          {question.question}
        </span>
        {!hasAnswer && !isLoading && (
          <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0 mt-0.5">
            리서치
          </span>
        )}
      </button>

      <AnimatePresence>
        {hasAnswer && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-gray-100">
              <div className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                {question.answer}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
