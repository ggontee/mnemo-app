"""테마 매칭 모듈

카드의 내용을 분석하여 기존 테마와 매칭하거나 새 테마를 제안한다.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def match_card_to_themes(
    card: dict,
    existing_themes: list[dict],
    api_key: Optional[str] = None,
) -> dict:
    """카드를 기존 테마와 매칭한다.

    Args:
        card: 카드 데이터 (title, summary, tags, keyPoints 등)
        existing_themes: 기존 테마 목록 [{id, name, summary, ...}]
        api_key: Anthropic API 키 (없으면 태그 기반 폴백)

    Returns:
        {
            "matchedThemes": [{"themeId": str, "signalType": "reinforcing"|"contradicting"|"new"}],
            "newTheme": {"name": str, "summary": str, "openQuestions": [str]} | None
        }
    """
    if api_key and existing_themes:
        try:
            return _match_with_claude(card, existing_themes, api_key)
        except Exception as e:
            logger.warning(f"Claude 매칭 실패, 태그 폴백 사용: {e}")

    return _match_by_tags(card, existing_themes)


def _match_with_claude(card: dict, themes: list[dict], api_key: str) -> dict:
    """Claude API를 사용한 시맨틱 매칭"""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    theme_list = "\n".join(
        f"- ID: {t['id']}, 이름: {t['name']}, 요약: {t.get('summary', '없음')}"
        for t in themes
    )

    prompt = f"""다음 카드를 기존 테마 목록과 매칭해주세요.

## 카드 정보
- 제목: {card.get('title', '')}
- 요약: {card.get('summary', '')}
- 태그: {', '.join(card.get('tags', []))}
- Key Points: {json.dumps(card.get('keyPoints', card.get('implications', [])), ensure_ascii=False)}

## 기존 테마 목록
{theme_list}

## 규칙
- 매칭 점수 0.7 이상인 테마만 포함
- 각 매칭에 대해 시그널 타입 판단:
  - "reinforcing": 기존 판단을 강화
  - "contradicting": 기존 판단과 충돌
  - "new": 새로운 방향의 시그널
- 매칭 테마가 없으면 새 테마 제안 (name, summary, openQuestions)

## 응답 형식 (JSON만)
{{
  "matchedThemes": [{{"themeId": "...", "signalType": "reinforcing|contradicting|new"}}],
  "newTheme": null 또는 {{"name": "...", "summary": "...", "openQuestions": ["..."]}}
}}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text
    # JSON 블록 추출
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    return json.loads(text.strip())


def _match_by_tags(card: dict, themes: list[dict]) -> dict:
    """태그 오버랩 기반 폴백 매칭"""
    card_tags = set(card.get("tags", []))
    if not card_tags:
        return {"matchedThemes": [], "newTheme": None}

    matched = []
    for theme in themes:
        # 테마에 연결된 카드들의 태그를 추론 (테마 이름 기반)
        theme_name_words = set(theme.get("name", "").lower().split())
        overlap = len(card_tags & theme_name_words)
        # 간단한 유사도: 태그가 테마 이름 단어와 겹치면 매칭
        if overlap > 0 or any(
            tag.lower() in theme.get("name", "").lower()
            for tag in card_tags
        ):
            matched.append({
                "themeId": theme["id"],
                "signalType": "reinforcing",
            })

    return {
        "matchedThemes": matched,
        "newTheme": None,
    }
