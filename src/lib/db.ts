import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Article, Theme, WikiOutput, LintReport } from './types';

let dbInstance: Database.Database | null = null;
const SQL_PATH = path.join(process.cwd(), 'data', 'mnemo.db');
const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initDb(): Database.Database {
  if (dbInstance) return dbInstance;

  ensureDataDir();

  const db = new Database(SQL_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    soWhat TEXT,
    keyPoints TEXT,
    implications TEXT,
    tags TEXT,
    sourceUrl TEXT NOT NULL DEFAULT '',
    sourceName TEXT NOT NULL DEFAULT '',
    sourceType TEXT,
    createdAt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    rawContentRef TEXT,
    userComment TEXT,
    aiQuestions TEXT,
    obsidianExported INTEGER DEFAULT 0,
    themeIds TEXT,
    relatedCards TEXT,
    signalType TEXT,
    deferredUntil TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    cardIds TEXT,
    openQuestions TEXT,
    relatedThemes TEXT,
    wikiPath TEXT NOT NULL DEFAULT '',
    lastCompiled TEXT NOT NULL DEFAULT '',
    signalCount INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    wikiType TEXT DEFAULT 'narrative',
    thesis TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS card_themes (
    cardId TEXT NOT NULL,
    themeId TEXT NOT NULL,
    signalType TEXT,
    PRIMARY KEY (cardId, themeId)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS wiki_outputs (
    id TEXT PRIMARY KEY,
    themeIds TEXT,
    outputType TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT '',
    prompt TEXT
  )`);

  // Migration: add deepDives and status columns if missing
  try {
    const columns = db.pragma('table_info(wiki_outputs)') as { name: string }[];
    const colNames = columns.map((c) => c.name);
    if (!colNames.includes('deepDives')) {
      db.exec("ALTER TABLE wiki_outputs ADD COLUMN deepDives TEXT");
    }
    if (!colNames.includes('status')) {
      db.exec("ALTER TABLE wiki_outputs ADD COLUMN status TEXT DEFAULT 'complete'");
    }
  } catch (e) {
    console.error('[db] Migration check failed:', e);
  }

  // Migration: convert legacy output types to new 2-type system
  try {
    db.exec("UPDATE wiki_outputs SET outputType = 'research-note' WHERE outputType IN ('brief', 'memo', 'analysis')");
  } catch (e) {
    console.error('[db] Output type migration failed:', e);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS lint_reports (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL DEFAULT '',
    dormantThemes TEXT,
    unresolvedConflicts INTEGER DEFAULT 0,
    answerableQuestions TEXT,
    newConnections TEXT,
    staleThemes TEXT
  )`);

  dbInstance = db;
  return db;
}

// --- Card operations ---

export async function getAllCards(): Promise<Article[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM cards ORDER BY createdAt DESC').all() as Record<string, any>[];
  return rows.map(rowToArticle);
}

export async function getCardsByStatus(status: string): Promise<Article[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM cards WHERE status = ? ORDER BY createdAt DESC').all(status) as Record<string, any>[];
  return rows.map(rowToArticle);
}

export async function getCardById(id: string): Promise<Article | null> {
  const db = initDb();
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as Record<string, any> | undefined;
  return row ? rowToArticle(row) : null;
}

export async function getCardsByTheme(themeId: string): Promise<Article[]> {
  const db = initDb();
  // First try junction table
  let rows = db.prepare(
    'SELECT c.* FROM cards c JOIN card_themes ct ON c.id = ct.cardId WHERE ct.themeId = ? ORDER BY c.createdAt DESC'
  ).all(themeId) as Record<string, any>[];
  // Fallback: search themeIds JSON field
  if (rows.length === 0) {
    const allRows = db.prepare('SELECT * FROM cards WHERE themeIds IS NOT NULL ORDER BY createdAt DESC').all() as Record<string, any>[];
    rows = allRows.filter(r => {
      const ids = safeJsonParse(r.themeIds, []);
      return Array.isArray(ids) && ids.includes(themeId);
    });
  }
  return rows.map(rowToArticle);
}

export async function upsertCard(card: Article): Promise<void> {
  const db = initDb();
  db.prepare(
    `INSERT OR REPLACE INTO cards
     (id, title, summary, soWhat, keyPoints, implications, tags,
      sourceUrl, sourceName, sourceType, createdAt, status,
      rawContentRef, userComment, aiQuestions, obsidianExported,
      themeIds, relatedCards, signalType, deferredUntil)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    card.id,
    card.title,
    card.summary,
    card.soWhat || null,
    JSON.stringify(card.keyPoints || []),
    JSON.stringify(card.implications || []),
    JSON.stringify(card.tags || []),
    card.sourceUrl,
    card.sourceName,
    card.sourceType || null,
    card.createdAt,
    card.status,
    card.rawContentRef || null,
    card.userComment || null,
    JSON.stringify(card.aiQuestions || []),
    card.obsidianExported ? 1 : 0,
    JSON.stringify(card.themeIds || []),
    JSON.stringify(card.relatedCards || []),
    card.signalType || null,
    card.deferredUntil || null,
  );
}

export async function updateCardStatus(id: string, status: string): Promise<void> {
  const db = initDb();
  db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(status, id);
}

// --- Theme operations ---

export async function getAllThemes(): Promise<Theme[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM themes ORDER BY lastCompiled DESC').all() as Record<string, any>[];
  return rows.map(rowToTheme);
}

export async function getThemeById(id: string): Promise<Theme | null> {
  const db = initDb();
  const row = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as Record<string, any> | undefined;
  return row ? rowToTheme(row) : null;
}

export async function getThemesByStatus(status: string): Promise<Theme[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM themes WHERE status = ?').all(status) as Record<string, any>[];
  return rows.map(rowToTheme);
}

export async function upsertTheme(theme: Theme): Promise<void> {
  const db = initDb();
  db.prepare(
    `INSERT OR REPLACE INTO themes
     (id, name, summary, cardIds, openQuestions, relatedThemes,
      wikiPath, lastCompiled, signalCount, status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    theme.id,
    theme.name,
    theme.summary,
    JSON.stringify(theme.cardIds || []),
    JSON.stringify(theme.openQuestions || []),
    JSON.stringify(theme.relatedThemes || []),
    theme.wikiPath,
    theme.lastCompiled,
    theme.signalCount,
    theme.status,
  );
}

export async function getThemeCards(themeId: string): Promise<Article[]> {
  // Also try using the theme's cardIds list
  const theme = await getThemeById(themeId);
  if (theme && theme.cardIds.length > 0) {
    const db = initDb();
    const placeholders = theme.cardIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM cards WHERE id IN (${placeholders}) ORDER BY createdAt DESC`).all(...theme.cardIds) as Record<string, any>[];
    if (rows.length > 0) return rows.map(rowToArticle);
  }
  return getCardsByTheme(themeId);
}

// --- WikiOutput operations ---

export async function saveOutput(output: WikiOutput): Promise<void> {
  const db = initDb();
  db.prepare(
    `INSERT OR REPLACE INTO wiki_outputs (id, themeIds, outputType, content, createdAt, prompt, deepDives, status)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    output.id,
    JSON.stringify(output.themeIds || []),
    output.outputType,
    output.content,
    output.createdAt,
    output.prompt || null,
    JSON.stringify(output.deepDives || []),
    output.status || 'complete',
  );
}

export async function updateOutputStatus(id: string, status: string, content?: string): Promise<void> {
  const db = initDb();
  if (content !== undefined) {
    db.prepare('UPDATE wiki_outputs SET status = ?, content = ? WHERE id = ?').run(status, content, id);
  } else {
    db.prepare('UPDATE wiki_outputs SET status = ? WHERE id = ?').run(status, id);
  }
}

export async function getOutputsByTheme(themeId: string): Promise<WikiOutput[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM wiki_outputs ORDER BY createdAt DESC').all() as Record<string, any>[];
  return rows.map(rowToWikiOutput).filter((o) => o.themeIds.includes(themeId));
}

export async function getAllOutputs(): Promise<WikiOutput[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM wiki_outputs ORDER BY createdAt DESC').all() as Record<string, any>[];
  return rows.map(rowToWikiOutput);
}

export async function getOutputById(id: string): Promise<WikiOutput | null> {
  const db = initDb();
  const row = db.prepare('SELECT * FROM wiki_outputs WHERE id = ?').get(id) as Record<string, any> | undefined;
  return row ? rowToWikiOutput(row) : null;
}

export async function deleteOutput(id: string): Promise<void> {
  const db = initDb();
  db.prepare('DELETE FROM wiki_outputs WHERE id = ?').run(id);
}

export async function updateOutputDeepDives(id: string, deepDives: WikiOutput['deepDives']): Promise<void> {
  const db = initDb();
  db.prepare('UPDATE wiki_outputs SET deepDives = ? WHERE id = ?').run(JSON.stringify(deepDives || []), id);
}

// --- LintReport operations ---

export async function saveLintReport(report: LintReport): Promise<void> {
  const db = initDb();
  db.prepare(
    `INSERT OR REPLACE INTO lint_reports
     (id, createdAt, dormantThemes, unresolvedConflicts, answerableQuestions, newConnections, staleThemes)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    report.id,
    report.createdAt,
    JSON.stringify(report.dormantThemes || []),
    report.unresolvedConflicts,
    JSON.stringify(report.answerableQuestions || []),
    JSON.stringify(report.newConnections || []),
    JSON.stringify(report.staleThemes || []),
  );
}

export async function getLatestLintReport(): Promise<LintReport | null> {
  const db = initDb();
  const row = db.prepare('SELECT * FROM lint_reports ORDER BY createdAt DESC LIMIT 1').get() as Record<string, any> | undefined;
  return row ? rowToLintReport(row) : null;
}

// --- Row to object converters ---

function safeJsonParse(val: any, fallback: any = []) {
  if (val == null || val === '') return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function rowToArticle(obj: Record<string, any>): Article {
  return {
    id: obj.id || '',
    title: obj.title || '',
    summary: obj.summary || '',
    soWhat: obj.soWhat || undefined,
    keyPoints: safeJsonParse(obj.keyPoints, undefined),
    implications: safeJsonParse(obj.implications, []),
    tags: safeJsonParse(obj.tags, []),
    sourceUrl: obj.sourceUrl || '',
    sourceName: obj.sourceName || '',
    sourceType: obj.sourceType || undefined,
    createdAt: obj.createdAt || '',
    status: obj.status || 'pending',
    rawContentRef: obj.rawContentRef || undefined,
    userComment: obj.userComment || undefined,
    aiQuestions: safeJsonParse(obj.aiQuestions, undefined),
    obsidianExported: obj.obsidianExported === 1,
    themeIds: safeJsonParse(obj.themeIds, undefined),
    relatedCards: safeJsonParse(obj.relatedCards, undefined),
    signalType: obj.signalType || undefined,
    deferredUntil: obj.deferredUntil || undefined,
  };
}

function rowToTheme(obj: Record<string, any>): Theme {
  return {
    id: obj.id || '',
    name: obj.name || '',
    summary: obj.summary || '',
    cardIds: safeJsonParse(obj.cardIds, []),
    openQuestions: safeJsonParse(obj.openQuestions, []),
    relatedThemes: safeJsonParse(obj.relatedThemes, []),
    wikiPath: obj.wikiPath || '',
    lastCompiled: obj.lastCompiled || '',
    signalCount: obj.signalCount || 0,
    status: obj.status || 'active',
    wikiType: obj.wikiType || 'narrative',
    thesis: obj.thesis || undefined,
  };
}

function rowToWikiOutput(obj: Record<string, any>): WikiOutput {
  return {
    id: obj.id || '',
    themeIds: safeJsonParse(obj.themeIds, []),
    outputType: obj.outputType || 'research-note',
    content: obj.content || '',
    createdAt: obj.createdAt || '',
    prompt: obj.prompt || undefined,
    deepDives: safeJsonParse(obj.deepDives, undefined),
    status: obj.status || 'complete',
  };
}

function rowToLintReport(obj: Record<string, any>): LintReport {
  return {
    id: obj.id || '',
    createdAt: obj.createdAt || '',
    dormantThemes: safeJsonParse(obj.dormantThemes, []),
    unresolvedConflicts: obj.unresolvedConflicts || 0,
    answerableQuestions: safeJsonParse(obj.answerableQuestions, []),
    newConnections: safeJsonParse(obj.newConnections, []),
    staleThemes: safeJsonParse(obj.staleThemes, []),
  };
}

// --- Tag operations ---

export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const db = initDb();
  const rows = db.prepare('SELECT tags FROM cards WHERE tags IS NOT NULL AND tags != ""').all() as Record<string, any>[];
  const tagMap = new Map<string, number>();
  for (const row of rows) {
    const tags = safeJsonParse(row.tags, []);
    if (Array.isArray(tags)) {
      for (const t of tags) {
        const tag = (t as string).trim().toLowerCase();
        if (tag) tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getCardsByTag(tag: string): Promise<Article[]> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM cards WHERE tags IS NOT NULL ORDER BY createdAt DESC').all() as Record<string, any>[];
  return rows
    .filter((r) => {
      const tags = safeJsonParse(r.tags, []);
      return Array.isArray(tags) && tags.some((t: string) => t.trim().toLowerCase() === tag.toLowerCase());
    })
    .map(rowToArticle);
}

// --- MOC (Map of Content) ---

export async function getThemeMOC(themeId: string): Promise<{
  cards: Article[];
  outputs: WikiOutput[];
  relatedThemes: { id: string; name: string; sharedTags: string[] }[];
  topTags: string[];
}> {
  const theme = await getThemeById(themeId);
  if (!theme) return { cards: [], outputs: [], relatedThemes: [], topTags: [] };

  // 테마 소속 카드
  const cards = await getThemeCards(themeId);

  // 테마 관련 아웃풋
  const outputs = await getOutputsByTheme(themeId);

  // 카드들의 태그 집계
  const tagMap = new Map<string, number>();
  for (const card of cards) {
    for (const t of card.tags || []) {
      const tag = t.trim().toLowerCase();
      if (tag) tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }
  const topTags = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  // 태그 기반 관련 테마 찾기
  const allThemes = await getAllThemes();
  const allCards = await getAllCards();
  const relatedThemes: { id: string; name: string; sharedTags: string[] }[] = [];

  for (const other of allThemes) {
    if (other.id === themeId) continue;
    const otherCards = allCards.filter((c) =>
      c.themeIds?.includes(other.id) || other.cardIds.includes(c.id)
    );
    const otherTags = new Set<string>();
    for (const c of otherCards) {
      for (const t of c.tags || []) otherTags.add(t.trim().toLowerCase());
    }
    const shared = topTags.filter((t) => otherTags.has(t));
    if (shared.length >= 2) {
      relatedThemes.push({ id: other.id, name: other.name, sharedTags: shared });
    }
  }
  relatedThemes.sort((a, b) => b.sharedTags.length - a.sharedTags.length);

  return { cards, outputs, relatedThemes: relatedThemes.slice(0, 5), topTags };
}

/** 아웃풋이 존재하는 themeId 목록 반환 */
export async function getThemeIdsWithOutputs(): Promise<string[]> {
  const db = initDb();
  const rows = db.prepare('SELECT themeIds FROM wiki_outputs').all() as Record<string, any>[];
  const idSet = new Set<string>();
  for (const row of rows) {
    const ids = safeJsonParse(row.themeIds, []);
    if (Array.isArray(ids)) {
      for (const id of ids) idSet.add(id);
    }
  }
  return Array.from(idSet);
}

export async function getDb(): Promise<Database.Database> {
  return initDb();
}
