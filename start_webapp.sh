#!/bin/bash
# Mnemo 웹앱 서버 시작 스크립트

export PATH="/opt/homebrew/bin:$PATH"

PROJECT_DIR="$HOME/coding/openclaw-workspace/projects/project-mnemo-mmeptsf1/code/mnemo-app"
cd "$PROJECT_DIR"

# .env에서 환경변수 로드
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

export NODE_ENV=production

# npx로 실행 (node 경로 자동 해결)
exec npx next start --hostname 0.0.0.0 --port 3000
