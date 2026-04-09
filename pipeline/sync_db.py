"""cards.json → mnemo.db 동기화

파이프라인(cards.json)에서 생성된 카드를 웹앱(mnemo.db)에 반영한다.
"""
from __future__ import annotations

import json
import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def get_data_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "data"


def sync_cards_to_db() -> dict:
    """cards.json의 카드를 mnemo.db에 upsert한다."""
    data_dir = get_data_dir()
    cards_path = data_dir / "cards.json"
    db_path = data_dir / "mnemo.db"

    if not cards_path.exists():
        logger.warning("cards.json이 없습니다.")
        return {"synced": 0, "skipped": 0}

    with open(cards_path, "r", encoding="utf-8") as f:
        cards = json.load(f)

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 테이블이 없으면 생성
    cursor.execute("""CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        soWhat TEXT,
        keyPoints TEXT,
        implications TEXT,
        tags TEXT,
        sourceUrl TEXT NOT NULL DEFAULT '',
        sourceName TEXT NOT NULL DEFAULT '',
        sourceType TEXT,
        createdAt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        rawContentRef TEXT,
        userComment TEXT,
        aiQuestions TEXT,
        obsidianExported INTEGER DEFAULT 0,
        themeIds TEXT,
        relatedCards TEXT,
        signalType TEXT,
        deferredUntil TEXT
    )""")

    # 기존 DB의 카드 ID와 status 가져오기 (웹에서 변경된 status 보존)
    cursor.execute("SELECT id, status FROM cards")
    db_cards = {row[0]: row[1] for row in cursor.fetchall()}

    synced = 0
    skipped = 0

    for card in cards:
        card_id = card.get("id", "")
        if not card_id:
            skipped += 1
            continue

        # 웹앱에서 사용자가 변경한 status는 보존
        status = card.get("status", "pending")
        if card_id in db_cards and db_cards[card_id] != "pending":
            status = db_cards[card_id]

        cursor.execute(
            """INSERT OR REPLACE INTO cards
               (id, title, summary, soWhat, keyPoints, implications, tags,
                sourceUrl, sourceName, sourceType, createdAt, status,
                rawContentRef, userComment, aiQuestions, obsidianExported,
                themeIds, relatedCards, signalType, deferredUntil)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                card_id,
                card.get("title", ""),
                card.get("summary", ""),
                card.get("soWhat"),
                json.dumps(card.get("keyPoints", []), ensure_ascii=False),
                json.dumps(card.get("implications", []), ensure_ascii=False),
                json.dumps(card.get("tags", []), ensure_ascii=False),
                card.get("sourceUrl", card.get("url", "")),
                card.get("sourceName", ""),
                card.get("sourceType"),
                card.get("createdAt", ""),
                status,
                card.get("rawContentRef"),
                card.get("userComment"),
                json.dumps(card.get("aiQuestions", []), ensure_ascii=False),
                1 if card.get("obsidianExported") else 0,
                json.dumps(card.get("themeIds", []), ensure_ascii=False),
                json.dumps(card.get("relatedCards", []), ensure_ascii=False),
                card.get("signalType"),
                card.get("deferredUntil"),
            ],
        )
        synced += 1

    conn.commit()
    conn.close()

    logger.info(f"DB 동기화 완료: {synced}건 upsert, {skipped}건 스킵")
    return {"synced": synced, "skipped": skipped}


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    result = sync_cards_to_db()
    print(f"\n동기화 결과: {result}")
