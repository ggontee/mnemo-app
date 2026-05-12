#!/bin/bash
# Mnemo 웹앱 서버 시작 스크립트 (Production)
# launchd(com.mnemo.webapp.plist) 에서 호출된다.
# .next 빌드 산출물이 있어야 동작 — 빌드는 deploy.sh / fix_server.sh 가 책임진다.

set -eo pipefail

export PATH="/opt/homebrew/bin:$PATH"
export NODE_ENV=production

PROJECT_DIR="$HOME/coding/mnemo-app"
cd "$PROJECT_DIR"

# .env 환경변수 로드 (있을 때만, 값에 공백이 있어도 깨지지 않게)
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

# .next 빌드 검증 — 없으면 즉시 종료해서 launchd KeepAlive 무한 루프를 만들지 않음
if [ ! -f "$PROJECT_DIR/.next/BUILD_ID" ]; then
    echo "[start_webapp] ERROR: .next/BUILD_ID 가 없음. 'npx next build' 를 먼저 실행하세요." >&2
    # 비정상 종료지만 ThrottleInterval 으로 폭주 방지
    sleep 60
    exit 1
fi

exec npm run start
