export interface AiQuestion {
  id: string;
  question: string;
  answer?: string;
  isLoading?: boolean;
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  soWhat?: string;
  keyPoints?: string[];
  implications: string[];
  tags: string[];
  sourceUrl: string;
  sourceName: string;
  sourceType?: "newsletter" | "video";
  createdAt: string;
  status: "pending" | "kept" | "discarded" | "deferred";
  rawContentRef?: string;
  userComment?: string;
  aiQuestions?: AiQuestion[];
  obsidianExported?: boolean;
  // v2 new fields
  themeIds?: string[];
  relatedCards?: string[];
  signalType?: "reinforcing" | "contradicting" | "new";
  deferredUntil?: string;
}

export interface Theme {
  id: string;
  name: string;
  summary: string;
  cardIds: string[];
  openQuestions: string[];
  relatedThemes: string[];
  wikiPath: string;
  lastCompiled: string;
  signalCount: number;
  status: "active" | "dormant" | "archived";
  wikiType?: "narrative" | "concept" | "company";
  thesis?: string;
}

export interface DeepDiveEntry {
  id: string;
  question: string;
  answer?: string;
  sources?: string[];
  createdAt: string;
  isLoading?: boolean;
}

export interface WikiOutput {
  id: string;
  themeIds: string[];
  outputType: "digest" | "research-note";
  content: string;
  createdAt: string;
  prompt?: string;
  deepDives?: DeepDiveEntry[];
  status?: "generating" | "complete";
}

export interface LintReport {
  id: string;
  createdAt: string;
  dormantThemes: string[];
  unresolvedConflicts: number;
  answerableQuestions: { themeId: string; question: string; suggestedCardId: string }[];
  newConnections: { from: string; to: string; reason: string }[];
  staleThemes: string[];
}
