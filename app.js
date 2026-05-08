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
        } else {
          setStatus(
            `${comments.length}개의 댓글을 수집했습니다. (GPT 분석은 다음 단계에서 추가됩니다.)`,
            'success'
          );
        }
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
