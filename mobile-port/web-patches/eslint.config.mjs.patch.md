# eslint.config.mjs 패치 (knowai-space 루트)

기존 `eslint.config.mjs`의 `eslintConfig` 배열에 다음 블록을 **최상단**에 추가한다 (다른 규칙들이 mobile 트리에 적용되기 전에 무시되도록).

```js
{
  ignores: [
    'mobile/ios/**',
    'mobile/android/**',
    'mobile/Pods/**',
    'mobile/node_modules/**',
    'mobile/build/**',
    'mobile/.cxx/**',
    'mobile/vendor/**',
    'mobile/__tests__/**/*.snap',
  ],
},
```

## 적용 후 형태 (발췌)

```js
import { FlatCompat } from '@eslint/eslintrc';
// ...

export default [
  {
    ignores: [
      'mobile/ios/**',
      'mobile/android/**',
      'mobile/Pods/**',
      'mobile/node_modules/**',
      'mobile/build/**',
      'mobile/.cxx/**',
      'mobile/vendor/**',
    ],
  },
  // 기존 next/core-web-vitals 컴팻 룰
  ...compat.config({
    extends: ['next/core-web-vitals', 'prettier'],
    rules: { /* ... */ },
  }),
];
```

## 이유

- 루트 eslint는 next/core-web-vitals 기반이며, RN 환경(no DOM, Metro bundler)과 룰 충돌. mobile 안에는 별도 `.eslintrc.js` (RN 기본)를 두어 mobile만의 룰 적용.
- 루트에서 `mobile/**`를 무시하지 않으면 `next lint`가 mobile 트리도 스캔해 에러 폭주.

## 검증

```bash
cd /home/user/knowai-space
npm run lint
# mobile/ 안의 파일은 lint 대상에서 빠져야 함 (출력에 mobile 경로 없음 확인)
```
