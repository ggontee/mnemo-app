import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'mnemo.db');
const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');

// Company wiki definitions
const COMPANY_WIKIS = [
  {
    id: 'company-anthropic',
    name: 'Anthropic',
    wikiType: 'company',
    matcher: (c) => {
      const text = [c.title, c.tags].join(' ').toLowerCase();
      return text.includes('anthropic') || (text.includes('claude') && !text.includes('openai'));
    },
    profile: {
      founded: '2021년 (Dario & Daniela Amodei)',
      hq: '샌프란시스코',
      model: 'AI 안전 연구 + Claude 모델 서비스',
      metrics: 'ARR $19B (14개월 만에 $1B→$19B), 역사상 최빠른 AI 제품 성장',
      funding: 'Google, Spark, Salesforce 등에서 수십억 달러 투자',
      moat: '개발자 도구 체인 (Claude Code, Dispatch, Channels), 안전성 연구',
    },
  },
  {
    id: 'company-openai',
    name: 'OpenAI',
    wikiType: 'company',
    matcher: (c) => {
      const text = [c.title, c.tags].join(' ').toLowerCase();
      return text.includes('openai') || (text.includes('chatgpt') && !text.includes('anthropic'));
    },
    profile: {
      founded: '2015년 (Sam Altman 외)',
      hq: '샌프란시스코',
      model: 'GPT 시리즈 + ChatGPT 플랫폼 + API',
      metrics: '2028년 지출 850억$ 예상, 2차 시장 주가 하락세',
      funding: 'Microsoft 주도 100억$+, IPO 추진 중',
      moat: '사용자 기반, 브랜드, 플러그인 생태계',
    },
  },
  {
    id: 'company-revolut',
    name: 'Revolut',
    wikiType: 'company',
    matcher: (c) => [c.title, c.tags].join(' ').toLowerCase().includes('레볼루트') || [c.title, c.tags].join(' ').toLowerCase().includes('revolut'),
    profile: {
      founded: '2015년 (Nik Storonsky)',
      hq: '런던',
      model: '네오뱅크 → 풀뱅킹 플랫폼 (11개 제품 라인)',
      metrics: '매출 £4.5B, 영업이익률 38%, ROE 35%, 순익 $23억, CAGR 76%',
      funding: 'SoftBank 등, 기업가치 약 $45B',
      moat: '다각화 수익 (단일 카테고리 의존도 22% 이하), 6개 수익 세그먼트',
    },
  },
  {
    id: 'company-coinbase',
    name: 'Coinbase',
    wikiType: 'company',
    matcher: (c) => [c.title, c.tags].join(' ').toLowerCase().includes('코인베이스') || [c.title, c.tags].join(' ').toLowerCase().includes('coinbase'),
    profile: {
      founded: '2012년 (Brian Armstrong)',
      hq: '샌프란시스코 (원격근무)',
      model: '크립토 거래소 + 기관 커스터디 + Base L2 + 스테이블코인',
      metrics: '나스닥 상장, OCC 연방은행 인가 조건부 승인 (최초)',
      funding: 'a16z, Tiger Global 등',
      moat: '규제 준수 선두, 연방은행 지위 추진, BTC 수익 펀드 온체인화',
    },
  },
  {
    id: 'company-stripe',
    name: 'Stripe',
    wikiType: 'company',
    matcher: (c) => {
      const text = [c.title, c.tags, c.keyPoints || ''].join(' ').toLowerCase();
      return text.includes('stripe');
    },
    profile: {
      founded: '2010년 (Patrick & John Collison)',
      hq: '샌프란시스코/더블린',
      model: '결제 인프라 → AI 에이전트 결제 표준 (MPP)',
      metrics: '기업가치 $65B+, IETF에 MPP 오픈 표준 제출',
      funding: 'a16z, Sequoia, Tiger Global 등',
      moat: '개발자 중심 금융 인프라, MPP로 에이전트 결제 표준 선점 시도',
    },
  },
];

