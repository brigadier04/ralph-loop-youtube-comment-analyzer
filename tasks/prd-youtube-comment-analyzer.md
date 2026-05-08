# PRD: YouTube Comment Analyzer

## 1. Introduction / Overview

YouTube 동영상 링크를 입력하면 댓글을 자동으로 수집하고, GPT를 활용해 시청자 반응을 분석해주는 정적 웹 앱입니다. 크리에이터가 자신의 콘텐츠에 대한 시청자 의견을 빠르게 파악할 수 있도록 긍정/부정/중립 비율과 함께 "잘하는 점"·"개선해야 할 점"을 대표 댓글로 추출해 보여줍니다.

서버·로그인·회원가입이 전혀 없으며, 사용자가 본인의 YouTube Data API v3 키와 OpenAI API 키를 직접 입력해 사용하는 BYOK(Bring Your Own Key) 방식입니다. GitHub Pages 같은 정적 호스팅에 그대로 배포 가능합니다.

## 2. Goals

- 유튜브 링크 한 줄로 최대 500개 최상위 댓글을 수집·분석해 30초 이내에 결과 표시
- 긍정/부정/중립 비율을 시각적으로 보여주는 도넛 차트 제공
- 잘하는 점 / 개선해야 할 점 대표 댓글 각 5개 추출
- 사용자 API 키를 localStorage에 안전하게 보관·삭제 가능
- 빌드 없이 GitHub Pages에 즉시 배포 가능한 vanilla HTML/CSS/JS 결과물

## 3. User Stories

### US-001: 프로젝트 스캐폴딩
**Description:** As a developer, I want a clean Vanilla HTML/CSS/JS skeleton so that subsequent stories have a consistent foundation.

**Acceptance Criteria:**
- [ ] `index.html`, `styles.css`, `app.js`, `README.md`, `.gitignore` 생성
- [ ] index.html은 한국어 lang="ko", UTF-8 charset, viewport meta 포함
- [ ] app.js는 `'use strict';`로 시작, ES2020 문법 사용
- [ ] 빌드 도구·node_modules·번들러 사용 안 함
- [ ] index.html을 브라우저에서 직접 열어 빈 레이아웃이 보임
- [ ] Verify in browser using dev-browser skill

### US-002: API 키 입력·저장 UI
**Description:** As a user, I want to enter my YouTube and OpenAI API keys once and have them persist so that I don't re-enter them every visit.

**Acceptance Criteria:**
- [ ] 두 개의 password 타입 input 필드 (YouTube API Key, OpenAI API Key)
- [ ] "저장" 버튼 클릭 시 localStorage에 저장
- [ ] 페이지 재방문 시 저장된 키가 자동 로드됨 (마스킹된 형태로 표시)
- [ ] "키 삭제" 버튼으로 localStorage에서 즉시 제거
- [ ] 키가 없으면 "분석 시작" 버튼 비활성화 + 안내 메시지
- [ ] 키는 외부로 전송되지 않고 YouTube·OpenAI API 호출에만 사용됨을 안내 문구로 명시
- [ ] Verify in browser using dev-browser skill

### US-003: GPT 모델 선택 드롭다운
**Description:** As a user, I want to choose the GPT model so that I can balance cost and quality.

**Acceptance Criteria:**
- [ ] `<select>` 드롭다운 옵션: gpt-4o-mini (기본), gpt-4o, gpt-4-turbo
- [ ] 각 옵션에 대략적 비용 안내 (예: "저렴", "고품질")
- [ ] 선택값이 localStorage에 저장되어 재방문 시 유지
- [ ] Verify in browser using dev-browser skill

### US-004: YouTube 링크 입력 및 videoId 추출
**Description:** As a user, I want to paste any YouTube URL format and have the app correctly identify the video.

