# Trill Lab

16비트 트릴 기준 한계 BPM을 빠르게 측정하는 리듬게임용 웹앱입니다.

## 이번 MVP 범위

- A / L 두 키만 입력 받기
- 반드시 교대 입력만 valid 처리
- 10초 측정 + 3초 카운트다운
- 결과를 16분음표 기준 BPM으로 계산
- 유효 입력, 무효 입력, 정확도, 최대 스트릭 표시

## 프로젝트 이름

- 워크스페이스 디렉토리: `06_trill-lab`
- 앱 이름: `trill-lab`

기존 `00_`, `01_`, `04_` 패턴을 따라 숫자 prefix를 붙였고,
이후 패턴 연습/챌린지/랭킹 기능으로 확장하기 쉬운 이름으로 잡았습니다.

## 로컬 실행

```bash
cd /Users/bini/.openclaw/workspace/06_trill-lab
pnpm install
pnpm dev
```

브라우저에서 <http://localhost:3000> 접속.

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 배포 전략

기존 `04_39notes`와 동일하게:

1. `dev`에서 작업
2. `dev -> main` PR 생성
3. CI에서 `install -> lint -> typecheck -> build`
4. `main` 머지 시 CD가 self-hosted runner에서 배포
5. `/Users/bini/apps/06_trill-lab`에 git sync
6. `pnpm install --frozen-lockfile`
7. `pnpm build`
8. `pm2 startOrReload ecosystem.config.cjs`
9. Cloudflare Tunnel이 `127.0.0.1:23310`을 외부에 노출

## 프로덕션 레이아웃

```text
/Users/bini/apps/
  06_trill-lab/
```

## Cloudflare Tunnel에서 마지막으로 할 일

앱 자체는 pm2가 `127.0.0.1:23310`에서 띄웁니다.
마스터가 Cloudflare Tunnel 웹 설정에서 마지막으로 할 일은 사실상 이것뿐이에요:

- Public Hostname 하나 생성
- 서비스 타입: HTTP
- URL: `http://127.0.0.1:23310`
- 원하는 도메인 연결

## GitHub 업로드

기본 CD 파일은 다음 원격 저장소를 가정합니다.

- `https://github.com/miku-agent/06_trill-lab.git`

실제 repo 생성 후 아래 중 하나로 맞추면 됩니다.

### 새 repo를 직접 만들 때

```bash
cd /Users/bini/.openclaw/workspace/06_trill-lab
git init
git checkout -b dev
git add .
git commit -m "feat: bootstrap trill bpm benchmark app"
gh repo create miku-agent/06_trill-lab --private --source=. --remote=origin --push
```

### repo를 먼저 만든 뒤 연결할 때

```bash
cd /Users/bini/.openclaw/workspace/06_trill-lab
git remote add origin git@github.com:miku-agent/06_trill-lab.git
git push -u origin dev
```

## 다음 단계 아이디어

- 8비트 / 12비트 / 24비트 모드 추가
- 손배치 프리셋 추가
- 세션 기록 저장 및 최고 기록 보드
- 패턴별 연습 모드 (트릴 / 계단 / 잭)
- 정확도보다 안정성 중심 스코어링 추가
