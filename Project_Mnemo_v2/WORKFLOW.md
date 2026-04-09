# Mnemo 개발 워크플로우

## 환경 구성

| 역할 | 장비 | 경로 |
|------|------|------|
| 개발 | MacBook Air (ggontee) | `~/mnemo-app` (GitHub clone) |
| 서비스 운영 | noteubug 서버 (jaehyungoh) | `/Users/jaehyungoh/coding/mnemo-app` |
| GitHub | ggontee/mnemo-app | `https://github.com/ggontee/mnemo-app` |
| 서버 접속 | Tailscale SSH | `ssh jaehyungoh@100.86.137.93` |

## 개발 흐름

```
MacBook Air (Claude Code)  →  git push  →  GitHub  →  noteubug (git pull)  →  서비스 반영
```

### 1. 개발 (MacBook Air)

```bash
cd ~/mnemo-app
claude   # Claude Code 실행
# 작업 완료 후
git add -A && git commit -m "작업 내용"
git push origin main
```

### 2. 서버 반영 (noteubug)

```bash
ssh jaehyungoh@100.86.137.93
cd /Users/jaehyungoh/coding/mnemo-app
git pull origin main
```

### 3. 서비스 재시작 (필요 시)

```bash
# 웹앱 재시작
launchctl unload ~/Library/LaunchAgents/com.mnemo.webapp.plist
launchctl load ~/Library/LaunchAgents/com.mnemo.webapp.plist

# 파이프라인은 launchd 스케줄(07:30, 15:30, 23:30)에 자동 실행
```

## 주의사항

- noteubug에서 직접 git 작업 금지 (SMB 네트워크 마운트로 인해 극도로 느림)
- 큰 파일 작업 필요 시 `/tmp`로 복사 후 작업
- `node_modules/`, `.next/`, `*.db`, `__pycache__/`, `data/logs/`는 `.gitignore`에 포함
