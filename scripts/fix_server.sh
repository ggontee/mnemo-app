#!/bin/bash
# Mnemo M2 서버 1회성 부트스트랩 스크립트
# 목적:
#   - 12일째 살아있는 stale next dev 인스턴스들 정리
#   - macOS Maintenance Sleep 방지 (standby/powernap off)
#   - 비대화된 webapp_stderr.log 비우기
#   - launchd 잡 깨끗하게 재로드
#
# 사용법 (MacBook Terminal에서):
#   ssh -t jaehyungoh@100.86.137.93 'bash -s' < ~/mnemo-app/scripts/fix_server.sh
#
#   -t 플래그가 sudo 비밀번호 프롬프트를 보장한다.

set -e

PROJECT_DIR="$HOME/coding/mnemo-app"
LOG_DIR="$PROJECT_DIR/data/logs"
PLIST="$HOME/Library/LaunchAgents/com.mnemo.webapp.plist"

hr() { printf '\n=== %s ===\n' "$1"; }

hr "0. 최신 코드 동기화 (start_webapp.sh 새 버전 받기)"
cd "$PROJECT_DIR"
git pull origin main

hr "1. 현재 떠있는 node/next 프로세스 (정리 전)"
ps -axo pid,etime,command | grep -i -E 'node|next' | grep -v grep || true

hr "2. launchd 잡 일단 stop (이후 정리 시 자동 재시작 막기)"
launchctl unload "$PLIST" 2>/dev/null || true
sleep 1

hr "3. stale next dev / next-server 프로세스 종료"
# mnemo-app 디렉토리 관련 next 프로세스만 노린다 (다른 user 프로세스 영향 X)
pkill -f "mnemo-app/node_modules/.bin/next" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2
echo "정리 후 남은 프로세스:"
ps -axo pid,etime,command | grep -i -E 'node|next' | grep -v grep || echo "  (없음)"

hr "4. 포트 3000/3001 점유 확인"
lsof -nP -iTCP:3000 -sTCP:LISTEN 2>&1 || echo "  3000: free"
lsof -nP -iTCP:3001 -sTCP:LISTEN 2>&1 || echo "  3001: free"

hr "5. 비대화된 로그 비우기"
mkdir -p "$LOG_DIR"
for f in "$LOG_DIR/webapp_stderr.log" "$LOG_DIR/webapp_stdout.log"; do
    if [ -f "$f" ]; then
        size=$(stat -f%z "$f" 2>/dev/null || echo 0)
        echo "  - $f ($size bytes) 비움"
        : > "$f"
    fi
done

hr "6. Maintenance Sleep 방지 (sudo 비밀번호 필요)"
echo "  standby 0 / powernap 0 / sleep 0 / disksleep 0 / displaysleep 0 / womp 1"
sudo pmset -a standby 0 powernap 0 sleep 0 disksleep 0 displaysleep 0 womp 1 tcpkeepalive 1
echo
echo "적용 결과:"
pmset -g | grep -E 'standby |powernap|sleep |disksleep|displaysleep|womp|tcpkeepalive' | head -10

hr "7. 의존성 설치 + production 빌드"
cd "$PROJECT_DIR"
export PATH="/opt/homebrew/bin:$PATH"
echo "  npm install --omit=dev..."
npm install --omit=dev --no-audit --no-fund
echo
echo "  npx next build..."
npx next build

hr "8. 빌드 결과 확인"
if [ -f "$PROJECT_DIR/.next/BUILD_ID" ]; then
    echo "  BUILD_ID: $(cat $PROJECT_DIR/.next/BUILD_ID)"
    ls -la "$PROJECT_DIR/.next" | head -8
else
    echo "  ERROR: BUILD_ID 없음 — 빌드 실패"
    exit 1
fi

hr "9. launchd 잡 재로드"
launchctl load "$PLIST"
sleep 5

hr "10. 서비스 상태 검증"
launchctl list com.mnemo.webapp | grep -E '"LastExitStatus"|"PID"|"Label"' || true
echo
echo "포트 3000 LISTEN:"
lsof -nP -iTCP:3000 -sTCP:LISTEN 2>&1 || echo "  ❌ 아직 안 떴음"
echo
echo "webapp_stderr.log 끝 10줄 (있다면 에러):"
tail -10 "$LOG_DIR/webapp_stderr.log" 2>/dev/null || echo "  (비어있음 — 정상)"
echo
echo "webapp_stdout.log 끝 10줄 (정상 기동 메시지):"
tail -10 "$LOG_DIR/webapp_stdout.log" 2>/dev/null

hr "끝. 정상이면 'Ready in ...' 같은 Next.js 시작 메시지가 보여야 함."