**Acceptance Criteria:**
- [ ] 다음 URL 형식 모두 지원: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`
- [ ] 정규식으로 videoId 추출 (11자 영숫자 + `-_`)
- [ ] 유효하지 않은 URL이면 빨간색 인라인 에러 메시지 표시
- [ ] 유효한 URL이면 "분석 시작" 버튼 활성화
- [ ] Verify in browser using dev-browser skill

### US-005: YouTube 댓글 수집 (최대 500개 페이지네이션)
**Description:** As a user, I want the app to collect up to 500 top-level comments via paginated YouTube API calls so that the analysis is meaningful.

**Acceptance Criteria:**
- [ ] YouTube Data API v3 `commentThreads.list` 호출 (`part=snippet`, `maxResults=100`, `order=relevance`)
- [ ] `nextPageToken`을 따라 최대 5페이지(=500개)까지 순차 수집
- [ ] 답글(replies)은 수집하지 않음 (top-level만)
- [ ] 댓글 비활성화 비디오는 명확한 에러 메시지 표시 ("이 동영상은 댓글이 비활성화되어 있습니다")
- [ ] 잘못된 API 키·할당량 초과는 구분된 메시지로 표시
- [ ] 수집 중 진행 상태 표시 (예: "댓글 수집 중… 200/500")
- [ ] Verify in browser using dev-browser skill

### US-006: GPT 분석 호출 (sentiment + 강점/개선점)
**Description:** As a user, I want collected comments analyzed by GPT and returned as structured data so that the UI can render the dashboard.

**Acceptance Criteria:**
- [ ] OpenAI Chat Completion API 호출 (`response_format: { type: "json_object" }`)
- [ ] 시스템 프롬프트로 다음 JSON 스키마 요구:
  ```
  {
    "sentiment": { "positive": <int>, "neutral": <int>, "negative": <int> },
    "strengths": [{ "comment": <string>, "reason": <string> }, ... 정확히 5개],
    "improvements": [{ "comment": <string>, "reason": <string> }, ... 정확히 5개]
  }
  ```
- [ ] sentiment 합이 수집된 댓글 수와 일치
- [ ] strengths/improvements는 실제 수집된 댓글 원문에서 발췌 (LLM 환각 방지 안내 프롬프트)
- [ ] 한/영 댓글 모두 처리, 응답 reason 필드는 한국어
- [ ] 토큰 한도 초과 시 댓글을 청크로 나눠 호출 후 결과 병합
- [ ] OpenAI 에러(401/429/500) 별도 메시지로 처리

### US-007: 결과 대시보드 렌더링
**Description:** As a user, I want to see a clean dashboard with sentiment chart and representative comments so that I can interpret the analysis at a glance.

**Acceptance Criteria:**
- [ ] 도넛 차트 (Chart.js v4 CDN) — 긍정(녹색) / 중립(회색) / 부정(빨강) 비율
- [ ] 차트 중앙에 총 분석 댓글 수 표시
- [ ] "잘하는 점" 섹션: 댓글 5개를 카드 형태로, 각 카드에 댓글 원문 + AI 코멘트(reason)
- [ ] "개선해야 할 점" 섹션: 동일 형식으로 5개
- [ ] 분석 대상 동영상 제목·썸네일 표시 (YouTube `videos.list` 추가 호출)
- [ ] 모바일·데스크톱 모두 가독성 있는 반응형 레이아웃
- [ ] Verify in browser using dev-browser skill

### US-008: 로딩·에러 UX
**Description:** As a user, I want clear loading indicators and error messages so that I always know the app's state.

**Acceptance Criteria:**
- [ ] 분석 시작 → "댓글 수집 중…" → "GPT 분석 중…" → 결과 표시 단계별 스피너·텍스트
- [ ] 모든 fetch 호출은 try/catch로 감싸 사용자에게 친절한 에러 메시지 변환
- [ ] 분석 진행 중 "분석 시작" 버튼 비활성화 (중복 클릭 방지)
- [ ] "취소" 버튼으로 진행 중인 fetch 중단 가능 (AbortController)
- [ ] Verify in browser using dev-browser skill

### US-009: README + GitHub Pages 배포 가이드
**Description:** As a developer, I want clear setup and deploy instructions so that anyone can fork and host their own copy.

**Acceptance Criteria:**
- [ ] README.md에 다음 섹션: 소개, 사용법, API 키 발급 방법(YouTube + OpenAI), 로컬 실행, GitHub Pages 배포
- [ ] YouTube API 키 발급 단계 스크린샷 또는 링크 포함
- [ ] OpenAI API 키 발급 안내 + 비용 경고
- [ ] `.github/workflows/pages.yml` 또는 수동 GitHub Pages 설정 가이드
- [ ] 라이선스(MIT) 명시

## 4. Functional Requirements

- **FR-1:** 결과물은 정적 파일(HTML/CSS/JS)만으로 동작하며 빌드 단계와 npm 의존성이 없어야 한다 (Chart.js CDN은 허용).
- **FR-2:** YouTube API 키와 OpenAI API 키는 사용자가 직접 입력하며 localStorage에만 저장한다. 서버나 외부 시스템으로 절대 전송하지 않는다.
- **FR-3:** 다음 YouTube URL 형식을 모두 인식해야 한다: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`.
- **FR-4:** 댓글은 `commentThreads.list`로 최대 500개 최상위 댓글을 `order=relevance`로 페이지네이션 수집한다. 답글은 수집하지 않는다.
- **FR-5:** GPT 호출은 `response_format: { type: "json_object" }` 모드로 수행하며, 응답 JSON을 검증한 뒤 UI에 렌더링한다.
- **FR-6:** GPT 분석 결과는 sentiment 카운트(positive/neutral/negative)와 strengths/improvements 각 5개 댓글 발췌를 포함한다.
- **FR-7:** 모델 드롭다운은 gpt-4o-mini(기본), gpt-4o, gpt-4-turbo 세 가지를 제공한다.
- **FR-8:** 진행 중 사용자에게 단계별 상태 텍스트(수집 N/500, GPT 분석 중)를 보여주고, AbortController로 취소를 지원한다.
- **FR-9:** 모든 에러 시나리오(잘못된 URL, 댓글 비활성화, 잘못된 키, 할당량 초과, 네트워크 오류, OpenAI 에러)는 사용자 친화적 메시지로 표시한다.
- **FR-10:** 모바일·데스크톱 반응형으로 최소 360px 너비에서도 깨지지 않게 렌더링한다.

