# Apple 4.2 / 3.1.1 통과 체크리스트

옵션 B(부분 네이티브)로 가도 WebView 비중이 크기 때문에 출시 시점에 다음을 **모두 충족**해야 한다.

## 1. 4.2 Minimum Functionality

| 항목 | 요건 | 검증 방법 |
|---|---|---|
| 첫 진입 = 네이티브 홈 | RN `Home.tsx`에서 카드 그리드 + 햅틱 + 푸시 권한 prompt | 콜드 스타트 시 WebView가 0개 |
| 로그인 = 네이티브 | RN `Login.tsx`에서 Apple Sign-In 최상단 | Google Sign-In만 있으면 안 됨 (Guideline 4.8) |
| 마이페이지 = 네이티브 | RN `MyPage.tsx`에서 프로필 편집, 크레딧 표시, 토픽 토글 | WebView 없이 풀 기능 동작 |
| 결제 = 네이티브 IAP | RN `Plans.tsx` + RevenueCat 데모 상품 1개 | Sandbox 구매 시연 영상 |
| 푸시 알림 | 권한 prompt → FCM 토큰 발급 → 실제 발송 데모 | TestFlight 사용자에게 푸시 전송 |
| 햅틱 | 좋아요/투표/탭 전환 시 `HapticFeedback.trigger('impactLight')` | 손가락 감각으로 확인 |
| 공유 | 네이티브 share sheet (`react-native` `Share`) | news 상세에서 공유 버튼 → 시트 표시 |
| 생체 인증 | 콜드 스타트 재방문 시 Face ID/Touch ID로 세션 unlock | 두 번째 실행 시 prompt |
| 딥링크 | 외부 메신저 URL → 앱 진입 | Notes에 URL 붙여넣고 길게 눌러 "aib에서 열기" |
| 오프라인 표시 | 네트워크 끊김 시 상단 배너 | 비행기 모드 토글 |

## 2. 3.1.1 In-App Purchase

| 항목 | 요건 | 검증 방법 |
|---|---|---|
| 외부 결제 링크 0개 (iOS) | `mobile/src/screens/Plans.tsx` 안에 Stripe URL 텍스트/버튼 절대 없음 | grep으로 `stripe`, `checkout.aib.vote` 검색 → 0 |
| WebView Stripe 차단 | `onShouldStartLoadWithRequest`에서 `stripe.com`, `*.stripe.com` 차단 + return false | 우회 시도 시 차단 동작 |
| 디지털 콘텐츠 = IAP | 크레딧 충전(=AI 사용량) 가입형 결제는 IAP 의무 | 1개 상품으로 시연 충분 |
| 영수증 검증 | RevenueCat이 Apple StoreKit + Google Play Billing 영수증 자동 검증 | RevenueCat 콘솔에서 거래 상태 확인 |

## 3. 4.8 Sign in with Apple

iOS 앱이 Google/Facebook 등 third-party SSO를 제공하면 **Apple Sign-In도 반드시 제공**해야 한다.

| 항목 | 요건 |
|---|---|
| Apple Sign-In 버튼 위치 | Google 버튼과 동일하거나 상위 |
| 버튼 디자인 | Apple HIG 준수 (검정/흰색/외곽선 중 하나) |
| 비-iOS에서는 | Apple 버튼 숨기기 가능 (선택) |

## 4. 5.1.1 Data Collection & Storage (App Privacy)

App Store Connect → App Privacy → 정확한 답변:

| 데이터 | 수집? | 용도 | 식별자 연결? |
|---|---|---|---|
| 이메일 주소 | YES | 계정 / 알림 | Linked |
| 이름 | YES | 계정 | Linked |
| User ID (Supabase UUID) | YES | 계정 | Linked |
| 구매 내역 | YES (RevenueCat) | 앱 기능 / 분석 | Linked |
| 정확한 위치 | NO | — | — |
| 대략적 위치 (IP) | YES | 사기 방지 / 지역화 | Not Linked |
| Push token | YES | App Functionality | Linked |
| Behavioral data (user_events) | YES | 분석 / 개인화 | Linked |
| Crash data (Sentry) | YES | 앱 기능 | Not Linked |

## 5. 5.1.2 Data Use

- App Tracking Transparency (ATT): 광고 ID(IDFA) 사용 시만 필요. 현재 코드에 광고 SDK 없음 → ATT prompt 불필요.
- 분석은 자체 user_events 테이블 + Vercel Analytics만. 제3자 광고 분석 없음.

## 6. 2.3 Accurate Metadata

| 항목 | 요건 |
|---|---|
| 앱 설명 | 실제 기능과 일치, "AI tools/News/Quiz/Workshop platform" 정확 표현 |
| 스크린샷 | 네이티브 화면 위주 (Home/Login/MyPage/Plans). WebView 콘텐츠도 1-2장 포함 가능 |
| 키워드 | 정확, 경쟁 앱 이름 금지 |
| 카테고리 | News, Education, Productivity 중 가장 가까운 1차 + 2차 |

## 7. 심사 노트 (Reviewer Notes, 영문)

```
Hi App Review Team,

aib (vote.aib.app) is a hybrid mobile application combining native screens
and a managed WebView for long-tail content. Key native features (all
exercised on first launch):

1. Native home with recommendation cards (React Native)
2. Sign in with Apple, Google Sign-In (ID token → Supabase backend)
3. Native MyPage (profile editing, credit balance, push topic toggles)
4. In-App Purchases via RevenueCat (one product: "Starter Credits 500" -
   bundle ID: vote.aib.app)
5. Push notifications (Firebase Cloud Messaging integrated with APNs)
6. Biometric session unlock (Face ID / Touch ID via Keychain)
7. Universal Links (associated domains: www.aib.vote, aib.vote)
8. Native share sheet, haptic feedback on key interactions
9. Offline banner via network reachability

WebView is used for content pages (news articles, class details, workshops,
terms, etc.) to leverage our server-rendered, SEO-optimized HTML. All
business-critical actions (auth, payment, profile) are native.

Demo account:
  Email: reviewer@aib.vote
  Password: ********
  IAP Sandbox test: Use a sandbox tester to purchase "Starter Credits 500"
  in the Plans tab. Credits will appear on MyPage within 10 seconds.

If you encounter any issues, please reach out to dev@aib.vote.

Thank you!
```

## 8. 자주 리젝되는 함정

| 함정 | 회피 |
|---|---|
| WebView가 첫 화면 | 첫 진입은 반드시 RN 네이티브 |
| iOS에 Apple Sign-In 없음 | Login.tsx에 Apple 버튼 최상단 |
| 외부 결제 링크 노출 | Stripe URL/버튼 절대 금지 (iOS), grep 정기 검사 |
| .well-known 리다이렉트 | curl로 응답 검증, 200 직접 응답 확인 |
| App Privacy 누락 | Supabase Auth / RevenueCat / 푸시 토큰 모두 명시 |
| 데모 계정 미제공 | App Store Connect → 앱 정보 → 심사 항목에 추가 |
| 스플래시 / 아이콘 부재 | 1024x1024, 1242x2688 등 필수 사이즈 모두 제출 |

## 9. 베타 단계 점검

- TestFlight 내부 20-30명 + 외부 50-100명 → 1주 이상 실사용 → 크래시율 < 1% → 심사 신청
- Play Console: 신규 앱 정책 — Internal → **Closed Testing 14일 / 20명 unique tester** 필수 → Production
