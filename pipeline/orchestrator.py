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
    # 기존 카드에 추가 (제목 기반 중복 제거)
    existing_cards = load_cards()
    existing_titles = {c.get("title", "").strip().lower() for c in existing_cards}

    dedup_cards = []
    skipped = 0
    for card in new_cards:
        title_key = card.get("title", "").strip().lower()
        if title_key in existing_titles:
            skipped += 1
            logger.info(f"중복 카드 스킵: {card.get('title', '')[:50]}")
            continue
        existing_titles.add(title_key)
        dedup_cards.append(card)

    if skipped > 0:
        logger.info(f"중복 제거: {skipped}건 스킵, {len(dedup_cards)}건 저장")

    existing_cards.extend(dedup_cards)
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

    # cards.json → mnemo.db 동기화
    try:
        from pipeline.sync_db import sync_cards_to_db
        sync_cards_to_db()
    except Exception as e:
        logger.error(f"DB 동기화 실패 (카드는 JSON에 저장됨): {e}")


def run_compile() -> dict:
    """미컴파일 kept 카드를 wiki에 컴파일

    Returns:
        컴파일 결과 요약
    """
    logger.info("=" * 50)
    logger.info("Wiki 컴파일 시작")
    logger.info("=" * 50)

    from pipeline.compiler.theme_matcher import match_card_to_themes
    from pipeline.compiler.wiki_updater import (
        create_wiki_document, add_signal_to_wiki,
        update_wiki_index, ensure_wiki_dir, get_wiki_path,
    )

    cards = load_cards()
    state = load_state()

    # 테마 목록 로드 (state에 저장)
    themes = state.get("themes", [])
    compiled_ids = set(state.get("compiledCardIds", []))

    # kept이면서 아직 컴파일되지 않은 카드
    kept_uncompiled = [
        c for c in cards
        if c.get("status") == "kept" and c["id"] not in compiled_ids
    ]

    if not kept_uncompiled:
        logger.info("컴파일할 카드가 없습니다.")
        return {"compiled": 0, "new_themes": 0}

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    new_themes_count = 0

    ensure_wiki_dir()

    for card in kept_uncompiled:
        logger.info(f"컴파일 중: {card.get('title', card['id'])}")

        result = match_card_to_themes(card, themes, api_key)

        # 매칭된 테마에 시그널 추가
        for match in result.get("matchedThemes", []):
            theme_id = match["themeId"]
            signal_type = match.get("signalType", "reinforcing")

            theme = next((t for t in themes if t["id"] == theme_id), None)
            if theme:
                add_signal_to_wiki(theme_id, card, signal_type)
                if card["id"] not in theme.get("cardIds", []):
                    theme.setdefault("cardIds", []).append(card["id"])
                theme["signalCount"] = theme.get("signalCount", 0) + 1
                theme["lastCompiled"] = now_kst_iso()
                card.setdefault("themeIds", []).append(theme_id)
                card["signalType"] = signal_type

        # 새 테마 생성
        new_theme = result.get("newTheme")
        if new_theme and new_theme.get("name"):
            from pipeline.utils import generate_id
            theme_id = generate_id()
            theme = {
                "id": theme_id,
                "name": new_theme["name"],
                "summary": new_theme.get("summary", ""),
                "cardIds": [card["id"]],
                "openQuestions": new_theme.get("openQuestions", []),
                "relatedThemes": [],
                "wikiPath": f"wiki/{theme_id}.md",
                "lastCompiled": now_kst_iso(),
                "signalCount": 1,
                "status": "active",
            }
            themes.append(theme)

            # wiki 문서 생성
            wiki_content = create_wiki_document(theme)
            get_wiki_path(theme_id).write_text(wiki_content, encoding="utf-8")
            add_signal_to_wiki(theme_id, card, "new")

            card.setdefault("themeIds", []).append(theme_id)
            card["signalType"] = "new"
            new_themes_count += 1
            logger.info(f"새 테마 생성: {new_theme['name']}")

        compiled_ids.add(card["id"])

    # 인덱스 업데이트
    update_wiki_index(themes)

    # 저장
    state["themes"] = themes
    state["compiledCardIds"] = list(compiled_ids)
    save_state(state)
    save_cards(cards)

    result = {"compiled": len(kept_uncompiled), "new_themes": new_themes_count}
    logger.info(f"✅ 컴파일 완료: {result}")
    return result


