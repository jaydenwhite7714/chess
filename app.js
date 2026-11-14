/* ============================================================
   Chess Test Net — main application
   Wires engine, AI, anti-cheat, Elo, UI and settings together.
   ============================================================ */

(() => {
  const ui = new window.UI();
  const settings = window.settings;

  // Core instances
  const chess = new window.Chess();
  const ai = new window.ChessAI({
    strength: settings.get("botStrength"),
    humanize: settings.get("humanizeEnabled"),
    minTime: settings.get("moveTimeMin") * 1000,
    maxTime: settings.get("moveTimeMax") * 1000
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

  // State
  let gameMode = settings.get("gameMode");           // "pvb" | "pvp"
  let timeControl = settings.get("timeControl");
  let increment = settings.get("increment");
  let timeWhite = settings.timeSeconds();
  let timeBlack = settings.timeSeconds();
  let clockInterval = null;
  let autoMoveTimer = null;
  let gameStarted = false;

  // Captured tracking
  let capturedWhite = []; // pieces won by white (from black)
  let capturedBlack = []; // pieces won by black (from white)

  // Persisted stats
  let stats = JSON.parse(localStorage.getItem("chess_testnet_stats") || "{}");
  if (!stats.games) stats = { games: 0, wins: 0, losses: 0, draws: 0, bestElo: 0 };

  // -----------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------

  function init() {
    applySettingsToUI();
    newGame();
    render();
    startClock();
    ui.setFooter("Ready", "Anti-cheat: active");

    // Wire buttons
    document.getElementById("btnNewGame").addEventListener("click", () => newGame());
    document.getElementById("btnResign").addEventListener("click", () => endGame("black"));
    document.getElementById("btnDraw").addEventListener("click", () => endGame("draw"));
    document.getElementById("btnClearMoves").addEventListener("click", () => ui.clearMoves());
    document.getElementById("btnSettings").addEventListener("click", openSettings);

    // Settings modal
    document.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
    document.getElementById("btnCloseSettings2").addEventListener("click", closeSettings);
    document.getElementById("modalBackdrop").addEventListener("click", closeSettings);
    document.getElementById("btnResetStats").addEventListener("click", resetStats);
    document.getElementById("btnExport").addEventListener("click", exportData);

    // Game over
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
    ui.setFooter("New game started", "Anti-cheat: active");

    gameStarted = true;
    ui.render(chess, settings.get("boardTheme"));
    updateTurnUI();
    maybeAutoMove();
  }

  function applyMove(move) {
    const beforeWhite = elo.ratingWhite;
    const beforeBlack = elo.ratingBlack;

    const result = chess.move(move);
    if (!result) return false;

    // Track captured
    if (result.capture && result.capture !== ".") {
      const owner = colorOfPiece(result.capture) === "w" ? "white" : "black";
      if (owner === "white") capturedBlack.push(result.capture);
      else capturedWhite.push(result.capture);
    }
    ui.setCaptured("white", capturedWhite);
    ui.setCaptured("black", capturedBlack);

    ui.addMove(chess.moveNumber - 1, result.san, chess.side === "w" ? "" : "");
    // Note: black move shown in same pair handled below in render loop — simpler:
    // we push pairs manually; here just refresh.
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
    // rebuild from history
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
      const el = document.createElement("div");
      el.className = "move-pair";
      const num = document.createElement("div");
      num.className = "move-number";
      num.textContent = i + 1 + ".";
      const rest = document.createElement("div");
      rest.className = "move-single";
      rest.textContent = p.replace(i + 1 + ". ", "");
      el.appendChild(num);
      el.appendChild(rest);
      ui.moveListEl.appendChild(el);
    });
    if (current) {
      const el = document.createElement("div");
      el.className = "move-pair";
      el.innerHTML = current;
      ui.moveListEl.appendChild(el);
    }
    if (ui.moveListEl.children.length) {
      ui.moveListEl.lastChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function moveToSan(h) {
    // Approximate SAN from history entry
    return (h.from !== undefined ? sqName(h.from) + "-" + sqName(h.to) : "?");
  }

  function squareNameFromIndex(idx) {
    return String.fromCharCode(97 + (idx % 8)) + (Math.floor(idx / 8) + 1);
  }

  function updateTurnUI() {
    const color = chess.side === "w" ? "white" : "black";
    ui.setTurn(color);
    ui.setStatus(color, color === "white" ? "Your turn" : "Thinking...");
    ui.setStatus(color === "white" ? "black" : "white", "");
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
  // Auto-move (bot)
  // -----------------------------------------------------------------

  function maybeAutoMove() {
    stopAutoMove();
    if (chess.isGameOver()) return;

    const humanTurn = chess.side === "w";
    const botOn = gameMode === "pvb" && !humanTurn && settings.get("autoMoveEnabled");
    const hotseatBot = gameMode === "pvp" ? false : botOn;

    if (botOn) {
      // Stealthy, human-like delay so the bot stays undetectable
      const delay = antiCheat.stealthDelay({
        minTime: settings.get("moveTimeMin") * 1000,
        maxTime: settings.get("moveTimeMax") * 1000
      });
      ui.setFooter("Bot thinking...", "Anti-cheat: active · undetectable mode");
      autoMoveTimer = setTimeout(() => {
        antiCheat.startMove();
        const pick = ai.pick(chess);
        if (pick && pick.move) {
          // Anti-cheat validates the move too (keeps everything consistent)
          const legal = chess.moves({ verbose: true });
          const ac = antiCheat.validate(pick.move, legal, /* engineTop */ true);
          if (ac.ok) {
            applyMove(pick.move);
          } else {
            // Fallback: play first legal move
            const fallback = legal[0];
            if (fallback) applyMove({ from: fallback.from, to: fallback.to, promotion: fallback.promotion });
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
    if (gameMode === "pvb" && !humanTurn) return; // bot's turn

    const piece = chess.square(idx);
    const isMyPiece = piece !== "." && colorOfPiece(piece) === chess.side;

    if (ui.selectedSquare === null) {
      if (isMyPiece) {
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

      // Attempt move
      const legal = chess.moves({ verbose: true }).filter(m => m.from === ui.selectedSquare && m.to === idx);
      if (legal.length) {
        antiCheat.startMove();
        const chosen = legal[0];
        // Anti-cheat validation for human move
        const ac = antiCheat.validate(chosen, chess.moves({ verbose: true }), /* engineTop */ false);
        if (!ac.ok) {
          ui.toast("Move flagged by anti-cheat", "warn");
          ui.clearSelection();
          render();
          return;
        }
        applyMove({ from: chosen.from, to: chosen.to, promotion: chosen.promotion });
      } else {
        ui.clearSelection();
        render();
      }
    }
  };

  // -----------------------------------------------------------------
  // Game over / Elo
  // -----------------------------------------------------------------

  function finishGame() {
    stopClock();
    stopAutoMove();
    const sideToMove = chess.side; // side that cannot move
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

    // UI updates
    ui.setElo("white", elo.ratingWhite, rating.white.change);
    ui.setElo("black", elo.ratingBlack, rating.black.change);

    const isWhiteWin = result === "white";
    const playerWon = (gameMode === "pvb" && isWhiteWin) || (gameMode === "pvp" && isWhiteWin);
    ui.statusWhite.textContent = result === "white" ? "You win!" : result === "black" ? "You lose!" : "Draw";
    ui.statusBlack.textContent = result === "black" ? "You win!" : result === "white" ? "You lose!" : "Draw";

    const titles = {
      white: "Checkmate! White wins",
      black: "Checkmate! Black wins",
      draw: chess.termination === "stalemate" ? "Stalemate" : "Draw"
    };
    openGameOver(result, titles[result], rating);

    ui.setFooter("Game over · " + result, "Anti-cheat: active");
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
    timeControl = next.timeControl;
    increment = next.increment;

    ai.setOptions({
      strength: next.botStrength,
      humanize: next.humanizeEnabled,
      minTime: next.moveTimeMin * 1000,
      maxTime: next.moveTimeMax * 1000
    });
    antiCheat.enabled = next.antiCheatEnabled;
    antiCheat.minMoveTime = next.acMinTime * 1000;
    antiCheat.maxAccuracy = next.acMaxAcc;
    elo.setOptions({ startingElo: next.startElo, kFactor: next.kFactor });

    // Reset clocks / ratings to new settings
    timeWhite = settings.timeSeconds();
    timeBlack = settings.timeSeconds();
    ui.setClock("white", timeWhite);
    ui.setClock("black", timeBlack);
    ui.setElo("white", elo.ratingWhite);
    ui.setElo("black", elo.ratingBlack);

    closeSettings();
    newGame();
    ui.toast("Settings saved", "ok");
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
