"""Wiki 문서 업데이트 모듈

테마 wiki .md 파일을 생성하거나 업데이트한다.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path

from pipeline.utils import get_data_dir, now_kst_iso

logger = logging.getLogger(__name__)

WIKI_DIR = get_data_dir() / "wiki"


def ensure_wiki_dir():
    """wiki 디렉토리 생성"""
    WIKI_DIR.mkdir(parents=True, exist_ok=True)


def theme_id_to_filename(theme_id: str) -> str:
    """테마 ID를 파일명으로 변환"""
    return f"{theme_id}.md"


def get_wiki_path(theme_id: str) -> Path:
    """테마의 wiki 파일 경로"""
    return WIKI_DIR / theme_id_to_filename(theme_id)


def create_wiki_document(theme: dict) -> str:
    """새 테마 wiki 문서 생성"""
    now = datetime.now().strftime("%Y-%m-%d")
    questions = theme.get("openQuestions", [])
    questions_md = "\n".join(f"- {q}" for q in questions) if questions else "- (아직 없음)"

    return f"""# {theme['name']}

## 종합 판단
> 마지막 업데이트: {now}
> 확신도: 🟡 중간

{theme.get('summary', '아직 충분한 시그널이 축적되지 않았습니다.')}

## 핵심 시그널 타임라인

(시그널이 추가되면 여기에 표시됩니다)

## 열린 질문

{questions_md}

## 관련 테마

(관련 테마가 발견되면 여기에 표시됩니다)

---
*Mnemo Wiki — 자동 생성 문서*
"""


def add_signal_to_wiki(
    theme_id: str,
    card: dict,
    signal_type: str = "reinforcing",
    updated_summary: str | None = None,
) -> str:
    """기존 wiki 문서에 시그널 추가

    Args:
        theme_id: 테마 ID
        card: 카드 데이터
        signal_type: reinforcing, contradicting, new
        updated_summary: 갱신된 종합 판단 (없으면 유지)

    Returns:
        업데이트된 wiki 문서 내용
    """
    ensure_wiki_dir()
    wiki_path = get_wiki_path(theme_id)

    if not wiki_path.exists():
        logger.warning(f"Wiki 파일 없음, 새로 생성: {wiki_path}")
        content = create_wiki_document({"name": theme_id, "summary": "", "openQuestions": []})
    else:
        content = wiki_path.read_text(encoding="utf-8")

    # 시그널 타입 마커
    type_marker = {
        "reinforcing": "[+]",
        "contradicting": "[⚠️]",
        "new": "[NEW]",
    }.get(signal_type, "[+]")

    # 날짜
    date_str = card.get("createdAt", now_kst_iso()).split("T")[0]

    # 시그널 항목 생성
    signal_entry = (
        f"- **{date_str}** {type_marker} {card.get('title', '제목 없음')} "
        f"— {card.get('sourceName', '출처 미상')} "
        f"(카드 ID: `{card.get('id', 'unknown')}`)\n"
        f"  > {card.get('summary', '')[:100]}{'...' if len(card.get('summary', '')) > 100 else ''}"
    )

    # 타임라인 섹션에 삽입
    timeline_header = "## 핵심 시그널 타임라인"
    if timeline_header in content:
        # 헤더 바로 다음 줄에 새 시그널 삽입 (시간역순 = 최신이 위)
        parts = content.split(timeline_header, 1)
        after_header = parts[1]

        # 다음 섹션 (##) 찾기
        next_section = re.search(r"\n## ", after_header)
        if next_section:
            insert_pos = next_section.start()
            new_after = (
                after_header[:insert_pos].rstrip()
                + "\n\n"
                + signal_entry
                + "\n"
                + after_header[insert_pos:]
            )
        else:
            new_after = after_header.rstrip() + "\n\n" + signal_entry + "\n"

        content = parts[0] + timeline_header + new_after
    else:
        # 타임라인 섹션이 없으면 추가
        content += f"\n\n{timeline_header}\n\n{signal_entry}\n"

    # 종합 판단 업데이트 (있으면)
    if updated_summary:
        now = datetime.now().strftime("%Y-%m-%d")
        summary_section = "## 종합 판단"
        if summary_section in content:
            # 종합 판단 섹션 교체
            parts = content.split(summary_section, 1)
            after = parts[1]
            next_section = re.search(r"\n## ", after)
            if next_section:
                replacement = (
                    f"\n> 마지막 업데이트: {now}\n"
                    f"> 확신도: 🟡 중간\n\n"
                    f"{updated_summary}\n"
                )
                content = parts[0] + summary_section + replacement + after[next_section.start():]
            else:
                content = (
                    parts[0] + summary_section
                    + f"\n> 마지막 업데이트: {now}\n"
                    f"> 확신도: 🟡 중간\n\n"
                    f"{updated_summary}\n"
                )

    # 파일 저장
    wiki_path.write_text(content, encoding="utf-8")
    logger.info(f"Wiki 업데이트 완료: {wiki_path}")

    return content


def update_wiki_index(themes: list[dict]) -> None:
    """wiki/_index.md 업데이트"""
    ensure_wiki_dir()
    index_path = WIKI_DIR / "_index.md"

    active = [t for t in themes if t.get("status") == "active"]
    dormant = [t for t in themes if t.get("status") == "dormant"]

    active_list = "\n".join(
        f"- [[{t['id']}|{t['name']}]] — 시그널 {t.get('signalCount', 0)}개"
        for t in active
    ) if active else "(활성 테마 없음)"

    dormant_list = "\n".join(
        f"- [[{t['id']}|{t['name']}]] — 마지막 업데이트: {t.get('lastCompiled', '알 수 없음')}"
        for t in dormant
    ) if dormant else "(없음)"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    content = f"""# Mnemo Wiki Index

> 테마별 지식 컴파일 문서 인덱스

## Active Themes

{active_list}

## Dormant Themes

{dormant_list}

---
*Last updated: {now}*
"""

    index_path.write_text(content, encoding="utf-8")
    logger.info("Wiki 인덱스 업데이트 완료")
