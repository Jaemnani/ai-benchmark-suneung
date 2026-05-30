import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 수능 벤치마크',
  description:
    '2025 수능을 AI 모델(Claude·Gemini)이 이미지 모드로 푼 결과를 과목·모델·모드별로 비교하는 리더보드 대시보드.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
