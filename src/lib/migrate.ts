import * as fs from 'fs';
import * as path from 'path';
import { Article } from './types';
import { upsertCard } from './db';

const CARDS_JSON_PATH = path.join(process.cwd(), 'data', 'cards.json');

interface RawCard {
  id: string;
  title: string;
  summary: string;
  soWhat?: string;
  keyPoints?: string[];
  implications?: string[];
  tags?: string[];
  sourceUrl: string;
  sourceName: string;
  sourceType?: 'newsletter' | 'video';
  createdAt: string;
  status?: 'pending' | 'kept' | 'discarded';
  rawContentRef?: string;
  userComment?: string;
  aiQuestions?: any[];
  obsidianExported?: boolean;
}

/**
 * Load cards from JSON file
 */
async function loadCardsFromJson(): Promise<Article[]> {
  if (!fs.existsSync(CARDS_JSON_PATH)) {
    console.log('cards.json not found, skipping migration');
    return [];
  }

  try {
    const fileContent = fs.readFileSync(CARDS_JSON_PATH, 'utf-8');
    const rawCards: RawCard[] = JSON.parse(fileContent);

    // Transform raw cards to Article interface
    const articles: Article[] = rawCards.map((card) => ({
      id: card.id,
      title: card.title,
      summary: card.summary,
      soWhat: card.soWhat,
      keyPoints: card.keyPoints,
      implications: card.implications || [],
      tags: card.tags || [],
      sourceUrl: card.sourceUrl,
      sourceName: card.sourceName,
      sourceType: card.sourceType,
      createdAt: card.createdAt,
      status: (card.status as any) || 'pending',
      rawContentRef: card.rawContentRef,
      userComment: card.userComment,
      aiQuestions: card.aiQuestions,
      obsidianExported: card.obsidianExported,
      // v2 fields default to undefined
      themeIds: undefined,
      relatedCards: undefined,
      signalType: undefined,
      deferredUntil: undefined
    }));

    return articles;
  } catch (error) {
    console.error('Error loading cards.json:', error);
    throw error;
  }
}

/**
 * Migrate all cards from JSON to SQLite
 */
export async function migrateCards(): Promise<void> {
  console.log('Starting migration from cards.json to SQLite...');

  const cards = await loadCardsFromJson();

  if (cards.length === 0) {
    console.log('No cards to migrate');
    return;
  }

  console.log(`Found ${cards.length} cards to migrate`);

  for (const card of cards) {
    try {
      await upsertCard(card);
    } catch (error) {
      console.error(`Error migrating card ${card.id}:`, error);
      throw error;
    }
  }

  console.log(`Successfully migrated ${cards.length} cards to SQLite`);
}

/**
 * Standalone migration function that can be run as a CLI script
 */
export async function runMigration(): Promise<void> {
  try {
    await migrateCards();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Allow running as a CLI script
if (require.main === module) {
  runMigration();
}
