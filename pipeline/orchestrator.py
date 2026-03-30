"""Mnemo 파이프라인 오케스트레이터

수집 → 요약 → 저장의 전체 흐름을 관리한다.
"""
from __future__ import annotations

import logging
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

# .env 파일에서 환경변수 로드 (python-dotenv 없이)
def _load_dotenv():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

_load_dotenv()

from pipeline.collectors.youtube_collector import collect_videos
from pipeline.collectors.newsletter_collector import collect_newsletters
from pipeline.splitter.newsletter_splitter import split_batch
from pipeline.summarizer.card_generator import summarize_batch
from pipeline.utils import (
    load_state, save_state, load_cards, save_cards, load_config, now_kst_iso
)

logger = logging.getLogger(__name__)


def run_collection(sources: list[str] = None) -> list[dict]:
    """데이터 수집 단계

    Args:
        sources: 수집할 소스 목록. None이면 전체. ["video", "newsletter"]

    Returns:
        수집된 raw 콘텐츠 목록
    """
    if sources is None:
        sources = ["video", "newsletter"]

    all_raw = []

    if "video" in sources:
        logger.info("=" * 50)
        logger.info("YouTube 영상 수집 시작")
        logger.info("=" * 50)
        try:
            video_raw = collect_videos()
            all_raw.extend(video_raw)
        except Exception as e:
            logger.error(f"YouTube 수집 중 오류: {e}")

    if "newsletter" in sources:
        logger.info("=" * 50)
        logger.info("뉴스레터 수집 시작")
        logger.info("=" * 50)
        try:
            newsletter_raw = collect_newsletters()
            all_raw.extend(newsletter_raw)
        except Exception as e:
            logger.error(f"뉴스레터 수집 중 오류: {e}")

    logger.info(f"총 {len(all_raw)}건 수집 완료")
    return all_raw


def run_summarize(raw_contents: list[dict]) -> list[dict]:
    """AI 요약 단계

    Returns:
        생성된 카드 목록
    """
    logger.info("=" * 50)
    logger.info(f"AI 요약 시작 ({len(raw_contents)}건)")
    logger.info("=" * 50)

    cards = summarize_batch(raw_contents)
    return cards


def run_save(new_cards: list[dict], raw_contents: list[dict]) -> None:
    """결과 저장 단계"""
    # 기존 카드에 추가
    existing_cards = load_cards()
    existing_cards.extend(new_cards)
    save_cards(existing_cards)

    # 상태 업데이트
    state = load_state()
    state["lastCollectionRun"] = now_kst_iso()

    # 수집된 ID 기록 (중복 방지용)
    new_video_ids = [r["sourceId"] for r in raw_contents if r["sourceType"] == "video"]
    new_email_ids = list(set(r.get("emailId", "") for r in raw_contents if r["sourceType"] == "newsletter"))
    new_email_ids = [eid for eid in new_email_ids if eid]

    state["lastVideoIds"] = list(set(state.get("lastVideoIds", []) + new_video_ids))[-50:]  # 최근 50개만 유지
    state["lastEmailIds"] = list(set(state.get("lastEmailIds", []) + new_email_ids))[-50:]

    # 통계 업데이트
    all_cards = existing_cards
    state["stats"] = {
        "totalCollected": len(all_cards),
        "totalKept": sum(1 for c in all_cards if c["status"] == "kept"),
        "totalDiscarded": sum(1 for c in all_cards if c["status"] == "discarded"),
        "pendingCards": sum(1 for c in all_cards if c["status"] == "pending"),
    }

    save_state(state)
    logger.info(f"저장 완료: {len(new_cards)}개 카드 추가 (전체 {len(all_cards)}개)")


def run_pipeline(sources: list[str] = None, skip_summarize: bool = False) -> dict:
    """전체 파이프라인 실행

    Args:
        sources: 수집 소스 목록
        skip_summarize: True면 수집만 하고 요약은 스킵

    Returns:
        실행 결과 요약
    """
    start = datetime.now()
    logger.info("🚀 Mnemo 파이프라인 시작")

    # 1. 수집
    raw_contents = run_collection(sources)

    if not raw_contents:
        logger.info("수집된 콘텐츠가 없어 파이프라인을 종료합니다.")
        return {"collected": 0, "split": 0, "summarized": 0, "duration_sec": 0}

    # 2. 뉴스레터 분리 (multi-topic 소스만)
    collected_count = len(raw_contents)
    if not skip_summarize:
        try:
            import anthropic
            newsletter_config = load_config("newsletter_sources")
            pipeline_config = load_config("pipeline_config")
            model = pipeline_config.get("anthropicModel", "claude-sonnet-4-6")
            client = anthropic.Anthropic()
            raw_contents = split_batch(raw_contents, newsletter_config, client, model)
            logger.info(f"Split 완료: {collected_count}건 → {len(raw_contents)}건")
        except Exception as e:
            logger.error(f"Split 단계 오류 (원본 유지): {e}")

    # 3. 요약
    new_cards = []
    if not skip_summarize:
        new_cards = run_summarize(raw_contents)
    else:
        logger.info("요약 단계를 스킵합니다.")

    # 3. 저장
    if new_cards:
        run_save(new_cards, raw_contents)

    elapsed = (datetime.now() - start).total_seconds()
    result = {
        "collected": collected_count,
        "split": len(raw_contents),
        "summarized": len(new_cards),
        "duration_sec": round(elapsed, 1),
    }

    logger.info(f"✅ 파이프라인 완료: {result}")
    return result


def main():
    parser = argparse.ArgumentParser(description="Mnemo 데이터 파이프라인")
    parser.add_argument(
        "--source",
        choices=["video", "newsletter", "all"],
        default="all",
        help="수집 소스 (기본: all)",
    )
    parser.add_argument(
        "--collect-only",
        action="store_true",
        help="수집만 하고 AI 요약은 스킵",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="상세 로그 출력",
    )

    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    sources = None if args.source == "all" else [args.source]
    result = run_pipeline(sources=sources, skip_summarize=args.collect_only)

    # 결과 출력
    print(f"\n{'='*40}")
    print(f"수집: {result['collected']}건")
    print(f"요약: {result['summarized']}건")
    print(f"소요: {result['duration_sec']}초")
    print(f"{'='*40}")


if __name__ == "__main__":
    main()
