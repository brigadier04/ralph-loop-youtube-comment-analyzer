# YouTube Comment Analyzer

YouTube 동영상 링크를 입력하면 댓글 최대 500개를 수집하고, GPT 로 긍정/부정/중립 비율과 잘하는 점·개선점 댓글 5개씩을 추출해 보여주는 정적 SPA 입니다.

- 회원가입·서버·빌드 도구 없음
- 사용자 본인의 YouTube Data API 키 / OpenAI API 키를 브라우저 localStorage 에 저장 (BYOK)
- GitHub Pages 등 정적 호스팅에 그대로 배포 가능

> 본 README 는 향후 스토리(US-009)에서 사용법, API 키 발급 방법, 배포 가이드 등이 추가됩니다.

## 로컬 실행

이 프로젝트는 번들러나 npm install 이 필요 없습니다. `index.html` 을 브라우저에서 직접 열면 됩니다.

```bash
# 옵션 A: 그냥 더블클릭
open index.html  # macOS
start index.html # Windows

# 옵션 B: 간단한 정적 서버 (예: Python)
python -m http.server 8000
# → http://localhost:8000
```

## 라이선스

MIT (US-009 에서 LICENSE 파일 추가 예정)
