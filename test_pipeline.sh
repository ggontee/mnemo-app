#!/bin/bash
# Mnemo 파이프라인 로컬 테스트 스크립트
# 사용법: cd code/mnemo-app && bash test_pipeline.sh

set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  Mnemo 파이프라인 로컬 테스트"
echo "========================================"
echo ""

# 1. 필요 패키지 확인/설치
echo "[1/5] 패키지 확인 중..."
pip3 install --quiet youtube-transcript-api anthropic google-api-python-client google-auth-httplib2 google-auth-oauthlib requests 2>/dev/null
echo "  ✓ 패키지 준비 완료"
echo ""

# 2. Gmail 인증 확인
echo "[2/5] Gmail 인증 확인..."
if [ -f ~/.openclaw/gmail-api/credentials.json ]; then
    echo "  ✓ credentials.json 존재"
else
    echo "  ✗ credentials.json 없음 → 뉴스레터 수집 불가"
fi
if [ -f ~/.openclaw/gmail-api/token.json ]; then
    echo "  ✓ token.json 존재 (만료 시 자동 갱신 시도)"
else
    echo "  ✗ token.json 없음 → 브라우저 인증 필요"
fi
echo ""

# 3. ANTHROPIC_API_KEY 확인
echo "[3/5] API 키 확인..."
# .env에서 키를 로드 (아직 환경변수에 없을 경우)
if [ -z "$ANTHROPIC_API_KEY" ] && [ -f .env ]; then
    export $(grep -v '^#' .env | grep ANTHROPIC_API_KEY | xargs 2>/dev/null) 2>/dev/null || true
fi

if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "  ✓ ANTHROPIC_API_KEY 설정됨"
else
    echo "  ⚠ ANTHROPIC_API_KEY 미설정 → AI 요약 스킵됨"
    echo "  설정 방법: .env 파일에 ANTHROPIC_API_KEY=sk-ant-... 추가"
fi
echo ""

# 4. Gmail 뉴스레터 발신자 스캔
echo "[4/5] 최근 7일 뉴스레터 발신자 스캔..."
echo "────────────────────────────────────────"
python3 -m pipeline.collectors.newsletter_collector scan 7 2>&1 || echo "  ⚠ 스캔 실패 (Gmail 인증 확인 필요)"
echo ""
echo "  💡 위 목록을 확인하여 newsletter_sources.json의 senderMatch를 업데이트하세요."
echo "     경로: data/config/newsletter_sources.json"
echo ""

# 5. 파이프라인 실행
echo "[5/5] 파이프라인 실행..."
echo "========================================"
echo ""

# collect-only로 수집만 먼저 테스트
echo "── Step A: 수집 테스트 (YouTube + Newsletter) ──"
python3 -m pipeline.orchestrator --collect-only -v 2>&1
echo ""

# ANTHROPIC_API_KEY가 있으면 전체 파이프라인도 실행
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "── Step B: 전체 파이프라인 (수집 + AI 요약) ──"
    python3 -m pipeline.orchestrator -v 2>&1
else
    echo "── Step B: AI 요약 스킵 (ANTHROPIC_API_KEY 미설정) ──"
    echo "  전체 파이프라인 실행하려면:"
    echo "  .env에 ANTHROPIC_API_KEY 추가 후 다시 실행"
fi

echo ""
echo "========================================"
echo "  테스트 완료!"
echo "  - 수집 결과: data/raw/ 폴더 확인"
echo "  - 카드 결과: data/cards.json 확인"
echo "========================================"
