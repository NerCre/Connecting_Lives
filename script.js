/* =========================================================
   命をツナグ - Vanilla JS single-page app (offline)
   - 状況 → 所属 → 対象者 → (部位) → 判断結果 → メール作成
   - マスタは localStorage に保存（パスワード付 管理画面で変更）
   ========================================================= */

(() => {
  'use strict';

  const STORAGE_KEY = 'inochi_master_v1';
  const SESSION_KEY = 'inochi_session_v1';

  /** =========================
   *  Utilities
   *  ========================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function nowIsoLocal() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  function uuid() {
    return 'id-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
  }

  function normalizeEmails(str) {
    return String(str || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function kanaGroupFromKana(kana) {
    // Expect hiragana/katakana reading; group by first char.
    const s = (kana || '').trim();
    if (!s) return '他';

    const ch = s[0];
    const hira = toHiragana(ch);

    const groups = [
      { label: 'あ', chars: 'あいうえお' },
      { label: 'か', chars: 'かきくけこがぎぐげご' },
      { label: 'さ', chars: 'さしすせそざじずぜぞ' },
      { label: 'た', chars: 'たちつてとだぢづでど' },
      { label: 'な', chars: 'なにぬねの' },
      { label: 'は', chars: 'はひふへほばびぶべぼぱぴぷぺぽ' },
      { label: 'ま', chars: 'まみむめも' },
      { label: 'や', chars: 'やゆよ' },
      { label: 'ら', chars: 'らりるれろ' },
      { label: 'わ', chars: 'わをん' },
    ];

    for (const g of groups) {
      if (g.chars.includes(hira)) return g.label;
    }
    return '他';
  }

  function toHiragana(ch) {
    // Convert katakana to hiragana (single char)
    const code = ch.charCodeAt(0);
    // Katakana range
    if (code >= 0x30a1 && code <= 0x30f6) {
      return String.fromCharCode(code - 0x60);
    }
    return ch;
  }

  function mailtoLink(to, subject, body) {
    const list = (to || []).filter(Boolean).join(',');
    const qs = new URLSearchParams();
    qs.set('subject', subject || '');
    qs.set('body', body || '');
    // Some mail clients don't like '+' encoding; use encodeURIComponent via URLSearchParams is ok.
    return `mailto:${list}?${qs.toString()}`;
  }

  async function sha256Hex(text) {
    const enc = new TextEncoder();
    const buf = enc.encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** =========================
   *  Master data (defaults)
   *  ========================= */
  function defaultMaster() {
    return {
      version: 1,
      admin: {
        passwordHash: '', // SHA-256 hex
      },
      globalContacts: {
        safetyHQ: 'safety@example.com',
        rescueTeam: 'rescue@example.com',
        ambulanceCenter: 'dispatch@example.com',
      },
      // 送信先範囲（マスタでON/OFF）
      sendScope: {
        safetyHQ: true,
        rescueTeam: false,
        ambulanceCenter: false,
        companyEmails: true,
      },
      companies: [
        { id: 'own', name: '自社', emails: ['aa@example.com', 'bb@example.com'] },
        { id: 'a', name: 'A造船', emails: ['cc@example.com', 'dd@example.com'] },
        { id: 'b', name: 'B株式会社', emails: ['ee@example.com'] },
      ],
      locations: [
        { id: uuid(), name: '北定盤2', qr: '' },
        { id: uuid(), name: 'ピース切断場', qr: '' },
        { id: uuid(), name: '道具置場', qr: '' },
        { id: uuid(), name: '施設作業場', qr: '' },
        { id: uuid(), name: '旧ガスセンター工場', qr: '' },
        { id: uuid(), name: 'B棟', qr: '' },
        { id: uuid(), name: '北定盤1', qr: '' },
        { id: uuid(), name: 'A棟', qr: '' },
        { id: uuid(), name: 'DOCK', qr: '' },
        { id: uuid(), name: '建造船', qr: '' },
        { id: uuid(), name: 'SUB定盤', qr: '' },
        { id: uuid(), name: 'SUB工場', qr: '' },
        { id: uuid(), name: '事務所', qr: '' },
        { id: uuid(), name: '食堂・協力業者ハウス', qr: '' },
        { id: uuid(), name: 'ブロック置場', qr: '' },
        { id: uuid(), name: '鋼材・SUB材置場', qr: '' },
        { id: uuid(), name: '曲げ定盤', qr: '' },
        { id: uuid(), name: 'パイプ置場', qr: '' },
        { id: uuid(), name: '艤装岸壁', qr: '' },
        { id: uuid(), name: '南定盤1', qr: '' },
        { id: uuid(), name: '70t JC', qr: '' },
        { id: uuid(), name: 'C棟', qr: '' },
        { id: uuid(), name: '艤装品置場', qr: '' },
        { id: uuid(), name: 'スクラップ場', qr: '' },
        { id: uuid(), name: '南定盤2', qr: '' },
        { id: uuid(), name: '南定盤3', qr: '' },
        { id: uuid(), name: '加工場', qr: '' },
        { id: uuid(), name: 'パイプ工場', qr: '' },
        { id: uuid(), name: '電気室・コンプレッサー室', qr: '' },
      ],
      staff: [
        // NOTE: kana is the reading used for sorting buttons
        { id: uuid(), companyId: 'own', name: '佐藤 一郎', kana: 'さとういちろう', qr: '' },
        { id: uuid(), companyId: 'own', name: '高橋 花子', kana: 'たかはしはなこ', qr: '' },
        { id: uuid(), companyId: 'a', name: '山田 太郎', kana: 'やまだたろう', qr: '' },
        { id: uuid(), companyId: 'a', name: '伊藤 次郎', kana: 'いとうじろう', qr: '' },
        { id: uuid(), companyId: 'b', name: '鈴木 三郎', kana: 'すずきさぶろう', qr: '' },
      ],
      situations: [
        {
          id: 'unconscious',
          label: '意識なし',
          hint: '',
          icon: '🧠',
          requiresBody: false,
          defaultAction: 'emergency',
          includeEmergency: ['safetyHQ', 'rescueTeam', 'ambulanceCenter'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '反応がない場合は呼吸や脈を確認し、すぐに救急車（119）を呼んでください。可能なら心肺蘇生（CPR）を開始します。',
          recommendTextObserve:
            '反応がない場合は緊急性が高い可能性があります。ためらわず緊急要請を選択してください。',
          subjectTpl: '[命をツナグ] {company} {person} - 意識なし',
          bodyTplEmergency:
            '{person}さん、「意識なし」、緊急救護必要、担架要請\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「意識なし」疑い、至急確認をお願いします\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'bleeding_major',
          label: '大量出血',
          hint: '',
          icon: '🩸',
          requiresBody: true,
          defaultAction: 'emergency',
          includeEmergency: ['safetyHQ', 'rescueTeam', 'ambulanceCenter'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '出血部位を圧迫して止血し、可能なら患部を心臓より高く保ちます。迷わず救急車（119）を呼んでください。',
          recommendTextObserve:
            '出血が続く・多い場合は緊急要請が必要です。圧迫止血を継続してください。',
          subjectTpl: '[命をツナグ] {company} {person} - 大量出血',
          bodyTplEmergency:
            '{person}さん、「大量出血（{part}）」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「出血（{part}）」、経過観察しつつ状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'bleeding',
          label: '出血',
          hint: '',
          icon: '🩸',
          requiresBody: true,
          defaultAction: 'observe',
          includeEmergency: ['safetyHQ', 'rescueTeam', 'ambulanceCenter'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '出血が止まらない・量が多い・意識がぼんやりする場合は、迷わず救急要請してください。',
          recommendTextObserve:
            '出血部位を圧迫して止血し、改善しない場合は緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 出血',
          bodyTplEmergency:
            '{person}さん、「出血（{part}）」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「出血（{part}）」、様子を見つつ状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'fall',
          label: '転落',
          hint: '',
          icon: '🧗',
          requiresBody: false,
          defaultAction: 'emergency',
          includeEmergency: ['safetyHQ', 'rescueTeam', 'ambulanceCenter'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '頭部・体幹を動かさず安静にし、必要に応じて救急車（119）を呼んでください。',
          recommendTextObserve:
            '痛み・しびれ・意識変容があれば緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 転落',
          bodyTplEmergency:
            '{person}さん、「転落」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「転落」疑い、状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'electric',
          label: '感電',
          hint: '電気事故',
          icon: '⚡',
          requiresBody: false,
          defaultAction: 'emergency',
          includeEmergency: ['safetyHQ', 'rescueTeam', 'ambulanceCenter'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '安全確保（通電停止）後、意識・呼吸を確認。異常があれば救急車（119）を呼んでください。',
          recommendTextObserve:
            '軽症でも遅れて症状が出ることがあります。必ず上長・安全課へ共有してください。',
          subjectTpl: '[命をツナグ] {company} {person} - 感電',
          bodyTplEmergency:
            '{person}さん、「感電」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「感電」疑い、状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'pinched',
          label: '挟まれ',
          hint: '',
          icon: '🧱',
          requiresBody: false,
          defaultAction: 'emergency',
          includeEmergency: ['safetyHQ', 'rescueTeam'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '挟まれの場合は二次災害に注意しつつ救出。出血や意識障害があれば救急車（119）。',
          recommendTextObserve:
            '痛みや腫れが強い場合は緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 挟まれ',
          bodyTplEmergency:
            '{person}さん、「挟まれ」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「挟まれ」疑い、状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'pain',
          label: '痛み',
          hint: '',
          icon: '🤕',
          requiresBody: true,
          defaultAction: 'observe',
          includeEmergency: ['safetyHQ', 'rescueTeam'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '強い痛み、変形、しびれ、出血がある場合は緊急要請を選択してください。',
          recommendTextObserve:
            '患部を安静にし、症状が改善しない/悪化する場合は緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 痛み',
          bodyTplEmergency:
            '{person}さん、「{part}に痛み」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、{part}に痛み、様子を見る\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'dizzy',
          label: '立ち眩み',
          hint: '',
          icon: '💫',
          requiresBody: false,
          defaultAction: 'observe',
          includeEmergency: ['safetyHQ'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '意識低下、胸痛、呼吸困難などがある場合は緊急要請してください。',
          recommendTextObserve:
            '安全な場所で座らせ、無理に立たせず、改善しない場合は緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 立ち眩み',
          bodyTplEmergency:
            '{person}さん、「立ち眩み」、緊急対応が必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「立ち眩み」、様子を見つつ状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'vomit',
          label: '嘔吐',
          hint: '',
          icon: '🤢',
          requiresBody: false,
          defaultAction: 'observe',
          includeEmergency: ['safetyHQ'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '意識障害、血を吐く、激しい腹痛がある場合は緊急要請してください。',
          recommendTextObserve:
            '横向きに寝かせ、誤嚥に注意し、改善しない場合は緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 嘔吐',
          bodyTplEmergency:
            '{person}さん、「嘔吐」、緊急対応が必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「嘔吐」、様子を見つつ状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'cant_stand',
          label: '立てない',
          hint: '',
          icon: '🧍',
          requiresBody: false,
          defaultAction: 'observe',
          includeEmergency: ['safetyHQ'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '意識がない、呼吸が苦しい、強い痛みがある場合は緊急要請してください。',
          recommendTextObserve:
            '無理に動かさず安静にし、改善しない場合は緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - 立てない',
          bodyTplEmergency:
            '{person}さん、「立てない」、緊急対応が必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「立てない」、様子を見つつ状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
        {
          id: 'other',
          label: 'その他',
          hint: '',
          icon: '➕',
          requiresBody: false,
          defaultAction: 'observe',
          includeEmergency: ['safetyHQ', 'rescueTeam'],
          includeObserve: ['safetyHQ'],
          recommendTextEmergency:
            '緊急性が疑われる場合は、迷わず緊急要請してください。',
          recommendTextObserve:
            '状況を整理して共有し、必要に応じて緊急要請へ切り替えてください。',
          subjectTpl: '[命をツナグ] {company} {person} - その他',
          bodyTplEmergency:
            '{person}さん、「その他」、緊急救護必要\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
          bodyTplObserve:
            '{person}さん、「その他」、状況共有\n所属：{company}\n発生時刻：{time}\n\n状況：{detail}',
        },
      ],
      bodyParts: [
        { id: 'head', label: '頭' },
        { id: 'neck', label: '首' },
        { id: 'torso', label: '胸/腹' },
        { id: 'leftArm', label: '左腕' },
        { id: 'rightArm', label: '右腕' },
        { id: 'leftHand', label: '左手' },
        { id: 'rightHand', label: '右手' },
        { id: 'hips', label: '腰' },
        { id: 'leftLeg', label: '左脚' },
        { id: 'rightLeg', label: '右脚' },
        { id: 'leftFoot', label: '左足' },
        { id: 'rightFoot', label: '右足' },
      ],
    };
  }

  function loadMaster() {
    // Merge with defaults so new fields/situations are added even if older data exists in localStorage
    const def = defaultMaster();

    function mergeById(defArr, savedArr) {
      const map = new Map();
      defArr.forEach((x) => map.set(x.id, x));

      if (Array.isArray(savedArr)) {
        for (const x of savedArr) {
          if (!x || !x.id) continue;
          const base = map.get(x.id) || {};
          map.set(x.id, { ...base, ...x });
        }
      }

      const ordered = [];
      const seen = new Set();
      for (const x of defArr) {
        const v = map.get(x.id);
        if (v) {
          ordered.push(v);
          seen.add(x.id);
        }
      }
      for (const [id, v] of map.entries()) {
        if (!seen.has(id)) ordered.push(v);
      }
      return ordered;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;

      const parsed = JSON.parse(raw) || {};
      const merged = { ...def, ...parsed };

      // Deep-merge objects that may get new keys over time
      merged.sendScope = { ...def.sendScope, ...(parsed.sendScope || {}) };

      merged.companies = mergeById(def.companies, parsed.companies);
      merged.staff = mergeById(def.staff, parsed.staff);
      merged.locations = mergeById(def.locations, parsed.locations);
      merged.situations = mergeById(def.situations, parsed.situations);
      merged.bodyParts = mergeById(def.bodyParts, parsed.bodyParts);

      return merged;
    } catch (e) {
      console.warn('Failed to load master; using default', e);
      return def;
    }
  }

  function saveMaster(master) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(master));
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  /** =========================
   *  App state & navigation
   *  ========================= */
  const WIZ = {
    triage: 'view-triage',
    location: 'view-location',
    accident: 'view-accident',
    victim: 'view-victim',
    review: 'view-review',
  };
  const WIZ_ORDER = ['triage', 'location', 'accident', 'victim', 'review'];

  function defaultWizardState() {
    return {
      startedAt: nowIsoLocal(),
      triage: { conscious: null, breathing: null },
      location: { qr: '', name: '', unknown: true },
      accident: { types: [], note: '' },
      victim: { staffId: null, name: '', qr: '', unknown: true },
    };
  }

  const state = {
    mode: 'emergency', // 'emergency' | 'unsure' (affects visible situations)
    situationId: null,
    companyId: null,
    personId: null,
    bodyPartId: null,
    detailNote: '', // optional
    action: null, // 'emergency' | 'observe' (selected on result)
    preview: { to: [], subject: '', body: '' },
    wiz: defaultWizardState(),
  };

  const nav = {
    stack: ['view-home'],
    show(viewId, { push = true } = {}) {
      $$('.view').forEach((v) => v.classList.remove('active'));
      const el = document.getElementById(viewId);
      if (!el) return;
      el.classList.add('active');

      // Topbar visibility
      const topbar = $('#topbar');
      topbar.style.display = 'flex';
      // Homeでは「戻る」「最初から」を非表示にして、Tunageru側（ログイン画面）と同じ見え方に揃える
      // ※機能は残し、他画面では表示する
      const backBtn = $('#btnBack');
      const restartBtn = $('#btnRestartGlobal');
      const isHome = (viewId === 'view-home');
      if (backBtn) backBtn.style.visibility = isHome ? 'hidden' : 'visible';
      if (restartBtn) restartBtn.style.visibility = isHome ? 'hidden' : 'visible';

      if (push) {
        const current = nav.stack[nav.stack.length - 1];
        if (current !== viewId) nav.stack.push(viewId);
      }

      onViewShown(viewId);
    },
    back() {
      if (nav.stack.length <= 1) {
        nav.show('view-home', { push: false });
        nav.stack = ['view-home'];
        return;
      }
      nav.stack.pop();
      nav.show(nav.stack[nav.stack.length - 1], { push: false });
    },
    restartAll() {
      nav.stack = ['view-home'];
      resetFlow();
      nav.show('view-home', { push: false });
    },
  };

  function resetFlow() {
    state.situationId = null;
    state.companyId = null;
    state.personId = null;
    state.bodyPartId = null;
    state.detailNote = '';
    state.action = null;
    state.preview = { to: [], subject: '', body: '' };
    state.wiz = defaultWizardState();

    // reset body selection UI
    $$('#bodySvg .body-part').forEach((p) => p.classList.remove('selected'));
    $('#bodySelectedLabel').textContent = '未選択';
    $('#btnBodyNext').disabled = true;

    // clear kana
    $$('#kanaBar .kana-btn').forEach((b) => b.classList.remove('active'));

    saveSession({ ...state, nav: nav.stack });
  }

  /** =========================
   *  Rendering
   *  ========================= */
  let master = loadMaster();

  function getSituation(id) {
    return master.situations.find((s) => s.id === id) || null;
  }
  function getCompany(id) {
    return master.companies.find((c) => c.id === id) || null;
  }
  function getPerson(id) {
    return master.staff.find((p) => p.id === id) || null;
  }
  function getBodyPart(id) {
    return master.bodyParts.find((b) => b.id === id) || null;
  }

  const STATUS_PRESET = {
    emergency: ['unconscious', 'bleeding_major', 'fall', 'electric', 'pinched', 'other'],
    unsure: ['bleeding', 'dizzy', 'pain', 'vomit', 'cant_stand', 'other'],
  };

  function getPresetSituations(mode) {
    const ids = STATUS_PRESET[mode];
    if (!ids) return null;
    const list = [];
    for (const id of ids) {
      const s = getSituation(id);
      if (s) list.push(s);
    }
    return list;
  }

  function renderStatusGrid() {
    const grid = $('#statusGrid');
    if (!grid) return;
    grid.innerHTML = '';

    let situations = getPresetSituations(state.mode) || master.situations.slice();

    for (const s of situations) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-btn status-card';
      btn.setAttribute('role', 'listitem');
      const iconHtml = s.icon ? `<div class="icon" aria-hidden="true">${escapeHtml(s.icon || '')}</div>` : '';
      const hintHtml = s.hint ? `<span>${escapeHtml(s.hint || '')}</span>` : '';
      btn.innerHTML = `
        ${iconHtml}
        <div class="label">
          <strong>${escapeHtml(s.label)}</strong>
          ${hintHtml}
        </div>
      `;
      btn.addEventListener('click', () => {
        // pick situation
        state.situationId = s.id;
        state.companyId = null;
        state.personId = null;
        state.bodyPartId = null;
        state.action = null;

        saveSession({ ...state, nav: nav.stack });

        // If body-part selection is required, do it BEFORE affiliation/person
        if (s.requiresBody) {
          $('#bodyTitle').textContent = s.label;
          const q = $('#bodyQuestion');
          if (q) q.textContent = '出血・痛みの部位をタップしてください。';
          nav.show('view-body');
          return;
        }

        renderCompanyList();
        nav.show('view-company');
      });
      grid.appendChild(btn);
    }
  }

  /** =========================
   *  Guided emergency flow (指示方式)
   *  ========================= */
  const ACCIDENT_OPTIONS = ['大量出血', '転落', '感電', '挟まれ', '火傷', '熱中症', 'その他'];

  function goWizardStep(stepKey, { push = true } = {}) {
    const id = WIZ[stepKey];
    if (!id) return;
    nav.show(id, { push });
    saveSession({ ...state, nav: nav.stack });
  }

  function stepKeyFromView(viewId) {
    return Object.keys(WIZ).find((k) => WIZ[k] === viewId) || null;
  }

  function updateStepperActive(viewId) {
    const current = stepKeyFromView(viewId);
    if (!current) return;
    $$('.stepper').forEach((stepper) => {
      stepper.querySelectorAll('.step-btn').forEach((btn) => {
        const k = btn.getAttribute('data-step');
        btn.classList.toggle('active', k === current);
      });
    });
  }

  function onViewShown(viewId) {
    if (!Object.values(WIZ).includes(viewId)) return;
    updateStepperActive(viewId);
    if (viewId === WIZ.triage) renderWizardTriage();
    if (viewId === WIZ.location) renderWizardLocation();
    if (viewId === WIZ.accident) renderWizardAccident();
    if (viewId === WIZ.victim) renderWizardVictim();
    if (viewId === WIZ.review) renderWizardReview();
  }

  function yesNoUnknownLabel(val) {
    if (val === 'yes') return 'あり';
    if (val === 'no') return 'なし';
    if (val === 'unknown') return '不明';
    return '未選択';
  }

  function renderWizardTriage() {
    const triage = state.wiz.triage;

    const segMap = {
      conscious: '#segConscious',
      breathing: '#segBreathing',
    };

    function syncGroup(group) {
      const segSel = segMap[group];
      const seg = segSel ? $(segSel) : null;
      if (!seg) return;
      const buttons = seg.querySelectorAll('.seg-btn');
      buttons.forEach((b) => {
        const val = b.getAttribute('data-val');
        const active = triage[group] === val;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    syncGroup('conscious');
    syncGroup('breathing');

    const nextBtn = $('#btnTriageNext');
    if (nextBtn) nextBtn.disabled = !(triage.conscious && triage.breathing);
  }

  function renderWizardLocation() {
    const loc = state.wiz.location;

    const selected = $('#locationSelected');
    if (selected) {
      selected.textContent = loc.unknown ? '不明' : (loc.name || '未設定');
    }

    const list = $('#locationList');
    if (list) {
      list.innerHTML = '';
      const items = (master.locations || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
      if (items.length === 0) {
        const d = document.createElement('div');
        d.className = 'small';
        d.textContent = '場所マスタが未登録です（管理画面で登録してください）。';
        list.appendChild(d);
      } else {
        for (const it of items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'list-btn';
          b.dataset.id = it.id;
          b.innerHTML = `${escapeHtml(it.name)}<span class="sub">${it.qr ? 'QR: ' + escapeHtml(it.qr) : ''}</span>`;
          list.appendChild(b);
        }
      }
    }

    const manual = $('#locationManual');
    if (manual) {
      const expected = loc.unknown ? '' : (loc.name || '');
      if ((manual.value || '') !== expected) manual.value = expected;
    }
  }

  function renderWizardAccident() {
    const wrap = $('#accidentChips');
    if (wrap && wrap.children.length === 0) {
      const defs = (master.accidentTypes || [
        { key: 'bleeding_major', label: '大量出血' },
        { key: 'fall', label: '転落' },
        { key: 'electric', label: '感電' },
        { key: 'crush', label: '挟まれ' },
        { key: 'burn', label: '熱傷' },
        { key: 'other', label: 'その他' },
      ]);
      defs.forEach((d) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.acc = d.key;
        chip.setAttribute('aria-pressed', 'false');
        chip.textContent = d.label;
        wrap.appendChild(chip);
      });
    }

    const types = new Set(state.wiz.accident.types || []);
    $$('#accidentChips .chip').forEach((c) => {
      const key = c.getAttribute('data-acc');
      c.classList.toggle('active', types.has(key));
      c.setAttribute('aria-pressed', types.has(key) ? 'true' : 'false');
    });
    const note = $('#accidentNote');
    if (note && note.value !== (state.wiz.accident.note || '')) note.value = state.wiz.accident.note || '';
  }

  function renderWizardVictim() {
    const v = state.wiz.victim;
    const staff = v.staffId ? getPerson(v.staffId) : null;
    const name = staff?.name || v.name || (v.unknown ? '不明' : '未設定');
    const companyName = staff ? (getCompany(staff.companyId)?.name || '') : '';

    const picked = $('#victimSelected');
    if (picked) picked.textContent = companyName ? `${name}（${companyName}）` : name;

    // Render list (filter)
    renderVictimSearchList($('#victimSearch')?.value || '');
  }

  function renderVictimSearchList(query) {
    const list = $('#victimList');
    if (!list) return;
    const q = (query || '').trim();

    const people = (master.staff || [])
      .map((p) => ({ ...p, company: getCompany(p.companyId)?.name || '' }))
      .filter((p) => {
        if (!q) return true;
        const hay = `${p.name} ${p.kana || ''} ${p.company || ''}`;
        return hay.includes(q);
      })
      .sort((a, b) => (a.kana || '').localeCompare(b.kana || '', 'ja'))
      .slice(0, 60);

    list.innerHTML = '';
    if (people.length === 0) {
      const d = document.createElement('div');
      d.className = 'small';
      d.textContent = '該当なし（よみ or 氏名で検索）';
      list.appendChild(d);
      return;
    }

    for (const p of people) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'list-btn';
      b.dataset.staff = p.id;
      b.innerHTML = `${escapeHtml(p.name)}<span class="sub">${escapeHtml(p.company)}</span>`;
      list.appendChild(b);
    }
  }

  function getAccidentLabel(key) {
    const defs = master.accidentTypes || [];
    const hit = defs.find((d) => d.key === key);
    return hit ? (hit.label || key) : (key || '');
  }

  function buildWizardPreview() {
    const triage = state.wiz.triage;
    const loc = state.wiz.location;
    const acc = state.wiz.accident;
    const v = state.wiz.victim;
    const staff = v.staffId ? getPerson(v.staffId) : null;
    const company = staff ? getCompany(staff.companyId) : null;

    const to = buildWizardRecipients({ staff, company });

    const locLabel = loc.unknown ? '（場所不明）' : (loc.name || '（場所未設定）');
    const victimLabel = staff?.name || v.name || (v.unknown ? '（被災者不明）' : '（被災者未設定）');

    const subject = `[命をツナグ] 緊急 ${locLabel} / ${victimLabel}`;

    const lines = [];
    lines.push(`【発見時刻】${state.wiz.startedAt}`);
    lines.push(`【意識】${yesNoUnknownLabel(triage.conscious)}`);
    lines.push(`【呼吸】${yesNoUnknownLabel(triage.breathing)}`);
    lines.push('');
    lines.push(`【場所】${locLabel}`);
    if (loc.qr) lines.push(`場所QR: ${loc.qr}`);
    lines.push('');
    const accLabels = (acc.types || []).map(getAccidentLabel).filter(Boolean);
    lines.push(`【事故区分】${accLabels.length ? accLabels.join(' / ') : '未選択'}`);
    if ((acc.note || '').trim()) lines.push(`補足: ${acc.note.trim()}`);
    lines.push('');
    lines.push(`【被災者】${victimLabel}`);
    if (company?.name) lines.push(`所属: ${company.name}`);
    if (staff?.id) lines.push(`職員ID: ${staff.id}`);
    if (v.qr) lines.push(`ヘルメットQR: ${v.qr}`);
    lines.push('');
    lines.push('—');
    lines.push('※このメールは「命をツナグ」から作成されました（未確定項目を含む場合があります）。');

    return { to, subject, body: lines.join('\n') };
  }

  function buildWizardRecipients({ staff, company }) {
    const scope = master.sendScope || {};
    const gc = master.globalContacts || {};
    const list = [];
    if (scope.safetyHQ && gc.safetyHQ) list.push(...normalizeEmails(gc.safetyHQ));
    if (scope.rescueTeam && gc.rescueTeam) list.push(...normalizeEmails(gc.rescueTeam));
    if (scope.ambulanceCenter && gc.ambulanceCenter) list.push(...normalizeEmails(gc.ambulanceCenter));
    if (scope.companyEmails && company?.emails?.length) list.push(...(company.emails || []));
    // de-dupe
    return Array.from(new Set(list.filter(Boolean)));
  }

  function renderWizardReview() {
    const p = buildWizardPreview();
    state.preview = p;
    saveSession({ ...state, nav: nav.stack });

    const triage = state.wiz.triage;
    const loc = state.wiz.location;
    const acc = state.wiz.accident;
    const v = state.wiz.victim;
    const staff = v.staffId ? getPerson(v.staffId) : null;
    const company = staff ? getCompany(staff.companyId) : null;

    const parts = [];
    parts.push(`<div><b>発見時刻</b>：${escapeHtml(state.wiz.startedAt)}</div>`);
    parts.push(`<div><b>意識</b>：${escapeHtml(yesNoUnknownLabel(triage.conscious))}　<b>呼吸</b>：${escapeHtml(yesNoUnknownLabel(triage.breathing))}</div>`);
    parts.push(`<div><b>場所</b>：${escapeHtml(loc.unknown ? '不明' : (loc.name || '未設定'))}${loc.qr ? ` <span class="sub">(QR)</span>` : ''}</div>`);
    if (loc.qr) parts.push(`<div class="sub">場所QR: ${escapeHtml(loc.qr)}</div>`);

    const accLabels = (acc.types || []).map(getAccidentLabel).filter(Boolean);
    parts.push(`<div><b>事故区分</b>：${escapeHtml(accLabels.length ? accLabels.join(' / ') : '未選択')}</div>`);
    if ((acc.note || '').trim()) parts.push(`<div class="sub">補足: ${escapeHtml(acc.note.trim())}</div>`);

    const victimLabel = staff?.name || v.name || (v.unknown ? '不明' : '未設定');
    parts.push(`<div><b>被災者</b>：${escapeHtml(victimLabel)}${company?.name ? ` <span class="sub">(${escapeHtml(company.name)})</span>` : ''}</div>`);

    const summary = $('#reviewSummary');
    if (summary) summary.innerHTML = parts.join('');

    const rec = $('#reviewRecipients');
    if (rec) rec.textContent = p.to.length ? p.to.join(', ') : '未設定（管理画面で送信先を登録してください）';

    // Note: Actual sending happens via "メールを開く" / "内容をコピー".
  }

  // --- QR modal (BarcodeDetector if available; fallback to manual text) ---
  let qrStream = null;
  let qrRunning = false;
  let qrDetector = null;
  let qrPurpose = null;
  let qrCanvas = null;
  let qrCtx = null;

  function setQrStatus(msg) {
    const el = $('#qrStatus');
    if (el) el.textContent = msg || '';
  }

  function openQrPhotoCapture() {
    const f = $('#qrFile');
    if (!f) return;
    try {
      // file:// 等でライブカメラが使えない環境でも、capture入力ならカメラが開けるケースが多い
      f.click();
    } catch {
      // ignore
    }
  }

  function openQrModal(purpose) {
    qrPurpose = purpose;
    const title = $('#qrModalTitle');
    if (title) title.textContent = purpose === 'victim' ? '被災者QRを読み取ってください' : '場所QRを読み取ってください';
    if ($('#qrManual')) $('#qrManual').value = '';
    const f = $('#qrFile');
    if (f) f.value = '';
    setQrStatus('');
    const modal = $('#qrModal');
    if (modal) {
      modal.classList.remove('hidden');
      // 直前にスクロールしていた場合でも、常に先頭から見えるように
      const body = modal.querySelector('.modal-body');
      if (body) body.scrollTop = 0;
    }
    document.body.classList.add('modal-open');
    startQrCamera({ autoFallback: true });
  }

  function closeQrModal() {
    stopQrCamera();
    const modal = $('#qrModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  async function startQrCamera(opts = {}) {
    const autoFallback = !!opts.autoFallback;
    // UI
    const wrap = $('#qrCameraWrap');
    if (wrap) wrap.classList.remove('hidden');

    // If this origin is not secure, many browsers disable getUserMedia.
    // We keep the photo fallback available in any case.
    const secure = (window.isSecureContext === true) || location.protocol === 'https:' || location.hostname === 'localhost';

    // Feature detection
    if (!secure || !('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
      if (wrap) wrap.classList.add('hidden');
      // file:// 等では getUserMedia が使えないことが多い。
      setQrStatus('この環境ではカメラのライブ読み取りが利用できません。カメラで撮影して読み取ります。');
      if (autoFallback) openQrPhotoCapture();
      return;
    }

    try {
      // Start camera preview
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e1) {
        // Fallback (some devices/browsers don't like facingMode constraints)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      qrStream = stream;
      const video = $('#qrVideo');
      if (video) {
        video.autoplay = true;
        video.muted = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.srcObject = qrStream;
        await video.play();
      }

      // Auto-detect if BarcodeDetector is available
      if ('BarcodeDetector' in window) {
        qrDetector = new BarcodeDetector({ formats: ['qr_code'] });
        qrRunning = true;
        requestAnimationFrame(qrTick);
        setQrStatus('カメラ起動中… QRを枠内に合わせてください。');
      } else {
        // Keep camera preview, but guide users to photo/manual in environments without detector.
        setQrStatus('カメラは起動しましたが、このブラウザではQR自動検出が利用できません。「写真で読み取る」または貼り付けをご利用ください。');
      }
    } catch (e) {
      const wrap = $('#qrCameraWrap');
      if (wrap) wrap.classList.add('hidden');
      setQrStatus('カメラの起動に失敗しました。権限設定を確認するか、"写真で読み取る"（撮影）をご利用ください。');
    }
  }

  function stopQrCamera() {
    qrRunning = false;
    try {
      const video = $('#qrVideo');
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    } catch {}
    if (qrStream) {
      try { qrStream.getTracks().forEach(t => t.stop()); } catch {}
    }
    qrStream = null;
    qrDetector = null;
  }

  async function decodeQrFromFile(file) {
    if (!file) return null;
    if (!('BarcodeDetector' in window)) return null;
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      // Prefer ImageBitmap for performance
      if ('createImageBitmap' in window) {
        const bmp = await createImageBitmap(file);
        const codes = await detector.detect(bmp);
        try { bmp.close && bmp.close(); } catch {}
        const raw = (codes && codes[0] && codes[0].rawValue) ? String(codes[0].rawValue).trim() : '';
        return raw || null;
      }

      // Fallback to <img> + canvas
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = 'async';
      const loaded = new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('img load failed'));
      });
      img.src = url;
      await loaded;
      URL.revokeObjectURL(url);

      if (!qrCanvas) {
        qrCanvas = document.createElement('canvas');
        qrCtx = qrCanvas.getContext('2d', { willReadFrequently: true });
      }
      qrCanvas.width = img.naturalWidth || img.width;
      qrCanvas.height = img.naturalHeight || img.height;
      qrCtx.drawImage(img, 0, 0);
      const codes = await detector.detect(qrCanvas);
      const raw = (codes && codes[0] && codes[0].rawValue) ? String(codes[0].rawValue).trim() : '';
      return raw || null;
    } catch (err) {
      console.warn('QR decode failed', err);
      return null;
    }
  }

  async function qrTick() {
    if (!qrRunning || !qrDetector) return;
    const video = $('#qrVideo');
    if (!video || video.readyState < 2) {
      requestAnimationFrame(qrTick);
      return;
    }

    try {
      const codes = await qrDetector.detect(video);
      if (codes && codes.length) {
        const raw = (codes[0].rawValue || '').trim();
        if (raw) {
          handleQrValue(raw);
          return;
        }
      }
    } catch {
      // ignore and keep scanning
    }
    requestAnimationFrame(qrTick);
  }

  function handleQrValue(value) {
    const v = (value || '').trim();
    if (!v) return;

    if (qrPurpose === 'location') {
      applyLocationQr(v);
    } else if (qrPurpose === 'victim') {
      applyVictimQr(v);
    }
    closeQrModal();
  }

  function applyLocationQr(qr) {
    const hit = (master.locations || []).find(l => (l.qr || '').trim() === qr);
    state.wiz.location.qr = qr;
    state.wiz.location.unknown = false;
    if (hit) {
      state.wiz.location.name = hit.name || '';
    } else {
      state.wiz.location.name = '未登録の場所（管理で登録してください）';
    }
    saveSession({ ...state, nav: nav.stack });
    renderWizardLocation();
  }

  function applyVictimQr(qr) {
    const hit = (master.staff || []).find(s => (s.qr || '').trim() === qr);
    state.wiz.victim.qr = qr;
    if (hit) {
      state.wiz.victim.staffId = hit.id;
      state.wiz.victim.name = '';
      state.wiz.victim.unknown = false;
    } else {
      state.wiz.victim.staffId = null;
      state.wiz.victim.unknown = false;
      state.wiz.victim.name = '未登録（管理で職員QRを登録してください）';
    }
    saveSession({ ...state, nav: nav.stack });
    renderWizardVictim();
  }

  /** =========================
   *  Map modal (select location when QR not available)
   *  - North/Central/South zoom (viewBox)
   *  - Polygons are defined in MAP_BASE_W/H coordinate space
   *  - Single SVG renders both background image + polygons to prevent misalignment
   *  ========================= */
  const MAP_IMAGE_SRC = 'map_grid.png';

  // Base size used when defining polygon points (generated from the supplied PDF)
  const MAP_BASE_W = 3307;
  const MAP_BASE_H = 2339;

  // Polygon areas (points are in MAP_BASE_W/H coordinate space)
  const MAP_AREAS_RAW = [
    {
      name: '鋼材・SUB材置場',
      poly: [
        [2220, 240], [2520, 150], [3100, 150], [3100, 260],
        [3200, 390], [3200, 520], [2450, 640], [2300, 520]
      ]
    },
    { name: '曲げ定盤', poly: [[2320, 650], [2560, 650], [2560, 1230], [2320, 1230]] },
    { name: 'ブロック置場', poly: [[2080, 710], [2900, 710], [2920, 1210], [2580, 1210], [2580, 1360], [2140, 1360]] },
    { name: 'パイプ置場', poly: [[2580, 1210], [2920, 1210], [2920, 1360], [2580, 1360]] },
    { name: '食堂・協力業者ハウス', poly: [[2090, 600], [2450, 600], [2450, 710], [2090, 710]] },
    { name: 'SUB定盤', poly: [[1250, 620], [1700, 560], [2050, 650], [2140, 820], [1800, 920], [1380, 860], [1250, 740]] },
    { name: 'SUB工場', poly: [[1760, 780], [2040, 780], [2040, 910], [1760, 910]] },
    { name: '事務所', poly: [[1760, 920], [2040, 920], [2040, 1000], [1760, 1000]] },
    { name: '南定盤3', poly: [[1700, 1300], [1950, 1300], [1950, 1450], [1700, 1450]] },
    { name: '南定盤2', poly: [[1280, 1300], [1700, 1300], [1700, 1450], [1280, 1450]] },
    { name: '加工場', poly: [[1470, 1460], [1630, 1460], [1630, 1600], [1470, 1600]] },
    { name: 'パイプ工場', poly: [[1640, 1460], [1860, 1460], [1860, 1600], [1640, 1600]] },
    { name: '電気室・コンプレッサー室', poly: [[1860, 1440], [2070, 1500], [2200, 1640], [2000, 1730], [1780, 1620]] },
    { name: '北定盤2', poly: [[460, 600], [650, 600], [650, 750], [500, 820], [420, 760]] },
    { name: 'ピース切断場', poly: [[260, 560], [410, 560], [410, 650], [260, 650]] },
    { name: '道具置場', poly: [[430, 570], [520, 570], [520, 650], [430, 650]] },
    { name: '施設作業場', poly: [[260, 520], [420, 520], [420, 560], [260, 560]] },
    { name: '旧ガスセンター工場', poly: [[980, 590], [1230, 590], [1230, 680], [980, 680]] },
    { name: 'B棟', poly: [[450, 720], [1100, 720], [1100, 860], [450, 860]] },
    { name: '北定盤1', poly: [[280, 850], [500, 850], [500, 980], [280, 980]] },
    { name: 'A棟', poly: [[560, 900], [1460, 900], [1460, 1020], [560, 1020]] },
    { name: 'DOCK', poly: [[210, 990], [320, 990], [320, 1090], [210, 1090]] },
    { name: '建造船', poly: [[420, 1040], [1440, 1040], [1440, 1260], [420, 1260]] },
    { name: '艤装岸壁', poly: [[630, 1260], [730, 1260], [730, 1950], [630, 1950]] },
    { name: '70t JC', poly: [[740, 1260], [820, 1260], [820, 1950], [740, 1950]] },
    { name: 'C棟', poly: [[850, 1300], [1030, 1300], [1030, 1920], [850, 1920]] },
    { name: '艤装品置場', poly: [[820, 1780], [1030, 1780], [1030, 1920], [820, 1920]] },
    { name: 'スクラップ場', poly: [[1040, 1850], [1180, 1850], [1180, 2050], [1040, 2050]] },
  ];

  function centroidOf(poly) {
    // Simple centroid (mean of vertices) is enough for UI marker
    const n = poly.length || 1;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of poly) {
      sx += x;
      sy += y;
    }
    return { cx: sx / n, cy: sy / n };
  }

  const MAP_AREAS = MAP_AREAS_RAW.map((a) => {
    const { cx, cy } = centroidOf(a.poly);
    return { ...a, cx, cy };
  });

  let mapSelected = null; // {name, poly, cx, cy}
  let mapView = 'all';
  let mapViewBox = { x: 0, y: 0, w: MAP_BASE_W, h: MAP_BASE_H };

  const MAP_VIEW_CFG = {
    zoom: 2.25,
    centers: {
      north: { cx: MAP_BASE_W / 2, cy: 720 },
      central: { cx: MAP_BASE_W / 2, cy: 1180 },
      south: { cx: MAP_BASE_W / 2, cy: 1780 },
    }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function computeViewBox(zone) {
    if (!zone || zone === 'all') return { x: 0, y: 0, w: MAP_BASE_W, h: MAP_BASE_H };

    const zoom = MAP_VIEW_CFG.zoom;
    const w = MAP_BASE_W / zoom;
    const h = MAP_BASE_H / zoom;
    const c = MAP_VIEW_CFG.centers[zone] || MAP_VIEW_CFG.centers.central;

    const x = clamp(c.cx - w / 2, 0, MAP_BASE_W - w);
    const y = clamp(c.cy - h / 2, 0, MAP_BASE_H - h);
    return { x, y, w, h };
  }

  function updateZoneButtons() {
    $$('#mapModal .zone-btn').forEach((btn) => {
      const z = btn.dataset.zone || 'all';
      const active = z === mapView;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function areaInViewBox(a, vb, margin = 80) {
    return (
      a.cx >= vb.x - margin &&
      a.cx <= vb.x + vb.w + margin &&
      a.cy >= vb.y - margin &&
      a.cy <= vb.y + vb.h + margin
    );
  }

  function guessZoneByArea(a) {
    if (!a) return 'central';
    if (a.cy < 950) return 'north';
    if (a.cy < 1550) return 'central';
    return 'south';
  }

  function setMapView(zone) {
    mapView = zone || 'all';
    mapViewBox = computeViewBox(mapView);
    updateZoneButtons();
    renderMapSvg();
    renderMapList($('#mapSearch')?.value || '');
  }

  function renderMapSvg() {
    const svg = $('#yardSvg');
    if (!svg) return;

    svg.innerHTML = '';
    svg.setAttribute('viewBox', `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}`);

    const ns = 'http://www.w3.org/2000/svg';

    // Background image inside the same SVG (prevents misalignment)
    const img = document.createElementNS(ns, 'image');
    img.setAttribute('href', MAP_IMAGE_SRC);
    img.setAttribute('x', '0');
    img.setAttribute('y', '0');
    img.setAttribute('width', String(MAP_BASE_W));
    img.setAttribute('height', String(MAP_BASE_H));
    img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    img.setAttribute('pointer-events', 'none');
    img.classList.add('map-bg');
    svg.appendChild(img);

    // Polygons
    for (const a of MAP_AREAS) {
      if (mapView !== 'all' && !areaInViewBox(a, mapViewBox, 140)) continue;

      const pg = document.createElementNS(ns, 'polygon');
      const pts = a.poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      pg.setAttribute('points', pts);
      pg.setAttribute('data-name', a.name);
      pg.setAttribute('tabindex', '0');
      pg.classList.add('map-poly');
      if (mapSelected && mapSelected.name === a.name) pg.classList.add('active');

      pg.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setMapSelection(a);
      });

      // Keyboard
      pg.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          setMapSelection(a);
        }
      });

      svg.appendChild(pg);
    }

    // Marker
    if (mapSelected) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(mapSelected.cx));
      dot.setAttribute('cy', String(mapSelected.cy));
      dot.setAttribute('r', '14');
      dot.classList.add('map-marker-dot');
      svg.appendChild(dot);
    }
  }

  function openMapModal() {
    const modal = $('#mapModal');
    if (!modal) return;

    // Reset UI
    mapSelected = null;
    const sel = $('#mapSelectedLabel');
    if (sel) sel.textContent = '未選択';
    const useBtn = $('#btnMapUse');
    if (useBtn) useBtn.disabled = true;

    const q = $('#mapSearch');
    if (q) q.value = '';

    setMapView('all');

    modal.classList.remove('hidden');
    const body = modal.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
    document.body.classList.add('modal-open');
  }

  function closeMapModal() {
    const modal = $('#mapModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  function renderMapList(filterText) {
    const wrap = $('#mapList');
    if (!wrap) return;
    wrap.innerHTML = '';

    const f = (filterText || '').trim();
    const items = MAP_AREAS
      .filter((z) => {
        if (mapView !== 'all' && !areaInViewBox(z, mapViewBox, 220)) return false
        return !f || z.name.includes(f);
      })
      .slice(0, 120);

    items.forEach((z) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-item' + (mapSelected && mapSelected.name === z.name ? ' active' : '');
      b.textContent = z.name;
      b.addEventListener('click', () => setMapSelection(z));
      wrap.appendChild(b);
    });
  }

  function setMapSelection(area) {
    mapSelected = area;

    // Update label
    const sel = $('#mapSelectedLabel');
    if (sel) sel.textContent = area?.name || '未選択';

    // Enable use button
    const useBtn = $('#btnMapUse');
    if (useBtn) useBtn.disabled = !area;

    // If current zoom view does not include the selected area, auto-switch to its zone
    if (area && mapView !== 'all' && !areaInViewBox(area, mapViewBox, 40)) {
      setMapView(guessZoneByArea(area));
    } else {
      renderMapSvg();
      renderMapList($('#mapSearch')?.value || '');
    }
  }

  function clearMapSelection() {
    mapSelected = null;
    const sel = $('#mapSelectedLabel');
    if (sel) sel.textContent = '未選択';
    const useBtn = $('#btnMapUse');
    if (useBtn) useBtn.disabled = true;
    const q = $('#mapSearch');
    if (q) q.value = '';
    renderMapSvg();
    renderMapList('');
  }

  function pointInPoly(x, y, poly) {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function findAreaAtPoint(x, y) {
    for (const a of MAP_AREAS) {
      if (pointInPoly(x, y, a.poly)) return a;
    }
    return null;
  }

  function findNearestArea(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const a of MAP_AREAS) {
      const dx = a.cx - x;
      const dy = a.cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  function svgPointFromEvent(e) {
    const svg = $('#yardSvg');
    if (!svg) return null;

    const clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const clientY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);

    // Convert screen coords -> SVG coords (viewBox coords)
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function handleMapTap(e) {
    const p = svgPointFromEvent(e);
    if (!p) return;

    const hit = findAreaAtPoint(p.x, p.y);
    const picked = hit || findNearestArea(p.x, p.y);
    if (picked) setMapSelection(picked);
  }

  function applyMapSelectionToLocation() {
    if (!mapSelected) return toast('場所を選択してください');
    state.wiz.location = { qr: '', name: mapSelected.name, unknown: false };
    if ($('#locationManual')) $('#locationManual').value = mapSelected.name;
    renderWizardLocation();
    saveSession({ ...state, nav: nav.stack });
    closeMapModal();
  }

function renderCompanyList() {
    const wrap = $('#companyList');
    if (!wrap) return;
    wrap.innerHTML = '';

    for (const c of master.companies) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-btn';
      btn.setAttribute('role', 'listitem');

      const emails = (c.emails || []).join(', ');
      btn.innerHTML = `${escapeHtml(c.name)}<span class="sub">${emails ? '送信先: ' + escapeHtml(emails) : ''}</span>`;
      btn.addEventListener('click', () => {
        state.companyId = c.id;
        state.personId = null;
        saveSession({ ...state, nav: nav.stack });

        // Affiliation -> staff selection (unsure flow also uses staff selection)
        renderKanaBar();
        renderPersonList('あ');
        nav.show('view-person');
      });
      wrap.appendChild(btn);
    }
  }

  function renderKanaBar() {
    const bar = $('#kanaBar');
    if (!bar) return;
    bar.innerHTML = '';

    const groups = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', '他'];
    groups.forEach((g, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kana-btn';
      b.textContent = g;
      b.addEventListener('click', () => {
        $$('#kanaBar .kana-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderPersonList(g);
      });
      if (idx === 0) b.classList.add('active');
      bar.appendChild(b);
    });
  }

  function renderPersonList(groupLabel) {
    const list = $('#personList');
    if (!list) return;
    list.innerHTML = '';

    const people = master.staff
      .filter((p) => p.companyId === state.companyId)
      .map((p) => ({ ...p, group: kanaGroupFromKana(p.kana) }))
      .filter((p) => (groupLabel ? p.group === groupLabel : true))
      .sort((a, b) => (a.kana || '').localeCompare(b.kana || '', 'ja'));

    if (people.length === 0) {
      const div = document.createElement('div');
      div.className = 'small';
      div.textContent = '該当する職員がいません（管理画面で登録してください）。';
      list.appendChild(div);
      return;
    }

    for (const p of people) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-btn';
      btn.setAttribute('role', 'listitem');
      btn.innerHTML = `${escapeHtml(p.name)}<span class="sub">よみ: ${escapeHtml(p.kana || '')}</span>`;
      btn.addEventListener('click', () => {
        state.personId = p.id;
        saveSession({ ...state, nav: nav.stack });

        const s = getSituation(state.situationId);

        // Safety: if body is required but not selected yet, ask body first
        if (s && s.requiresBody && !state.bodyPartId) {
          $('#bodyTitle').textContent = s.label;
          nav.show('view-body');
          return;
        }

        if (state.mode === 'emergency') {
          showEmergencyCallView();
          return;
        }

        // unsure flow -> result + (existing) mail preview
        buildResultPreview();
        nav.show('view-result');
      });
      list.appendChild(btn);
    }
  }

  function renderBodyPartsHandlers() {
    $$('#bodySvg .body-part').forEach((el) => {
      el.addEventListener('click', () => {
        $$('#bodySvg .body-part').forEach((p) => p.classList.remove('selected'));
        el.classList.add('selected');
        state.bodyPartId = el.getAttribute('data-part');
        const bp = getBodyPart(state.bodyPartId);
        $('#bodySelectedLabel').textContent = bp ? bp.label : '選択中';
        $('#btnBodyNext').disabled = !state.bodyPartId;
        saveSession({ ...state, nav: nav.stack });
      });
    });
  }

  /** =========================
   *  Result / mail preview
   *  ========================= */
  function interpolate(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  }

  function buildRecipientsForAction(action) {
    const s = getSituation(state.situationId);
    const c = getCompany(state.companyId);

    const scope = master.sendScope || { safetyHQ: true, rescueTeam: true, ambulanceCenter: true, companyEmails: true };

    const groups = action === 'emergency' ? (s?.includeEmergency || []) : (s?.includeObserve || []);
    const to = [];

    // global groups
    for (const g of groups) {
      if (g === 'safetyHQ' && scope.safetyHQ && master.globalContacts.safetyHQ) to.push(master.globalContacts.safetyHQ);
      if (g === 'rescueTeam' && scope.rescueTeam && master.globalContacts.rescueTeam) to.push(master.globalContacts.rescueTeam);
      if (g === 'ambulanceCenter' && scope.ambulanceCenter && master.globalContacts.ambulanceCenter) to.push(master.globalContacts.ambulanceCenter);
    }

    // company contacts
    if (scope.companyEmails && c && c.emails) to.push(...c.emails);

    // de-dup
    return Array.from(new Set(to.filter(Boolean)));
  }

  function showEmergencyCallView() {
    // Emergency mode: auto "request" (demo) + mail launch button only (no preview UI)
    state.action = 'emergency';
    state.preview = buildMail('emergency');

    nav.show('view-emergency');
    saveSession({ ...state, nav: nav.stack });

    // Demo feedback
    toast('（デモ）救急要請を開始しました');
  }


  function buildMail(action) {
    const s = getSituation(state.situationId);
    const c = getCompany(state.companyId);
    const p = getPerson(state.personId);
    const bp = getBodyPart(state.bodyPartId);

    const time = nowIsoLocal();
    const part = bp ? bp.label : '';
    const detail = state.detailNote || '';
    const vars = {
      company: c?.name || '',
      person: p?.name || '',
      time,
      part,
      detail: detail || '（追記なし）',
    };

    const subject = interpolate(s?.subjectTpl || '[命をツナグ] 連絡', vars);
    const bodyTpl = action === 'emergency' ? s?.bodyTplEmergency : s?.bodyTplObserve;
    const body = interpolate(bodyTpl || '{person} {company} {time}', vars);

    return { to: buildRecipientsForAction(action), subject, body };
  }

  function buildResultText(action) {
    const s = getSituation(state.situationId);
    return action === 'emergency' ? s?.recommendTextEmergency : s?.recommendTextObserve;
  }

  function buildResultPreview() {
    const s = getSituation(state.situationId);
    const action = state.action || s?.defaultAction || 'observe';

    state.action = action;
    state.preview = buildMail(action);

    // Summary
    $('#sumStatus').textContent = s?.label || '-';
    $('#sumCompany').textContent = getCompany(state.companyId)?.name || '-';
    $('#sumPerson').textContent = getPerson(state.personId)?.name || '-';

    const bp = getBodyPart(state.bodyPartId);
    const detail = bp ? `${bp.label}${s?.id === 'pain' ? 'に痛み' : ''}` : '';
    const hasDetail = Boolean(detail);
    $('#sumDetailRow').style.display = hasDetail ? 'flex' : 'none';
    $('#sumDetail').textContent = hasDetail ? detail : '-';

    // Result text
    $('#resultText').textContent = buildResultText(action) || '';

    // Buttons labels/toggles
    const btnE = $('#btnActionEmergency');
    const btnO = $('#btnActionObserve');

    // In emergency mode / emergency default, keep emergency prominent but still allow observe.
    btnE.style.display = 'block';
    btnO.style.display = 'block';

    // Preview
    $('#mailToPreview').textContent = (state.preview.to || []).join(', ') || '-';
    $('#mailSubjectPreview').textContent = state.preview.subject || '-';
    $('#mailBodyPreview').textContent = state.preview.body || '-';

    saveSession({ ...state, nav: nav.stack });
  }

  async function copyPreview() {
    const text =
      `宛先: ${state.preview.to.join(', ')}\n` +
      `件名: ${state.preview.subject}\n` +
      `本文:\n${state.preview.body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('コピーしました');
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('コピーしました');
    }
  }

  function openMail() {
    const { to, subject, body } = state.preview;
    const href = mailtoLink(to, subject, body);
    // Must be user gesture; called inside click handlers
    window.location.href = href;
  }

  /** =========================
   *  Admin (password-protected)
   *  ========================= */
  const admin = {
    authed: false,
    async initGate() {
      const hasPass = Boolean(master.admin.passwordHash);
      $('#adminFirstSet').classList.toggle('hidden', hasPass);
      $('#adminLogin').classList.toggle('hidden', !hasPass);
      $('#adminGateMsg').textContent = '';
    },
    async setPass() {
      const p1 = $('#adminNewPass1').value;
      const p2 = $('#adminNewPass2').value;
      if (!p1 || p1.length < 4) return (toast('4文字以上で設定してください'), void 0);
      if (p1 !== p2) return (toast('確認が一致しません'), void 0);
      master.admin.passwordHash = await sha256Hex(p1);
      saveMaster(master);
      toast('パスワードを設定しました');
      await admin.initGate();
    },
    async login() {
      const p = $('#adminPass').value;
      if (!p) return toast('パスワードを入力してください');
      const h = await sha256Hex(p);
      if (h !== master.admin.passwordHash) {
        $('#adminGateMsg').textContent = 'パスワードが違います。';
        toast('ログイン失敗');
        return;
      }
      admin.authed = true;
      $('#adminGate').classList.add('hidden');
      $('#adminPanel').classList.remove('hidden');
      toast('ログインしました');
      renderAdminAll();
    },
    logout() {
      admin.authed = false;
      $('#adminGate').classList.remove('hidden');
      $('#adminPanel').classList.add('hidden');
      $('#adminPass').value = '';
      admin.initGate();
    },
    async changePass() {
      const oldP = $('#adminChangeOld').value;
      const n1 = $('#adminChangeNew1').value;
      const n2 = $('#adminChangeNew2').value;
      const msg = $('#adminChangeMsg');
      msg.textContent = '';

      if (!oldP || !n1 || !n2) return (msg.textContent = 'すべて入力してください');
      if (n1 !== n2) return (msg.textContent = '確認が一致しません');
      const hOld = await sha256Hex(oldP);
      if (hOld !== master.admin.passwordHash) return (msg.textContent = '現在のパスワードが違います');
      if (n1.length < 4) return (msg.textContent = '4文字以上で設定してください');

      master.admin.passwordHash = await sha256Hex(n1);
      saveMaster(master);
      msg.textContent = '変更しました';
      toast('パスワードを変更しました');
      $('#adminChangeOld').value = '';
      $('#adminChangeNew1').value = '';
      $('#adminChangeNew2').value = '';
    },
  };

  function renderAdminAll() {
    renderAdminCompanies();
    renderAdminGlobalContacts();
    renderAdminStaffSelectors();
    renderAdminStaffList();
    renderAdminLocations();
    renderAdminSituations();
  }

  function renderAdminCompanies() {
    const wrap = $('#adminCompanies');
    wrap.innerHTML = '';

    master.companies.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'admin-item';

      const emails = (c.emails || []).join(', ');
      div.innerHTML = `
        <div><strong>${escapeHtml(c.name)}</strong> <span class="small">(${escapeHtml(c.id)})</span></div>
        <div class="small">送信先: ${escapeHtml(emails)}</div>
        <div class="form-grid">
          <input data-k="name" value="${escapeHtml(c.name)}" />
          <input data-k="emails" value="${escapeHtml(emails)}" />
          <button class="btn btn-secondary" data-act="save">保存</button>
          <button class="btn btn-secondary" data-act="del">削除</button>
        </div>
      `;

      div.querySelector('[data-act="save"]').addEventListener('click', () => {
        const name = div.querySelector('input[data-k="name"]').value.trim();
        const em = normalizeEmails(div.querySelector('input[data-k="emails"]').value);
        if (!name) return toast('会社名を入力してください');
        c.name = name;
        c.emails = em;
        saveMaster(master);
        toast('保存しました');
        renderCompanyList();
        renderAdminCompanies();
      });

      div.querySelector('[data-act="del"]').addEventListener('click', () => {
        if (!confirm('削除しますか？（所属と紐づく職員がいる場合は注意）')) return;
        master.companies = master.companies.filter((x) => x.id !== c.id);
        // detach staff
        master.staff = master.staff.map((s) => (s.companyId === c.id ? { ...s, companyId: '' } : s));
        saveMaster(master);
        toast('削除しました');
        renderCompanyList();
        renderAdminAll();
      });

      wrap.appendChild(div);
    });
  }

  function renderAdminGlobalContacts() {
    $('#gcSafetyHQ').value = master.globalContacts.safetyHQ || '';
    $('#gcRescueTeam').value = master.globalContacts.rescueTeam || '';
    $('#gcAmbulance').value = master.globalContacts.ambulanceCenter || '';

    // scope checkboxes
    $('#scopeSafetyHQ').checked = !!master.sendScope?.safetyHQ;
    $('#scopeRescueTeam').checked = !!master.sendScope?.rescueTeam;
    $('#scopeAmbulance').checked = !!master.sendScope?.ambulanceCenter;
    $('#scopeCompanyEmails').checked = !!master.sendScope?.companyEmails;
  }

  function renderAdminStaffSelectors() {
    const sel1 = $('#staffCompanyFilter');
    const sel2 = $('#newStaffCompany');
    sel1.innerHTML = '';
    sel2.innerHTML = '';

    const optAll = document.createElement('option');
    optAll.value = '__all__';
    optAll.textContent = 'すべて';
    sel1.appendChild(optAll);

    master.companies.forEach((c) => {
      const o1 = document.createElement('option');
      o1.value = c.id;
      o1.textContent = c.name;
      sel1.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = c.id;
      o2.textContent = c.name;
      sel2.appendChild(o2);
    });
  }

  function renderAdminStaffList() {
    const wrap = $('#adminStaff');
    const filter = $('#staffCompanyFilter').value || '__all__';
    wrap.innerHTML = '';

    let items = master.staff.slice();
    if (filter !== '__all__') items = items.filter((s) => s.companyId === filter);

    if (items.length === 0) {
      const d = document.createElement('div');
      d.className = 'small';
      d.textContent = '職員が未登録です。';
      wrap.appendChild(d);
      return;
    }

    items
      .slice()
      .sort((a, b) => (a.kana || '').localeCompare(b.kana || '', 'ja'))
      .forEach((s) => {
        const div = document.createElement('div');
        div.className = 'admin-item';

        const companyName = getCompany(s.companyId)?.name || '（未設定）';
        div.innerHTML = `
          <div><strong>${escapeHtml(s.name)}</strong> <span class="small">(${escapeHtml(companyName)})</span></div>
          <div class="small">よみ: ${escapeHtml(s.kana || '')} / グループ: ${escapeHtml(kanaGroupFromKana(s.kana))}</div>
          <div class="form-grid">
            <select data-k="company"></select>
            <input data-k="name" value="${escapeHtml(s.name)}" />
            <input data-k="kana" value="${escapeHtml(s.kana || '')}" />
            <input data-k="qr" value="${escapeHtml(s.qr || '')}" placeholder="ヘルメットQR（任意）" />
            <button class="btn btn-secondary" data-act="save">保存</button>
            <button class="btn btn-secondary" data-act="del">削除</button>
          </div>
        `;

        const sel = div.querySelector('select[data-k="company"]');
        master.companies.forEach((c) => {
          const o = document.createElement('option');
          o.value = c.id;
          o.textContent = c.name;
          if (c.id === s.companyId) o.selected = true;
          sel.appendChild(o);
        });

        div.querySelector('[data-act="save"]').addEventListener('click', () => {
          const name = div.querySelector('input[data-k="name"]').value.trim();
          const kana = div.querySelector('input[data-k="kana"]').value.trim();
          const qr = div.querySelector('input[data-k="qr"]').value.trim();
          const companyId = div.querySelector('select[data-k="company"]').value;
          if (!name) return toast('氏名を入力してください');
          if (!kana) return toast('よみ（かな）を入力してください');
          s.name = name;
          s.kana = kana;
          s.qr = qr;
          s.companyId = companyId;
          saveMaster(master);
          toast('保存しました');
          renderAdminStaffList();
        });

        div.querySelector('[data-act="del"]').addEventListener('click', () => {
          if (!confirm('削除しますか？')) return;
          master.staff = master.staff.filter((x) => x.id !== s.id);
          saveMaster(master);
          toast('削除しました');
          renderAdminStaffList();
        });

        wrap.appendChild(div);
      });
  }

  function renderAdminLocations() {
    const wrap = $('#adminLocations');
    if (!wrap) return;
    wrap.innerHTML = '';

    const items = (master.locations || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
    if (items.length === 0) {
      const d = document.createElement('div');
      d.className = 'small';
      d.textContent = '場所が未登録です。';
      wrap.appendChild(d);
      return;
    }

    items.forEach((loc) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      div.innerHTML = `
        <div><strong>${escapeHtml(loc.name || '')}</strong> <span class="small">(${escapeHtml(loc.id || '')})</span></div>
        <div class="small">QR文字列: ${escapeHtml(loc.qr || '')}</div>
        <div class="form-grid">
          <input data-k="name" value="${escapeHtml(loc.name || '')}" placeholder="場所名" />
          <input data-k="qr" value="${escapeHtml(loc.qr || '')}" placeholder="LOC-XXX" />
          <button class="btn btn-secondary" data-act="save">保存</button>
          <button class="btn btn-secondary" data-act="del">削除</button>
        </div>
      `;

      div.querySelector('[data-act="save"]').addEventListener('click', () => {
        const name = div.querySelector('input[data-k="name"]').value.trim();
        const qr = div.querySelector('input[data-k="qr"]').value.trim();
        if (!name) return toast('場所名を入力してください');
        if (!qr) return toast('QR文字列を入力してください');
        loc.name = name;
        loc.qr = qr;
        saveMaster(master);
        toast('保存しました');
        renderAdminLocations();
      });

      div.querySelector('[data-act="del"]').addEventListener('click', () => {
        if (!confirm('削除しますか？')) return;
        master.locations = (master.locations || []).filter((x) => x.id !== loc.id);
        saveMaster(master);
        toast('削除しました');
        renderAdminLocations();
      });

      wrap.appendChild(div);
    });
  }

  function renderAdminSituations() {
    const wrap = $('#adminSituations');
    wrap.innerHTML = '';

    master.situations.forEach((s) => {
      const div = document.createElement('div');
      div.className = 'admin-item';

      const includeE = (s.includeEmergency || []).join(', ');
      const includeO = (s.includeObserve || []).join(', ');

      div.innerHTML = `
        <div><strong>${escapeHtml(s.label)}</strong> <span class="small">(${escapeHtml(s.id)})</span></div>
        <div class="small">推奨: ${escapeHtml(s.defaultAction === 'emergency' ? '緊急' : '様子見')}</div>

        <div class="form-grid">
          <select data-k="defaultAction">
            <option value="emergency">緊急</option>
            <option value="observe">様子見</option>
          </select>
          <label class="field" style="grid-column: span 2;">
            <span>部位選択を使う</span>
            <select data-k="requiresBody">
              <option value="false">いいえ</option>
              <option value="true">はい</option>
            </select>
          </label>
        </div>

        <div class="form-col">
          <label class="field">
            <span>緊急：含める部署（safetyHQ,rescueTeam,ambulanceCenter をカンマ区切り）</span>
            <input data-k="includeEmergency" value="${escapeHtml(includeE)}" />
          </label>
          <label class="field">
            <span>様子見：含める部署（同上）</span>
            <input data-k="includeObserve" value="${escapeHtml(includeO)}" />
          </label>

          <label class="field">
            <span>表示文（緊急）</span>
            <textarea data-k="recommendTextEmergency">${escapeHtml(s.recommendTextEmergency || '')}</textarea>
          </label>
          <label class="field">
            <span>表示文（様子見）</span>
            <textarea data-k="recommendTextObserve">${escapeHtml(s.recommendTextObserve || '')}</textarea>
          </label>

          <label class="field">
            <span>件名テンプレ（例: [命をツナグ] {company} {person} - ...）</span>
            <input data-k="subjectTpl" value="${escapeHtml(s.subjectTpl || '')}" />
          </label>

          <label class="field">
            <span>本文テンプレ（緊急）</span>
            <textarea data-k="bodyTplEmergency">${escapeHtml(s.bodyTplEmergency || '')}</textarea>
          </label>

          <label class="field">
            <span>本文テンプレ（様子見）</span>
            <textarea data-k="bodyTplObserve">${escapeHtml(s.bodyTplObserve || '')}</textarea>
          </label>

          <button class="btn btn-primary" data-act="save">保存</button>
        </div>
      `;

      div.querySelector('select[data-k="defaultAction"]').value = s.defaultAction;
      div.querySelector('select[data-k="requiresBody"]').value = String(!!s.requiresBody);

      div.querySelector('[data-act="save"]').addEventListener('click', () => {
        s.defaultAction = div.querySelector('select[data-k="defaultAction"]').value;
        s.requiresBody = div.querySelector('select[data-k="requiresBody"]').value === 'true';

        s.includeEmergency = normalizeEmails(div.querySelector('input[data-k="includeEmergency"]').value).map((x) => x);
        // normalizeEmails splits by comma; here we want raw tokens, so do manual:
        s.includeEmergency = String(div.querySelector('input[data-k="includeEmergency"]').value)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

        s.includeObserve = String(div.querySelector('input[data-k="includeObserve"]').value)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

        s.recommendTextEmergency = div.querySelector('textarea[data-k="recommendTextEmergency"]').value.trim();
        s.recommendTextObserve = div.querySelector('textarea[data-k="recommendTextObserve"]').value.trim();
        s.subjectTpl = div.querySelector('input[data-k="subjectTpl"]').value.trim();
        s.bodyTplEmergency = div.querySelector('textarea[data-k="bodyTplEmergency"]').value.replace(/\r\n/g, '\n');
        s.bodyTplObserve = div.querySelector('textarea[data-k="bodyTplObserve"]').value.replace(/\r\n/g, '\n');

        saveMaster(master);
        toast('保存しました');
      });

      wrap.appendChild(div);
    });
  }

  /** =========================
   *  Wire events
   *  ========================= */
  function wireGlobalEvents() {
    const back = $('#btnBack');
    if (back) back.addEventListener('click', () => nav.back());
    const restart = $('#btnRestartGlobal');
    if (restart) restart.addEventListener('click', () => nav.restartAll());

    const startEm = $('#btnStartEmergency');
    if (startEm) startEm.addEventListener('click', () => {
      state.mode = 'emergency';
      resetFlow();
      state.wiz.startedAt = nowIsoLocal();
      goWizardStep('triage');
      saveSession({ ...state, nav: nav.stack });
    });

    $('#btnBodyNext').addEventListener('click', () => {
      if (!state.bodyPartId) return;

      // If company/person are already chosen, proceed to the final screen
      if (state.companyId && state.personId) {
        if (state.mode === 'emergency') {
          showEmergencyCallView();
        } else {
          buildResultPreview();
          nav.show('view-result');
        }
        return;
      }

      // Otherwise continue the normal flow (body -> affiliation)
      renderCompanyList();
      nav.show('view-company');
    });

    $('#btnActionEmergency').addEventListener('click', () => {
      state.action = 'emergency';
      buildResultPreview();
    });
    $('#btnActionObserve').addEventListener('click', () => {
      state.action = 'observe';
      buildResultPreview();
    });

    $('#btnOpenMail').addEventListener('click', () => openMail());
    $('#btnOpenMailEmergency')?.addEventListener('click', () => openMail());
    $('#btnCopyMail').addEventListener('click', () => copyPreview());

    // Admin entry
    $('#btnAdmin').addEventListener('click', async () => {
      await admin.initGate();
      $('#adminPanel').classList.add('hidden');
      $('#adminGate').classList.remove('hidden');
      admin.authed = false;
      nav.show('view-admin');
    });

    // Admin gate
    $('#btnAdminSetPass').addEventListener('click', () => admin.setPass());
    $('#btnAdminLogin').addEventListener('click', () => admin.login());
    $('#btnAdminChangePass').addEventListener('click', () => admin.changePass());

    // Admin tabs
    $$('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        $$('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const key = t.getAttribute('data-tab');

        $$('.admin-tab').forEach((p) => p.classList.remove('active'));
        const panel = document.querySelector(`[data-tab-panel="${key}"]`);
        if (panel) panel.classList.add('active');
      });
    });

    // Admin: add company
    $('#btnAddCompany').addEventListener('click', () => {
      const name = $('#newCompanyName').value.trim();
      const emails = normalizeEmails($('#newCompanyEmails').value);
      if (!name) return toast('会社名を入力してください');

      const id = name === '自社' ? 'own' : uuid().slice(0, 8);
      master.companies.push({ id, name, emails });
      saveMaster(master);

      $('#newCompanyName').value = '';
      $('#newCompanyEmails').value = '';
      toast('追加しました');
      renderCompanyList();
      renderAdminAll();
    });

    // Admin: save global contacts
    $('#btnSaveGlobalContacts').addEventListener('click', () => {
      master.globalContacts.safetyHQ = $('#gcSafetyHQ').value.trim();
      master.globalContacts.rescueTeam = $('#gcRescueTeam').value.trim();
      master.globalContacts.ambulanceCenter = $('#gcAmbulance').value.trim();

      master.sendScope = {
        safetyHQ: $('#scopeSafetyHQ').checked,
        rescueTeam: $('#scopeRescueTeam').checked,
        ambulanceCenter: $('#scopeAmbulance').checked,
        companyEmails: $('#scopeCompanyEmails').checked,
      };
      saveMaster(master);
      toast('保存しました');
    });

    // Admin: staff list filter
    $('#btnStaffFilter').addEventListener('click', () => renderAdminStaffList());

    // Admin: add staff
    $('#btnAddStaff').addEventListener('click', () => {
      const companyId = $('#newStaffCompany').value;
      const name = $('#newStaffName').value.trim();
      const kana = $('#newStaffKana').value.trim();
      const qr = ($('#newStaffQr')?.value || '').trim();
      if (!companyId) return toast('会社を選択してください');
      if (!name) return toast('氏名を入力してください');
      if (!kana) return toast('よみ（かな）を入力してください');

      master.staff.push({ id: uuid(), companyId, name, kana, qr });
      saveMaster(master);

      $('#newStaffName').value = '';
      $('#newStaffKana').value = '';
      if ($('#newStaffQr')) $('#newStaffQr').value = '';
      toast('追加しました');
      renderAdminStaffList();
    });

    // Admin: add location
    $('#btnAddLoc')?.addEventListener('click', () => {
      const name = ($('#newLocName')?.value || '').trim();
      const qr = ($('#newLocQr')?.value || '').trim();
      if (!name) return toast('場所名を入力してください');
      if (!qr) return toast('場所QR（文字列）を入力してください');

      if (!Array.isArray(master.locations)) master.locations = [];
      master.locations.push({ id: uuid(), name, qr });
      saveMaster(master);

      $('#newLocName').value = '';
      $('#newLocQr').value = '';
      toast('追加しました');
      renderAdminLocations();
    });

    // Admin: Export JSON
    $('#btnExportJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(master, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inochi_master.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('JSONを書き出しました');
    });

    /** ===== Guided emergency flow events ===== */
    // Stepper navigation
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.step-btn');
      if (!btn) return;
      const step = btn.dataset.step;
      if (!step) return;
      goWizardStep(step);
      saveSession({ ...state, nav: nav.stack });
    });

    // Segmented selections (triage)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      let field = btn.dataset.field;
      const val = btn.dataset.val;
      if (!field) {
        const seg = btn.closest('.seg');
        const sid = seg?.id || '';
        if (sid === 'segConscious') field = 'conscious';
        else if (sid === 'segBreathing') field = 'breathing';
      }
      if (!field || !val) return;
      if (!state.wiz?.triage) state.wiz = defaultWizardState();
      state.wiz.triage[field] = val;
      renderWizardTriage();
      saveSession({ ...state, nav: nav.stack });
    });

    // Triage actions
    $('#btnTriageNext')?.addEventListener('click', () => goWizardStep('location'));
    $('#btnQuickToReview1')?.addEventListener('click', () => goWizardStep('review'));
    $('#btnTriageQuickShare')?.addEventListener('click', () => goWizardStep('review'));
    // Location actions
    $('#btnScanLocation')?.addEventListener('click', () => openQrModal('location'));
    $('#btnMapSelect')?.addEventListener('click', () => openMapModal());
    $('#btnLocationNext')?.addEventListener('click', () => goWizardStep('accident'));
    $('#btnQuickToReview2')?.addEventListener('click', () => goWizardStep('review'));

    // Map modal events
    $('#btnMapClose')?.addEventListener('click', () => closeMapModal());
    $('#btnMapCancel')?.addEventListener('click', () => closeMapModal());
    $('#btnMapUse')?.addEventListener('click', () => applyMapSelectionToLocation());
    $('#mapSearch')?.addEventListener('input', (e) => renderMapList(e.target.value || ''));
    $('#btnMapClear')?.addEventListener('click', () => clearMapSelection());
    // Zone buttons
    $$('#mapModal .zone-btn').forEach((b) => b.addEventListener('click', () => setMapView(b.dataset.zone || 'all')));

    // Tap/click can be on SVG overlay or the image itself
    $('#yardSvg')?.addEventListener('click', (e) => handleMapTap(e));
    $('#yardSvg')?.addEventListener('touchstart', (e) => handleMapTap(e), { passive: true });
    $('#mapModal')?.addEventListener('click', (e) => {
      if (e.target === $('#mapModal')) closeMapModal();
    });

    $('#btnLocationUnknown')?.addEventListener('click', () => {
      state.wiz.location = { qr: '', name: '不明', unknown: true };
      if ($('#locationManual')) $('#locationManual').value = '';
      renderWizardLocation();
      saveSession({ ...state, nav: nav.stack });
    });

    $('#btnLocationSetManual')?.addEventListener('click', () => {
      const v = ($('#locationManual')?.value || '').trim();
      if (!v) return toast('場所名を入力してください');
      state.wiz.location = { qr: state.wiz.location.qr || '', name: v, unknown: false };
      renderWizardLocation();
      saveSession({ ...state, nav: nav.stack });
    });

    $('#locationManual')?.addEventListener('input', (e) => {
      const v = (e.target.value || '').trim();
      if (!state.wiz.location) state.wiz.location = { qr: '', name: '', unknown: true };
      if (v) {
        state.wiz.location.name = v;
        state.wiz.location.unknown = false;
      }
      renderWizardLocation();
      saveSession({ ...state, nav: nav.stack });
    });

    $('#locationList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.list-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      const loc = (master.locations || []).find((x) => x.id === id);
      if (!loc) return;
      state.wiz.location = { qr: loc.qr || '', name: loc.name || '', unknown: false };
      if ($('#locationManual')) $('#locationManual').value = state.wiz.location.name || '';
      renderWizardLocation();
      saveSession({ ...state, nav: nav.stack });
    });

    // Accident actions
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (!document.getElementById(WIZ.accident)?.classList.contains('active')) return;
      const t = chip.dataset.acc;
      if (!t) return;
      const arr = state.wiz.accident.types;
      const idx = arr.indexOf(t);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(t);
      renderWizardAccident();
      saveSession({ ...state, nav: nav.stack });
    });
    $('#btnAccidentNone')?.addEventListener('click', () => {
      state.wiz.accident.types = [];
      renderWizardAccident();
      saveSession({ ...state, nav: nav.stack });
    });
    $('#accidentNote')?.addEventListener('input', (e) => {
      state.wiz.accident.note = e.target.value || '';
      saveSession({ ...state, nav: nav.stack });
    });
    $('#btnAccidentNext')?.addEventListener('click', () => goWizardStep('victim'));
    $('#btnQuickToReview3')?.addEventListener('click', () => goWizardStep('review'));

    // Victim actions
    $('#btnScanVictim')?.addEventListener('click', () => openQrModal('victim'));
    $('#btnVictimNext')?.addEventListener('click', () => goWizardStep('review'));
    $('#btnQuickToReview4')?.addEventListener('click', () => goWizardStep('review'));
    $('#btnVictimUnknown')?.addEventListener('click', () => {
      state.wiz.victim = { staffId: null, name: '', unknown: true, qr: '' };
      $('#victimSearch').value = '';
      renderWizardVictim();
      saveSession({ ...state, nav: nav.stack });
    });
    $('#victimSearch')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim();
      renderVictimSearchList(q);
    });
    $('#victimList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.list-btn');
      if (!btn) return;
      const staffId = btn.dataset.staff;
      if (!staffId) return;
      const p = getPerson(staffId);
      if (!p) return;
      state.wiz.victim = { staffId: p.id, name: p.name, unknown: false, qr: p.qr || '' };
      $('#victimSelected').textContent = p.name;
      $('#victimSearch').value = '';
      renderWizardVictim();
      saveSession({ ...state, nav: nav.stack });
    });

    // Review actions
    $('#btnWizardCopy')?.addEventListener('click', () => {
      state.preview = buildWizardPreview();
      copyPreview();
      saveSession({ ...state, nav: nav.stack });
    });
    $('#btnWizardOpenMail')?.addEventListener('click', () => {
      state.preview = buildWizardPreview();
      openMail();
      saveSession({ ...state, nav: nav.stack });
    });

    // QR modal controls
    $('#btnQrClose')?.addEventListener('click', closeQrModal);
    $('#btnQrCancel')?.addEventListener('click', closeQrModal);
    $('#qrModal')?.addEventListener('click', (e) => {
      if (e.target?.id === 'qrModal') closeQrModal();
    });

    // Esc キーでも閉じられるように（PC/キーボード利用時）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const m = $('#qrModal');
      if (m && !m.classList.contains('hidden')) closeQrModal();
    });
    $('#btnQrUseManual')?.addEventListener('click', () => {
      const v = ($('#qrManual')?.value || '').trim();
      if (!v) return toast('QR文字列を入力してください');
      handleQrValue(v);
    });

    // QR modal: photo fallback
    $('#btnQrPhoto')?.addEventListener('click', () => {
      const f = $('#qrFile');
      if (f) f.click();
    });
    $('#qrFile')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setQrStatus('画像を解析中…');
      const raw = await decodeQrFromFile(file);
      if (raw) {
        handleQrValue(raw);
      } else {
        setQrStatus('画像からQRを読み取れませんでした。別の角度で撮影するか、貼り付けをご利用ください。');
      }
      e.target.value = '';
    });

    // Admin: Import JSON
    $('#importJson').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!imported || typeof imported !== 'object') throw new Error('invalid');
        // Keep backward/forward compatibility by loading through merger
        localStorage.setItem(MASTER_KEY, JSON.stringify(imported));
        master = loadMaster();
        toast('読み込みました');
        $('#adminIoMsg').textContent = '読み込みました。画面を更新しました。';
        renderAdminAll();
        renderStatusGrid();
        renderCompanyList();
      } catch (err) {
        console.error(err);
        $('#adminIoMsg').textContent = '読み込みに失敗しました。JSON形式を確認してください。';
        toast('読み込み失敗');
      } finally {
        e.target.value = '';
      }
    });
  }

  /** =========================
   *  Boot
   *  ========================= */
  function restoreIfPossible() {
    const ses = loadSession();
    if (!ses) return;

    // Restore selection state only (do not auto-open deep screens)
    state.mode = 'emergency';
    state.situationId = ses.situationId || null;
    state.companyId = ses.companyId || null;
    state.personId = ses.personId || null;
    state.bodyPartId = ses.bodyPartId || null;
    state.action = ses.action || null;
    state.detailNote = ses.detailNote || '';
    state.preview = ses.preview || state.preview;
    state.wiz = ses.wiz ? { ...defaultWizardState(), ...ses.wiz } : state.wiz;

    // Restore nav stack if valid
    if (Array.isArray(ses.nav) && ses.nav.length) {
      nav.stack = ses.nav.filter((id) => typeof id === 'string' && document.getElementById(id));
      if (!nav.stack.length) nav.stack = ['view-home'];
    }

    // If in body view, restore selection highlight
    if (state.bodyPartId) {
      const el = document.querySelector(`#bodySvg .body-part[data-part="${state.bodyPartId}"]`);
      if (el) {
        el.classList.add('selected');
        const bp = getBodyPart(state.bodyPartId);
        $('#bodySelectedLabel').textContent = bp ? bp.label : '選択中';
        $('#btnBodyNext').disabled = false;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      // init
    renderStatusGrid();
    renderCompanyList();
    renderBodyPartsHandlers();
    wireGlobalEvents();
    restoreIfPossible();

    // Start on home always (safer), but keep session state
    nav.show('view-home', { push: false });
    nav.stack = ['view-home'];
    saveSession({ ...state, nav: nav.stack });

    // If first time, show admin set screen on admin view when opened
    admin.initGate();
    } catch (e) {
      console.error(e);
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = 'エラーが発生しました。管理→設定の見直し、またはファイルの再配布をご確認ください。';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 4000);
      }
    }
  });
})();
