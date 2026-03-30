"""뉴스레터 분리기 — 큐레이션형 뉴스레터를 개별 토픽으로 분리

TLDR처럼 여러 뉴스를 모아 보내는 뉴스레터를 개별 기사 단위로 쪼갠다.
단일 주제 뉴스레터(Stratechery 등)는 그대로 1건으로 유지.

사용법:
  split_result = split_if_needed(raw_content, source_config)
  → [raw_content] (단일) 또는 [chunk1, chunk2, ...] (분리됨)
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import anthropic

from pipeline.utils import generate_id

logger = logging.getLogger(__name__)

# ── 분리 판단 + 실행을 한 번에 하는 프롬프트 ─────────────────────
SPLIT_SYSTEM = """당신은 뉴스레터 콘텐츠를 분석하여 독립된 토픽 단위로 분리하는 AI입니다.

입력된 뉴스레터 원문을 읽고, 독립적인 뉴스/토픽이 여러 개 존재하는지 판단한 뒤:
- 2개 이상의 독립 토픽이 있으면 각각을 분리하세요.
- 하나의 연결된 주제로 이루어진 글이면 분리하지 마세요.

다음 JSON 형식으로 출력하세요:

{
  "shouldSplit": true 또는 false,
  "reason": "분리/비분리 판단 이유 한 줄",
  "topics": [
    {
      "title": "토픽의 원문 제목 또는 핵심 요약 (영문 그대로 유지)",
      "text": "해당 토픽에 속하는 본문 텍스트 (광고·스폰서 제외, 핵심 내용만)",
      "category": "HEADLINES | DEEP_DIVE | ENGINEERING | OPINION | OTHER"
    }
  ]
}

규칙:
- shouldSplit이 false이면 topics는 빈 배열 []
- 스폰서 광고, 구독 링크, 서명 등은 제외
- 각 topic의 text는 원문에서 해당 부분을 가져오되, 불필요한 링크 번호([1], [2])는 제거
- 너무 짧은 항목(1~2문장짜리 언급)은 독립 토픽으로 분리하지 말 것
- category는 참고용. 정확히 맞추지 않아도 됨
- 반드시 유효한 JSON만 출력"""


def _parse_json(text: str) -> dict:
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


def split_newsletter(
    raw_content: dict,
    client: anthropic.Anthropic,
    model: str,
) -> list[dict]:
    """큐레이션형 뉴스레터를 개별 토픽 raw_content로 분리

    Returns:
        분리된 raw_content 목록. 분리 불필요시 원본 1건 그대로 반환.
    """
    text = raw_content.get("rawText", "")
    if not text:
        return [raw_content]

    # 너무 짧으면 분리 불필요
    if len(text) < 1500:
        logger.debug(f"본문이 짧아 분리 스킵: {raw_content.get('title', '')}")
        return [raw_content]

    max_chars = 10000
    if len(text) > max_chars:
        text = text[:max_chars]

    user_prompt = f"""다음 뉴스레터를 분석하여 독립 토픽으로 분리해주세요.

## 메타데이터
- 뉴스레터: {raw_content.get('sourceName', '')}
- 제목: {raw_content.get('title', '')}

## 본문
{text}"""

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=SPLIT_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
        )

        result = _parse_json(response.content[0].text)

        if not result.get("shouldSplit", False):
            logger.info(f"단일 토픽 뉴스레터 (분리 안함): {raw_content.get('title', '')}")
            return [raw_content]

        topics = result.get("topics", [])
        if len(topics) < 2:
            logger.info(f"토픽 1개 이하, 분리 안함: {raw_content.get('title', '')}")
            return [raw_content]

        # 각 토픽을 독립 raw_content로 변환
        split_contents = []
        parent_id = raw_content.get("sourceId", generate_id())

        for i, topic in enumerate(topics):
            topic_text = topic.get("text", "").strip()
            if not topic_text or len(topic_text) < 100:
                logger.debug(f"토픽 텍스트 너무 짧아 스킵: {topic.get('title', '')}")
                continue

            chunk = {
                # 기본 메타데이터는 원본에서 상속
                "sourceId": f"{parent_id}_t{i}",
                "sourceName": raw_content.get("sourceName", ""),
                "sourceType": raw_content.get("sourceType", "newsletter"),
                "title": topic.get("title", f"Topic {i+1}"),
                "url": raw_content.get("url", ""),
                "rawText": topic_text,
                "collectedAt": raw_content.get("collectedAt", ""),
                "emailId": raw_content.get("emailId", ""),
                # 분리 추적용 필드
                "parentNewsletterTitle": raw_content.get("title", ""),
                "parentRawRef": raw_content.get("rawContentRef", ""),
                "splitIndex": i,
                "splitCategory": topic.get("category", "OTHER"),
            }
            split_contents.append(chunk)

        if not split_contents:
            logger.warning(f"분리 결과가 비어 원본 유지: {raw_content.get('title', '')}")
            return [raw_content]

        logger.info(
            f"뉴스레터 분리 완료: '{raw_content.get('title', '')[:40]}' → {len(split_contents)}개 토픽"
        )
        return split_contents

    except json.JSONDecodeError as e:
        logger.error(f"Splitter JSON 파싱 실패: {e}")
        return [raw_content]
    except anthropic.APIError as e:
        logger.error(f"Splitter API 오류: {e}")
        return [raw_content]
    except Exception as e:
        logger.error(f"Splitter 실패 ({raw_content.get('title', '')}): {e}")
        return [raw_content]


def split_batch(
    raw_contents: list[dict],
    newsletter_config: dict,
    client: anthropic.Anthropic,
    model: str,
) -> list[dict]:
    """배치 단위로 분리 처리

    newsletter_config의 parseStrategy에 따라:
    - "multi-topic": AI 분리 시도
    - "single-article": 분리 없이 그대로 통과

    Args:
        raw_contents: 수집된 raw 콘텐츠 목록
        newsletter_config: newsletter_sources.json의 sources 목록
        client: Anthropic 클라이언트
        model: 사용할 모델명

    Returns:
        분리 후 raw_content 목록 (원본 + 분리된 항목)
    """
    # source name → config 매핑
    strategy_map = {}
    for src in newsletter_config.get("sources", []):
        strategy_map[src["name"].lower()] = src.get("parseStrategy", "single-article")

    result = []
    for raw in raw_contents:
        source_name = raw.get("sourceName", "").lower()
        strategy = strategy_map.get(source_name, "single-article")

        if raw.get("sourceType") != "newsletter":
            # 뉴스레터가 아니면 (비디오 등) 그대로 통과
            result.append(raw)
            continue

        if strategy == "multi-topic":
            split_items = split_newsletter(raw, client, model)
            result.extend(split_items)
        else:
            result.append(raw)

    logger.info(f"Split 결과: {len(raw_contents)}건 → {len(result)}건")
    return result
