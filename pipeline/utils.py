"""공통 유틸리티 함수"""
from __future__ import annotations

import json
import os
import string
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Union, List, Dict

KST = timezone(timedelta(hours=9))

def get_project_root() -> Path:
    """pipeline/ 의 상위 = mnemo-app/ 루트"""
    return Path(__file__).resolve().parent.parent

def get_data_dir() -> Path:
    return get_project_root() / "data"

def load_json(path: Path) -> dict | list:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: Path, data: dict | list, indent: int = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)

def generate_id(length: int = 8) -> str:
    """nanoid 스타일 짧은 ID 생성"""
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choices(alphabet, k=length))

def now_kst() -> datetime:
    return datetime.now(KST)

def now_kst_iso() -> str:
    return now_kst().isoformat()

def today_str() -> str:
    return now_kst().strftime("%Y-%m-%d")

def load_config(name: str) -> dict:
    """data/config/{name}.json 로드"""
    return load_json(get_data_dir() / "config" / f"{name}.json")

def load_state() -> dict:
    return load_json(get_data_dir() / "state.json")

def save_state(state: dict) -> None:
    save_json(get_data_dir() / "state.json", state)

def load_cards() -> list[dict]:
    return load_json(get_data_dir() / "cards.json")

def save_cards(cards: list[dict]) -> None:
    save_json(get_data_dir() / "cards.json", cards)

def save_raw(source_type: str, filename: str, data: dict) -> str:
    """raw 데이터를 날짜별 폴더에 저장하고 상대 경로를 반환"""
    rel_path = f"raw/{source_type}/{today_str()}/{filename}.json"
    full_path = get_data_dir() / rel_path
    save_json(full_path, data)
    return rel_path
