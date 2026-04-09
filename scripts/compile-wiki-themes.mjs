import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'mnemo.db');
const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');

// Insight-driven wiki themes — each has a specific thesis, not just a category
const WIKI_THEMES = [
  {
    id: 'wiki-ai-replaces-managers',
    name: 'AI가 중간관리자를 대체하는가?',
    summary: 'Jack Dorsey·Block 등이 AI로 관리 계층 제거를 시도하지만, CFO 79%가 도입 실패 — 효율성과 정당성의 간극',
    thesis: 'AI는 정보 중계 역할의 중간관리자를 기술적으로 대체할 수 있으나, 조직 권력의 정당성 문제는 해결하지 못한다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('관리자') || t.includes('관리 계층') || t.includes('조직 구조') ||
        (t.includes('block') && tags.includes('ai')) ||
        t.includes('cfo') && t.includes('ai') ||
        t.includes('ai가 중간') || t.includes('convoy') ||
        (tags.includes('조직관리') && tags.includes('ai')) ||
        (tags.includes('조직설계') && tags.includes('ai')) ||
        (tags.includes('조직구조') && tags.includes('ai'));
    },
  },
  {
    id: 'wiki-agent-payment-wars',
    name: 'AI 에이전트 결제 인프라 전쟁',
    summary: 'Stripe MPP vs x402 vs ERC-8183 — 에이전트끼리 돈을 주고받는 표준을 누가 장악하나',
    thesis: 'AI 에이전트가 자율적으로 거래하려면 새로운 결제 프로토콜이 필요하고, 이 표준 전쟁에서 승자가 다음 금융 인프라를 지배한다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('mpp') || t.includes('x402') || t.includes('erc-8183') ||
        t.includes('에이전트 결제') || t.includes('에이전트에게 팔') ||
        (tags.includes('에이전트') && tags.includes('결제')) ||
        t.includes('wlfi') || t.includes('에이전트 거래 표준') ||
        t.includes('콘텐츠 수익화') && tags.includes('에이전트');
    },
  },
  {
    id: 'wiki-crypto-institutional',
    name: '크립토의 제도권 편입이 가속화되고 있다',
    summary: '코인베이스 은행 인가, 401(k) 크립토, 토큰증권 법제화, 마스터카드 BVNK 인수 — 제도와 전통금융이 크립토를 흡수 중',
    thesis: '크립토가 기존 금융 시스템에 편입되는 속도가 예상보다 빠르며, 규제가 오히려 제도화의 촉매가 되고 있다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('코인베이스') && (t.includes('은행') || t.includes('인가') || t.includes('펀드')) ||
        t.includes('401(k)') || t.includes('토큰증권') || t.includes('스테이블코인법') ||
        t.includes('비트코인 전략비축') || t.includes('bvnk') || t.includes('마스터카드') ||
        t.includes('온체인 이전') || t.includes('월스트리트') && tags.includes('토큰') ||
        t.includes('circle') && tags.includes('규제') ||
        (tags.includes('rwa') || tags.includes('토큰화')) && tags.includes('크립토');
    },
  },
  {
    id: 'wiki-ai-arms-race-economics',
    name: 'AI 군비경쟁: 850억 달러는 정당화될 수 있는가?',
    summary: 'OpenAI 2028년 지출 850억$, JP모건 AI CDS 출시, 추론비용은 인건비의 3% — 버블인가 혁명인가',
    thesis: 'AI 투자 규모가 역사적 수준이지만 추론 비용 대비 인건비 우위가 유지되는 한 경제성은 유효하다. 다만 월가는 이미 헤지를 시작했다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('ipo') && (tags.includes('openai') || tags.includes('anthropic')) ||
        t.includes('ai 버블') || t.includes('cds') ||
        t.includes('추론 비용') || t.includes('openai 주식') ||
        t.includes('2050년 경제') || t.includes('군비') ||
        (t.includes('openai') && t.includes('anthropic') && t.includes('ipo'));
    },
  },
  {
    id: 'wiki-revolut-neobank-proof',
    name: '레볼루트가 증명한 것: 핀테크는 은행이 될 수 있다',
    summary: '순익 $23억, ROE 35%, 매출 CAGR 76% — 네오뱅크가 전통 은행을 수익성으로 이기기 시작했다',
    thesis: '다각화된 수익 구조를 갖춘 핀테크가 전통 은행의 수익성을 넘어서는 것이 실증되었으며, 이는 글로벌 뱅킹 판도를 바꿀 전환점이다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('레볼루트') || (tags.includes('레볼루트'));
    },
  },
  {
    id: 'wiki-quantum-crypto-threat',
    name: '양자컴퓨팅이 비트코인 암호를 깨는 날',
    summary: '구글: 50만 큐비트 미만으로 9분 만에 해독 가능, 자원 요구량 기존 예상보다 대폭 감소',
    thesis: '양자컴퓨팅의 암호화폐 위협 시점이 당초 예상보다 빠르게 다가오고 있으며, 포스트양자 암호 전환이 시급하다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      return t.includes('양자') || t.includes('quantum');
    },
  },
  {
    id: 'wiki-agent-security-surface',
    name: 'AI 에이전트가 만드는 새로운 공격 면',
    summary: '공급망 해킹, 하네스 유출, DeFi 키 탈취 — 에이전트 자율성이 보안 취약점으로 전환되는 패턴',
    thesis: 'AI 에이전트의 자율성 확대는 필연적으로 새로운 보안 공격 면을 만들며, 기존 보안 패러다임으로는 대응이 불가능하다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('공급망 공격') || t.includes('clawkeeper') ||
        t.includes('소스코드 유출') || t.includes('하네스') && t.includes('유출') ||
        (t.includes('해킹') && (tags.includes('defi') || tags.includes('크립토'))) ||
        (tags.includes('보안') && tags.includes('에이전트'));
    },
  },
  {
    id: 'wiki-saas-death-vertical',
    name: 'SaaS 종말론: AI가 소프트웨어 자급자족을 가능하게 하는가',
    summary: 'Claude Max $200로 15개 툴 제작, Cursor·Intercom 자체 모델 개발 — SaaS 존재 이유가 흔들린다',
    thesis: 'AI가 맞춤 소프트웨어 제작 비용을 극적으로 낮추면서 범용 SaaS의 가치 제안이 약화되고 있으나, 데이터 네트워크 효과가 있는 SaaS는 살아남는다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('saas 종말') || t.includes('자급자족') ||
        t.includes('수직 통합') && tags.includes('ai') ||
        t.includes('무료 체험') && tags.includes('saas') ||
        t.includes('ai 앱') && t.includes('수직');
    },
  },
  {
    id: 'wiki-ai-product-paradigm',
    name: 'AI 제품 개발의 새 문법: Eval이 PRD를 대체한다',
    summary: 'Eval 루프, 멀티에이전트 분업, 유저스토리=프롬프트 — AI 시대 제품 개발은 기존과 근본적으로 다르다',
    thesis: 'AI 제품의 품질은 기획서가 아닌 평가 시스템 설계 역량으로 결정되며, 이는 PM의 역할을 근본적으로 바꾼다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('eval') || t.includes('prd') ||
        t.includes('멀티에이전트') && tags.includes('코딩') ||
        t.includes('프롬프트') && t.includes('유저 스토리') ||
        t.includes('claude code') && (t.includes('비결') || t.includes('성능')) ||
        (tags.includes('evals') || tags.includes('ai제품개발'));
    },
  },
  {
    id: 'wiki-geopolitical-macro',
    name: '지정학 리스크가 시장을 지배하는 국면',
    summary: '이란 최후통첩, 연준 3방향 혼재, 트럼프 발표 15분 전 20조 배팅 — 예측 불가의 매크로 환경',
    thesis: '지정학적 불확실성이 금리·유가·증시를 동시에 흔들고 있으며, 전통적 경제 모델링이 한계를 드러내고 있다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('이란') || t.includes('연준 금리') ||
        t.includes('20조 배팅') || t.includes('블랙먼데이') ||
        t.includes('나이키') && t.includes('급락') ||
        (tags.includes('지정학')) ||
        t.includes('조정장') || t.includes('불확실장') ||
        t.includes('에너지 전쟁') || t.includes('전력망');
    },
  },
  {
    id: 'wiki-anthropic-ecosystem',
    name: 'Anthropic 생태계 확장 전략',
    summary: 'ARR $19B, 바이오텍 인수, Claude Code/Dispatch, API 정책 변경 — Anthropic이 그리는 AI 플랫폼 그림',
    thesis: 'Anthropic은 모델 성능 경쟁에서 생태계·인프라 경쟁으로 전환하고 있으며, 개발자 도구 체인이 핵심 해자가 되고 있다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return (t.includes('anthropic') && !t.includes('openai')) ||
        t.includes('claude code') ||
        (t.includes('claude') && (t.includes('조작') || t.includes('제어') || t.includes('스케줄'))) ||
        t.includes('arr') && tags.includes('anthropic');
    },
  },
  {
    id: 'wiki-taste-judgment-ai-age',
    name: 'AI 시대, 실행력보다 판단력이 희소해진다',
    summary: 'AI가 평균적 실행을 대체하면서, 취향·판단력·깊이 있는 사고가 진짜 경쟁력으로 부상',
    thesis: 'AI가 실행 비용을 제로에 가깝게 만들수록, "무엇을 만들지" 결정하는 판단력과 취향이 유일한 차별 요소가 된다.',
    cardMatchers: (c) => {
      const t = c.title.toLowerCase();
      const tags = (c.tags || '').toLowerCase();
      return t.includes('취향') || t.includes('판단력') ||
        t.includes('사람 깊이') || t.includes('행동 변화') ||
        t.includes('무의식적 습관') || t.includes('ai 시대') && t.includes('육아') ||
        (tags.includes('자기계발') && tags.includes('리더십'));
    },
  },
];

