"""기존 보관 카드를 신규 양식(soWhat + keyPoints)으로 마이그레이션

두 가지 경로:
1. raw 원본이 있는 카드 → 원본에서 새로 요약
2. raw 원본이 없는 카드 → 기존 summary + implications에서 재생성
"""
from __future__ import annotations

import json
import logging
import os
import sys
import shutil
from datetime import datetime

import anthropic

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# 프로젝트 루트 기준 경로
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_PATH = os.path.join(PROJECT_ROOT, "data", "cards.json")

# ── 프롬프트: raw 원본이 있을 때 (전체 재요약) ──────────────────────
FULL_RESUMMARIZE_SYSTEM = """당신은 콘텐츠를 분석해서 지식 카드를 생성하는 AI입니다.

입력된 콘텐츠와 메타데이터를 활용하여 다음 JSON 형식으로 출력하세요:

{
  "title": "핵심을 담은 한국어 제목 (원본이 영어면 번역, 20자 이내)",
  "summary": "무슨 일이 있었는지 사실 중심 요약 1~2문장. 100자 이내. 의견이나 판단 배제, 팩트만.",
  "soWhat": "그래서 뭐? — 이 콘텐츠가 왜 중요한지 한 줄 해석. 50자 이내.",
  "keyPoints": [
    "핵심 포인트 1: 구체적 사실이나 수치, 또는 중요한 맥락 (50자 이내)",
    "핵심 포인트 2: 위와 다른 각도의 사실 또는 맥락 (50자 이내)",
    "핵심 포인트 3: (있으면) 추가 포인트 (50자 이내)"
  ],
  "tags": ["태그1", "태그2", "태그3"]
}

규칙:
- summary는 사실 전달에 집중. "~할 전망", "~에 주목해야" 같은 판단 문구 금지.
- soWhat은 읽는 사람이 '왜 이걸 신경 써야 하지?'에 대한 답. 콘텐츠 고유의 맥락에서 작성.
- keyPoints는 2~3개. "실무/트렌드/커리어" 같은 고정 프레임 없이, 콘텐츠에서 실제로 중요한 포인트만 추출.
  구체적 수치, 이름, 날짜가 있으면 반드시 포함.
- tags는 3~5개, 주제 영역 중심 (예: 크립토, 지정학, SaaS, 반도체)
- 한국어로 작성, 고유명사와 기술 용어는 영문 병기 가능
- 반드시 유효한 JSON만 출력. 다른 텍스트 없이 JSON 객체만."""

# ── 프롬프트: raw 원본이 없을 때 (기존 요약에서 변환) ───────────────
CONVERT_SYSTEM = """당신은 기존 뉴스 카드 요약을 신규 양식으로 변환하는 AI입니다.

기존 카드의 title, summary, implications를 보고 다음 JSON으로 변환하세요:

{
  "title": "기존 제목 유지 또는 더 간결하게 수정 (20자 이내)",
  "summary": "사실 중심 요약 1~2문장. 100자 이내. 기존 summary에서 의견/판단 제거하고 팩트만 남기기.",
  "soWhat": "그래서 뭐? — 이 콘텐츠가 왜 중요한지 한 줄 해석. 50자 이내.",
  "keyPoints": [
    "핵심 포인트 1 (50자 이내)",
    "핵심 포인트 2 (50자 이내)"
  ],
  "tags": ["태그1", "태그2", "태그3"]
}

규칙:
- 기존 implications에서 "실무 관점", "트렌드", "커리어" 같은 고정 프레임 제거
- 콘텐츠 고유의 구체적 사실/수치/맥락 중심으로 keyPoints 재작성
- soWhat은 기존 implications에서 가장 핵심적인 해석 한 줄로 압축
- summary는 사실만. 판단/전망 문구 삭제.
- 반드시 유효한 JSON만 출력."""