def run_lint() -> dict:
    """전체 wiki 린팅 실행"""
    logger.info("=" * 50)
    logger.info("Wiki 린팅 시작")
    logger.info("=" * 50)

    from pipeline.compiler.linter import run_lint as execute_lint

    cards = load_cards()
    state = load_state()
    themes = state.get("themes", [])

    report = execute_lint(themes, cards)

    # dormant 테마 상태 업데이트
    for theme in themes:
        if theme["id"] in report.get("dormantThemes", []):
            theme["status"] = "dormant"

    state["themes"] = themes
    state["lastLintReport"] = report
    save_state(state)

    logger.info(f"✅ 린팅 완료")
    return report


def run_digest(period: str = "weekly") -> dict:
    """다이제스트 생성"""
    logger.info("=" * 50)
    logger.info(f"{period} 다이제스트 생성 시작")
    logger.info("=" * 50)

    from datetime import datetime, timedelta

    cards = load_cards()
    state = load_state()
    themes = state.get("themes", [])

    # 기간 계산
    now = datetime.now()
    if period == "weekly":
        start_date = now - timedelta(days=7)
    else:
        start_date = now - timedelta(days=30)

    # 기간 내 업데이트된 테마
    updated_themes = []
    for theme in themes:
        last = theme.get("lastCompiled", "")
        if last:
            try:
                last_dt = datetime.fromisoformat(last.replace("Z", "+00:00")).replace(tzinfo=None)
                if last_dt >= start_date:
                    updated_themes.append(theme)
            except (ValueError, TypeError):
                pass

    if not updated_themes:
        logger.info("기간 내 업데이트된 테마가 없습니다.")
        return {"period": period, "themes_updated": 0, "digest": "업데이트 없음"}

    # 다이제스트 생성
    digest_lines = [
        f"# Mnemo {'주간' if period == 'weekly' else '월간'} 다이제스트",
        f"\n> 기간: {start_date.strftime('%Y-%m-%d')} ~ {now.strftime('%Y-%m-%d')}",
        f"\n## 업데이트된 테마 ({len(updated_themes)}개)\n",
    ]

    for theme in updated_themes:
        digest_lines.append(f"### {theme['name']}")
        digest_lines.append(f"- 시그널 수: {theme.get('signalCount', 0)}")
        digest_lines.append(f"- 상태: {theme.get('status', 'active')}")
        digest_lines.append(f"- 요약: {theme.get('summary', '없음')}")
        digest_lines.append("")

    digest = "\n".join(digest_lines)

    # 저장
    from pipeline.utils import get_data_dir
    output_dir = get_data_dir() / "wiki" / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"digest-{period}-{now.strftime('%Y%m%d')}.md"
    (output_dir / filename).write_text(digest, encoding="utf-8")

    logger.info(f"✅ 다이제스트 저장: {filename}")
    return {
        "period": period,
        "themes_updated": len(updated_themes),
        "digest": digest,
        "file": str(output_dir / filename),
    }


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
        "--compile",
        action="store_true",
        help="미컴파일 kept 카드를 wiki에 컴파일",
    )
    parser.add_argument(
        "--lint",
        action="store_true",
        help="전체 wiki 린팅 실행",
    )
    parser.add_argument(
        "--digest",
        choices=["weekly", "monthly"],
        default=None,
        help="다이제스트 생성 (weekly/monthly)",
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

    # 개별 명령 실행
    if args.compile:
        result = run_compile()
        print(f"\n{'='*40}")
        print(f"컴파일: {result['compiled']}건, 새 테마: {result['new_themes']}개")
        print(f"{'='*40}")
        return

    if args.lint:
        result = run_lint()
        print(f"\n{'='*40}")
        print(f"Dormant 테마: {len(result.get('dormantThemes', []))}개")
        print(f"충돌 시그널: {result.get('unresolvedConflicts', 0)}건")
        print(f"답변 가능 질문: {len(result.get('answerableQuestions', []))}건")
        print(f"{'='*40}")
        return

    if args.digest:
        result = run_digest(args.digest)
        print(f"\n{'='*40}")
        print(f"다이제스트: {result['period']}, 테마 {result['themes_updated']}개")
        print(f"{'='*40}")
        return

    # 기본: 수집 파이프라인
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
