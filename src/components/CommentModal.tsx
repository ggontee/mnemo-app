"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Article } from "@/lib/types";

interface CommentModalProps {
  article: Article | null;
  isOpen: boolean;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export default function CommentModal({
  article,
  isOpen,
  onConfirm,
  onCancel,
}: CommentModalProps) {
  const [comment, setComment] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setComment("");
      // 약간의 딜레이 후 포커스 (애니메이션 완료 후)
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm(comment.trim());
    setComment("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && article && (
        <>
          {/* 배경 딤 */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />

          {/* 바텀시트 */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[70] shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="max-w-md mx-auto px-5 pt-4 pb-8" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))" }}>
              {/* 핸들 바 */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

              {/* 카드 미니 프리뷰 */}
              <div className="flex items-start gap-3 mb-4 p-3 bg-emerald-50 rounded-xl">
                <span className="text-emerald-500 text-xl mt-0.5">♥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {article.title}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {article.sourceName}
                  </p>
                </div>
              </div>

              {/* 코멘트 입력 */}
              <label className="block text-sm font-medium text-gray-500 mb-2">
                메모를 남겨보세요 (선택)
              </label>
              <textarea
                ref={inputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="이 아티클에 대한 생각, 관련 프로젝트, 활용 아이디어..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                rows={3}
                maxLength={500}
              />
              <p className="text-right text-xs text-gray-300 mt-1">
                {comment.length}/500
              </p>

              {/* 액션 버튼 */}
              <div className="flex gap-3 mt-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 text-base font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3 text-base font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  {comment.trim() ? "메모와 함께 보관" : "바로 보관"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
