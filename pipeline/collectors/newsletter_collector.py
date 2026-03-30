"""Gmail 뉴스레터 수집기

Gmail API로 뉴스레터 메일을 조회하고, HTML 본문에서 아티클을 추출한다.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from pathlib import Path
from typing import Optional
from html.parser import HTMLParser

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from pipeline.utils import (
    load_config, load_state, save_raw, now_kst, generate_id
)

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


class ArticleLinkExtractor(HTMLParser):
    """HTML에서 아티클 링크와 주변 텍스트를 추출하는 파서"""

    def __init__(self):
        super().__init__()
        self.articles: list[dict] = []
        self._current_link: Optional[str] = None
        self._current_text: list[str] = []
        self._all_text: list[str] = []
        self._in_a = False

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attr_dict = dict(attrs)
            href = attr_dict.get("href", "")
            if href and self._is_article_link(href):
                self._in_a = True
                self._current_link = href
                self._current_text = []

    def handle_endtag(self, tag):
        if tag == "a" and self._in_a:
            self._in_a = False
            text = " ".join(self._current_text).strip()
            if self._current_link and len(text) > 5:
                self.articles.append({
                    "url": self._current_link,
                    "title": text[:200],
                })
            self._current_link = None

    def handle_data(self, data):
        cleaned = data.strip()
        if cleaned:
            self._all_text.append(cleaned)
            if self._in_a:
                self._current_text.append(cleaned)

    def _is_article_link(self, href: str) -> bool:
        """아티클 링크인지 판별 (광고, 구독해지 등 제외)"""
        skip_patterns = [
            "unsubscribe", "mailto:", "javascript:", "#",
            "manage-preferences", "subscription", "list-manage",
            "twitter.com", "facebook.com", "linkedin.com/share",
            "beacon", "tracking", "pixel",
            "view-in-browser", "view-online", "web-version",
        ]
        href_lower = href.lower()
        return not any(p in href_lower for p in skip_patterns)

    def get_full_text(self) -> str:
        return "\n".join(self._all_text)


def get_gmail_service():
    """Gmail API 서비스 객체를 반환한다."""
    pipeline_config = load_config("pipeline_config")
    creds_path = Path(os.path.expanduser(pipeline_config["gmailCredentialsPath"]))
    token_path = Path(os.path.expanduser(pipeline_config["gmailTokenPath"]))

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            logger.info("Gmail 토큰 갱신 중...")
            creds.refresh(Request())
            logger.info("Gmail 토큰 갱신 완료")
        else:
            logger.info("Gmail 브라우저 인증 시작...")
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        # 토큰 저장
        with open(token_path, "w") as f:
            f.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def get_email_body(service, msg_id: str) -> tuple[str, str]:
    """이메일의 HTML 본문과 제목을 반환한다."""
    msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()

    subject = ""
    for header in msg.get("payload", {}).get("headers", []):
        if header["name"].lower() == "subject":
            subject = header["value"]
            break

    html_body = _extract_html_body(msg.get("payload", {}))
    return subject, html_body


def _extract_html_body(payload: dict) -> str:
    """payload에서 HTML 본문을 재귀적으로 추출"""
    mime_type = payload.get("mimeType", "")

    if mime_type == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    for part in payload.get("parts", []):
        result = _extract_html_body(part)
        if result:
            return result

    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    return ""


def parse_link_list(html: str, max_articles: int = 10) -> list[dict]:
    """link-list 전략: HTML에서 아티클 링크 목록 추출"""
    parser = ArticleLinkExtractor()
    parser.feed(html)

    full_text = parser.get_full_text()

    # 중복 URL 제거
    seen = set()
    unique = []
    for article in parser.articles:
        url = article["url"].split("?")[0]
        if url not in seen:
            seen.add(url)
            # rawText로 전체 텍스트의 일부를 포함 (AI 요약에 활용)
            article["rawText"] = f"[{article['title']}]\n\n{full_text[:3000]}"
            unique.append(article)

    return unique[:max_articles]


def _extract_source_url(text: str) -> str:
    """plain text 뉴스레터에서 원본 URL을 추출한다.

    지원 패턴:
    - Substack: "View this post on the web at https://..."
    - 아웃스탠딩: 본문 중 https://outstanding.kr/... URL
    - TLDR: "View Online" 근처 URL (plain text라 추출 어려울 수 있음)
    - 일반: 본문 첫 번째 https:// URL (tracking/redirect 제외)
    """
    # 1) Substack 패턴: "View this post on the web at URL"
    substack_match = re.search(
        r'View this post on the web at\s+(https?://\S+)', text
    )
    if substack_match:
        return substack_match.group(1).rstrip(')')

    # 2) 아웃스탠딩 패턴: 본문의 outstanding.kr URL
    outstanding_match = re.search(
        r'(https?://outstanding\.kr/\S+)', text
    )
    if outstanding_match:
        url = outstanding_match.group(1)
        # UTM 파라미터 제거
        return url.split('?')[0]

    # 3) Mailchimp "웹에서 보기" 패턴
    mailchimp_match = re.search(
        r'웹에서 보기\s*\(?(https?://\S+)\)?', text
    )
    if mailchimp_match:
        return mailchimp_match.group(1).rstrip(')')

    # 4) 일반 fallback: 첫 https URL (tracking 제외)
    skip_domains = [
        'substack.com/redirect', 'list-manage.com', 'mailchi.mp',
        'tracking', 'beacon', 'pixel', 'unsubscribe',
    ]
    for match in re.finditer(r'(https?://\S+)', text[:2000]):
        url = match.group(1).rstrip(').,;')
        if not any(skip in url.lower() for skip in skip_domains):
            return url

    return ""


def parse_single_article(html: str, subject: str) -> list[dict]:
    """single-article 전략: 뉴스레터 전체가 하나의 아티클.
    plain text 이메일도 지원한다.
    """
    # HTML 태그가 거의 없으면 plain text로 간주
    if "<a " not in html.lower() and "<div" not in html.lower():
        # plain text — 그대로 사용
        raw_text = html.strip()[:5000]
    else:
        parser = ArticleLinkExtractor()
        parser.feed(html)
        raw_text = parser.get_full_text()[:5000]

    # 빈 텍스트 방지
    if not raw_text or len(raw_text) < 50:
        raw_text = html.strip()[:5000]

    # 원본 URL 자동 추출
    source_url = _extract_source_url(raw_text)

    return [{
        "url": source_url,
        "title": subject,
        "rawText": raw_text,
    }]


def _build_gmail_query(config: dict) -> str:
    """설정 기반으로 Gmail 검색 쿼리 생성.

    label 의존 대신 발신자 목록으로 직접 검색한다.
    gmailQuery가 명시되어 있으면 그것을 사용.
    """
    explicit_query = config.get("gmailQuery", "")

    # 명시적 쿼리가 있고 label: 을 사용하지 않으면 그대로 사용
    if explicit_query and "label:" not in explicit_query:
        return explicit_query

    # 발신자 기반 자동 쿼리 생성
    sources = config.get("sources", [])
    if not sources:
        return "category:promotions newer_than:1d"

    # from:(addr1 OR addr2 OR addr3) newer_than:Xd
    senders = [s["senderMatch"] for s in sources]
    from_clause = " OR ".join(senders)
    days = config.get("lookbackDays", 1)
    return f"from:({from_clause}) newer_than:{days}d"


def collect_newsletters() -> list[dict]:
    """Gmail에서 뉴스레터를 수집하고 raw 데이터를 저장한다."""
    config = load_config("newsletter_sources")
    state = load_state()
    last_email_ids = set(state.get("lastEmailIds", []))

    try:
        service = get_gmail_service()
    except Exception as e:
        logger.error(f"Gmail 서비스 초기화 실패: {e}")
        return []

    query = _build_gmail_query(config)
    logger.info(f"Gmail 검색 쿼리: {query}")

    max_articles = config.get("maxArticlesPerNewsletter", 10)
    sources = {s["senderMatch"].lower(): s for s in config.get("sources", [])}

    # 메일 목록 조회
    try:
        results = service.users().messages().list(userId="me", q=query, maxResults=50).execute()
        messages = results.get("messages", [])
    except Exception as e:
        logger.error(f"Gmail 메일 목록 조회 실패: {e}")
        return []

    if not messages:
        logger.info("새로운 뉴스레터가 없습니다.")
        return []

    logger.info(f"Gmail에서 {len(messages)}개 메일 발견")
    collected = []

    for msg_meta in messages:
        msg_id = msg_meta["id"]

        if msg_id in last_email_ids:
            logger.debug(f"이미 처리한 메일 스킵: {msg_id}")
            continue

        try:
            msg = service.users().messages().get(userId="me", id=msg_id, format="metadata",
                                                  metadataHeaders=["From", "Subject"]).execute()
            headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
            from_addr = headers.get("from", "").lower()
            subject = headers.get("subject", "")

            # 등록된 소스인지 확인
            matched_source = None
            for sender, source_config in sources.items():
                if sender in from_addr:
                    matched_source = source_config
                    break

            if not matched_source:
                logger.debug(f"미등록 발신자 스킵: {from_addr} — {subject}")
                continue

            logger.info(f"뉴스레터 처리 중: {matched_source['name']} — {subject}")

            _, html_body = get_email_body(service, msg_id)
            if not html_body:
                logger.warning(f"본문 없음: {msg_id}")
                continue

            strategy = matched_source.get("parseStrategy", "link-list")
            if strategy == "link-list":
                articles = parse_link_list(html_body, max_articles)
            else:
                articles = parse_single_article(html_body, subject)

            for i, article in enumerate(articles):
                source_id = f"{matched_source['name'].lower()}_{msg_id[:8]}_{i:03d}"
                raw_content = {
                    "sourceId": source_id,
                    "sourceName": matched_source["name"],
                    "sourceType": "newsletter",
                    "title": article.get("title", subject),
                    "url": article.get("url", ""),
                    "rawText": article.get("rawText", article.get("title", "")),
                    "collectedAt": now_kst().isoformat(),
                    "emailId": msg_id,
                }

                raw_ref = save_raw("newsletters", source_id, raw_content)
                raw_content["rawContentRef"] = raw_ref
                collected.append(raw_content)

            logger.info(f"  → {len(articles)}개 아티클 추출")

        except Exception as e:
            logger.error(f"메일 처리 실패 (msg_id={msg_id}): {e}")
            continue

    logger.info(f"뉴스레터 수집 완료: {len(collected)}건")
    return collected


def scan_recent_newsletters(days: int = 7, max_results: int = 100) -> list[dict]:
    """최근 뉴스레터 발신자 스캔 (디버그/설정용).

    실제로 어떤 발신자에서 뉴스레터가 오는지 파악하여
    newsletter_sources.json 설정에 반영할 수 있다.

    Returns:
        [{from, subject, date}] 목록
    """
    try:
        service = get_gmail_service()
    except Exception as e:
        logger.error(f"Gmail 서비스 초기화 실패: {e}")
        return []

    query = f"newer_than:{days}d"
    logger.info(f"스캔 쿼리: {query}")

    try:
        results = service.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
        messages = results.get("messages", [])
    except Exception as e:
        logger.error(f"메일 목록 조회 실패: {e}")
        return []

    if not messages:
        logger.info("최근 뉴스레터가 없습니다.")
        return []

    seen_senders = {}
    for msg_meta in messages:
        try:
            msg = service.users().messages().get(
                userId="me", id=msg_meta["id"], format="metadata",
                metadataHeaders=["From", "Subject", "Date"]
            ).execute()
            headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}

            from_addr = headers.get("from", "")
            subject = headers.get("subject", "")
            date = headers.get("date", "")

            # 발신자별 첫 번째만 기록
            sender_key = from_addr.lower()
            if sender_key not in seen_senders:
                seen_senders[sender_key] = {
                    "from": from_addr,
                    "subject": subject,
                    "date": date,
                    "count": 1,
                }
            else:
                seen_senders[sender_key]["count"] += 1

        except Exception:
            continue

    # count 내림차순 정렬
    result = sorted(seen_senders.values(), key=lambda x: x["count"], reverse=True)
    return result


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    if len(sys.argv) > 1 and sys.argv[1] == "scan":
        # 스캔 모드: python3 -m pipeline.collectors.newsletter_collector scan
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        print(f"\n최근 {days}일 뉴스레터 발신자 스캔 중...\n")
        senders = scan_recent_newsletters(days)
        if senders:
            print(f"{'발신자':<50} {'건수':>4}  최근 제목")
            print("-" * 100)
            for s in senders:
                print(f"{s['from'][:50]:<50} {s['count']:>4}  {s['subject'][:40]}")
        else:
            print("뉴스레터를 찾지 못했습니다.")
    else:
        # 수집 모드
        results = collect_newsletters()
        for r in results:
            print(f"  - [{r['sourceName']}] {r['title']}")