## 5. Non-Goals (Out of Scope)

- 회원가입·로그인·OAuth (BYOK 방식 유지)
- 백엔드 서버, 서버리스 함수, 데이터베이스
- 답글(replies) 분석 — 최상위 댓글만
- 분석 결과 영구 저장·기록·히스토리 (페이지 새로고침 시 초기화)
- CSV/PDF 내보내기 (향후 확장)
- 다국어 UI — 한국어 전용
- 워드클라우드, 토픽 모델링, 시계열 분석 (향후 확장)
- 다중 동영상 일괄 분석 (한 번에 한 동영상)
- 자동 번역 — 댓글 원문 그대로 GPT에 전달

## 6. Design Considerations

- **레이아웃:** 단일 페이지, 위에서 아래로: 헤더 → API 키 설정 패널(접힘 가능) → 모델 선택·URL 입력 → 분석 버튼 → 결과 대시보드
- **컬러:** 긍정 #22c55e (녹색), 중립 #94a3b8 (회색), 부정 #ef4444 (빨강), 배경 다크/라이트 자동(prefers-color-scheme)
- **타이포:** 시스템 폰트 스택 (`-apple-system, "Segoe UI", "Apple SD Gothic Neo", sans-serif`)
- **차트 라이브러리:** Chart.js v4 CDN (`<script src="https://cdn.jsdelivr.net/npm/chart.js@4">`)
- **아이콘:** 이모지 또는 inline SVG (외부 폰트 아이콘 사용 안 함)

## 7. Technical Considerations

- **GPT 프롬프트 전략:** 시스템 프롬프트에 JSON 스키마 명시 + few-shot 1개 + "댓글 원문 그대로 인용" 강제 지시. 댓글이 토큰 한도 초과 시 100개 단위로 청크 분석 후 sentiment 카운트 합산, strengths/improvements는 청크별 후보를 모아 다시 한 번 LLM 재선별 단계 수행.
- **CORS:** YouTube Data API와 OpenAI API 모두 CORS를 허용하므로 브라우저 직접 호출 가능.
- **Rate limiting:** OpenAI 429 에러 시 Exponential backoff 1회 재시도.
- **localStorage 키 네이밍:** `yca.ytKey`, `yca.openaiKey`, `yca.model` 접두사로 충돌 방지.
- **AbortController:** 모든 fetch에 동일 signal 연결, "취소" 버튼이 abort() 호출.
- **번들 크기:** 자체 코드는 단일 app.js (목표 < 30KB). Chart.js만 CDN 외부 의존.

## 8. Success Metrics

- 링크 입력부터 결과 화면 표시까지 평균 30초 이내 (500 댓글 + gpt-4o-mini 기준)
- 키 저장 후 재방문 시 100% 자동 복원
- 첫 방문 사용자가 README 없이도 키 발급·입력·분석 완료까지 도달 (UX 자명성)
- Lighthouse Performance 90+ (정적 자산만이므로 자연스럽게 달성 가능)
- 빌드·배포 단계가 "git push" 한 번으로 끝남

## 9. Open Questions

- 향후 확장: 답글 분석을 옵션으로 추가할지?
- 분석 결과를 URL 해시(#)에 인코딩해 공유 링크 기능을 넣을지?
- 라이브 동영상은 댓글이 동적으로 늘어나는데 정적 스냅샷만 보여주면 충분한지?
- 카테고리별 댓글(질문/감탄/비판/제안) 자동 분류를 추가하면 더 유용할지?
