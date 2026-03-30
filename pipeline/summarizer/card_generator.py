"""AI 요약기 — raw 콘텐츠를 Mnemo 카드로 변환

Claude API를 사용해서 수집된 콘텐츠를 구조화된 카드로 요약한다.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import anthropic

from pipeline.utils import (
    load_config, generate_id, now_kst_iso
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """당신은 콘텐츠를 분석해서 지식 카드를 생성하는 AI입니다.

입력된 콘텐츠(뉴스레터 아티클 또는 영상 트랜스크립트)와
함께 제공되는 메타데이터(원본 URL, 출처명, 콘텐츠 유형)를 활용하여
다음 JSON 형식으로 출력하세요:

{
  "title": "핵심을 담은 한국어 제목 (원본이 영어면 번역, 20자 이내)",
  "summary": "무슨 일이 있었는지 사실 중심 요약 1~2문장. 100자 이내. 의견이나 판단 배제, 팩트만.",
  "soWhat": "그래서 뭐? — 이 콘텐츠가 왜 중요한지 한 줄 해석. 50자 이내.",
  "keyPoints": [
    "핵심 포인트 1: 구체적 사실이나 수치, 또는 중요한 맥락 (50자 이내)",
    "핵심 포인트 2: 위와 다른 각도의 사실 또는 맥락 (50자 이내)",
    "핵심 포인트 3: (있으면) 추가 포인트 (50자 이내)"
  ],
  "tags": ["태그1", "태그2", "태그3"],
  "sourceUrl": "원본 콘텐츠 URL (메타데이터에서 그대로 전달)",
  "sourceName": "출처명 (메타데이터에서 그대로 전달)",
  "sourceType": "newsletter 또는 video (메타데이터에서 그대로 전달)"
}

규칙:
- summary는 사실 전달에 집중. "~할 전망", "~에 주목해야" 같은 판단 문구 금지.
- soWhat은 읽는 사람이 '왜 이걸 신경 써야 하지?'에 대한 답. 콘텐츠 고유의 맥락에서 작성.
- keyPoints는 2~3개. "실무/트렌드/커리어" 같은 고정 프레임 없이, 콘텐츠에서 실제로 중요한 포인트만 추출.
  구체적 수치, 이름, 날짜가 있으면 반드시 포함.
- tags는 3~5개, 주제 영역 중심 (예: 크립토, 지정학, SaaS, 반도체)
- 한국어로 작성, 고유명사와 기술 용어는 영문 병기 가능
- 반드시 유효한 JSON만 출력. 다른 텍스트 없이 JSON 객체만."""


def build_user_prompt(raw_content: dict) -> str:
    """raw 콘텐츠를 AI 입력 프롬프트로 변환"""
    text = raw_content.get("rawText", "")
    # 트랜스크립트가 너무 길면 앞뒤를 잘라서 전달 (토큰 절약)
    max_chars = 8000
    if len(text) > max_chars:
        half = max_chars // 2
        text = text[:half] + "\n\n[...중략...]\n\n" + text[-half:]

    metadata = {
        "sourceUrl": raw_content.get("url", ""),
        "sourceName": raw_content.get("sourceName", ""),
        "sourceType": raw_content.get("sourceType", ""),
    }

    return f"""다음 콘텐츠를 분석하여 Mnemo 지식 카드를 생성해주세요.

## 메타데이터
- 출처: {metadata['sourceName']}
- 유형: {metadata['sourceType']}
- URL: {metadata['sourceUrl']}
- 원본 제목: {raw_content.get('title', '')}

## 콘텐츠
{text}"""


def summarize_single(raw_content: dict, client: anthropic.Anthropic, model: str) -> Optional[dict]:
    """단일 raw 콘텐츠를 Mnemo 카드로 변환"""
    try:
        user_prompt = build_user_prompt(raw_content)

        response = client.messages.create(
            model=model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        # 응답에서 JSON 추출
        response_text = response.content[0].text.strip()

        # JSON 블록이 ```json ... ``` 으로 감싸져 있을 수 있음
        if response_text.startswith("```"):
            lines = response_text.split("\n")
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
            response_text = "\n".join(json_lines)

        card_data = json.loads(response_text)

        # 필수 필드 검증
        required = ["title", "summary", "implications", "tags", "sourceUrl", "sourceName", "sourceType"]
        for field in required:
            if field not in card_data:
                logger.warning(f"필수 필드 누락: {field}")
                # 메타데이터 필드는 원본에서 보충
                if field == "sourceUrl":
                    card_data["sourceUrl"] = raw_content.get("url", "")
                elif field == "sourceName":
                    card_data["sourceName"] = raw_content.get("sourceName", "")
                elif field == "sourceType":
                    card_data["sourceType"] = raw_content.get("sourceType", "")

        # Article 객체로 변환
        # soWhat + keyPoints (신규) → implications (하위호환)로도 매핑
        so_what = card_data.get("soWhat", "")
        key_points = card_data.get("keyPoints", card_data.get("implications", []))[:3]

        article = {
            "id": generate_id(),
            "title": card_data["title"],
            "summary": card_data["summary"],
            "soWhat": so_what,
            "keyPoints": key_points,
            "implications": key_points,  # 하위호환: 기존 프론트엔드 깨지지 않게
            "tags": card_data.get("tags", [])[:5],
            "sourceUrl": card_data["sourceUrl"],
            "sourceName": card_data["sourceName"],
            "sourceType": card_data["sourceType"],
            "createdAt": now_kst_iso(),
            "status": "pending",
            "rawContentRef": raw_content.get("rawContentRef", ""),
            # 분리된 카드 추적 (splitter에서 온 경우)
            "parentNewsletterTitle": raw_content.get("parentNewsletterTitle", ""),
            "splitIndex": raw_content.get("splitIndex", -1),
        }

        logger.info(f"카드 생성 완료: {article['title']}")
        return article

    except json.JSONDecodeError as e:
        logger.error(f"AI 응답 JSON 파싱 실패: {e}")
        return None
    except anthropic.APIError as e:
        logger.error(f"Anthropic API 오류: {e}")
        return None
    except Exception as e:
        logger.error(f"요약 실패 ({raw_content.get('title', '?')}): {e}")
        return None


def summarize_batch(raw_contents: list[dict]) -> list[dict]:
    """여러 raw 콘텐츠를 배치로 요약

    Returns:
        생성된 Article 카드 목록
    """
    if not raw_contents:
        logger.info("요약할 콘텐츠가 없습니다.")
        return []

    config = load_config("pipeline_config")
    model = config.get("anthropicModel", "claude-sonnet-4-6")

    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수 사용

    cards = []
    for i, raw in enumerate(raw_contents):
        logger.info(f"요약 중 ({i+1}/{len(raw_contents)}): {raw.get('title', '?')}")
        card = summarize_single(raw, client, model)
        if card:
            cards.append(card)

    logger.info(f"AI 요약 완료: {len(cards)}/{len(raw_contents)}건 성공")
    return cards


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    # 테스트용 더미 데이터
    test_raw = {
        "sourceId": "test_001",
        "sourceName": "TestSource",
        "sourceType": "newsletter",
        "title": "Test Article",
        "url": "https://example.com/test",
        "rawText": "This is a test article about AI agents transforming software development.",
        "rawContentRef": "raw/newsletters/2026-03-13/test_001.json",
    }

    cards = summarize_batch([test_raw])
    for c in cards:
        print(json.dumps(c, ensure_ascii=False, indent=2))
