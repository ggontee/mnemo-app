"use client";

import { useRef, useCallback, useState } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Article } from "@/lib/types";
import ArticleCard from "./ArticleCard";

interface SwipeCardProps {
  article: Article;
  onSwipe: (direction: "left" | "right") => void;
  isTop: boolean;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 120;

export default function SwipeCard({ article, onSwipe, isTop, disabled }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);
  const opacity = useTransform(x, [-300, -100, 0, 100, 300], [0.5, 1, 1, 1, 0.5]);

  const keepOpacity = useTransform(x, [0, 100, 200], [0, 0.5, 1]);
  const discardOpacity = useTransform(x, [-200, -100, 0], [1, 0.5, 0]);

  // 터치 방향 감지: "horizontal" | "vertical" | null
  const directionRef = useRef<"horizontal" | "vertical" | null>(null);
  const startTouchRef = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    directionRef.current = null;
    startTouchRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setScrollEnabled(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startTouchRef.current) return;
    if (directionRef.current) return; // 이미 방향 결정됨

    const dx = Math.abs(e.touches[0].clientX - startTouchRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - startTouchRef.current.y);

    // 최소 이동 거리(10px) 넘으면 방향 결정
    if (dx > 10 || dy > 10) {
      if (dx > dy) {
        directionRef.current = "horizontal";
        setScrollEnabled(false); // 가로 스와이프 → 스크롤 끄기
      } else {
        directionRef.current = "vertical";
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    directionRef.current = null;
    startTouchRef.current = null;
    setScrollEnabled(true);
  }, []);

  function handleDragEnd(_: unknown, info: PanInfo) {
    const offset = info.offset.x;
    if (offset > SWIPE_THRESHOLD) {
      onSwipe("right");
    } else if (offset < -SWIPE_THRESHOLD) {
      onSwipe("left");
    }
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        x,
        rotate,
        opacity,
        zIndex: isTop ? 10 : 0,
        cursor: isTop ? "grab" : "default",
        touchAction: "none",
      }}
      drag={isTop && !disabled ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      initial={{ scale: isTop ? 1 : 0.95, y: isTop ? 0 : 10 }}
      animate={{ scale: isTop ? 1 : 0.95, y: isTop ? 0 : 10 }}
      exit={{
        x: x.get() > 0 ? 400 : -400,
        opacity: 0,
        transition: { duration: 0.3 },
      }}
      whileDrag={{ cursor: "grabbing" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative w-full h-full bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Keep 오버레이 */}
        <motion.div
          className="absolute inset-0 bg-emerald-500/20 rounded-2xl z-10 pointer-events-none flex items-center justify-center"
          style={{ opacity: keepOpacity }}
        >
          <span className="text-emerald-600 font-bold text-3xl border-4 border-emerald-600 rounded-xl px-6 py-2 -rotate-12">
            KEEP
          </span>
        </motion.div>

        {/* Discard 오버레이 */}
        <motion.div
          className="absolute inset-0 bg-red-500/20 rounded-2xl z-10 pointer-events-none flex items-center justify-center"
          style={{ opacity: discardOpacity }}
        >
          <span className="text-red-600 font-bold text-3xl border-4 border-red-600 rounded-xl px-6 py-2 rotate-12">
            PASS
          </span>
        </motion.div>

        {/* 카드 콘텐츠 (세로 스크롤 + 가로 스와이프 공존) */}
        <div
          ref={scrollRef}
          className="h-full overscroll-contain"
          style={{
            overflowY: scrollEnabled ? "auto" : "hidden",
            touchAction: scrollEnabled ? "pan-y" : "none",
          }}
        >
          <ArticleCard article={article} />
        </div>
      </div>
    </motion.div>
  );
}
