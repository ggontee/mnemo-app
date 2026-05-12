#!/bin/bash
# Mnemo M2 서버 진단 스크립트
# 사용처: M2 서버(jaehyungoh@) 위에서 실행
# 목적: webapp 접속이 됐다 안됐다 하는 원인 진단
#
# 권장 실행:
#   ssh jaehyungoh@100.86.137.93 'bash -s' < scripts/diagnose_server.sh
#
# 자체적으로 stdout에 섹션을 찍어서 한 번에 모든 정보를 모은다.

set +e  # 한 섹션 실패해도 다음 섹션 계속

PROJECT_DIR="$HOME/coding/mnemo-app"
WEBAPP_LOG_DIR="$PROJECT_DIR/data/logs"

hr() { printf '\n=== %s ===\n' "$1"; }

hr "0. 환경"
date '+%Y-%m-%d %H:%M:%S %Z'
hostname
sw_vers 2>/dev/null | head -3
echo "uptime: $(uptime)"
echo "whoami: $(whoami)"
echo "PROJECT_DIR=$PROJECT_DIR (exists? $([ -d "$PROJECT_DIR" ] && echo yes || echo NO))"

hr "1. launchd 잡 상태"
echo "-- launchctl list | grep mnemo --"
launchctl list 2>/dev/null | grep -i mnemo
echo
echo "-- com.mnemo.webapp 상세 --"
launchctl list com.mnemo.webapp 2>&1 | head -30 || echo "(잡 미등록)"
echo
echo "-- LaunchAgents plist 파일 확인 --"
ls -la "$HOME/Library/LaunchAgents/" 2>/dev/null | grep mnemo

hr "2. webapp 프로세스"
echo "-- node 프로세스 전체 --"
ps -axo pid,etime,%cpu,%mem,rss,command | grep -i -E 'node|next' | grep -v grep
echo
echo "-- 포트 3000 LISTEN --"
lsof -nP -iTCP:3000 -sTCP:LISTEN 2>&1 || echo "(아무도 안 듣고 있음)"
echo
echo "-- 포트 3001 LISTEN --"
lsof -nP -iTCP:3001 -sTCP:LISTEN 2>&1 || echo "(아무도 안 듣고 있음)"

hr "3. webapp 로그 (최근 stderr 200줄)"
if [ -f "$WEBAPP_LOG_DIR/webapp_stderr.log" ]; then
    echo "-- 파일 정보 --"
    ls -la "$WEBAPP_LOG_DIR/webapp_stderr.log"
    echo "-- 마지막 수정 시각 (몇 분 전?) --"
    stat -f "modified=%Sm" "$WEBAPP_LOG_DIR/webapp_stderr.log"
    echo "-- 내용 (tail 200) --"
    tail -200 "$WEBAPP_LOG_DIR/webapp_stderr.log"
else
    echo "(webapp_stderr.log 없음)"
fi

hr "4. webapp stdout (최근 100줄)"
if [ -f "$WEBAPP_LOG_DIR/webapp_stdout.log" ]; then
    tail -100 "$WEBAPP_LOG_DIR/webapp_stdout.log"
else
    echo "(webapp_stdout.log 없음)"
fi

hr "5. .next 빌드 상태"
if [ -d "$PROJECT_DIR/.next" ]; then
    echo "-- .next 디렉토리 --"
    ls -la "$PROJECT_DIR/.next" | head -15
    echo "-- BUILD_ID --"
    cat "$PROJECT_DIR/.next/BUILD_ID" 2>/dev/null || echo "(BUILD_ID 없음 — next start 불가)"
    echo "-- prerender-manifest.json 마지막 수정 --"
    stat -f "modified=%Sm  size=%z" "$PROJECT_DIR/.next/prerender-manifest.json" 2>/dev/null
else
    echo "(.next 디렉토리 없음 — next build 한 적 없음. next start는 무조건 실패)"
fi
echo "-- 최근 git 커밋 --"
cd "$PROJECT_DIR" 2>/dev/null && git log -3 --oneline 2>&1

hr "6. start_webapp.sh 경로 검증"
if [ -f "$PROJECT_DIR/start_webapp.sh" ]; then
    echo "-- 내용 --"
    cat "$PROJECT_DIR/start_webapp.sh"
    echo
    echo "-- 안에서 cd하는 경로 존재 여부 --"
    target=$(grep -E '^PROJECT_DIR=' "$PROJECT_DIR/start_webapp.sh" | tail -1 | sed -E 's/^PROJECT_DIR=["'\'']?([^"'\'']*).*/\1/')
    target_expanded=$(eval echo "$target")
    echo "스크립트 안의 PROJECT_DIR: $target_expanded"
    if [ -d "$target_expanded" ]; then
        echo "→ 존재함"
    else
        echo "→ 없음! cd가 실패할 것임 (set -e 없으니 silent fail)"
    fi
fi

hr "7. 시스템 리소스"
echo "-- 메모리 --"
vm_stat | head -10
echo "-- 메모리 압박 --"
memory_pressure 2>&1 | head -10 || echo "(memory_pressure 실행 불가)"
echo "-- 디스크 --"
df -h / | head -3
echo "-- cards.json/db 크기 --"
ls -lh "$PROJECT_DIR/data/cards.json" "$PROJECT_DIR/data/mnemo.db" 2>&1 | head -5

hr "8. 슬립/전원 설정 (서버 절전이 들어가면 응답 멈춤)"
pmset -g 2>&1 | head -25
echo
echo "-- 현재 어시션 (뭔가 슬립을 막고 있는지) --"
pmset -g assertions 2>&1 | grep -E 'PreventUserIdleSystemSleep|PreventSystemSleep' | head -10

hr "9. 최근 슬립/웨이크/재부팅 이벤트 (24시간)"
echo "-- pmset -g log (마지막 50줄) --"
pmset -g log 2>/dev/null | grep -E 'Sleep|Wake|DarkWake|Shutdown|Start' | tail -50
echo
echo "-- 최근 셧다운 (last) --"
last shutdown 2>&1 | head -10
echo
echo "-- 시스템 부팅 시각 --"
sysctl -n kern.boottime

hr "10. 네트워크 / Tailscale"
echo "-- Tailscale 상태 --"
/Applications/Tailscale.app/Contents/MacOS/Tailscale status 2>/dev/null | head -10 || tailscale status 2>&1 | head -10
echo
echo "-- 네트워크 인터페이스 --"
ifconfig en0 2>/dev/null | head -8
echo
echo "-- 라우팅 --"
netstat -nr 2>/dev/null | grep -E '^default|100\.' | head -5

hr "11. launchd webapp 잡 재시작 흔적"
echo "-- system.log에서 com.mnemo.webapp 관련 (최근 24h) --"
log show --predicate 'process == "launchd" AND eventMessage CONTAINS "mnemo"' --last 24h 2>&1 | tail -40

hr "끝. 위 결과를 통째로 복사해서 Claude에 붙여넣어 주세요."
