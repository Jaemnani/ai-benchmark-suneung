# aib Expo Go 데모 (iPhone 14)

`https://www.aib.vote` 를 WebView로 감싸서 iPhone에 띄우는 가장 단순한 데모입니다. 5분 안에 켜집니다.

## 한 번만 준비

### 1) iPhone에 Expo Go 설치
App Store → "Expo Go" 검색 → 설치 (무료, Apple 계정 외 추가 가입 불필요).

### 2) 컴퓨터에 Node.js 20 이상
이미 있으면 스킵.
```bash
node -v   # v20+ 확인
```

### 3) iPhone과 컴퓨터를 같은 Wi-Fi에 연결
회사·집·핫스팟 어디든 OK. 같은 네트워크여야 QR 스캔 후 연결됨.

> Wi-Fi가 다르면 `npx expo start --tunnel`로 우회 가능 (느림).

## 실행

처음이면 레포를 자기 컴퓨터에 받습니다 (원하는 디렉터리 어디서나):

```bash
git clone https://github.com/Jaemnani/AI-benchmark-suneung.git
cd AI-benchmark-suneung
git checkout claude/nextjs-to-mobile-app-iNQ5J
cd expo-demo
npm install            # 1-2분
npx expo start         # Metro 서버 실행 + QR 코드 출력
```

이미 clone 받았으면 `AI-benchmark-suneung/expo-demo`에서 `npm install && npx expo start`만.

터미널에 큰 QR 코드가 표시됩니다.

### iPhone에서 열기
1. iPhone 카메라 앱을 열고 QR 코드를 비춥니다.
2. "Expo Go에서 열기" 노란 배너를 탭합니다.
3. Expo Go가 열리고 잠시 후 `aib` 사이트가 WebView로 표시됩니다.

> 카메라가 QR을 못 잡으면 Expo Go 앱을 직접 열어 "Scan QR Code" 사용.

## 동작

- 콜드 스타트 → `https://www.aib.vote` 로드
- 좌→우 스와이프 = 뒤로 가기 (iOS WebView 기본 제스처)
- 위에서 당기기 = 새로고침
- 외부 도메인 링크 (예: 트위터, 유튜브) → 사파리로 자동 위임
- Stripe Checkout URL → 차단 (모바일은 IAP 정책상 외부 결제 금지)

## 한계 (Expo Go이므로)

- Apple Sign-In, RevenueCat IAP, Firebase Push 같은 네이티브 모듈은 동작하지 않음 — 별도 dev client 빌드 필요
- 단순 WebView만으로는 Apple App Store 4.2 통과 불가 (출시용은 `mobile-port/PLAN.md` 옵션 B 진행 필요)
- 푸시 알림은 Expo Notifications로 별도 구현 가능 (이 데모는 미포함)

## 정리

```bash
# Metro 서버 종료: 터미널에서 Ctrl+C
# Expo Go에서 앱 닫기: 좌상단 X 또는 홈으로 이동
```

## 다음 단계

이 데모가 잘 뜨면 `mobile-port/PLAN.md` 의 옵션 B로 진행 — Login/MyPage/Plans 네이티브 화면 + IAP + Apple Sign-In + 푸시까지 추가하고 App Store 심사 준비.
