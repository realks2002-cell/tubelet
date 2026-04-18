# Youtube_sum — Tubelet

구독한 YouTube 채널의 새 영상을 자동으로 요약해서 카카오톡으로 보내주는 개인용 앱.

## 🔗 배포

- **프로덕션**: https://tubelet.vercel.app
- **GitHub**: https://github.com/realks2002-cell/tubelet
- **호스팅**: Vercel (정적 호스팅, public/ 서빙)
- **자동화**: GitHub Actions cron (`.github/workflows/digest.yml`) — 매시간 정각 자동 실행
- **소유자 계정**: realks2002@gmail.com (앱 ID 1434755 / 카카오 개발자)

### 배포 흐름

```
로컬 npm run dev
        │
        ├─ public/digest/*.html, state/last-checked.json 생성
        │
        └─ git commit + push
              │
              └─ Vercel 자동 재배포 → https://tubelet.vercel.app 갱신
              └─ 카카오톡 '나와의 채팅' 발송

GitHub Actions cron (매시간)
        │
        └─ npm run dev → 자동 커밋 → Vercel 재배포 + 카톡 발송
```

### Vercel 환경 설정
- `vercel.json`: `outputDirectory: "public"`, `framework: null`, `cleanUrls: true`
- 빌드 커맨드 없음 (순수 정적)

### 환경 변수 (GitHub Secrets)
Actions 실행을 위해 레포 Secrets에 등록:
- `YOUTUBE_API_KEY`
- `ANTHROPIC_API_KEY`
- `KAKAO_REST_API_KEY`
- `KAKAO_CLIENT_SECRET`
- `KAKAO_REFRESH_TOKEN`
- `SITE_URL` = `https://tubelet.vercel.app`

### 카카오 Redirect URI 등록 (두 개 모두 등록 필수)
- `http://localhost:3000/auth/kakao/callback` (로컬 개발)
- `https://tubelet.vercel.app/auth/kakao/callback` (Vercel 배포)

## 프로젝트 개요
- 언어: TypeScript + Node.js (ESM)
- 실행: `npm run dev` (로컬 cron), `npm run serve` (URL 즉석 요약 웹서버), GitHub Actions cron (프로덕션)
- 파이프라인: YouTube Data API → 자막 추출 → Claude 요약 (Haiku 4.5) → HTML 다이제스트 → 카톡 발송

## 디자인 시스템 · Tubelet

이 프로젝트의 모든 HTML/시각 결과물은 **Tubelet** 디자인 시스템을 따른다.
레퍼런스 원본: `docs/design/design-system.html` (새 컴포넌트·화면 만들기 전 반드시 읽을 것).

### 디자인 토큰 (CSS 변수)

```css
:root {
  /* Surface */
  --bg: #FFFFFF;         /* 모든 페이지 바탕 — 순백 고정 */
  --bg-tint: #F5F2EC;    /* 썸네일 플레이스홀더, 미리보기 모달만 */

  /* Ink */
  --ink: #1A1814;        /* 본문·제목·Primary 버튼·다크 박스 배경 */
  --ink-2: #4A4540;      /* 부제·lead */
  --ink-3: #8A847C;      /* 메타·캡션 */
  --ink-4: #B8B0A4;      /* 비활성·plate placeholder */

  /* Rule */
  --rule: #EAE5DA;       /* 1px 구분선 (기본) */
  --rule-strong: #D6CEBE; /* 1px 구분선 (강조·button outline) */

  /* Accent — 머스타드 1톤만 */
  --accent: oklch(0.72 0.14 75);     /* 풀쿼트 세로선·Action 넘버 */
  --accent-ink: oklch(0.32 0.10 60);  /* accent 위 텍스트 */
  --accent-bg: oklch(0.95 0.04 80);   /* "AI 요약" 칩 배경 */

  /* Semantic */
  --positive: oklch(0.55 0.12 145);   /* 전송 완료 도트 */
  --danger: oklch(0.58 0.17 28);      /* 라이브·실패 */

  /* Type */
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

**폰트 로드 순서** (HTML head):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
```

### 타이포그래피 스케일

| 역할 | 크기/줄높이/간격 | 용도 |
|---|---|---|
| Display | Pretendard 600 · 54/57 · -0.025em | 히어로 헤드라인 |
| H1 | Pretendard 600 · 36/38 · -0.02em | 페이지 타이틀 |
| H2 | Pretendard 600 · 24/29 · -0.015em | 섹션 제목 |
| Deck | Pretendard 500 · 19/28 · 1.5 | 요약 리드 문장 |
| Body | Pretendard 400 · 17/28 · 1.65 | 본문 |
| UI | Pretendard 500 · 14/21 · 0 | 버튼·인풋 |
| Meta | Pretendard 400 · 12.5/19 · ink-3 | 캡션·시간 |
| Label | Pretendard 500 · 11 · +0.12em · UPPER | 아이브로우 |
| Mono | JetBrains Mono 400 · 12 · ink-2 | 타임스탬프·버전 |

### Spacing (4px ramp)
`4 / 8 / 12 / 16 / 24 / 32 / 56` — 섹션 간격은 32 이상, 섹션 구분선 간격은 56.

