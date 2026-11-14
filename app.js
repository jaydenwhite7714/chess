/* ============================================================
   Chess Test Net — main application
   Fully integrated: human-like AI, stealth anti-cheat, sound,
   particles, Elo, settings, smooth UX.
   ============================================================ */

(() => {
  const ui = new window.UI();
  const settings = window.settings;

  const chess = new window.Chess();
  const ai = new window.ChessAI({
    strength: settings.get("botStrength"),
    humanize: settings.get("humanizeEnabled"),
    minTime: settings.get("moveTimeMin") * 1000,
    maxTime: settings.get("moveTimeMax") * 1000,
    personality: settings.get("aiPersonality") || "balanced"
  });
  const antiCheat = new window.AntiCheat({
    enabled: settings.get("antiCheatEnabled"),
    minMoveTime: settings.get("acMinTime") * 1000,
    maxAccuracy: settings.get("acMaxAcc")
  });
  const elo = new window.EloSystem({
    startingElo: settings.get("startElo"),
    kFactor: settings.get("kFactor")
  });

  // -----------------------------------------------------------------
  // Sound (Web Audio API, no external files)
  // -----------------------------------------------------------------
  let audioCtx = null;
  let soundEnabled = false;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      try { audioCtx.resume(); } catch (e) {}
    }
    return !!audioCtx;
  }

  function playTone(type) {
    if (!soundEnabled || !ensureAudio()) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;

      const cfg = {
        move:   { f: 260, f2: 330, t: 0.06, type: "sine" },
        capture:{ f: 170, f2: 210, t: 0.1, type: "sawtooth" },
        castle: { f: 300, f2: 420, f3: 520, t: 0.15, type: "triangle" },
        promote:{ f: 400, f2: 650, t: 0.2, type: "square" },
        check:  { f: 160, f2: 130, t: 0.3, type: "sawtooth" },
        gameover:{ f: 130, f2: 100, t: 0.5, type: "sawtooth" },
        win:    { f: 520, f2: 660, f3: 800, t: 0.4, type: "sine" },
        lose:   { f: 180, f2: 140, f3: 110, t: 0.5, type: "sawtooth" },
        draw:   { f: 340, f2: 380, t: 0.3, type: "sine" },
        ui:     { f: 900, t: 0.03, type: "sine" }
      }[type] || { f: 400, t: 0.05, type: "sine" };

      if (cfg.f3) {
        osc.frequency.setValueAtTime(cfg.f, now);
        osc.frequency.linearRampToValueAtTime(cfg.f2, now + cfg.t / 3);
        osc.frequency.linearRampToValueAtTime(cfg.f3, now + cfg.t * 2 / 3);
      } else if (cfg.f2) {
        osc.frequency.setValueAtTime(cfg.f, now);
        osc.frequency.exponentialRampToValueAtTime(cfg.f2, now + cfg.t / 2);
      } else {
        osc.frequency.setValueAtTime(cfg.f, now);
      }
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + cfg.t);
      osc.start(now);
      osc.stop(now + cfg.t + 0.05);
    } catch (e) {}
  }

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  let gameMode = settings.get("gameMode");
  let timeWhite = settings.timeSeconds();
  let timeBlack = settings.timeSeconds();
  let clockInterval = null;
  let autoMoveTimer = null;
  let gameStarted = false;

  let capturedWhite = [];
  let capturedBlack = [];

  let stats = JSON.parse(localStorage.getItem("chess_testnet_stats") || "{}");
  if (!stats.games) stats = { games: 0, wins: 0, losses: 0, draws: 0, bestElo: 0 };

  // -----------------------------------------------------------------
  // Confetti
  // -----------------------------------------------------------------
  function fireConfetti(colors) {
    let container = document.getElementById("confetti");
    if (!container) {
      container = document.createElement("div");
      container.id = "confetti";
      document.body.appendChild(container);
    }
    const count = 70;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      p.style.left = Math.random() * 100 + "vw";
      p.style.top = "-12vh";
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (1.4 + Math.random() * 1.4) + "s";
      p.style.animationDelay = (Math.random() * 0.6) + "s";
      p.style.opacity = 0.85 + Math.random() * 0.15;
      container.appendChild(p);
      setTimeout(() => p.remove(), 3200);
    }
  }

  // -----------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------
  function init() {
    applySettingsToUI();
    newGame();
    render();
    ui.setFooter("Ready", "Anti-cheat: active · stealth mode");

    // Enable sound on first interaction
    document.body.addEventListener("click", () => { soundEnabled = true; ensureAudio(); }, { once: true });
    document.body.addEventListener("keydown", () => { soundEnabled = true; ensureAudio(); }, { once: true });

    document.getElementById("btnNewGame").addEventListener("click", () => { playTone("ui"); newGame(); });
    document.getElementById("btnResign").addEventListener("click", () => { playTone("lose"); endGame("black"); });
    document.getElementById("btnDraw").addEventListener("click", () => { playTone("draw"); endGame("draw"); });
    document.getElementById("btnClearMoves").addEventListener("click", () => { ui.clearMoves(); playTone("ui"); });
    document.getElementById("btnSettings").addEventListener("click", openSettings);

    document.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
    document.getElementById("btnCloseSettings2").addEventListener("click", closeSettings);
    document.getElementById("modalBackdrop").addEventListener("click", closeSettings);
    document.getElementById("btnResetStats").addEventListener("click", resetStats);
    document.getElementById("btnExport").addEventListener("click", exportData);

    document.getElementById("btnCloseGameOver").addEventListener("click", closeGameOver);
    document.getElementById("goBackdrop").addEventListener("click", closeGameOver);
    document.getElementById("btnPlayAgain").addEventListener("click", () => { closeGameOver(); newGame(); });
  }

  // -----------------------------------------------------------------
  // Game flow
  // -----------------------------------------------------------------
  function newGame() {
    stopClock();
    stopAutoMove();

    chess.reset();
    elo.reset();
    antiCheat.reset();
    capturedWhite = [];
    capturedBlack = [];
    timeWhite = settings.timeSeconds();
    timeBlack = settings.timeSeconds();

    ui.clearMoves();
    ui.setCaptured("white", []);
    ui.setCaptured("black", []);
    ui.setClock("white", timeWhite);
    ui.setClock("black", timeBlack);
    ui.setElo("white", elo.ratingWhite);
    ui.setElo("black", elo.ratingBlack);
    ui.setStatus("white", "Your turn");
    ui.setStatus("black", "Waiting");
    ui.setFooter("New game started", "Anti-cheat: active · stealth mode");

    document.getElementById("confetti")?.remove();

    gameStarted = true;
    ui.render(chess, settings.get("boardTheme"));
    updateTurnUI();
    maybeAutoMove();
  }

  function applyMove(move, playedByHuman = true) {
    const isCapture = chess.square(move.to) !== "." && chess.square(move.to) !== chess.square(move.from);
    // Determine capture BEFORE applying (we check target)
    const targetBefore = chess.square(move.to);
    const isCastle = move.from !== undefined && Math.abs(move.from - move.to) === 2 &&
      chess.square(move.from) && chess.square(move.from).toLowerCase() === "k";
    const isPromo = !!move.promotion;

    playTone(isCapture ? "capture" : isCastle ? "castle" : isPromo ? "promote" : "move");

    const result = chess.move(move);
    if (!result) return false;

    if (result.capture && result.capture !== ".") {
      const owner = colorOfPiece(result.capture) === "w" ? "white" : "black";
      if (owner === "white") capturedBlack.push(result.capture);
      else capturedWhite.push(result.capture);
      ui.setCaptured("white", capturedWhite);
      ui.setCaptured("black", capturedBlack);
    }

    refreshMoveList();
    ui.setLastMove(move.from, move.to);
    ui.render(chess, settings.get("boardTheme"));

    updateTurnUI();

    if (chess.isGameOver()) {
      finishGame();
      return true;
    }

    startClock();
    maybeAutoMove();
    return true;
  }

  function refreshMoveList() {
    ui.clearMoves();
    let pairs = [];
    let current = "";
    chess.history.forEach((h, i) => {
      const san = moveToSan(h);
      if (h.side === "w") {
        current = (i / 2 + 1) + ". " + san + "   ";
      } else {
        current += san + "   ";
        pairs.push(current);
        current = "";
      }
    });
    pairs.forEach((p, i) => {
      const parts = p.trim().split(/\s+/);
      const num = parts[0];
      const rest = p.replace(num + " ", "");
      const el = document.createElement("div");
      el.className = "move-pair";
      const nEl = document.createElement("div");
      nEl.className = "move-number";
      nEl.textContent = num;
      const rEl = document.createElement("div");
      rEl.className = "move-single";
      rEl.textContent = rest;
      el.appendChild(nEl);
      el.appendChild(rEl);
      ui.moveListEl.appendChild(el);
    });
    if (current.trim()) {
      const parts = current.trim().split(/\s+/);
      const num = parts[0];
      const el = document.createElement("div");
      el.className = "move-pair current";
      const nEl = document.createElement("div");
      nEl.className = "move-number";
      nEl.textContent = num;
      const rEl = document.createElement("div");
      rEl.className = "move-single current";
      rEl.textContent = current.replace(num + " ", "");
      el.appendChild(nEl);
      el.appendChild(rEl);
      ui.moveListEl.appendChild(el);
    }
    if (ui.moveListEl.children.length) {
      ui.moveListEl.lastChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function moveToSan(h) {
    const from = sqName(h.from);
    const to = sqName(h.to);
    let s = "";
    const piece = h.piece;
    if (piece.toLowerCase() !== "p") s += piece.toUpperCase();
    if (h.captured !== ".") {
      if (piece.toLowerCase() === "p") s += from[0];
      s += "x";
    }
    s += to;
    if (h.promotion) s += "=" + h.promotion.toUpperCase();
    return s;
  }

  function updateTurnUI() {
    const color = chess.side === "w" ? "white" : "black";
    ui.setTurn(color);
    ui.setStatus(color, color === "white" ? "Your turn" : "Thinking...");
    ui.setStatus(color === "white" ? "black" : "white", "");
    ui.render(chess, settings.get("boardTheme"));
  }

  // -----------------------------------------------------------------
  // Clocks
  // -----------------------------------------------------------------
  function startClock() {
    stopClock();
    if (!gameStarted || chess.isGameOver()) return;
    clockInterval = setInterval(() => {
      const color = chess.side === "w" ? "white" : "black";
      if (color === "white") timeWhite -= 1; else timeBlack -= 1;
      ui.setClock("white", Math.max(0, timeWhite));
      ui.setClock("black", Math.max(0, timeBlack));
      if (timeWhite <= 0 || timeBlack <= 0) {
        stopClock();
        endGame(timeWhite <= 0 ? "black" : "white");
      }
    }, 1000);
  }

  function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  }

  // -----------------------------------------------------------------
  // Auto-move (bot) — human-like
  // -----------------------------------------------------------------
  function maybeAutoMove() {
    stopAutoMove();
    if (chess.isGameOver()) return;

    const humanTurn = chess.side === "w";
    const botOn = gameMode === "pvb" && !humanTurn && settings.get("autoMoveEnabled");

    if (botOn) {
      // Count complexity for human-like thinking time
      let complexity = 0;
      for (let i = 0; i < 64; i++) {
        const p = chess.square(i);
        if (p && p !== ".") complexity++;
      }
      complexity = complexity / 64;

      const moveCount = chess.history.length;
      const timeLeft = chess.side === "b" ? timeBlack : timeWhite;

      const delay = antiCheat.suggestDelay({
        minTime: settings.get("moveTimeMin") * 1000,
        maxTime: settings.get("moveTimeMax") * 1000,
        complexity
      });

      ui.setFooter("Bot thinking...", "Anti-cheat: active · stealth mode");
      autoMoveTimer = setTimeout(() => {
        antiCheat.startMove();
        const pick = ai.pick(chess, {
          moveCount,
          timeLeft
        });
        if (pick && pick.move) {
          const legal = chess.moves({ verbose: true });
          const ac = antiCheat.validate(pick.move, legal, true);
          if (ac.ok) {
            applyMove(pick.move, false);
          } else {
            const fallback = legal[0];
            if (fallback) applyMove({ from: fallback.from, to: fallback.to, promotion: fallback.promotion }, false);
          }
        }
      }, delay);
    }
  }

  function stopAutoMove() {
    if (autoMoveTimer) { clearTimeout(autoMoveTimer); autoMoveTimer = null; }
  }

  // -----------------------------------------------------------------
  // Human move (square click)
  // -----------------------------------------------------------------
  ui.onSquareClick = (idx) => {
    if (chess.isGameOver()) return;
    const humanTurn = chess.side === "w";
    if (gameMode === "pvb" && !humanTurn) return;

    const piece = chess.square(idx);
    const isMyPiece = piece !== "." && colorOfPiece(piece) === chess.side;

    if (ui.selectedSquare === null) {
      if (isMyPiece) {
        playTone("ui");
        ui.setSelection(idx);
        const legal = chess.moves({ verbose: true }).filter(m => m.from === idx);
        ui.setHighlights(legal.map(m => m.to));
        ui.render(chess, settings.get("boardTheme"));
      }
    } else {
      if (isMyPiece && idx !== ui.selectedSquare) {
        ui.setSelection(idx);
        const legal = chess.moves({ verbose: true }).filter(m => m.from === idx);
        ui.setHighlights(legal.map(m => m.to));
        ui.render(chess, settings.get("boardTheme"));
        return;
      }

      const legal = chess.moves({ verbose: true }).filter(m => m.from === ui.selectedSquare && m.to === idx);
      if (legal.length) {
        const chosen = legal[0];

        // Pawn promotion
        let promotion = chosen.promotion;
        const movingPiece = chess.square(ui.selectedSquare);
        const toRank = 8 - rankOf(idx);
        if (movingPiece && movingPiece.toLowerCase() === "p" && (toRank === 8 || toRank === 1)) {
          promotion = prompt("Promote pawn to:\nq = Queen\nr = Rook\nb = Bishop\nn = Knight\n\nEnter: q/r/b/n", "q");
          if (!promotion || !"qrbn".includes(promotion.toLowerCase())) promotion = "q";
          promotion = promotion.toLowerCase();
        }

        antiCheat.startMove();
        const ac = antiCheat.validate(
          { from: chosen.from, to: chosen.to, promotion },
          chess.moves({ verbose: true }),
          false
        );
        if (!ac.ok) {
          ui.toast("Move blocked by anti-cheat (illegal)", "warn");
          ui.clearSelection();
          render();
          return;
        }

        applyMove({ from: chosen.from, to: chosen.to, promotion }, true);
      } else {
        ui.clearSelection();
        render();
      }
    }
  };

  function rankOf(s) { return (s / 8) | 0; }

  // -----------------------------------------------------------------
  // Game over / Elo
  // -----------------------------------------------------------------
  function finishGame() {
    stopClock();
    stopAutoMove();
    const sideToMove = chess.side;
    let result;
    if (chess.termination === "checkmate") {
      result = sideToMove === "w" ? "black" : "white";
    } else {
      result = "draw";
    }

    const rating = elo.record(result);
    stats.games++;
    if (result === "white") stats.wins++;
    else if (result === "black") stats.losses++;
    else stats.draws++;
    if (elo.ratingWhite > stats.bestElo) stats.bestElo = elo.ratingWhite;
    localStorage.setItem("chess_testnet_stats", JSON.stringify(stats));

    ui.setElo("white", elo.ratingWhite, rating.white.change);
    ui.setElo("black", elo.ratingBlack, rating.black.change);

    ui.statusWhite.textContent = result === "white" ? "You win!" : result === "black" ? "You lose!" : "Draw";
    ui.statusBlack.textContent = result === "black" ? "You win!" : result === "white" ? "You lose!" : "Draw";

    const titles = {
      white: "Checkmate — You Win!",
      black: "Checkmate — You Lost!",
      draw: chess.termination === "stalemate" ? "Stalemate" : "Draw"
    };

    playTone(result === "white" ? "win" : result === "black" ? "lose" : "draw");

    if (result === "white") fireConfetti(["#6366f1", "#22d3ee", "#22c55e", "#fbbf24"]);
    else if (result === "black") fireConfetti(["#ef4444", "#f59e0b", "#6366f1"]);
    else fireConfetti(["#94a3b8", "#6366f1", "#22d3ee"]);

    openGameOver(result, titles[result], rating);

    ui.setFooter("Game over · " + result, "Anti-cheat: active · stealth mode");
    ui.toast(result.charAt(0).toUpperCase() + result.slice(1) + " — Elo updated", result === "white" ? "ok" : "info");
  }

  function endGame(winner) {
    if (chess.isGameOver()) return;
    stopClock(); stopAutoMove();
    if (winner === "draw") {
      chess.gameOver = true; chess.termination = "draw"; chess.side = "w";
      finishGame();
    } else {
      chess.gameOver = true; chess.termination = "checkmate";
      chess.side = winner === "white" ? "b" : "w";
      finishGame();
    }
  }

  // -----------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------
  function render() {
    ui.render(chess, settings.get("boardTheme"));
  }

  // -----------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------
  function applySettingsToUI() {
    ui.applyToModal(settings.values);
    document.getElementById("valMoveTimeMin").textContent = settings.get("moveTimeMin") + "s";
    document.getElementById("valMoveTimeMax").textContent = settings.get("moveTimeMax") + "s";
    document.getElementById("smValMoveTimeMin").textContent = settings.get("moveTimeMin") + "s";
    document.getElementById("smValMoveTimeMax").textContent = settings.get("moveTimeMax") + "s";
    document.getElementById("smValAcMinTime").textContent = settings.get("acMinTime") + "s";
    document.getElementById("smValAcMaxAcc").textContent = settings.get("acMaxAcc") + "%";
  }

  function openSettings() {
    ui.applyToModal(settings.values);
    ui.openModal("settingsModal");
  }

  function closeSettings() { ui.closeModal("settingsModal"); }

  function saveSettings() {
    const next = ui.readFromModal();
    Object.entries(next).forEach(([k, v]) => settings.set(k, v));

    gameMode = next.gameMode;
    soundEnabled = true;

    ai.setOptions({
      strength: next.botStrength,
      humanize: next.humanizeEnabled,
      minTime: next.moveTimeMin * 1000,
      maxTime: next.moveTimeMax * 1000,
      personality: next.aiPersonality || "balanced"
    });
    antiCheat.enabled = next.antiCheatEnabled;
    antiCheat.minMoveTime = next.acMinTime * 1000;
    antiCheat.maxAccuracy = next.acMaxAcc;
    elo.setOptions({ startingElo: next.startElo, kFactor: next.kFactor });

    timeWhite = settings.timeSeconds();
    timeBlack = settings.timeSeconds();
    ui.setClock("white", timeWhite);
    ui.setClock("black", timeBlack);
    ui.setElo("white", elo.ratingWhite);
    ui.setElo("black", elo.ratingBlack);

    closeSettings();
    newGame();
    ui.toast("Settings saved", "ok");
    playTone("ui");
  }

  function resetStats() {
    if (!confirm("Reset Elo and stats?")) return;
    stats = { games: 0, wins: 0, losses: 0, draws: 0, bestElo: 0 };
    localStorage.setItem("chess_testnet_stats", JSON.stringify(stats));
    newGame();
    ui.toast("Stats reset", "ok");
  }

  function exportData() {
    const data = {
      settings: settings.values,
      stats,
      eloHistory: elo.history,
      antiCheat: antiCheat.status(),
      at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chess_testnet_export.json";
    a.click();
    URL.revokeObjectURL(url);
    ui.toast("Exported game data", "ok");
  }

  // -----------------------------------------------------------------
  // Game over modal
  // -----------------------------------------------------------------
  function openGameOver(result, title, rating) {
    document.getElementById("goTitle").textContent = title;
    document.getElementById("goResult").textContent = result.toUpperCase();
    document.getElementById("goDetails").textContent =
      `White ${rating.white.before} → ${rating.white.after} (${rating.white.change > 0 ? "+" : ""}${rating.white.change})   •   Black ${rating.black.before} → ${rating.black.after} (${rating.black.change > 0 ? "+" : ""}${rating.black.change})`;

    document.getElementById("goNameWhite").textContent = gameMode === "pvb" ? "You" : "White";
    document.getElementById("goNameBlack").textContent = gameMode === "pvb" ? "Bot" : "Black";

    const wPos = rating.white.change > 0; const bPos = rating.black.change > 0;
    document.getElementById("goEloWhite").textContent = (rating.white.change > 0 ? "+" : "") + rating.white.change;
    document.getElementById("goEloWhite").className = "go-elo-change " + (wPos ? "pos" : "neg");
    document.getElementById("goEloBlack").textContent = (rating.black.change > 0 ? "+" : "") + rating.black.change;
    document.getElementById("goEloBlack").className = "go-elo-change " + (bPos ? "pos" : "neg");
    document.getElementById("goNewEloWhite").textContent = rating.white.after;
    document.getElementById("goNewEloBlack").textContent = rating.black.after;

    ui.openModal("gameOverModal");
  }

  function closeGameOver() { ui.closeModal("gameOverModal"); }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  function colorOfPiece(p) {
    return p === p.toUpperCase() ? "w" : "b";
  }
  window.sqName = (i) => String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1);

  // Kick off
  init();

})();
