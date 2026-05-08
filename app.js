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

    if (
      !ytInput ||
      !openaiInput ||
      !ytStatus ||
      !openaiStatus ||
      !saveBtn ||
      !clearBtn ||
      !startBtn ||
      !analysisHint ||
      !modelSelect
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

      const bothPresent = Boolean(ytKey) && Boolean(openaiKey);
      startBtn.disabled = !bothPresent;
      analysisHint.textContent = bothPresent
        ? '준비되었습니다. 분석할 동영상을 추가해 주세요. (다음 단계에서 URL 입력이 추가됩니다.)'
        : '두 개의 API 키를 모두 저장하면 분석을 시작할 수 있습니다.';
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

    refresh();
  });
})();