### Radius (3단계만)
- `0` divider
- `6px` button·input
- `10px` card
- `14px` modal/sheet
- `999px` chip/avatar

### Rule & Elevation
- **그림자 금지** (모달만 예외: `0 20px 60px -10px rgba(0,0,0,.2)`)
- 구분은 `1px solid var(--rule)` 한 줄로만
- 배경 음영 금지

## 원칙 · 4가지 (반드시 준수)

1. **흰 종이 먼저** — 배경은 순백 고정. 카드도 흰색. 구분은 1px rule 한 줄로만. 음영·그림자 금지.
2. **읽는 감각** — 본문은 Pretendard. 줄간격 1.65. 드롭캡 한 번, 풀쿼트 한 번 — 에디토리얼 리듬 유지.
3. **잉크 한 방울** — 채도는 머스타드(`--accent`) 하나로. 풀쿼트 세로선, AI 태그 칩, 다크 박스의 넘버에만 허용. 다른 브랜드 컬러 추가 금지.
4. **조용한 데이터** — 숫자·통계는 꼭 필요한 것만. 아이콘 남발 금지. 이모지 금지. 아이콘이 필요하면 SVG 1.5px stroke. 시간은 Mono, 나머지는 자연어.

## 보이스 & 톤

**DO**: "어젯밤부터 3편의 새 영상이 올라왔고, 모두 정리해서 보내드렸어요."
**DON'T**: "🚀 와우! 무려 3개의 새로운 컨텐츠가 업로드되었습니다!!"

**DO**: "5명 팀 세 곳이 10배 속도 + 사고 절반을 얻기까지."
**DON'T**: "이 영상을 통해 얻을 수 있는 다양한 인사이트들을 확인해 보세요."

조용하고 개인적이며 편집자적인 말투. 과장·감탄사·이모지 금지.

## 핵심 컴포넌트 패턴

### Masthead (페이지 상단)
eyebrow → display 헤드라인(serif italic 강조 포함) → lead(ink-2 · deck 크기) → meta-row(k/v 3세트).

### Summary Row (영상 리스트 카드)
썸네일(16/10, 120px) · 본문(source → headline → tldr) · meta(우측 시간 + 전송 상태). 카드 간 구분은 `border-top: 1px solid --rule`.

### Insight Card
`border: 1px --rule; padding: 16px 18px; radius 10`. `Insight 01` 이라벨(ink-3, serif 12) → 헤드라인(serif 17/500) → 설명(12.5 · ink-2).

### Pull Quote
`border-left: 2px solid var(--accent); padding-left: 20px`. serif italic 20px. 인용자는 sans 11.5 · ink-3 · mt:10.

### Actions Box (다크 섹션)
`background: var(--ink); color: #F2EDE3; border-radius: 10; padding: 18-24px`.
label(eyebrow · ink-4) → h2(serif 18 · 400 · white) → 아이템: `grid 22px 1fr auto`. 넘버는 serif 17 · accent. 이펙트(우측) 는 pill chip (`border: 1px rgba(255,255,255,.15)`).

### Chip
- Neutral: `bg: --bg-tint; color: --ink-2`
- Accent: `bg: --accent-bg; color: --accent-ink`
- Live: 앞에 `--danger` 도트 + pulse
- 공통: `padding: 3px 9px; radius: 999px; font-size: 11.5px; font-weight: 500`

### Button
- Primary: `bg: --ink; color: #fff; padding: 7px 14px; radius: 6; font: 13/500`
- Outline: `border: 1px --rule-strong; bg: #fff; color: --ink`
- Ghost: `color: --ink-2; hover: bg --bg-tint`

### Channel Chip (인라인 태그)
아바타(22px pill · 서브틀 컬러) + 채널명 + 카운트(우측 mono pill).

## 레퍼런스 파일

- `docs/design/design-system.html` — **공식 디자인 시스템 (열람 필수)**
- `docs/design/index.html` — 앱 전체 화면 프로토타입 (온보딩·대시보드·상세·미리보기)
- `docs/design/styles.css` — 공유 CSS (토큰이 여기 정의됨)
- `docs/design/HANDOFF-README.md` — Claude Design 핸드오프 가이드

## 코드 규칙 (개발 컨벤션)

- TypeScript strict 모드
- `import ... from './x.js'` (ESM, .js 확장자 필수)
- 함수형 · 불필요한 주석 금지
- 한국어 UI 문구 / 영어 변수명
- 아이콘: https://lucide.dev (SVG 1.5 stroke, 인라인)
- 이모지: 금지 (디자인 원칙 · 보이스 톤)

## 파이프라인 구조

```
src/
├── config.ts       # channels.json 로드
├── youtube.ts      # YouTube Data API v3
├── transcript.ts   # 자막 추출 (youtube-transcript)
├── summarize.ts    # Claude 요약
├── html.ts         # 다이제스트 HTML 생성 (Tubelet 디자인)
├── save.ts         # public/digest/ 저장
├── state.ts        # 중복 방지
└── index.ts        # 메인 엔트리
```
