export interface AiQuestion {
  id: string;
  question: string;
  answer?: string;       // AI 리서치 결과 (클릭 시 생성)
  isLoading?: boolean;   // 리서치 진행 중
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  soWhat?: string;
  keyPoints?: string[];
  implications: string[];  // 하위호환 (기존 카드) + keyPoints 미러
  tags: string[];
  sourceUrl: string;
  sourceName: string;
  sourceType?: "newsletter" | "video";
  createdAt: string;
  status: "pending" | "kept" | "discarded";
  rawContentRef?: string;

  // 새 필드: 사용자 코멘트 & AI 생성 질문
  userComment?: string;
  aiQuestions?: AiQuestion[];
  obsidianExported?: boolean;
}
