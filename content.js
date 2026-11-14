/* ============================================================
   Chess Test Net — Content Script for chess.com (FULL)
   Works directly on chess.com: reads the live board, detects
   colors & time control, reads your Elo, and plays human-like
   stealth moves via click simulation. Never engine-perfect.
   ============================================================ */

(function() {
  'use strict';

  if (window.chessTestNetInjected) return;
  window.chessTestNetInjected = true;

  // ============================================================
  // 1. INJECT ENGINE SCRIPTS INTO PAGE (shared global scope)
  // ============================================================
  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(src);
      s.onload = resolve;
      s.onerror = reject;
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // ============================================================
  // 2. STATE
  // ============================================================
  const STATE = {
    engine: null,
    ai: null,
    antiCheat: null,
    eloSys: null,
    color: null,            // 'w' or 'b' — our color (user sets via panel)
    timeControl: 'blitz',   // detected
    humanElo: 1200,         // detected user elo (fallback)
    boardEl: null,
    ourTurn: false,
    lastFen: null,
    enabled: false,
    autoMove: false,
    timer: null,
    moveCount: 0,
    gameActive: false,
    lastSan: null,
  };

  // ============================================================
  // 3. UI PANEL (glassmorphism, matches extension style)
  // ============================================================
  let panel = null;

  function createPanel() {
    if (document.getElementById('ctn-panel')) return;
    panel = document.createElement('div');
    panel.id = 'ctn-panel';
    panel.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 2147483647;
      width: 300px;
      background: rgba(15, 18, 26, 0.88);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      padding: 18px;
      color: #e2e8f0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);
      font-size: 13px;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: ctnSlideIn 0.4s cubic-bezier(0.16,1,0.3,1);
    `;

    panel.innerHTML = `
      <style>
        @keyframes ctnSlideIn { from { opacity:0; transform: translateY(-20px);} to { opacity:1; transform: translateY(0);} }
        .ctn-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .ctn-label { font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
        .ctn-toggle { position:relative; width:44px; height:24px; background:rgba(255,255,255,0.08); border-radius:12px; border:none; outline:none; cursor:pointer; transition:all 0.2s; }
        .ctn-toggle::after { content:''; position:absolute; top:2px; left:2px; width:20px; height:20px; background:#fff; border-radius:50%; transition:transform 0.2s; }
        .ctn-toggle.active { background:#6366f1; box-shadow:0 0 16px rgba(99,102,241,0.4); }
        .ctn-toggle.active::after { transform:translateX(20px); }
        .ctn-btn { width:100%; padding:10px; border-radius:10px; border:none; color:#fff; font-weight:700; font-size:13px; cursor:pointer; transition:all 0.2s; }
        .ctn-btn.primary { background:#6366f1; box-shadow:0 0 20px rgba(99,102,241,0.35); }
        .ctn-btn.primary.on { background:#ef4444; box-shadow:0 0 20px rgba(239,68,68,0.35); }
        .ctn-btn.secondary { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); }
        .ctn-strength { display:flex; gap:4px; }
        .ctn-strength-btn { flex:1; padding:6px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:#cbd5e1; font-size:11px; cursor:pointer; }
        .ctn-strength-btn.active { background:#6366f1; border-color:#6366f1; color:#fff; }
        .ctn-range { width:100%; accent-color:#6366f1; cursor:pointer; }
        .ctn-status { margin-top:6px; padding:8px; border-radius:8px; background:rgba(255,255,255,0.04); font-size:11px; color:#94a3b8; border:1px solid rgba(255,255,255,0.06); }
        .ctn-status.healthy { color:#22c55e; border-color:rgba(34,197,94,0.2); }
        .ctn-status.warn { color:#f59e0b; border-color:rgba(245,158,11,0.2); }
        .ctn-status.bad { color:#ef4444; border-color:rgba(239,68,68,0.2); }
        .ctn-close { margin-top:4px; width:100%; padding:8px; border-radius:8px; border:none; background:rgba(255,255,255,0.05); color:#94a3b8; font-size:11px; cursor:pointer; }
        .ctn-hint { font-size:10px; color:#64748b; margin-top:4px; line-height:1.4; }
      </style>

      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#22d3ee);display:grid;place-items:center;font-size:16px;">♟</div>
        <div style="font-weight:800;font-size:15px;letter-spacing:-0.5px;">Chess Test Net</div>
      </div>

      <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">Auto-move on chess.com</div>
      <div style="border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;"></div>

      <div class="ctn-row">
        <span class="ctn-label">Auto-move</span>
        <button class="ctn-toggle" id="ctn-toggle"></button>
      </div>
      <button class="ctn-btn primary" id="ctn-btn-auto">▶ Enable Auto-Move</button>

      <div class="ctn-strength">
        <button class="ctn-strength-btn" id="ctn-weak">Weak</button>
        <button class="ctn-strength-btn active" id="ctn-med">Medium</button>
        <button class="ctn-strength-btn" id="ctn-strong">Strong</button>
      </div>

      <div class="ctn-row">
        <span class="ctn-label">Your color</span>
        <button class="ctn-btn secondary" id="ctn-color" style="flex:1;padding:6px;font-size:11px;">White</button>
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
        <input type="checkbox" id="ctn-humanize" checked style="accent-color:#6366f1; width:16px;height:16px; cursor:pointer;">
        <span style="flex:1;">Humanize (mistakes + timing)</span>
      </label>

      <div style="display:flex;gap:8px;margin:8px 0;">
        <div style="flex:1;">
          <div class="ctn-label">Min time (s)</div>
          <input class="ctn-range" id="ctn-min-time" type="range" min="1" max="8" step="0.5" value="2">
        </div>
        <div style="flex:1;">
          <div class="ctn-label">Max time (s)</div>
          <input class="ctn-range" id="ctn-max-time" type="range" min="2" max="20" step="0.5" value="8">
        </div>
      </div>

      <div class="ctn-status healthy" id="ctn-status">Status: Ready</div>
      <div class="ctn-hint" id="ctn-hint">Detecting game...</div>

      <button class="ctn-close" id="ctn-close">Close panel</button>
    `;

    document.body.appendChild(panel);
  }

  function setStatus(msg, kind = 'healthy') {
    const el = document.getElementById('ctn-status');
    if (el) { el.textContent = 'Status: ' + msg; el.className = 'ctn-status ' + kind; }
  }
  function setHint(msg) {
    const el = document.getElementById('ctn-hint');
    if (el) el.textContent = msg;
  }

  // ============================================================
  // 4. CHESS.COM DOM HELPERS
  // ============================================================

  // Map algebraic square -> our board index (rank 8 = 0)
  function sqToIdx(san) {
    if (!san || san.length < 2) return -1;
    const f = san.charCodeAt(0) - 97;
    const r = parseInt(san[1], 10);
    if (f < 0 || f > 7 || r < 1 || r > 8 || isNaN(r)) return -1;
    return (8 - r) * 8 + f;
  }
  function idxToSan(i) {
    return String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1);
  }

  // Read piece from a chess.com square element
  function readPieceFromSquare(el) {
    if (!el) return null;
    // Try custom <chess-piece> element with piece attribute
    const cp = el.querySelector('chess-piece') || el.querySelector('[piece]');
    if (cp) {
      const piece = cp.getAttribute('piece') || cp.getAttribute('data-piece') || '';
      if (piece) {
        const isWhite = cp.classList.contains('white') || piece === piece.toUpperCase() || !piece.startsWith('b');
        return isWhite ? piece.toUpperCase() : piece.toLowerCase();
      }
    }
    // Try img src
    const img = el.querySelector('img');
    if (img) {
      const src = img.getAttribute('src') || '';
      const lower = src.toLowerCase();
      let type = 'p';
      for (const t of ['q','r','b','n','k','p']) {
        if (lower.includes(t)) { type = t; break; }
      }
      const isWhite = lower.includes('white') || lower.includes('w_') || !lower.includes('black');
      return isWhite ? type.toUpperCase() : type;
    }
    // Try text content (unicode piece)
    const text = el.textContent.trim();
    const unicodeMap = { '♔':'K','♕':'Q','♖':'R','♗':'B','♘':'N','♙':'P','♚':'k','♛':'q','♜':'r','♝':'b','♞':'n','♟':'p' };
    if (unicodeMap[text]) return unicodeMap[text];
    // Try class names
    const cls = el.className || '';
    const cLower = cls.toLowerCase();
    let type = 'p';
    for (const t of ['queen','rook','bishop','knight','king','pawn']) {
      if (cLower.includes(t)) { type = t[0]; break; }
    }
    const isWhite = cLower.includes('white') || cLower.includes('-w') || !cLower.includes('black');
    return isWhite ? type.toUpperCase() : type;
  }

  // Read the full board from chess.com DOM
  function readBoardFromDOM() {
    const squares = document.querySelectorAll('[data-square]');
    if (!squares || squares.length === 0) return null;

    const board = [];
    for (let i = 0; i < 64; i++) board[i] = '.';

    let foundAny = false;
    squares.forEach(el => {
      const san = el.getAttribute('data-square');
      const idx = sqToIdx(san);
      if (idx === -1) return;
      const piece = readPieceFromSquare(el);
      if (piece && piece !== '.') {
        board[idx] = piece;
        foundAny = true;
      }
    });

    if (!foundAny) return null;
    return board;
  }

  // Find square element by algebraic name
  function squareEl(san) {
    return document.querySelector('[data-square="' + san + '"]');
  }

  // ============================================================
  // 5. TIME CONTROL & ELO DETECTION
  // ============================================================

  function detectTimeControl() {
    // Look for clock elements or time control text
    const text = document.body.innerText || '';
    // Patterns: "3+0", "5|0", "10+5", "Bullet", "Blitz", "Rapid"
    const m = text.match(/\b(\d+)\s*[\+|\s]\s*(\d+)\b/);
    if (m) {
      const base = parseInt(m[1], 10);
      const inc = parseInt(m[2], 10);
      const total = base + inc;
      if (total <= 3) return 'bullet';
      if (total <= 10) return 'blitz';
      if (total <= 30) return 'rapid';
      return 'classical';
    }
    if (/bullet/i.test(text)) return 'bullet';
    if (/blitz/i.test(text)) return 'blitz';
    if (/rapid/i.test(text)) return 'rapid';
    if (/classical/i.test(text)) return 'classical';
    return 'blitz';
  }

  function detectHumanElo() {
    // Best-effort: scan for rating near user's name in game header
    const text = document.body.innerText || '';
    // Look for 3-4 digit numbers that could be ratings
    const ratings = [];
    const matches = text.match(/\b(\d{3,4})\b/g);
    if (matches) {
      for (const m of matches) {
        const n = parseInt(m, 10);
        if (n >= 400 && n <= 3000) ratings.push(n);
      }
    }
    if (ratings.length) {
      // Return the most common / median-ish
      ratings.sort((a,b) => a - b);
      return ratings[Math.floor(ratings.length / 2)];
    }
    return 1200;
  }

  function mapEloToStrength(elo) {
    if (elo < 900) return 'weak';
    if (elo < 1300) return 'weak';
    if (elo < 1700) return 'medium';
    if (elo < 2100) return 'strong';
    return 'master';
  }

  function mapEloToMistakeFreq(elo) {
    if (elo < 1000) return 0.50;
    if (elo < 1400) return 0.30;
    if (elo < 1800) return 0.18;
    if (elo < 2200) return 0.10;
    return 0.05;
  }

  // ============================================================
  // 6. MOVE EXECUTION (click simulation on chess.com)
  // ============================================================

  async function clickSquare(san) {
    const el = squareEl(san);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    await new Promise(r => setTimeout(r, 60 + Math.random() * 60));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    await new Promise(r => setTimeout(r, 40 + Math.random() * 40));
    el.dispatchEvent(new MouseEvent('click', opts));
    return true;
  }

  async function makeMoveOnChessDotCom(move) {
    const fromSan = idxToSan(move.from);
    const toSan = idxToSan(move.to);
    await clickSquare(fromSan);
    await new Promise(r => setTimeout(r, 150 + Math.random() * 150));
    await clickSquare(toSan);
    STATE.lastSan = fromSan + toSan + (move.promotion || '');
  }

  // ============================================================
  // 7. AI MOVE LOOP (human-like, stealthy)
  // ============================================================

  function computeDelay() {
    const minMs = STATE.ai.minTime;
    const maxMs = STATE.ai.maxTime;
    let d = minMs + Math.random() * (maxMs - minMs);

    // Time control adjustments
    if (STATE.timeControl === 'bullet') d *= 0.35;
    else if (STATE.timeControl === 'blitz') d *= 0.6;
    else if (STATE.timeControl === 'rapid') d *= 0.85;

    // Human jitter
    if (Math.random() < 0.10) d *= 0.25;   // instant
    if (Math.random() < 0.12) d *= 2.2;    // deep think
    return Math.round(d);
  }

  function scheduleAIMove() {
    if (!STATE.autoMove || !STATE.ourTurn || STATE.gameActive === false) return;
    if (STATE.engine.isGameOver()) return;

    const legal = STATE.engine.moves({ verbose: true });
    if (!legal.length) return;

    // Anti-cheat validation + human pick
    const pick = STATE.ai.pick(STATE.engine, { moveCount: STATE.moveCount });
    const ac = STATE.antiCheat.validate(pick.move, legal, true);

    let moveToPlay = pick.move;
    if (!ac.ok) {
      // Fallback to a legal move that keeps stealth
      const fallback = legal[Math.floor(Math.random() * legal.length)];
      moveToPlay = { from: fallback.from, to: fallback.to, promotion: fallback.promotion };
      setStatus('Stealth: adjusted move', 'warn');
    }

    STATE.antiCheat.startMove();
    const delay = computeDelay();

    setHint('Thinking… ' + Math.round(delay / 1000) + 's');

    STATE.timer = setTimeout(async () => {
      if (!STATE.autoMove || !STATE.ourTurn) return;
      await makeMoveOnChessDotCom(moveToPlay);
      // Apply to our engine
      STATE.engine.move(moveToPlay);
      STATE.moveCount++;
      STATE.lastFen = STATE.engine.fen;
      STATE.ourTurn = false;
      setStatus('Move played · waiting for opponent', 'healthy');
      setHint('Waiting for opponent…');
    }, delay);
  }

  function stopTimer() {
    if (STATE.timer) { clearTimeout(STATE.timer); STATE.timer = null; }
  }

  // ============================================================
  // 8. MAIN LOOP — poll board, detect turns & moves
  // ============================================================

  function pollBoard() {
    const board = readBoardFromDOM();
    if (!board) {
      setStatus('Waiting for board…', 'warn');
      setHint('Open a game on chess.com');
      return;
    }

    const fen = boardToFen(board);
    const changed = fen !== STATE.lastFen;

    if (changed && STATE.lastFen !== null) {
      // Opponent (or we) made a move — detect and sync
      handleBoardChange(board);
    }

    STATE.lastFen = fen;

    // Detect game active
    if (!STATE.gameActive) {
      STATE.gameActive = true;
      setStatus('Game detected', 'healthy');
      detectSettings();
      // Try to determine turn from engine side if we set color
      if (STATE.color) {
        STATE.ourTurn = (STATE.engine.side === STATE.color);
        setStatus(STATE.ourTurn ? 'Your turn' : "Opponent's turn", 'healthy');
      }
    }
  }

  function boardToFen(board) {
    let rows = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0, row = '';
      for (let f = 0; f < 8; f++) {
        const p = board[r * 8 + f];
        if (p === '.') empty++;
        else { if (empty > 0) { row += empty; empty = 0; } row += p; }
      }
      if (empty > 0) row += empty;
      rows += row + (r < 7 ? '/' : '');
    }
    return rows + ' ' + (STATE.engine ? STATE.engine.side : 'w') + ' - - 0 1';
  }

  function handleBoardChange(newBoard) {
    // Sync our engine to the new board position
    STATE.engine.board = [...newBoard];
    // Recompute legal moves to validate
    const legal = STATE.engine.moves({ verbose: true });

    // Toggle turn
    STATE.ourTurn = !STATE.ourTurn;
    if (STATE.color) {
      STATE.ourTurn = (STATE.engine.side === STATE.color);
    }

    if (STATE.ourTurn && STATE.autoMove && STATE.enabled && !STATE.engine.isGameOver()) {
      setStatus('Your turn — computing…', 'healthy');
      scheduleAIMove();
    } else if (!STATE.ourTurn) {
      setStatus("Opponent's turn", 'healthy');
      setHint('Waiting for opponent…');
    }
  }

  function detectSettings() {
    STATE.timeControl = detectTimeControl();
    STATE.humanElo = detectHumanElo();
    const strength = mapEloToStrength(STATE.humanElo);
    const mistakeFreq = mapEloToMistakeFreq(STATE.humanElo);

    // Apply to AI
    if (STATE.ai) {
      STATE.ai.setOptions({
        strength: strength,
        humanize: document.getElementById('ctn-humanize').checked,
        minTime: parseFloat(document.getElementById('ctn-min-time').value) * 1000,
        maxTime: parseFloat(document.getElementById('ctn-max-time').value) * 1000,
        personality: 'balanced',
        mistakeFrequency: mistakeFreq,
      });
    }

    setHint(`Elo ~${STATE.humanElo} · ${STATE.timeControl} · ${strength}`);
  }

  // ============================================================
  // 9. PANEL WIRING
  // ============================================================

  function wirePanel() {
    const btnAuto = panel.querySelector('#ctn-btn-auto');
    const toggle = panel.querySelector('#ctn-toggle');
    const btnWeak = panel.querySelector('#ctn-weak');
    const btnMed = panel.querySelector('#ctn-med');
    const btnStrong = panel.querySelector('#ctn-strong');
    const btnColor = panel.querySelector('#ctn-color');
    const chkHuman = panel.querySelector('#ctn-humanize');
    const inpMin = panel.querySelector('#ctn-min-time');
    const inpMax = panel.querySelector('#ctn-max-time');
    const btnClose = panel.querySelector('#ctn-close');

    function setStrength(str) {
      [btnWeak, btnMed, btnStrong].forEach(b => { b.classList.remove('active'); });
      if (str === 'weak') btnWeak.classList.add('active');
      else if (str === 'strong') btnStrong.classList.add('active');
      else btnMed.classList.add('active');
      if (STATE.ai) STATE.ai.strength = str;
    }

    btnAuto.addEventListener('click', () => {
      STATE.autoMove = !STATE.autoMove;
      btnAuto.textContent = STATE.autoMove ? '⏸ Disable Auto-Move' : '▶ Enable Auto-Move';
      btnAuto.classList.toggle('on', STATE.autoMove);
      toggle.classList.toggle('active', STATE.autoMove);
      setStatus(STATE.autoMove ? 'Auto-move ON' : 'Auto-move OFF', STATE.autoMove ? 'healthy' : 'warn');
      if (STATE.autoMove) scheduleAIMove();
    });

    btnWeak.addEventListener('click', () => setStrength('weak'));
    btnMed.addEventListener('click', () => setStrength('medium'));
    btnStrong.addEventListener('click', () => setStrength('strong'));

    btnColor.addEventListener('click', () => {
      STATE.color = STATE.color === 'w' ? 'b' : 'w';
      btnColor.textContent = STATE.color === 'w' ? 'White' : 'Black';
      setStatus('Color set to ' + (STATE.color === 'w' ? 'White' : 'Black'), 'healthy');
    });

    chkHuman.addEventListener('change', () => {
      if (STATE.ai) STATE.ai.humanize = chkHuman.checked;
    });
    inpMin.addEventListener('input', () => { if (STATE.ai) STATE.ai.minTime = parseFloat(inpMin.value) * 1000; });
    inpMax.addEventListener('input', () => { if (STATE.ai) STATE.ai.maxTime = parseFloat(inpMax.value) * 1000; });

    btnClose.addEventListener('click', () => { if (panel) panel.remove(); panel = null; });
  }

  // ============================================================
  // 10. INIT
  // ============================================================

  async function init() {
    try {
      await injectScript('chess.js');
      await injectScript('ai.js');
      await injectScript('anti-cheat.js');
      await injectScript('elo.js');
    } catch (e) {
      console.error('[CTN] Failed to inject engine scripts', e);
      setStatus('Engine load failed', 'bad');
      return;
    }

    // Wait briefly for globals
    await new Promise(r => setTimeout(r, 100));

    STATE.engine = new window.Chess();
    STATE.ai = new window.ChessAI({
      strength: 'medium',
      humanize: true,
      minTime: 2000,
      maxTime: 8000,
      personality: 'balanced',
    });
    STATE.antiCheat = new window.AntiCheat({
      enabled: true,
      minMoveTime: 1000,
      maxAccuracy: 88,
      perfectStreakLimit: 8,
    });
    STATE.eloSys = new window.EloSystem({
      startingElo: 1200,
      kFactor: 32,
    });

    createPanel();
    wirePanel();
    setStatus('Engine ready — open a game', 'healthy');
    setHint('Injecting into chess.com…');

    // Main poll loop
    setInterval(pollBoard, 800);
  }

  init();

})();
