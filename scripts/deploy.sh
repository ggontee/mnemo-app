#!/bin/bash
# Mnemo 배포 스크립트 (Production 모드)
# 사용법: ./scripts/deploy.sh "커밋 메시지"
#
# 흐름:
#   MacBook: lock 정리 → git commit → git push
#   M2:      git pull → npm install --omit=dev → next build → launchd reload
#
# 빌드 시간만큼(보통 30초~3분) 서비스가 잠시 끊긴다.

set -e

cd ~/mnemo-app

MSG="${1:-chore: update}"
M2_HOST="jaehyungoh@100.86.137.93"
M2_PROJECT="/Users/jaehyungoh/coding/mnemo-app"

# 1. lock 파일 정리 (Cowork 마운트로 인한 잔존 lock)
rm -f .git/*.lock 2>/dev/null || true

# 2. 변경사항 있을 때만 커밋·푸시
if git diff --quiet && git diff --cached --quiet; then
    echo "변경사항이 없습니다. M2 재빌드만 수행합니다."
else
    git add -A
    git commit -m "$MSG"
    git push origin main
fi

# 3. M2 서버에서 pull + build + reload
echo "M2 서버에 반영 중... (빌드 시간 동안 서비스 잠시 다운)"
ssh "$M2_HOST" bash -se <<EOF
set -e
export PATH="/opt/homebrew/bin:\$PATH"
cd "$M2_PROJECT"

echo "[M2] git pull"
git pull origin main

echo "[M2] npm install (devDeps 포함 — next.config.ts transpile 위해 typescript 필요)"
npm install --no-audit --no-fund

echo "[M2] next build"
npx next build

echo "[M2] launchd reload"
launchctl unload ~/Library/LaunchAgents/com.mnemo.webapp.plist 2>/dev/null || true
launchctl load   ~/Library/LaunchAgents/com.mnemo.webapp.plist

echo "[M2] 서비스 상태 확인 (5초 대기 후)"
sleep 5
launchctl list com.mnemo.webapp | grep -E '"LastExitStatus"|"PID"' || true

if lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[M2] OK — 포트 3000 LISTEN 중"
else
    echo "[M2] 경고 — 포트 3000 아직 LISTEN 아님. webapp_stderr.log 확인 필요"
fi
EOF

echo "배포 완료!"