async function main() {
  if (!fs.existsSync(WIKI_DIR)) fs.mkdirSync(WIKI_DIR, { recursive: true });

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Get all kept cards
  const stmt = db.prepare("SELECT * FROM cards WHERE status = 'kept'");
  const cards = [];
  while (stmt.step()) cards.push(stmt.getAsObject());
  stmt.free();
  console.log(`Found ${cards.length} kept cards\n`);

  // Clear existing themes and links
  db.run('DELETE FROM themes');
  db.run('DELETE FROM card_themes');
  db.run("UPDATE cards SET themeIds = '[]'");

  const unmatchedCards = new Set(cards.map(c => c.id));

  for (const theme of WIKI_THEMES) {
    const matched = cards.filter(c => theme.cardMatchers(c));
    if (matched.length === 0) {
      console.log(`⚠ ${theme.name}: no cards matched, skipping`);
      continue;
    }

    matched.forEach(c => unmatchedCards.delete(c.id));
    const cardIds = matched.map(c => c.id);
    const now = new Date().toISOString();

    // Extract open questions from matched cards
    const openQuestions = [];
    matched.forEach(c => {
      const qs = JSON.parse(c.aiQuestions || '[]');
      qs.slice(0, 1).forEach(q => openQuestions.push(q));
    });

    // Find related themes
    const relatedThemes = WIKI_THEMES
      .filter(t => t.id !== theme.id)
      .filter(t => {
        const otherMatched = cards.filter(c => t.cardMatchers(c));
        const otherIds = new Set(otherMatched.map(c => c.id));
        return cardIds.some(id => otherIds.has(id));
      })
      .map(t => t.id);

    // Insert theme
    db.run(
      `INSERT OR REPLACE INTO themes (id, name, summary, cardIds, openQuestions, relatedThemes, wikiPath, lastCompiled, signalCount, status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [theme.id, theme.name, theme.summary, JSON.stringify(cardIds),
       JSON.stringify(openQuestions.slice(0, 5)), JSON.stringify(relatedThemes),
       `data/wiki/${theme.id}.md`, now, matched.length, 'active']
    );

    // Insert card_themes junction + update card themeIds
    for (const card of matched) {
      // Determine signal type based on soWhat content
      let signalType = 'reinforcing';
      const soWhat = (card.soWhat || '').toLowerCase();
      if (soWhat.includes('반면') || soWhat.includes('그러나') || soWhat.includes('실패') || soWhat.includes('한계') || soWhat.includes('괴리')) {
        signalType = 'contradicting';
      } else if (soWhat.includes('처음') || soWhat.includes('최초') || soWhat.includes('새로운') || soWhat.includes('등장') || soWhat.includes('출시')) {
        signalType = 'new';
      }

      db.run('INSERT OR IGNORE INTO card_themes (cardId, themeId, signalType) VALUES (?,?,?)',
        [card.id, theme.id, signalType]);

      const existingIds = JSON.parse(card.themeIds || '[]');
      if (!existingIds.includes(theme.id)) {
        existingIds.push(theme.id);
        db.run('UPDATE cards SET themeIds = ? WHERE id = ?', [JSON.stringify(existingIds), card.id]);
      }
    }

    console.log(`✓ ${theme.name}`);
    console.log(`  ${matched.length} signals | ${relatedThemes.length} related`);
    console.log(`  Cards: ${matched.map(c => c.title).slice(0, 3).join(', ')}...`);

    // Generate wiki markdown
    const wiki = generateWikiMd(theme, matched, relatedThemes, openQuestions);
    fs.writeFileSync(path.join(WIKI_DIR, `${theme.id}.md`), wiki, 'utf-8');
  }

  console.log(`\n${unmatchedCards.size} cards not matched to any theme`);

  // Save DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('DB saved');

  // Summary
  const s1 = db.prepare('SELECT COUNT(*) as cnt FROM themes'); s1.step();
  console.log(`Total themes: ${s1.getAsObject().cnt}`); s1.free();
  const s2 = db.prepare('SELECT COUNT(*) as cnt FROM card_themes'); s2.step();
  console.log(`Total card-theme links: ${s2.getAsObject().cnt}`); s2.free();
}

function generateWikiMd(theme, cards, relatedThemes, openQuestions) {
  const sorted = [...cards].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const lines = [];

  lines.push(`# ${theme.name}`);
  lines.push('');
  lines.push(`> **테시스**: ${theme.thesis}`);
  lines.push('');
  lines.push(`**신호 수**: ${cards.length} | **최종 컴파일**: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  // Key narrative
  lines.push('## 핵심 내러티브');
  lines.push('');
  lines.push(theme.summary);
  lines.push('');

  // Reinforcing signals
  const reinforcing = sorted.filter(c => {
    const sw = (c.soWhat || '').toLowerCase();
    return !sw.includes('반면') && !sw.includes('그러나') && !sw.includes('실패') && !sw.includes('한계') && !sw.includes('괴리');
  });
  const contradicting = sorted.filter(c => {
    const sw = (c.soWhat || '').toLowerCase();
    return sw.includes('반면') || sw.includes('그러나') || sw.includes('실패') || sw.includes('한계') || sw.includes('괴리');
  });

  if (reinforcing.length > 0) {
    lines.push('## 🟢 강화 신호');
    lines.push('');
    for (const c of reinforcing.slice(0, 8)) {
      const date = (c.createdAt || '').split('T')[0];
      lines.push(`### ${c.title}`);
      lines.push(`*${date} · ${c.sourceName || 'unknown'}*`);
      lines.push('');
      if (c.soWhat) lines.push(`**So What**: ${c.soWhat}`);
      const kp = JSON.parse(c.keyPoints || '[]');
      if (kp.length > 0) {
        lines.push('');
        kp.slice(0, 2).forEach(p => lines.push(`- ${p}`));
      }
      lines.push('');
    }
  }

  if (contradicting.length > 0) {
    lines.push('## 🔴 반박/긴장 신호');
    lines.push('');
    for (const c of contradicting.slice(0, 5)) {
      const date = (c.createdAt || '').split('T')[0];
      lines.push(`### ${c.title}`);
      lines.push(`*${date} · ${c.sourceName || 'unknown'}*`);
      lines.push('');
      if (c.soWhat) lines.push(`**So What**: ${c.soWhat}`);
      lines.push('');
    }
  }

  // Open questions
  if (openQuestions.length > 0) {
    lines.push('## ❓ 열린 질문');
    lines.push('');
    openQuestions.slice(0, 5).forEach(q => {
      const qText = typeof q === 'string' ? q : q.question || '';
      lines.push(`- ${qText}`);
    });
    lines.push('');
  }

  // Timeline
  lines.push('## 시그널 타임라인');
  lines.push('');
  for (const c of sorted) {
    const date = (c.createdAt || '').split('T')[0];
    lines.push(`- [${date}] ${c.title} (${c.sourceName || '?'})`);
  }
  lines.push('');

  // Related
  if (relatedThemes.length > 0) {
    lines.push('## 관련 위키');
    lines.push('');
    relatedThemes.forEach(t => lines.push(`- [[${t}]]`));
    lines.push('');
  }

  return lines.join('\n');
}

main().catch(console.error);
