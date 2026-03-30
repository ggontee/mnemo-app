"""기존 TLDR 보관 카드를 개별 토픽으로 분리 후 재요약

1. 원본(raw)이 있는 TLDR kept 카드를 찾는다
2. splitter로 분리
3. 각 토픽을 신규 양식(soWhat + keyPoints)으로 요약
4. 기존 merged 카드 삭제, 분리된 카드로 교체
5. Deep Dive (aiQuestions 등) 삭제
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import ssl
from datetime import datetime

import anthropic
import httpx

from pipeline.splitter.newsletter_splitter import split_newsletter
from pipeline.summarizer.card_generator import summarize_single
from pipeline.utils import get_data_dir, load_json, save_json, generate_id, now_kst_iso

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CARDS_PATH = get_data_dir() / "cards.json"


def make_client():
    ctx = ssl.create_default_context(cafile="/etc/ssl/certs/ca-certificates.crt")
    http_client = httpx.Client(proxy="http://localhost:3128", verify=ctx, timeout=60)
    return anthropic.Anthropic(http_client=http_client)


def main():
    # 백업
    backup = str(CARDS_PATH) + f".backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(CARDS_PATH, backup)
    logger.info(f"백업: {backup}")

    cards = load_json(CARDS_PATH)
    client = make_client()
    model = "claude-sonnet-4-6"

    # TLDR kept + raw 있는 카드 찾기
    targets = []
    for i, c in enumerate(cards):
        if (c.get("status") == "kept"
            and c.get("sourceName") == "TLDR"
            and c.get("rawContentRef")):
            raw_path = get_data_dir() / c["rawContentRef"]
            if raw_path.exists():
                targets.append((i, c, raw_path))

    if not targets:
        logger.info("분리 대상 TLDR 카드 없음")
        return

    logger.info(f"분리 대상: {len(targets)}장")

    # 삭제할 인덱스, 추가할 카드 수집
    indices_to_remove = set()
    new_cards = []

    for idx, card, raw_path in targets:
        raw = load_json(raw_path)
        raw["rawContentRef"] = card["rawContentRef"]
        raw["sourceName"] = card.get("sourceName", "TLDR")
        raw["sourceType"] = card.get("sourceType", "newsletter")

        logger.info(f"━━━ 분리 중: {card['title']}")

        # 1. Split
        split_results = split_newsletter(raw, client, model)

        if len(split_results) <= 1:
            logger.info(f"  단일 토픽, 분리 안함")
            continue

        # 이 카드는 삭제 대상
        indices_to_remove.add(idx)

        # 2. 각 토픽 요약
        for topic_raw in split_results:
            if len(topic_raw.get("rawText", "")) < 100:
                logger.debug(f"  스킵 (너무 짧음): {topic_raw.get('title', '')[:40]}")
                continue

            card_result = summarize_single(topic_raw, client, model)
            if card_result:
                # pending → kept로 설정 (부모가 kept이었으므로)
                card_result["status"] = "pending"
                # 분리 추적 필드
                card_result["parentNewsletterTitle"] = card.get("title", "")
                card_result["splitIndex"] = topic_raw.get("splitIndex", -1)
                # Deep Dive 없이 깨끗하게
                card_result.pop("aiQuestions", None)
                card_result.pop("aiAnswers", None)

                new_cards.append(card_result)
                logger.info(f"  ✓ {card_result['title']}")
            else:
                logger.warning(f"  ✗ 요약 실패: {topic_raw.get('title', '')[:40]}")

    # 3. cards.json 업데이트
    if not indices_to_remove:
        logger.info("분리된 카드 없음, 변경 없이 종료")
        return

    # 기존 카드에서 삭제 대상 제거
    updated_cards = [c for i, c in enumerate(cards) if i not in indices_to_remove]
    # 새 카드 추가
    updated_cards.extend(new_cards)

    save_json(CARDS_PATH, updated_cards)

    removed_titles = [cards[i]["title"] for i in indices_to_remove]
    logger.info(f"\n완료:")
    logger.info(f"  삭제: {len(indices_to_remove)}장 — {removed_titles}")
    logger.info(f"  추가: {len(new_cards)}장 (pending 상태)")
    logger.info(f"  전체: {len(updated_cards)}장")


if __name__ == "__main__":
    from pathlib import Path
    import sys
    # .env 로드
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

    main()
