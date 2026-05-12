# Mnemo 개발 워크플로우

## 환경 구성

| 역할 | 장비 | 경로 |
|------|------|------|
| 코드 편집 | Cowork (Claude) | MacBook 폴더 마운트 → 직접 파일 수정 |
| 개발 (로컬) | MacBook Air (ggontee) | `~/mnemo-app` (GitHub clone) |
| 서비스 운영 | noteubug M2 서버 (jaehyungoh) | `/Users/jaehyungoh/coding/mnemo-app` |
| GitHub | ggontee/mnemo-app | `https://github.com/ggontee/mnemo-app` |
| 서버 접속 | Tailscale SSH | `ssh jaehyungoh@100.86.137.93` |

## 개발 흐름

```
Cowork (파일 수정)  →  MacBook 터미널 (deploy.sh)  →  GitHub  →  M2 서버 자동 pull
```

### 1. 코드 수정 (Cowork)

Cowork에서 마운트된 `~/mnemo-app` 폴더의 파일을 직접 편집한다.
Cowork 환경에서는 마운트 권한 문제로 git 명령 실행 불가.

### 2. 배포 (MacBook 터미널 — 한 줄)

```bash
~/mnemo-app/scripts/deploy.sh "커밋 메시지"
```

이 스크립트가 수행하는 작업:
- `.git/*.lock` 파일 정리 (Cowork 마운트로 인한 잔존 lock)
- `git add -A && git commit && git push`
- M2 서버에 SSH 접속하여 `git pull origin main`

### 3. SSH 비밀번호 입력 생략 (선택, 권장)

매번 M2 비밀번호 입력을 생략하려면 SSH 키를 등록한다:

```bash
# MacBook에서 1회 실행
ssh-copy-id jaehyungoh@100.86.137.93
```

등록 후에는 `deploy.sh` 실행 시 비밀번호 없이 자동 배포.

### 4. 서비스 재시작 (필요 시)

```bash
ssh jaehyungoh@100.86.137.93 "launchctl unload ~/Library/LaunchAgents/com.mnemo.webapp.plist && launchctl load ~/Library/LaunchAgents/com.mnemo.webapp.plist"
```

파이프라인은 launchd 스케줄(07:30, 15:30, 23:30)에 자동 실행.

## 주의사항

- Cowork 환경에서 git 명령 직접 실행 금지 (마운트 권한 문제로 lock 파일 생성)
- noteubug M2 서버에서 직접 코드 수정 금지 (GitHub 기준 동기화 충돌 방지)
- 큰 파일 작업 필요 시 `/tmp`로 복사 후 작업
- `.gitignore` 대상: `node_modules/`, `.next/`, `*.db`, `__pycache__/`, `data/logs/`
