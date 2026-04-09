import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'mnemo.db');
const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');

// Theme definitions based on tag analysis of 121 kept cards
const THEME_DEFS = [
  {
    id: 'theme-ai-agents',
    name: 'AI 에이전트 & 자동화',
    keywords: ['AI 에이전트', 'AI에이전트', '에이전트', '자동화', 'Claude', 'Anthropic', 'AI'],
    summary: 'AI 에이전트 기술의 발전과 업무 자동화 적용 동향',
  },
  {
    id: 'theme-crypto-defi',
    name: '크립토 & DeFi',
    keywords: ['크립토', 'DeFi', 'Web3', '스테이블코인', '비트코인', '예측시장', '블록체인'],
    summary: '암호화폐, 탈중앙화 금융, Web3 생태계 동향',
  },
  {
    id: 'theme-startup-vc',
    name: '스타트업 & VC',
    keywords: ['스타트업', 'VC', '투자', 'M&A', 'GTM전략', '펀드레이징'],
    summary: '스타트업 생태계, 벤처투자, M&A 동향',
  },
  {
    id: 'theme-fintech',
    name: '핀테크 & SaaS',
    keywords: ['핀테크', 'SaaS', '레볼루트', '네오뱅크', '결제', '이커머스'],
    summary: '핀테크 서비스와 SaaS 비즈니스 모델 트렌드',
  },
  {
    id: 'theme-llm-infra',
    name: 'LLM 인프라 & 개발',
    keywords: ['LLM', 'OpenAI', 'RAG', '파인튜닝', 'MLOps', 'AI검색'],
    summary: 'LLM 기술 스택, 인프라, 개발 도구 동향',
  },
  {
    id: 'theme-bigtech-regulation',
    name: '빅테크 & 규제',
    keywords: ['빅테크', '규제', '지정학', '반도체', '미국경제', '테슬라'],
    summary: '빅테크 기업 동향, 기술 규제, 지정학적 변화',
  },
  {
    id: 'theme-leadership',
    name: '리더십 & 조직',
    keywords: ['리더십', '조직관리', '자기계발', '생산성', '구조조정', '인재'],
    summary: '리더십, 조직 문화, 생산성 관련 인사이트',
  },
  {
    id: 'theme-security',
    name: '보안 & 리스크',
    keywords: ['보안', '사이버보안', '리스크관리', '컴플라이언스'],
    summary: '사이버보안 위협과 리스크 관리 동향',
  },
];