// Concept wiki definitions
const CONCEPT_WIKIS = [
  {
    id: 'concept-stablecoin',
    name: '스테이블코인 규제와 시장 구조',
    wikiType: 'concept',
    matcher: (c) => {
      const text = [c.title, c.tags, c.summary || ''].join(' ').toLowerCase();
      return text.includes('스테이블코인') || text.includes('usdc') || text.includes('tether') || text.includes('circle');
    },
    definition: '법정화폐에 1:1 연동된 암호화폐. USDC(Circle), USDT(Tether)가 양대 산맥.',
    businessMeaning: '크립토 생태계의 결제 인프라이자, 전통 금융과의 브릿지. 규제가 시장 구조를 좌우한다.',
    realCases: '미국 스테이블코인법 이자 수익 금지 → Circle 16% 급락, Tether 반사이익 / 마스터카드 BVNK $1.8B 인수',
  },
  {
    id: 'concept-agent-payments',
    name: 'AI 에이전트 결제 프로토콜',
    wikiType: 'concept',
    matcher: (c) => {
      const text = [c.title, c.tags, c.summary || ''].join(' ').toLowerCase();
      return text.includes('mpp') || text.includes('x402') || text.includes('erc-8183') ||
        (text.includes('에이전트') && text.includes('결제'));
    },
    definition: 'AI 에이전트가 사람 개입 없이 자율적으로 결제를 실행하기 위한 기술 표준.',
    businessMeaning: '에이전트 경제의 기반 인프라. 이 표준을 장악하는 자가 AI 커머스를 지배한다.',
    realCases: 'Stripe MPP (IETF 표준 제출), x402 오픈 웹 결제 재단 (Visa·MC·AWS 참여), ERC-8183 (온체인 에이전트 거래), WLFI SDK (Claude Code 통합)',
  },
  {
    id: 'concept-rwa-tokenization',
    name: 'RWA 토큰화 (실물자산의 온체인화)',
    wikiType: 'concept',
    matcher: (c) => {
      const text = [c.title, c.tags, c.summary || '', c.keyPoints || ''].join(' ').toLowerCase();
      return text.includes('rwa') || text.includes('토큰화') || text.includes('토큰증권') ||
        (text.includes('온체인') && (text.includes('월스트리트') || text.includes('자본시장')));
    },
    definition: '주식·채권·부동산 등 실물자산을 블록체인 토큰으로 표현하여 24/7 거래 가능하게 하는 것.',
    businessMeaning: 'DTCC가 $3.7조 처리 인프라를 토큰화로 전환 중. 중개 구조 해체와 T+0 결제의 현실화.',
    realCases: 'DTCC 국채 토큰화 서비스 (2026 상반기), NYSE 24/7 온체인 주식 거래, Coinbase BTC 수익 펀드 ERC-3643 표준',
  },
  {
    id: 'concept-harness-engineering',
    name: '하네스 엔지니어링 (AI 에이전트 설계)',
    wikiType: 'concept',
    matcher: (c) => {
      const text = [c.title, c.tags, c.summary || '', c.keyPoints || ''].join(' ').toLowerCase();
      return text.includes('하네스') || text.includes('harness') ||
        (text.includes('3계층') && text.includes('학습'));
    },
    definition: '모델 가중치가 아닌 에이전트를 구동하는 코드·프롬프트·도구 체계. Anthropic이 "하네스가 성능의 핵심"이라고 공식 언급.',
    businessMeaning: 'AI 경쟁력이 모델 크기에서 엔지니어링 설계로 이동. 하네스 IP가 핵심 전략 자산이 됐다.',
    realCases: 'Claude Code 50만줄 소스코드 유출 (하네스 구조 노출), 3계층 학습 (Model·Harness·Context), Workload-Harness Fit 프레임워크',
  },
  {
    id: 'concept-eval-driven-dev',
    name: 'Eval 기반 AI 제품 개발',
    wikiType: 'concept',
    matcher: (c) => {
      const text = [c.title, c.tags, c.summary || ''].join(' ').toLowerCase();
      return text.includes('eval') && (text.includes('prd') || text.includes('ai제품') || text.includes('ai 제품'));
    },
    definition: '기존 PRD(제품 요구사항 문서) 대신 데이터·태스크·스코어링 함수로 AI 제품 품질을 정의하고 개선하는 방법론.',
    businessMeaning: 'AI PM의 역할이 기획서 작성에서 평가 시스템 설계로 전환. 직관적 "바이브 체크"에서 정량적 Eval 루프로.',
    realCases: 'Continuous Eval Loop 체계, 멀티에이전트 분업 (Planner·Generator·Evaluator), Claude Code의 Grep·Glob·LSP 도구 체계',
  },
  {
    id: 'concept-defi-security',
    name: 'DeFi 보안과 키 관리 리스크',
    wikiType: 'concept',
    matcher: (c) => {
      const text = [c.title, c.tags, c.summary || ''].join(' ').toLowerCase();
      return (text.includes('defi') && (text.includes('해킹') || text.includes('보안'))) ||
        (text.includes('공급망') && text.includes('공격'));
    },
    definition: '탈중앙화 금융 프로토콜의 보안 취약점. 스마트 컨트랙트 자체보다 키 관리·의존성 공급망이 더 큰 위협.',
    businessMeaning: 'DeFi TVL이 커질수록 해킹 인센티브 증가. 보안 감사·런타임 보호가 새로운 시장.',
    realCases: '솔라나 최대 DeFi 해킹 ($2.85억), Axios npm 공급망 백도어, ClawKeeper 런타임 보호 프레임워크',
  },
];

