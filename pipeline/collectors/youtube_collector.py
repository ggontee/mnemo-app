"""YouTube 트랜스크립트 수집기

RSS 피드로 신규 영상을 감지하고, youtube-transcript-api로 자막을 추출한다.
실패 시 Supadata API로 폴백.

youtube-transcript-api 1.x API 기준.
"""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Optional

import requests
from youtube_transcript_api import YouTubeTranscriptApi

from pipeline.utils import (
    load_config, load_state, save_raw, now_kst, today_str
)

logger = logging.getLogger(__name__)

# youtube-transcript-api 1.x: 인스턴스 생성 필요
ytt_api = YouTubeTranscriptApi()


def fetch_rss_videos(rss_url: str, since: Optional[datetime] = None, max_retries: int = 2) -> list[dict]:
    """RSS 피드에서 영상 목록을 가져온다. 간헐적 404 대비 리트라이."""
    import time

    for attempt in range(max_retries + 1):
        try:
            resp = requests.get(rss_url, timeout=15)
            resp.raise_for_status()
            break
        except requests.RequestException as e:
            if attempt < max_retries:
                wait = 3 * (attempt + 1)
                logger.warning(f"RSS 피드 요청 실패 (시도 {attempt + 1}/{max_retries + 1}), {wait}초 후 재시도: {rss_url}")
                time.sleep(wait)
            else:
                logger.warning(f"RSS 피드 요청 최종 실패 (간헐적 오류 가능): {rss_url} - {e}")
                return []

    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as e:
        logger.error(f"RSS XML 파싱 실패: {e}")
        return []

    videos = []
    for entry in root.findall("atom:entry", ns):
        video_id = entry.find("yt:videoId", ns)
        title = entry.find("atom:title", ns)
        published = entry.find("atom:published", ns)

        if video_id is None or title is None or published is None:
            continue

        pub_dt = datetime.fromisoformat(published.text.replace("Z", "+00:00"))

        if since and pub_dt < since:
            continue

        videos.append({
            "videoId": video_id.text,
            "title": title.text,
            "publishedAt": published.text,
            "url": f"https://www.youtube.com/watch?v={video_id.text}",
        })

    return videos


def get_transcript_primary(video_id: str, preferred_langs: list[str]) -> Optional[str]:
    """youtube-transcript-api 1.x로 자막 추출 (1차 시도)"""
    try:
        # 1.x API: ytt_api.fetch(video_id, languages=[...])
        fetched = ytt_api.fetch(video_id, languages=preferred_langs)
        text = " ".join(snippet.text for snippet in fetched)
        return text if text.strip() else None

    except Exception:
        # fetch 실패 시 list()로 사용 가능한 자막 탐색
        try:
            transcript_list = ytt_api.list(video_id)

            transcript = None
            try:
                transcript = transcript_list.find_transcript(preferred_langs)
            except Exception:
                try:
                    transcript = transcript_list.find_generated_transcript(preferred_langs)
                except Exception:
                    for t in transcript_list:
                        transcript = t
                        break

            if transcript is None:
                return None

            fetched = transcript.fetch()
            text = " ".join(snippet.text for snippet in fetched)
            return text if text.strip() else None

        except Exception as e:
            logger.warning(f"youtube-transcript-api 실패 (video={video_id}): {e}")
            return None


def get_transcript_supadata(video_id: str, api_key: str) -> Optional[str]:
    """Supadata API로 자막 추출 (폴백)"""
    if not api_key:
        logger.info("Supadata API 키가 설정되지 않아 스킵합니다.")
        return None

    try:
        resp = requests.get(
            "https://api.supadata.ai/v1/youtube/transcript",
            params={"videoId": video_id, "text": "true"},
            headers={"x-api-key": api_key},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("text", None)
    except Exception as e:
        logger.warning(f"Supadata API 실패 (video={video_id}): {e}")
        return None


def get_transcript(video_id: str, config: dict) -> Optional[str]:
    """폴백 체인으로 트랜스크립트 추출"""
    preferred_langs = config.get("preferredLanguages", ["ko", "en"])
    fallback = config.get("transcriptFallback", {})

    # 1차: youtube-transcript-api
    text = get_transcript_primary(video_id, preferred_langs)
    if text:
        logger.info(f"[{video_id}] youtube-transcript-api 성공")
        return text

    # 2차: Supadata
    supadata_key = fallback.get("supadataApiKey", "")
    if supadata_key.startswith("${") and supadata_key.endswith("}"):
        import os
        env_name = supadata_key[2:-1]
        supadata_key = os.environ.get(env_name, "")

    text = get_transcript_supadata(video_id, supadata_key)
    if text:
        logger.info(f"[{video_id}] Supadata API 성공")
        return text

    logger.error(f"[{video_id}] 모든 트랜스크립트 추출 실패")
    return None


def collect_videos() -> list[dict]:
    """신규 YouTube 영상을 수집하고 raw 데이터를 저장한다."""
    config = load_config("video_sources")
    state = load_state()

    last_run = state.get("lastCollectionRun")
    if last_run:
        since = datetime.fromisoformat(last_run)
    else:
        since = now_kst() - timedelta(days=1)

    max_videos = config.get("maxVideosPerRun", 5)
    last_video_ids = set(state.get("lastVideoIds", []))
    collected = []

    for channel in config.get("channels", []):
        rss_url = channel.get("rssUrl", "")
        if not rss_url:
            continue

        logger.info(f"채널 확인 중: {channel['name']}")
        videos = fetch_rss_videos(rss_url, since)

        for video in videos:
            vid = video["videoId"]

            if vid in last_video_ids:
                continue

            if len(collected) >= max_videos:
                break

            logger.info(f"트랜스크립트 추출 중: {video['title']}")
            transcript = get_transcript(vid, config)

            if not transcript:
                continue

            raw_content = {
                "sourceId": f"yt_{vid}",
                "sourceName": channel["name"],
                "sourceType": "video",
                "title": video["title"],
                "url": video["url"],
                "rawText": transcript,
                "metadata": {
                    "channelName": channel["name"],
                    "publishedAt": video["publishedAt"],
                },
                "collectedAt": now_kst().isoformat(),
            }

            raw_ref = save_raw("videos", f"yt_{vid}", raw_content)
            raw_content["rawContentRef"] = raw_ref
            collected.append(raw_content)

            logger.info(f"수집 완료: {video['title']} ({len(transcript)} chars)")

    logger.info(f"YouTube 수집 완료: {len(collected)}건")
    return collected


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    results = collect_videos()
    for r in results:
        print(f"  - {r['title']} ({r['sourceName']})")
