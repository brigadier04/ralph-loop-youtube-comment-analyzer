'use strict';

// YouTube Comment Analyzer
// Vanilla JS SPA. No bundler, no build step.
// Subsequent user stories (US-003+) extend this file.

(function init() {
  if (typeof document === 'undefined') {
    return;
  }

  const STORAGE_KEYS = Object.freeze({
    YT: 'yca.ytKey',
    OPENAI: 'yca.openaiKey',
    MODEL: 'yca.model',
  });

  const MODEL_OPTIONS = Object.freeze([
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
  ]);
  const DEFAULT_MODEL = 'gpt-4o-mini';

  function safeGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      /* localStorage unavailable; silently ignore */
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      /* localStorage unavailable; silently ignore */
    }
  }

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 6) return '•'.repeat(key.length);
    const tail = key.slice(-4);
    const head = key.slice(0, 3);
    return `${head}…${tail}`;
  }

  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

  const COMMENTS_API_URL =
    'https://www.googleapis.com/youtube/v3/commentThreads';
  const COMMENTS_PAGE_SIZE = 100;
  const COMMENTS_MAX_PAGES = 5;
  const COMMENTS_TARGET = COMMENTS_PAGE_SIZE * COMMENTS_MAX_PAGES;

  const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
  const OPENAI_CHUNK_SIZE = 100;
  const OPENAI_RATE_LIMIT_BACKOFF_MS = 2000;
  const OPENAI_REPRESENTATIVE_COUNT = 5;

  const ANALYSIS_SYSTEM_PROMPT =
    '당신은 YouTube 댓글을 분석하는 한국어 전문 분석가입니다.\n' +
    '사용자가 번호가 매겨진 댓글 목록을 보내면, 아래 JSON 스키마만 정확히 따르는 단일 JSON 객체를 반환하세요.\n' +
    '\n' +
    '{\n' +
    '  "sentiment": { "positive": <정수>, "neutral": <정수>, "negative": <정수> },\n' +
    '  "strengths":    [ { "comment": "<원문 그대로>", "reason": "<한국어 분석>" }, ... 정확히 5개 ],\n' +
    '  "improvements": [ { "comment": "<원문 그대로>", "reason": "<한국어 분석>" }, ... 정확히 5개 ]\n' +
    '}\n' +
    '\n' +
    '규칙 (반드시 지킬 것):\n' +
    '1. sentiment.positive + sentiment.neutral + sentiment.negative 의 합은 입력된 댓글의 총 개수와 정확히 일치해야 합니다.\n' +
    '2. strengths와 improvements의 "comment" 필드는 사용자가 보낸 댓글의 원문에서 그대로 발췌해야 합니다. 원문에 없는 문장을 새로 만들거나 의역하지 마세요. 환각(hallucination)은 절대 금지입니다.\n' +
    '3. "reason" 필드는 반드시 한국어로 작성하세요.\n' +
    '4. strengths는 동영상/콘텐츠가 잘하고 있는 점을 보여주는 대표 댓글, improvements는 개선이 필요한 점을 보여주는 대표 댓글입니다.\n' +
    '5. 댓글 수가 5개보다 적어도 가능한 만큼만 포함하되 댓글을 만들어내지 마세요. 그 경우 부족한 항목은 빈 배열 항목 없이 가능한 갯수만 반환합니다.\n' +
    '6. 출력은 위 스키마의 JSON 객체 하나만 반환하세요. 다른 텍스트, 설명, 코드 펜스는 포함하지 마세요.';

  const ANALYSIS_AGGREGATE_SYSTEM_PROMPT =
    '여러 청크에서 추출된 strengths/improvements 후보들이 입력으로 주어집니다.\n' +
    '이 후보 중에서 가장 대표적인 strengths 5개와 improvements 5개를 선정해, 아래 JSON 스키마만 정확히 따르는 단일 JSON 객체를 반환하세요.\n' +
    '\n' +
    '{\n' +
    '  "strengths":    [ { "comment": "<후보 원문 그대로>", "reason": "<한국어 분석>" }, ... 정확히 5개 ],\n' +
    '  "improvements": [ { "comment": "<후보 원문 그대로>", "reason": "<한국어 분석>" }, ... 정확히 5개 ]\n' +
    '}\n' +
    '\n' +
    '규칙:\n' +
    '1. "comment"는 후보에 존재하는 원문을 그대로 사용하세요. 새로 만들거나 수정하지 마세요. 환각 금지.\n' +
    '2. "reason"은 한국어로 작성하세요.\n' +
    '3. 출력은 위 스키마의 JSON 객체 하나만, 다른 텍스트 없이 반환하세요.';

  function buildAnalysisUserPrompt(comments) {
    const lines = comments.map(function (c, i) {
      const safe = String((c && c.text) || '').replace(/\s+/g, ' ').trim();
      const clipped = safe.length > 1000 ? safe.slice(0, 1000) + '…' : safe;
      return '[' + (i + 1) + '] ' + clipped;
    });
    return (
      '다음은 분석할 YouTube 댓글 ' +
      comments.length +
      '개입니다. 각 줄은 [번호] 댓글원문 형식입니다.\n\n' +
      lines.join('\n')
    );
  }

  function buildAggregateUserPrompt(strengthCandidates, improvementCandidates) {
    return (
      '다음은 여러 청크에서 분석된 strengths / improvements 후보입니다.\n' +
      '이 중에서 가장 대표적이고 중복되지 않는 strengths 5개, improvements 5개를 골라 JSON 으로 반환하세요.\n\n' +
      '[strengths 후보]\n' +
      JSON.stringify(strengthCandidates, null, 2) +
      '\n\n[improvements 후보]\n' +
      JSON.stringify(improvementCandidates, null, 2)
    );
  }

  function classifyOpenAIError(status, body) {
    const msg =
      (body && body.error && typeof body.error.message === 'string'
        ? body.error.message
        : '') || '';
    if (status === 401) {
      return makeError(
        'openaiKeyInvalid',
        'OpenAI API 키가 유효하지 않습니다. 키를 다시 확인해 주세요.'
      );
    }
    if (status === 429) {
      return makeError(
        'rateLimit',
        'OpenAI 요청 한도(rate limit)에 도달했습니다. 잠시 후 다시 시도해 주세요.'
      );
    }
    if (status >= 500) {
      return makeError(
        'openaiServer',
        'OpenAI 서버 오류 (HTTP ' + status + '). 잠시 후 다시 시도해 주세요.'
      );
    }
    return makeError(
      'openaiError',
      'OpenAI API 오류 (HTTP ' + status + ')' + (msg ? ': ' + msg : '.')
    );
  }

  async function callOpenAI(params) {
    const requestBody = {
      model: params.model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    };

    let response;
    try {
      response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + params.apiKey,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (_) {
      throw makeError(
        'network',
        '네트워크 오류가 발생했습니다. 연결을 확인하고 다시 시도해 주세요.'
      );
    }

    let parsed = null;
    try {
      parsed = await response.json();
    } catch (_) {
      parsed = null;
    }

    if (!response.ok) {
      throw classifyOpenAIError(response.status, parsed);
    }

    const content =
      parsed &&
      parsed.choices &&
      parsed.choices[0] &&
      parsed.choices[0].message &&
      parsed.choices[0].message.content;
    if (typeof content !== 'string') {
      throw makeError(
        'openaiError',
        'OpenAI 응답을 해석할 수 없습니다.'
      );
    }

    let json;
    try {
      json = JSON.parse(content);
    } catch (_) {
      throw makeError(
        'openaiError',
        'OpenAI 응답이 JSON 형식이 아닙니다.'
      );
    }
    return json;
  }

  async function callOpenAIWithRetry(params) {
    try {
      return await callOpenAI(params);
    } catch (err) {
      if (err && err.code === 'rateLimit') {
        await new Promise(function (resolve) {
          setTimeout(resolve, OPENAI_RATE_LIMIT_BACKOFF_MS);
        });
        return await callOpenAI(params);
      }
      throw err;
    }
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  function normalizeRepresentativeList(list) {
    if (!Array.isArray(list)) return [];
    return list
      .slice(0, OPENAI_REPRESENTATIVE_COUNT)
      .map(function (item) {
        return {
          comment:
            item && typeof item.comment === 'string' ? item.comment : '',
          reason:
            item && typeof item.reason === 'string' ? item.reason : '',
        };
      })
      .filter(function (item) {
        return item.comment.length > 0;
      });
  }

  function normalizeAnalysisResult(raw, expectedCount) {
    const rawSent = raw && raw.sentiment;
    const positiveRaw =
      rawSent && typeof rawSent.positive === 'number' ? rawSent.positive : 0;
    const neutralRaw =
      rawSent && typeof rawSent.neutral === 'number' ? rawSent.neutral : 0;
    const negativeRaw =
      rawSent && typeof rawSent.negative === 'number' ? rawSent.negative : 0;

    let positive = Math.max(0, Math.floor(positiveRaw));
    let neutral = Math.max(0, Math.floor(neutralRaw));
    let negative = Math.max(0, Math.floor(negativeRaw));
    const sum = positive + neutral + negative;

    // PRD requires sentiment sum === analyzedCount. Renormalize if the LLM is off.
    if (sum !== expectedCount && sum > 0) {
      const ratio = expectedCount / sum;
      positive = Math.round(positive * ratio);
      neutral = Math.round(neutral * ratio);
      negative = expectedCount - positive - neutral;
      if (negative < 0) {
        negative = 0;
        const drift = expectedCount - (positive + neutral);
        if (drift > 0) neutral += drift;
        else if (drift < 0) positive = Math.max(0, positive + drift);
      }
    } else if (sum === 0) {
      neutral = expectedCount;
    }

    return {
      sentiment: { positive: positive, neutral: neutral, negative: negative },
      strengths: normalizeRepresentativeList(raw && raw.strengths),
      improvements: normalizeRepresentativeList(raw && raw.improvements),
      analyzedCount: expectedCount,
    };
  }

  async function analyzeComments(params) {
    const comments = params.comments;
    const apiKey = params.apiKey;
    const model = params.model;
    const onPhase =
      typeof params.onPhase === 'function' ? params.onPhase : function () {};

    if (!Array.isArray(comments) || comments.length === 0) {
      throw makeError('noComments', '분석할 댓글이 없습니다.');
    }
    if (!apiKey) {
      throw makeError('missingKey', 'OpenAI API 키가 없습니다.');
    }

    const chunks = chunkArray(comments, OPENAI_CHUNK_SIZE);

    if (chunks.length === 1) {
      onPhase({ step: 1, total: 1 });
      const raw = await callOpenAIWithRetry({
        apiKey: apiKey,
        model: model,
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        userPrompt: buildAnalysisUserPrompt(comments),
      });
      return normalizeAnalysisResult(raw, comments.length);
    }

    const totalSteps = chunks.length + 1;
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    const strengthCandidates = [];
    const improvementCandidates = [];

    for (let i = 0; i < chunks.length; i += 1) {
      onPhase({ step: i + 1, total: totalSteps });
      const raw = await callOpenAIWithRetry({
        apiKey: apiKey,
        model: model,
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        userPrompt: buildAnalysisUserPrompt(chunks[i]),
      });
      const norm = normalizeAnalysisResult(raw, chunks[i].length);
      positive += norm.sentiment.positive;
      neutral += norm.sentiment.neutral;
      negative += norm.sentiment.negative;
      for (const s of norm.strengths) strengthCandidates.push(s);
      for (const m of norm.improvements) improvementCandidates.push(m);
    }

    onPhase({ step: totalSteps, total: totalSteps });
    const aggRaw = await callOpenAIWithRetry({
      apiKey: apiKey,
      model: model,
      systemPrompt: ANALYSIS_AGGREGATE_SYSTEM_PROMPT,
      userPrompt: buildAggregateUserPrompt(
        strengthCandidates,
        improvementCandidates
      ),
    });
    const aggStrengths = normalizeRepresentativeList(aggRaw && aggRaw.strengths);
    const aggImprovements = normalizeRepresentativeList(
      aggRaw && aggRaw.improvements
    );

    return {
      sentiment: { positive: positive, neutral: neutral, negative: negative },
      strengths:
        aggStrengths.length > 0
          ? aggStrengths
          : strengthCandidates.slice(0, OPENAI_REPRESENTATIVE_COUNT),
      improvements:
        aggImprovements.length > 0
          ? aggImprovements
          : improvementCandidates.slice(0, OPENAI_REPRESENTATIVE_COUNT),
      analyzedCount: comments.length,
    };
  }

  function makeError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  function classifyYouTubeError(status, body) {
    const reason =
      (body &&
        body.error &&
        Array.isArray(body.error.errors) &&
        body.error.errors[0] &&
        body.error.errors[0].reason) ||
      '';

    if (status === 403 && reason === 'commentsDisabled') {
      return makeError(
        'commentsDisabled',
        '이 동영상은 댓글이 비활성화되어 있습니다.'
      );
    }
    if (status === 403 && reason === 'quotaExceeded') {
      return makeError(
        'quotaExceeded',
        'YouTube API 일일 할당량을 초과했습니다. 내일 다시 시도하거나 다른 키를 사용해 주세요.'
      );
    }
    if (status === 400 && reason === 'keyInvalid') {
      return makeError(
        'invalidKey',
        'YouTube API 키가 유효하지 않습니다. 키를 다시 확인해 주세요.'
      );
    }
    if (status === 403) {
      return makeError(
        'invalidKey',
        'YouTube API 키가 유효하지 않거나 권한이 없습니다.'
      );
    }
    if (status === 404 || reason === 'videoNotFound') {
      return makeError(
        'videoNotFound',
        '동영상을 찾을 수 없습니다. URL을 다시 확인해 주세요.'
      );
    }
    return makeError(
      'apiError',
      `YouTube API 오류가 발생했습니다 (HTTP ${status}).`
    );
  }

  async function fetchCommentsPage(videoId, apiKey, pageToken) {
    const url = new URL(COMMENTS_API_URL);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('videoId', videoId);
    url.searchParams.set('maxResults', String(COMMENTS_PAGE_SIZE));
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('key', apiKey);
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    let response;
    try {
      response = await fetch(url.toString());
    } catch (_) {
      throw makeError(
        'network',
        '네트워크 오류가 발생했습니다. 연결을 확인하고 다시 시도해 주세요.'
      );
    }

    let body = null;
    try {
      body = await response.json();
    } catch (_) {
      body = null;
    }

    if (!response.ok) {
      throw classifyYouTubeError(response.status, body);
    }

    return body || {};
  }

  function normalizeCommentItem(item) {
    const snippet =
      item &&
      item.snippet &&
      item.snippet.topLevelComment &&
      item.snippet.topLevelComment.snippet;
    if (!snippet) return null;
    return {
      author:
        typeof snippet.authorDisplayName === 'string'
          ? snippet.authorDisplayName
          : '',
      text:
        typeof snippet.textOriginal === 'string'
          ? snippet.textOriginal
          : typeof snippet.textDisplay === 'string'
          ? snippet.textDisplay
          : '',
      likeCount:
        typeof snippet.likeCount === 'number' ? snippet.likeCount : 0,
      publishedAt:
        typeof snippet.publishedAt === 'string' ? snippet.publishedAt : '',
    };
  }

  async function collectComments(videoId, apiKey, options) {
    const opts = options || {};
    const onProgress =
      typeof opts.onProgress === 'function' ? opts.onProgress : function () {};

    if (!VIDEO_ID_PATTERN.test(String(videoId || ''))) {
      throw makeError('invalidVideoId', '유효하지 않은 동영상 ID 입니다.');
    }
    if (!apiKey) {
      throw makeError('missingKey', 'YouTube API 키가 없습니다.');
    }

    const collected = [];
    let pageToken = '';

    onProgress({ collected: 0, target: COMMENTS_TARGET, page: 0 });

    for (let page = 0; page < COMMENTS_MAX_PAGES; page += 1) {
      const data = await fetchCommentsPage(videoId, apiKey, pageToken);
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const normalized = normalizeCommentItem(item);
        if (normalized) {
          collected.push(normalized);
        }
      }

      onProgress({
        collected: collected.length,
        target: COMMENTS_TARGET,
        page: page + 1,
      });

      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      if (!pageToken) break;
    }

    return collected;
  }

  function extractVideoId(rawUrl) {
    if (!rawUrl) return null;
    const trimmed = String(rawUrl).trim();
    if (!trimmed) return null;

    if (VIDEO_ID_PATTERN.test(trimmed)) {
      return trimmed;
    }

    let withScheme = trimmed;
    if (!/^https?:\/\//i.test(withScheme)) {
      withScheme = 'https://' + withScheme.replace(/^\/+/, '');
    }

    let parsed;
    try {
      parsed = new URL(withScheme);
    } catch (_) {
      return null;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    const isYouTubeHost =
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com';

    if (!isYouTubeHost) return null;

    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v') || '';
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    const segMatch = parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (segMatch) {
      const id = segMatch[1];
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    return null;
  }

  document.addEventListener('DOMContentLoaded', function onReady() {
    const ytInput = document.getElementById('ytKeyInput');
    const openaiInput = document.getElementById('openaiKeyInput');
    const ytStatus = document.getElementById('ytKeyStatus');
    const openaiStatus = document.getElementById('openaiKeyStatus');
    const saveBtn = document.getElementById('saveKeysBtn');
    const clearBtn = document.getElementById('clearKeysBtn');
    const startBtn = document.getElementById('startAnalysisBtn');
    const analysisHint = document.getElementById('analysisHint');
    const modelSelect = document.getElementById('modelSelect');
    const videoUrlInput = document.getElementById('videoUrlInput');
    const videoUrlError = document.getElementById('videoUrlError');
    const analysisStatus = document.getElementById('analysisStatus');

    if (
      !ytInput ||
      !openaiInput ||
      !ytStatus ||
      !openaiStatus ||
      !saveBtn ||
      !clearBtn ||
      !startBtn ||
      !analysisHint ||
      !modelSelect ||
      !videoUrlInput ||
      !videoUrlError ||
      !analysisStatus
    ) {
      return;
    }

    let inFlight = false;

    const savedModel = safeGet(STORAGE_KEYS.MODEL);
    modelSelect.value = MODEL_OPTIONS.includes(savedModel)
      ? savedModel
      : DEFAULT_MODEL;
    if (!savedModel) {
      safeSet(STORAGE_KEYS.MODEL, modelSelect.value);
    }

    modelSelect.addEventListener('change', function onModelChange() {
      const next = MODEL_OPTIONS.includes(modelSelect.value)
        ? modelSelect.value
        : DEFAULT_MODEL;
      modelSelect.value = next;
      safeSet(STORAGE_KEYS.MODEL, next);
    });

    function renderStatus(el, key) {
      if (key) {
        el.textContent = `저장됨: ${maskKey(key)}`;
        el.classList.add('saved');
      } else {
        el.textContent = '저장된 키가 없습니다.';
        el.classList.remove('saved');
      }
    }

    function refresh() {
      const ytKey = safeGet(STORAGE_KEYS.YT);
      const openaiKey = safeGet(STORAGE_KEYS.OPENAI);

      renderStatus(ytStatus, ytKey);
      renderStatus(openaiStatus, openaiKey);

      const rawUrl = videoUrlInput.value.trim();
      const videoId = extractVideoId(rawUrl);
      const urlIsEmpty = rawUrl.length === 0;
      const urlIsInvalid = !urlIsEmpty && !videoId;

      if (urlIsInvalid) {
        videoUrlError.textContent =
          '유효한 YouTube URL이 아닙니다. (예: https://www.youtube.com/watch?v=...)';
        videoUrlError.hidden = false;
        videoUrlInput.classList.add('invalid');
        videoUrlInput.setAttribute('aria-invalid', 'true');
      } else {
        videoUrlError.textContent = '';
        videoUrlError.hidden = true;
        videoUrlInput.classList.remove('invalid');
        videoUrlInput.removeAttribute('aria-invalid');
      }

      const keysPresent = Boolean(ytKey) && Boolean(openaiKey);
      startBtn.disabled = !(keysPresent && Boolean(videoId)) || inFlight;

      if (inFlight) {
        analysisHint.textContent = '분석 중입니다…';
      } else if (!keysPresent) {
        analysisHint.textContent =
          '두 개의 API 키를 모두 저장하면 분석을 시작할 수 있습니다.';
      } else if (urlIsEmpty) {
        analysisHint.textContent =
          '분석할 YouTube 동영상 URL을 입력하세요.';
      } else if (videoId) {
        analysisHint.textContent =
          '준비되었습니다. \'분석 시작\' 버튼을 눌러 진행하세요.';
      } else {
        analysisHint.textContent =
          'URL을 다시 확인해 주세요.';
      }
    }

    function setStatus(message, kind) {
      analysisStatus.textContent = message || '';
      analysisStatus.classList.remove('error', 'success');
      if (kind === 'error' || kind === 'success') {
        analysisStatus.classList.add(kind);
      }
    }

    async function runAnalysis() {
      if (inFlight) return;
      const ytKey = safeGet(STORAGE_KEYS.YT);
      const openaiKey = safeGet(STORAGE_KEYS.OPENAI);
      const videoId = extractVideoId(videoUrlInput.value.trim());
      if (!ytKey || !openaiKey || !videoId) {
        return;
      }

      inFlight = true;
      refresh();
      setStatus(`댓글 수집 중… 0/${COMMENTS_TARGET}`, null);

      try {
        const comments = await collectComments(videoId, ytKey, {
          onProgress(progress) {
            setStatus(
              `댓글 수집 중… ${progress.collected}/${COMMENTS_TARGET}`,
              null
            );
          },
        });

        if (comments.length === 0) {
          setStatus('이 동영상에는 분석할 댓글이 없습니다.', 'error');
          return;
        }

        const model = MODEL_OPTIONS.includes(modelSelect.value)
          ? modelSelect.value
          : DEFAULT_MODEL;

        setStatus(
          `GPT 분석 중… (${comments.length}개 댓글, 모델: ${model})`,
          null
        );

        const analysis = await analyzeComments({
          comments,
          apiKey: openaiKey,
          model,
          onPhase({ step, total }) {
            const label =
              total > 1
                ? `GPT 분석 중… (${step}/${total} · 모델: ${model})`
                : `GPT 분석 중… (모델: ${model})`;
            setStatus(label, null);
          },
        });

        const s = analysis.sentiment;
        setStatus(
          `분석 완료 — 긍정 ${s.positive} · 중립 ${s.neutral} · 부정 ${s.negative}` +
            ` (총 ${analysis.analyzedCount}개). 결과 대시보드는 다음 단계에서 추가됩니다.`,
          'success'
        );
      } catch (err) {
        const message =
          (err && err.message) ||
          '댓글 수집 중 알 수 없는 오류가 발생했습니다.';
        setStatus(message, 'error');
      } finally {
        inFlight = false;
        refresh();
      }
    }

    saveBtn.addEventListener('click', function onSave() {
      const ytValue = ytInput.value.trim();
      const openaiValue = openaiInput.value.trim();

      if (ytValue) {
        safeSet(STORAGE_KEYS.YT, ytValue);
      }
      if (openaiValue) {
        safeSet(STORAGE_KEYS.OPENAI, openaiValue);
      }

      ytInput.value = '';
      openaiInput.value = '';
      refresh();
    });

    clearBtn.addEventListener('click', function onClear() {
      safeRemove(STORAGE_KEYS.YT);
      safeRemove(STORAGE_KEYS.OPENAI);
      ytInput.value = '';
      openaiInput.value = '';
      refresh();
    });

    videoUrlInput.addEventListener('input', function onUrlInput() {
      if (analysisStatus.textContent) {
        setStatus('', null);
      }
      refresh();
    });

    startBtn.addEventListener('click', runAnalysis);

    refresh();
  });
})();
