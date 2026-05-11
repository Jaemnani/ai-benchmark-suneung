# package.json 패치 (knowai-space 루트)

기존 `package.json`에 다음 키를 **추가**한다. 기존 키는 건드리지 않는다.

## 1. `workspaces` 추가 (top-level)

```json
{
  "workspaces": ["mobile"]
}
```

> `"name"`, `"private"` 필드 다음 줄 정도가 자연스러움. private는 true여야 workspaces 동작.
> 기존에 `"private": true`가 없다면 추가.

## 2. `scripts` 보강

기존 scripts에 다음 항목 추가:

```json
{
  "scripts": {
    "mobile:start": "npm -w @aib/mobile run start",
    "mobile:ios": "npm -w @aib/mobile run ios",
    "mobile:android": "npm -w @aib/mobile run android",
    "mobile:install": "npm -w @aib/mobile install",
    "mobile:lint": "cd mobile && eslint src --ext .ts,.tsx"
  }
}
```

## 3. `lint-staged` 키 **삭제** (있다면)

기존:
```json
"lint-staged": {
  "*.{ts,tsx}": "eslint --fix",
  "*.{ts,tsx,json,md,css}": "prettier --write"
}
```

이 키는 통째로 삭제. 대신 `.lintstagedrc.json` (별도 파일)에서 스코프를 좁힌다. 이유: package.json 내 글롭은 모노레포 친화도가 낮고 mobile 트리를 잘못 잡을 위험.

## 4. 적용 후 검증

```bash
cd /home/user/knowai-space
npm install            # workspaces 부트스트랩 (mobile 디렉터리는 아직 비어있어도 OK)
npm run mobile:start   # 에러 — mobile 워크스페이스 아직 없음 (정상)
git diff package.json  # workspaces, mobile:* scripts 확인
```

## 5. 예시 최종 형태 (발췌)

```json
{
  "name": "knowai-space",
  "version": "...",
  "private": true,
  "workspaces": ["mobile"],
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "mobile:start": "npm -w @aib/mobile run start",
    "mobile:ios": "npm -w @aib/mobile run ios",
    "mobile:android": "npm -w @aib/mobile run android",
    "mobile:install": "npm -w @aib/mobile install",
    "mobile:lint": "cd mobile && eslint src --ext .ts,.tsx",
    "...": "..."
  }
}
```