async function main() {
  if (!fs.existsSync(WIKI_DIR)) fs.mkdirSync(WIKI_DIR, { recursive: true });

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Add new columns if not exist
  try { db.run('ALTER TABLE themes ADD COLUMN wikiType TEXT DEFAULT "narrative"'); } catch(e) {}
  try { db.run('ALTER TABLE themes ADD COLUMN thesis TEXT'); } catch(e) {}

  // Update existing narrative themes
  db.run("UPDATE themes SET wikiType = 'narrative' WHERE wikiType IS NULL");

  // Get all kept cards
  const stmt = db.prepare("SELECT * FROM cards WHERE status = 'kept'");
  const cards = [];
  while (stmt.step()) cards.push(stmt.getAsObject());
  stmt.free();

  const allWikis = [...COMPANY_WIKIS, ...CONCEPT_WIKIS];

  for (const wiki of allWikis) {
    const matched = cards.filter(c => wiki.matcher(c));
    if (matched.length === 0) {
      console.log(`⚠ ${wiki.name}: 0 cards, skip`);
      continue;
    }

    const cardIds = matched.map(c => c.id);
    const now = new Date().toISOString();

    // Build summary based on type
    let summary = '';
    if (wiki.wikiType === 'company') {
      summary = `${wiki.profile.model} | ${wiki.profile.metrics}`;
    } else {
      summary = `${wiki.definition}`;
    }

    // Extract open questions
    const openQuestions = [];
    matched.slice(0, 3).forEach(c => {
      const qs = JSON.parse(c.aiQuestions || '[]');
      qs.slice(0, 1).forEach(q => openQuestions.push(q));
    });

    // Insert theme
    db.run(
      `INSERT OR REPLACE INTO themes (id, name, summary, cardIds, openQuestions, relatedThemes, wikiPath, lastCompiled, signalCount, status, wikiType, thesis)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [wiki.id, wiki.name, summary, JSON.stringify(cardIds),
       JSON.stringify(openQuestions.slice(0, 5)), '[]',
       `data/wiki/${wiki.id}.md`, now, matched.length, 'active',
       wiki.wikiType, null]
    );

    // Insert card_themes
    for (const card of matched) {
      db.run('INSERT OR IGNORE INTO card_themes (cardId, themeId, signalType) VALUES (?,?,?)',
        [card.id, wiki.id, 'reinforcing']);
    }

    console.log(`✓ [${wiki.wikiType}] ${wiki.name}: ${matched.length} cards`);

    // Generate wiki markdown
    const md = wiki.wikiType === 'company'
      ? generateCompanyWiki(wiki, matched)
      : generateConceptWiki(wiki, matched);
    fs.writeFileSync(path.join(WIKI_DIR, `${wiki.id}.md`), md, 'utf-8');
  }

  // Save DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  // Summary
  const s1 = db.prepare("SELECT wikiType, COUNT(*) as cnt FROM themes GROUP BY wikiType");
  while (s1.step()) { const r = s1.getAsObject(); console.log(`  ${r.wikiType}: ${r.cnt}`); }
  s1.free();
  const s2 = db.prepare('SELECT COUNT(*) as cnt FROM themes'); s2.step();
  console.log(`Total themes: ${s2.getAsObject().cnt}`); s2.free();
}

function generateCompanyWiki(wiki, cards) {
  const sorted = [...cards].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const p = wiki.profile;
  const lines = [];
  lines.push(`# ${wiki.name}`);
  lines.push('');
  lines.push('## 기업 프로필');
  lines.push('');
  lines.push(`| 항목 | 내용 |`);
  lines.push(`|------|------|`);
  lines.push(`| 설립 | ${p.founded} |`);
  lines.push(`| 본사 | ${p.hq} |`);
  lines.push(`| 사업모델 | ${p.model} |`);
  lines.push(`| 주요 지표 | ${p.metrics} |`);
  lines.push(`| 투자 | ${p.funding} |`);
  lines.push(`| 핵심 해자 | ${p.moat} |`);
  lines.push('');
  lines.push('## 최근 시그널');
  lines.push('');
  for (const c of sorted.slice(0, 10)) {
    const date = (c.createdAt || '').split('T')[0];
    lines.push(`### ${c.title}`);
    lines.push(`*${date} · ${c.sourceName || '?'}*`);
    lines.push('');
    if (c.soWhat) lines.push(`**So What**: ${c.soWhat}`);
    const kp = JSON.parse(c.keyPoints || '[]');
    if (kp.length > 0) { lines.push(''); kp.slice(0, 2).forEach(k => lines.push(`- ${k}`)); }
    lines.push('');
  }
  lines.push('## 시그널 타임라인');
  lines.push('');
  sorted.forEach(c => {
    const date = (c.createdAt || '').split('T')[0];
    lines.push(`- [${date}] ${c.title} (${c.sourceName || '?'})`);
  });
  return lines.join('\n');
}

function generateConceptWiki(wiki, cards) {
  const sorted = [...cards].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const lines = [];
  lines.push(`# ${wiki.name}`);
  lines.push('');
  lines.push('## 정의');
  lines.push('');
  lines.push(wiki.definition);
  lines.push('');
  lines.push('## 사업적 의미');
  lines.push('');
  lines.push(wiki.businessMeaning);
  lines.push('');
  lines.push('## 실제 사례');
  lines.push('');
  lines.push(wiki.realCases);
  lines.push('');
  lines.push('## 관련 시그널');
  lines.push('');
  for (const c of sorted.slice(0, 8)) {
    const date = (c.createdAt || '').split('T')[0];
    lines.push(`### ${c.title}`);
    lines.push(`*${date} · ${c.sourceName || '?'}*`);
    lines.push('');
    if (c.soWhat) lines.push(`**So What**: ${c.soWhat}`);
    const kp = JSON.parse(c.keyPoints || '[]');
    if (kp.length > 0) { lines.push(''); kp.slice(0, 2).forEach(k => lines.push(`- ${k}`)); }
    lines.push('');
  }
  return lines.join('\n');
}

main().catch(console.error);