def load_cards() -> list[dict]:
    with open(CARDS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_cards(cards: list[dict]):
    with open(CARDS_PATH, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)


def load_raw_content(ref: str) -> dict | None:
    """rawContentRef 경로에서 원본 콘텐츠 로드"""
    raw_path = os.path.join(PROJECT_ROOT, "data", ref) if not ref.startswith("data/") else os.path.join(PROJECT_ROOT, ref)
    if not os.path.exists(raw_path):
        return None
    with open(raw_path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_ai_json(text: str) -> dict:
    """AI 응답에서 JSON 추출"""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        json_lines = []
        in_block = False
        for line in lines:
            if line.strip().startswith("```") and not in_block:
                in_block = True
                continue
            elif line.strip() == "```" and in_block:
                break
            elif in_block:
                json_lines.append(line)
        text = "\n".join(json_lines)
    return json.loads(text)


def migrate_with_raw(card: dict, raw: dict, client: anthropic.Anthropic, model: str) -> dict | None:
    """원본 콘텐츠가 있는 카드: 전체 재요약"""
    text = raw.get("rawText", "")
    max_chars = 8000
    if len(text) > max_chars:
        half = max_chars // 2
        text = text[:half] + "\n\n[...중략...]\n\n" + text[-half:]

    user_prompt = f"""다음 콘텐츠를 분석하여 Mnemo 지식 카드를 생성해주세요.

## 메타데이터
- 출처: {card.get('sourceName', '')}
- 유형: {card.get('sourceType', '')}
- URL: {card.get('sourceUrl', '')}
- 원본 제목: {raw.get('title', card.get('title', ''))}

## 콘텐츠
{text}"""

    resp = client.messages.create(
        model=model,
        max_tokens=2048,
        system=FULL_RESUMMARIZE_SYSTEM,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return parse_ai_json(resp.content[0].text)


def migrate_without_raw(card: dict, client: anthropic.Anthropic, model: str) -> dict | None:
    """원본 없는 카드: 기존 요약에서 변환"""
    user_prompt = f"""다음 기존 카드를 신규 양식으로 변환해주세요.

## 기존 카드
- 제목: {card['title']}
- 요약: {card['summary']}
- 시사점:
{chr(10).join('  - ' + imp for imp in card.get('implications', []))}
- 태그: {', '.join(card.get('tags', []))}"""

    resp = client.messages.create(
        model=model,
        max_tokens=1024,
        system=CONVERT_SYSTEM,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return parse_ai_json(resp.content[0].text)


def main():
    # 백업 먼저
    backup_path = CARDS_PATH + f".backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(CARDS_PATH, backup_path)
    logger.info(f"백업 완료: {backup_path}")

    cards = load_cards()
    kept = [(i, c) for i, c in enumerate(cards) if c.get("status") == "kept"]

    # 이미 soWhat이 있는 카드는 스킵
    # --raw-only 플래그: 원본이 있는 카드만 처리
    raw_only = "--raw-only" in sys.argv
    to_migrate = [(i, c) for i, c in kept if not c.get("soWhat")]
    if raw_only:
        to_migrate = [(i, c) for i, c in to_migrate
                      if c.get("rawContentRef") and load_raw_content(c["rawContentRef"]) is not None]
        logger.info(f"--raw-only 모드: 원본 있는 카드만 처리")
    if not to_migrate:
        logger.info("마이그레이션할 카드가 없습니다. 모든 카드가 이미 신규 양식입니다.")
        return

    logger.info(f"마이그레이션 대상: {len(to_migrate)}장 (전체 보관: {len(kept)}장)")

    # VM 환경: HTTP 프록시 + SSL 인증서 설정
    import httpx as _httpx
    import ssl as _ssl
    _ctx = _ssl.create_default_context(cafile="/etc/ssl/certs/ca-certificates.crt")
    _http_client = _httpx.Client(proxy="http://localhost:3128", verify=_ctx, timeout=60)
    client = anthropic.Anthropic(http_client=_http_client)
    model = "claude-sonnet-4-6"

    success = 0
    fail = 0

    for idx, card in to_migrate:
        title = card["title"][:40]
        raw_ref = card.get("rawContentRef", "")
        raw = load_raw_content(raw_ref) if raw_ref else None

        try:
            if raw:
                logger.info(f"[{success+fail+1}/{len(to_migrate)}] 전체 재요약: {title}")
                result = migrate_with_raw(card, raw, client, model)
            else:
                logger.info(f"[{success+fail+1}/{len(to_migrate)}] 기존→변환: {title}")
                result = migrate_without_raw(card, client, model)

            if not result:
                logger.warning(f"  결과 없음, 스킵: {title}")
                fail += 1
                continue

            # 카드 업데이트 (기존 필드 보존, 새 필드 추가/갱신)
            cards[idx]["title"] = result.get("title", card["title"])
            cards[idx]["summary"] = result.get("summary", card["summary"])
            cards[idx]["soWhat"] = result.get("soWhat", "")
            key_points = result.get("keyPoints", [])[:3]
            cards[idx]["keyPoints"] = key_points
            cards[idx]["implications"] = key_points  # 하위호환
            cards[idx]["tags"] = result.get("tags", card.get("tags", []))

            logger.info(f"  ✓ soWhat: {cards[idx]['soWhat'][:30]}...")
            success += 1

        except Exception as e:
            logger.error(f"  실패: {title} — {e}")
            fail += 1

    # 저장
    save_cards(cards)
    logger.info(f"\n마이그레이션 완료: 성공 {success}, 실패 {fail}")
    logger.info(f"cards.json 저장 완료. 백업: {backup_path}")


if __name__ == "__main__":
    main()
