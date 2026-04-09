"""Wiki 린팅 모듈

테마 건강도를 점검하고 린트 리포트를 생성한다.
주 1회 실행 권장 (매주 월요일).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from pipeline.utils import get_data_dir, now_kst_iso, generate_id

logger = logging.getLogger(__name__)

DORMANT_THRESHOLD_DAYS = 30
WIKI_DIR = get_data_dir() / "wiki"


def run_lint(themes: list[dict], cards: list[dict]) -> dict:
    """전체 wiki 린팅 실행

    Args:
        themes: 모든 테마 목록
        cards: 모든 카드 목록

    Returns:
        린트 리포트 dict
    """
    now = datetime.now()
    report = {
        "id": f"lint-{generate_id()}",
        "createdAt": now_kst_iso(),
        "dormantThemes": [],
        "unresolvedConflicts": 0,
        "answerableQuestions": [],
        "newConnections": [],
        "staleThemes": [],
    }

    # 카드 인덱스
    card_map = {c["id"]: c for c in cards}
    kept_cards = [c for c in cards if c.get("status") == "kept"]

    for theme in themes:
        theme_id = theme["id"]

        # 1. Dormancy 체크
        last_compiled = theme.get("lastCompiled", "")
        if last_compiled:
            try:
                last_date = datetime.fromisoformat(last_compiled.replace("Z", "+00:00"))
                days_since = (now - last_date.replace(tzinfo=None)).days
                if days_since >= DORMANT_THRESHOLD_DAYS:
                    report["dormantThemes"].append(theme_id)
                    logger.info(f"Dormant 테마 발견: {theme.get('name')} ({days_since}일)")
            except (ValueError, TypeError):
                pass

        # 2. 충돌 시그널 체크
        theme_card_ids = theme.get("cardIds", [])
        for card_id in theme_card_ids:
            card = card_map.get(card_id)
            if card and card.get("signalType") == "contradicting":
                report["unresolvedConflicts"] += 1

        # 3. 열린 질문 중 답변 가능한 것 탐색
        open_questions = theme.get("openQuestions", [])
        for question in open_questions:
            question_lower = question.lower()
            for card in kept_cards:
                if card["id"] in theme_card_ids:
                    continue
                # 간단한 키워드 매칭
                card_text = f"{card.get('title', '')} {card.get('summary', '')}".lower()
                q_words = [w for w in question_lower.split() if len(w) > 2]
                matches = sum(1 for w in q_words if w in card_text)
                if q_words and matches / len(q_words) > 0.3:
                    report["answerableQuestions"].append({
                        "themeId": theme_id,
                        "question": question,
                        "suggestedCardId": card["id"],
                    })
                    break

        # 4. 종합 판단 현행화 체크
        if last_compiled:
            try:
                last_date = datetime.fromisoformat(last_compiled.replace("Z", "+00:00"))
                days_since = (now - last_date.replace(tzinfo=None)).days
                if days_since >= 14 and theme.get("status") == "active":
                    report["staleThemes"].append(theme_id)
            except (ValueError, TypeError):
                pass

    # 5. 테마 간 새 연결 탐색
    for i, t1 in enumerate(themes):
        for t2 in themes[i + 1:]:
            if t2["id"] in (t1.get("relatedThemes") or []):
                continue
            # 태그 기반 간단한 연결 탐색
            t1_cards = [card_map.get(cid) for cid in (t1.get("cardIds") or [])]
            t2_cards = [card_map.get(cid) for cid in (t2.get("cardIds") or [])]
            t1_tags = set()
            t2_tags = set()
            for c in t1_cards:
                if c:
                    t1_tags.update(c.get("tags", []))
            for c in t2_cards:
                if c:
                    t2_tags.update(c.get("tags", []))
            overlap = t1_tags & t2_tags
            if len(overlap) >= 2:
                report["newConnections"].append({
                    "from": t1["id"],
                    "to": t2["id"],
                    "reason": f"공통 태그: {', '.join(list(overlap)[:3])}",
                })

    # 린트 리포트 파일 저장
    report_path = WIKI_DIR / "lint_report.md"
    _save_lint_report_md(report, themes, report_path)

    logger.info(
        f"린팅 완료: dormant={len(report['dormantThemes'])}, "
        f"conflicts={report['unresolvedConflicts']}, "
        f"answerable={len(report['answerableQuestions'])}, "
        f"connections={len(report['newConnections'])}"
    )

    return report


def _save_lint_report_md(report: dict, themes: list[dict], path: Path) -> None:
    """린트 리포트를 마크다운으로 저장"""
    theme_map = {t["id"]: t.get("name", t["id"]) for t in themes}

    lines = [
        "# Wiki 린트 리포트",
        f"\n> 실행 시점: {report['createdAt']}",
        "",
    ]

    # Dormant 테마
    lines.append("## Dormant 테마 (30일+ 시그널 없음)")
    if report["dormantThemes"]:
        for tid in report["dormantThemes"]:
            lines.append(f"- {theme_map.get(tid, tid)}")
    else:
        lines.append("- 없음")

    # 충돌 시그널
    lines.append(f"\n## 미해결 충돌 시그널: {report['unresolvedConflicts']}건")

    # 답변 가능한 질문
    lines.append("\n## 답변 가능한 열린 질문")
    if report["answerableQuestions"]:
        for aq in report["answerableQuestions"]:
            lines.append(
                f"- **{theme_map.get(aq['themeId'], aq['themeId'])}**: "
                f"{aq['question']} → 카드 `{aq['suggestedCardId']}`"
            )
    else:
        lines.append("- 없음")

    # 새 연결
    lines.append("\n## 새 테마 연결 가능성")
    if report["newConnections"]:
        for nc in report["newConnections"]:
            lines.append(
                f"- {theme_map.get(nc['from'], nc['from'])} ↔ "
                f"{theme_map.get(nc['to'], nc['to'])}: {nc['reason']}"
            )
    else:
        lines.append("- 없음")

    # Stale 테마
    lines.append("\n## 종합 판단 갱신 필요")
    if report["staleThemes"]:
        for tid in report["staleThemes"]:
            lines.append(f"- {theme_map.get(tid, tid)}")
    else:
        lines.append("- 모든 테마가 최신 상태")

    path.write_text("\n".join(lines), encoding="utf-8")
