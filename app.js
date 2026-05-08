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
      !videoUrlError
    ) {
      return;
    }

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
      startBtn.disabled = !(keysPresent && Boolean(videoId));

      if (!keysPresent) {
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

    videoUrlInput.addEventListener('input', refresh);

    refresh();
  });
})();
