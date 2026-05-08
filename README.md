# YouTube Comment Analyzer

YouTube 동영상 링크를 입력하면 댓글 최대 500개를 수집하고, Google Gemini 로 긍정/부정/중립 비율과 잘하는 점·개선점 댓글 5개씩을 추출해 보여주는 정적 SPA 입니다.

- 회원가입·서버·빌드 도구 없음
- 사용자 본인의 YouTube Data API 키 / Google Gemini API 키를 브라우저 localStorage 에 저장 (BYOK)
- GitHub Pages 등 정적 호스팅에 그대로 배포 가능

## 목차

- [소개](#소개)
- [사용법](#사용법)
- [YouTube Data API 키 발급 방법](#youtube-data-api-키-발급-방법)
- [Google Gemini API 키 발급 방법](#google-gemini-api-키-발급-방법)
- [로컬 실행](#로컬-실행)
- [GitHub Pages 배포](#github-pages-배포)
- [라이선스](#라이선스)

## 소개

이 프로젝트는 다음 흐름으로 동작합니다.

1. 사용자가 YouTube 동영상 URL 을 붙여넣고 "분석 시작" 을 누릅니다.
2. 브라우저에서 직접 YouTube Data API (`commentThreads.list`) 를 호출해 최상위 댓글을 최대 500개(=100개 × 5페이지) 수집합니다.
3. 수집한 댓글을 Google Gemini API (`generateContent`, JSON mode) 로 보내 sentiment(긍정/중립/부정) 카운트와 강점·개선점 대표 댓글 5개씩을 JSON 으로 받습니다.
4. Chart.js 도넛 차트와 카드 UI 로 결과를 렌더링합니다.

**중요:** 모든 API 호출은 사용자의 브라우저에서 직접 수행되며, 입력한 키는 외부 서버로 전송되지 않습니다. 키는 브라우저 `localStorage` 에만 저장됩니다.

> **왜 OpenAI 대신 Gemini 인가요?** OpenAI API 는 브라우저에서 직접 호출할 수 없도록 CORS 가 막혀 있습니다 (서버 우회 필요). Google Gemini API 는 CORS 를 허용하므로 정적 SPA 에서 별도 서버 없이 BYOK 방식으로 사용할 수 있습니다.

## 사용법

1. [GitHub Pages 배포](#github-pages-배포) 또는 [로컬 실행](#로컬-실행) 으로 페이지를 엽니다.
2. **YouTube Data API 키** 와 **Gemini API 키** 를 각각 입력 후 "저장" 을 누릅니다. 키는 브라우저 `localStorage` (`yca.ytKey`, `yca.geminiKey`) 에 저장됩니다.
3. 사용할 Gemini 모델을 선택합니다 (기본값: `gemini-2.0-flash`).
4. 분석할 YouTube 동영상 URL 을 입력합니다. 다음 형식을 모두 지원합니다.
   - `https://www.youtube.com/watch?v=...`
   - `https://youtu.be/...`
   - `https://www.youtube.com/shorts/...`
   - `https://www.youtube.com/embed/...`
5. "분석 시작" 을 누릅니다. 진행 상태가 텍스트로 표시되며, 진행 중에는 "취소" 버튼으로 즉시 중단할 수 있습니다.
6. 분석이 끝나면 동영상 썸네일·제목·채널명, 도넛 차트, 강점/개선점 카드가 표시됩니다.
7. "키 삭제" 버튼으로 저장된 키를 즉시 제거할 수 있습니다.

## YouTube Data API 키 발급 방법

YouTube 댓글 수집을 위해 YouTube Data API v3 키가 필요합니다. 무료 할당량(일 10,000 units)으로 충분히 사용 가능합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) 에 로그인합니다.
2. 상단 프로젝트 선택 → **새 프로젝트** 를 만들거나 기존 프로젝트를 선택합니다.
3. 좌측 메뉴 → **API 및 서비스** → **라이브러리** 로 이동합니다.
4. "YouTube Data API v3" 를 검색해 선택 후 **사용 설정** 을 누릅니다.
5. 좌측 메뉴 → **API 및 서비스** → **사용자 인증 정보** 로 이동합니다.
6. 상단 **+ 사용자 인증 정보 만들기** → **API 키** 를 선택합니다.
7. 생성된 API 키를 복사해 이 앱의 "YouTube Data API 키" 입력란에 붙여넣고 "저장" 을 누릅니다.
8. (선택) 보안을 위해 키 제한에서 "API 제한사항" → **YouTube Data API v3** 만 허용하도록 설정하는 것을 권장합니다.

**참고:** `commentThreads.list` 호출 1회 = 1 unit 이며, 본 앱은 동영상 1개당 최대 5회 호출합니다 (= 5 units). `videos.list` 도 1회 추가 호출됩니다 (= 1 unit). 하루 1,500회 이상 분석해도 무료 할당량 내에 들어옵니다.

> **HTTP referrer 제한 주의:** 키를 발급할 때 "애플리케이션 제한사항" 에서 HTTP referrer 를 설정한다면, GitHub Pages 도메인 (`https://<username>.github.io/*`) 을 반드시 허용 목록에 추가해야 합니다. 그렇지 않으면 브라우저에서 "네트워크 오류" 로 표시됩니다.

## Google Gemini API 키 발급 방법

Gemini 분석을 위해 Google AI Studio 에서 API 키를 발급받아야 합니다. **무료 등급(Free tier)이 제공되며 신용카드 등록이 필요 없습니다.**

1. [Google AI Studio](https://aistudio.google.com/) 에 Google 계정으로 로그인합니다.
2. 좌측 또는 상단 메뉴에서 [**Get API key**](https://aistudio.google.com/app/apikey) 를 클릭합니다.
3. **+ Create API key** 버튼을 누르고, 새 Google Cloud 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
4. 생성된 키 (`AIza...`) 를 복사합니다. 키는 발급 후 다시 볼 수 있지만, 가능하면 안전한 곳에 별도로 저장하세요.
5. 복사한 키를 이 앱의 "Gemini API 키" 입력란에 붙여넣고 "저장" 을 누릅니다.

### 비용 안내 (gemini-2.0-flash 기준)

본 앱은 기본 모델로 **`gemini-2.0-flash`** 를 사용하도록 설정되어 있습니다. 정확한 무료/유료 한도는 [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) 와 [Pricing](https://ai.google.dev/pricing) 페이지에서 확인하세요.

| 모델 | 무료 등급(분/일) 대략 | 분석 1회 부하 | 비고 |
| --- | --- | --- | --- |
| `gemini-2.0-flash` | 일일 ~1,500 회 (RPM 15) | 댓글 100개 단위 청크 + 집계 1회 | 기본값. 일반적인 분석에 충분 |
| `gemini-2.5-flash` | 일일 ~250 회 | 동일 | 최신, 약간 더 정확 |
| `gemini-1.5-pro` | 일일 ~50 회 | 동일 | 가장 고품질, 무료 할당량 가장 적음 |

- 댓글 한 개당 최대 1,000자로 자르고, 100개 단위로 청크 분할 후 청크별 분석 + 1회 집계 호출(총 N+1회) 합니다.
- 무료 등급은 시간에 따라 변경될 수 있으니 사용 전 [Google AI Studio](https://aistudio.google.com/) 에서 본인 계정의 한도를 확인하세요.
- 유료 결제가 활성화된 프로젝트는 사용량에 따른 과금이 적용됩니다 (Free tier 한도 초과분에 대해).

### 키 보관 주의

- 키는 브라우저 `localStorage` 에만 저장되며 외부로 전송되지 않습니다.
- 다만 **공용 PC 에서는 분석 후 반드시 "키 삭제" 버튼을 눌러주세요.** localStorage 는 브라우저 종료 후에도 유지됩니다.
- 키가 노출됐다고 의심되면 즉시 [Google AI Studio](https://aistudio.google.com/app/apikey) 또는 Google Cloud Console 에서 해당 키를 폐기(revoke) 하고 새 키를 발급받으세요.

## 로컬 실행

번들러나 `npm install` 이 필요 없습니다. `index.html` 을 브라우저에서 직접 열면 됩니다.

```bash
# 옵션 A: 파일을 직접 열기
open index.html      # macOS
start index.html     # Windows
xdg-open index.html  # Linux

# 옵션 B: 간단한 정적 서버 (Python 3 필요)
python -m http.server 8000
# → http://localhost:8000

# 옵션 C: Node.js 가 있다면
npx --yes serve .
# → http://localhost:3000
```

> 일부 브라우저는 `file://` 프로토콜에서 CORS / fetch 정책이 다르게 동작할 수 있습니다. 동작이 이상하면 옵션 B 또는 C 의 정적 서버 방식을 사용하세요.

### 코드 점검

빌드 도구는 없지만, 커밋 전 `app.js` 문법 점검은 다음 명령으로 가능합니다.

```bash
node --check app.js
```

## GitHub Pages 배포

이 저장소를 본인 계정으로 fork 하거나 새 저장소로 push 한 뒤 두 가지 방식 중 하나로 배포할 수 있습니다.

### 방식 1: GitHub Actions 워크플로 (권장)

본 저장소에는 `.github/workflows/pages.yml` 워크플로가 포함되어 있습니다. `main` 브랜치에 push 하면 자동으로 GitHub Pages 에 배포됩니다.

1. 저장소를 본인 계정으로 fork (또는 push) 합니다.
2. 저장소 페이지 → **Settings** → **Pages** 로 이동합니다.
3. **Build and deployment** → **Source** 에서 **GitHub Actions** 를 선택합니다.
4. `main` 브랜치에 push 하거나 **Actions** 탭에서 "Deploy to GitHub Pages" 워크플로를 수동 실행 (`workflow_dispatch`) 합니다.
5. 배포가 완료되면 `https://<username>.github.io/<repo-name>/` 에서 접속할 수 있습니다.

### 방식 2: 수동 (Deploy from a branch)

GitHub Actions 를 사용하지 않고 브랜치에서 직접 서빙하는 방식입니다.

1. 저장소 페이지 → **Settings** → **Pages** 로 이동합니다.
2. **Build and deployment** → **Source** 에서 **Deploy from a branch** 를 선택합니다.
3. **Branch** → **main** / **/ (root)** 을 선택하고 **Save** 를 누릅니다.
4. 1~2 분 후 `https://<username>.github.io/<repo-name>/` 에서 접속할 수 있습니다.

> **주의:** Pages 로 배포된 정적 사이트는 누구나 접근할 수 있지만, 분석 시 사용되는 API 키는 **방문자 본인의 브라우저** 에 저장됩니다. 배포자가 키를 가져갈 수는 없습니다 (BYOK 구조).

## 라이선스

[MIT License](./LICENSE) — 자유롭게 사용/수정/재배포 가능합니다.