async function main() {
  if (!fs.existsSync(WIKI_DIR)) {
    fs.mkdirSync(WIKI_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Get all kept cards
  const stmt = db.prepare("SELECT * FROM cards WHERE status = 'kept'");
  const cards = [];
  while (stmt.step()) cards.push(stmt.getAsObject());
  stmt.free();
  console.log(`Found ${cards.length} kept cards`);

  // Match cards to themes
  const themeCards = {};
  THEME_DEFS.forEach(t => { themeCards[t.id] = []; });

  for (const card of cards) {
    const tags = JSON.parse(card.tags || '[]');
    const title = (card.title || '').toLowerCase();
    const summary = (card.summary || '').toLowerCase();

    for (const theme of THEME_DEFS) {
      const match = theme.keywords.some(kw => {
        const kwLower = kw.toLowerCase();
        return tags.some(t => t.toLowerCase().includes(kwLower) || kwLower.includes(t.toLowerCase()))
          || title.includes(kwLower)
          || summary.includes(kwLower);
      });
      if (match) {
        themeCards[theme.id].push(card);
      }
    }
  }

  // Create themes and link cards
  for (const themeDef of THEME_DEFS) {
    const linkedCards = themeCards[themeDef.id];
    if (linkedCards.length === 0) {
      console.log(`Skipping ${themeDef.name}: no cards matched`);
      continue;
    }

    const cardIds = linkedCards.map(c => c.id);
    const now = new Date().toISOString();

    // Collect open questions from cards
    const openQuestions = [];
    linkedCards.slice(0, 5).forEach(c => {
      const qs = JSON.parse(c.aiQuestions || '[]');
      qs.slice(0, 1).forEach(q => openQuestions.push(q));
    });

    // Find related themes (themes that share cards)
    const relatedThemes = THEME_DEFS
      .filter(t => t.id !== themeDef.id)
      .filter(t => {
        const otherCards = new Set(themeCards[t.id].map(c => c.id));
        return cardIds.some(id => otherCards.has(id));
      })
      .map(t => t.id);

    // Insert theme
    db.run(
      `INSERT OR REPLACE INTO themes (id, name, summary, cardIds, openQuestions, relatedThemes, wikiPath, lastCompiled, signalCount, status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        themeDef.id,
        themeDef.name,
        themeDef.summary,
        JSON.stringify(cardIds),
        JSON.stringify(openQuestions.slice(0, 5)),
        JSON.stringify(relatedThemes),
        `data/wiki/${themeDef.id}.md`,
        now,
        linkedCards.length,
        'active',
      ]
    );

    // Insert card_themes junction
    for (const card of linkedCards) {
      db.run(
        `INSERT OR IGNORE INTO card_themes (cardId, themeId, signalType) VALUES (?,?,?)`,
        [card.id, themeDef.id, 'reinforcing']
      );

      // Also update card's themeIds
      const existingIds = JSON.parse(card.themeIds || '[]');
      if (!existingIds.includes(themeDef.id)) {
        existingIds.push(themeDef.id);
        db.run(`UPDATE cards SET themeIds = ? WHERE id = ?`, [JSON.stringify(existingIds), card.id]);
      }
    }

    console.log(`✓ ${themeDef.name}: ${linkedCards.length} cards, ${relatedThemes.length} related themes`);

    // Create wiki markdown
    const wikiContent = generateWiki(themeDef, linkedCards, relatedThemes, openQuestions);
    const wikiPath = path.join(WIKI_DIR, `${themeDef.id}.md`);
    fs.writeFileSync(wikiPath, wikiContent, 'utf-8');
    console.log(`  → Wiki saved`);
  }

  // Persist DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('\nDB saved successfully');

  // Summary
  const stmt2 = db.prepare('SELECT COUNT(*) as cnt FROM themes');
  stmt2.step();
  console.log(`Total themes: ${stmt2.getAsObject().cnt}`);
  stmt2.free();

  const stmt3 = db.prepare('SELECT COUNT(*) as cnt FROM card_themes');
  stmt3.step();
  console.log(`Total card-theme links: ${stmt3.getAsObject().cnt}`);
  stmt3.free();
}

function generateWiki(theme, cards, relatedThemes, openQuestions) {
  const lines = [];
  lines.push(`# ${theme.name}`);
  lines.push('');
  lines.push(`> ${theme.summary}`);
  lines.push('');
  lines.push(`**상태**: active | **신호 수**: ${cards.length} | **최종 컴파일**: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  lines.push('## 핵심 요약');
  lines.push('');
  const recentCards = [...cards].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 10);
  for (const card of recentCards) {
    const soWhat = card.soWhat || card.summary || '';
    lines.push(`- **${card.title}**: ${soWhat.substring(0, 120)}`);
  }
  lines.push('');

  lines.push('## 시그널 타임라인');
  lines.push('');
  for (const card of [...cards].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 20)) {
    const date = (card.createdAt || '').split('T')[0];
    lines.push(`- [${date}] ${card.title} (${card.sourceName || 'unknown'})`);
  }
  lines.push('');

  if (openQuestions.length > 0) {
    lines.push('## 열린 질문');
    lines.push('');
    openQuestions.forEach(q => lines.push(`- ${q}`));
    lines.push('');
  }

  if (relatedThemes.length > 0) {
    lines.push('## 관련 테마');
    lines.push('');
    relatedThemes.forEach(t => lines.push(`- [[${t}]]`));
    lines.push('');
  }

  return lines.join('\n');
}

main().catch(console.error);
