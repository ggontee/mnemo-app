"use client";

import { useState } from "react";
import { Article } from "@/lib/types";

interface RelatedCardsProps {
  relatedCards: Article[];
  themes: string[];
}

export default function RelatedCards({
  relatedCards,
  themes,
}: RelatedCardsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!relatedCards || relatedCards.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-between"
      >
        <span>관련 보관 카드 {relatedCards.length}개</span>
        <span className="text-xs">{isExpanded ? "▼" : "▶"}</span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {relatedCards.slice(0, 3).map((card) => (
            <div
              key={card.id}
              className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200"
            >
              <p className="text-sm text-gray-700 font-medium line-clamp-2">
                {card.title}
              </p>
              {themes && themes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {themes.map((theme) => (
                    <span
                      key={theme}
                      className="inline-block px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {relatedCards.length > 3 && (
            <p className="text-xs text-gray-500 px-3">
              +{relatedCards.length - 3}개 더...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
