#!/bin/bash
# Mnemo 통합 관리 스크립트
#
# 사용법:
#   ./setup_cron.sh install   — 크론잡 + 웹서버 모두 등록
#   ./setup_cron.sh uninstall — 모두 제거
#   ./setup_cron.sh status    — 현재 상태 확인
#   ./setup_cron.sh run       — 파이프라인 즉시 수동 실행

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/data/logs"

# 크론잡
PIPE_PLIST="com.mnemo.pipeline"
PIPE_SRC="$PROJECT_DIR/${PIPE_PLIST}.plist"
PIPE_DST="$HOME/Library/LaunchAgents/${PIPE_PLIST}.plist"

# 웹서버
WEB_PLIST="com.mnemo.webapp"
WEB_SRC="$PROJECT_DIR/${WEB_PLIST}.plist"
WEB_DST="$HOME/Library/LaunchAgents/${WEB_PLIST}.plist"

install_service() {
    local name=$1 src=$2 dst=$3
    launchctl bootout gui/$(id -u) "$dst" 2>/dev/null || true
    cp "$src" "$dst"
    launchctl bootstrap gui/$(id -u) "$dst"
    echo "   ✅ $name 등록 완료"
}

uninstall_service() {
    local name=$1 dst=$2
    launchctl bootout gui/$(id -u) "$dst" 2>/dev/null || true
    rm -f "$dst"
    echo "   ✅ $name 제거 완료"
}

check_service() {
    local name=$1 plist_name=$2 dst=$3
    if [ -f "$dst" ]; then
        if launchctl print gui/$(id -u)/$plist_name 2>/dev/null | grep -q "state"; then
            echo "   $name: ✅ 실행 중"
        else
            echo "   $name: ⚠️  설치됨 (미실행)"
        fi
    else
        echo "   $name: ❌ 미설치"
    fi
}

case "${1:-status}" in
    install)
        echo "📦 Mnemo 전체 설치 중..."
        echo ""

        mkdir -p "$LOG_DIR"

        # 빌드 확인
        if [ ! -d "$PROJECT_DIR/.next" ]; then
            echo "   🔨 Next.js 빌드 중..."
            cd "$PROJECT_DIR" && npm run build
        fi

        install_service "크론잡 (7:30/15:30/23:30)" "$PIPE_SRC" "$PIPE_DST"
        install_service "웹서버 (포트 3000)" "$WEB_SRC" "$WEB_DST"

        # 로컬 IP 확인
        LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "확인불가")

        echo ""
        echo "🎉 설치 완료!"
        echo ""
        echo "   📱 접속 주소:"
        echo "      이 Mac: http://localhost:3000"
        echo "      다른 기기 (같은 WiFi): http://${LOCAL_IP}:3000"
        echo ""
        echo "   ⏰ 크론잡: 매일 07:30, 15:30, 23:30"
        echo "   📂 로그: $LOG_DIR/"
        echo ""
        echo "   상태 확인: ./setup_cron.sh status"
        echo "   제거: ./setup_cron.sh uninstall"
        ;;

    uninstall)
        echo "🗑  Mnemo 전체 제거 중..."
        echo ""

        uninstall_service "크론잡" "$PIPE_DST"
        uninstall_service "웹서버" "$WEB_DST"

        echo ""
        echo "✅ 모두 제거 완료!"
        ;;

    status)
        echo "📊 Mnemo 상태:"
        echo ""

        check_service "크론잡 (파이프라인)" "$PIPE_PLIST" "$PIPE_DST"
        check_service "웹서버 (Next.js)" "$WEB_PLIST" "$WEB_DST"

        # 로컬 IP 확인
        LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "확인불가")
        echo ""
        echo "   📱 접속: http://${LOCAL_IP}:3000"

        echo ""
        echo "   📋 최근 파이프라인 로그:"
        if ls "$LOG_DIR"/pipeline_*.log 1>/dev/null 2>&1; then
            LATEST_LOG=$(ls -t "$LOG_DIR"/pipeline_*.log | head -1)
            tail -3 "$LATEST_LOG" 2>/dev/null | sed 's/^/      /'
        else
            echo "      (아직 실행 로그 없음)"
        fi

        echo ""
        echo "   📋 웹서버 로그:"
        if [ -f "$LOG_DIR/webapp_stderr.log" ]; then
            tail -3 "$LOG_DIR/webapp_stderr.log" 2>/dev/null | sed 's/^/      /'
        else
            echo "      (아직 로그 없음)"
        fi
        ;;

    run)
        echo "🚀 Mnemo 파이프라인 수동 실행..."
        echo ""
        bash "$PROJECT_DIR/run_pipeline.sh"
        ;;

    *)
        echo "사용법: $0 {install|uninstall|status|run}"
        echo ""
        echo "  install   — 크론잡 + 웹서버 모두 등록"
        echo "  uninstall — 모두 제거"
        echo "  status    — 현재 상태 확인"
        echo "  run       — 파이프라인 즉시 수동 실행"
        exit 1
        ;;
esac
