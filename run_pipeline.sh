#!/bin/bash
# Mnemo 파이프라인 실행 스크립트
# launchd 또는 수동으로 실행할 수 있다.

set -e

export PATH="/opt/homebrew/bin:$PATH"

# 프로젝트 디렉토리
PROJECT_DIR="$HOME/coding/openclaw-workspace/projects/project-mnemo-mmeptsf1/code/mnemo-app"
LOG_DIR="$PROJECT_DIR/data/logs"
LOG_FILE="$LOG_DIR/pipeline_$(date +%Y%m%d_%H%M%S).log"

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

# .env에서 환경변수 로드
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [START] Mnemo 파이프라인 시작" | tee -a "$LOG_FILE"

# 파이프라인 실행
python3 -m pipeline.orchestrator 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -eq 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] 파이프라인 정상 완료" | tee -a "$LOG_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] 파이프라인 실패 (exit code: $EXIT_CODE)" | tee -a "$LOG_FILE"
fi

# 오래된 로그 정리 (30일 이상)
find "$LOG_DIR" -name "pipeline_*.log" -mtime +30 -delete 2>/dev/null || true

exit $EXIT_CODE
