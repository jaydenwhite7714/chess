/* ============================================================
   Chess Test Net — UI layer
   Board rendering, square interaction, move list, clocks,
   settings modal, game-over modal, toasts.
   ============================================================ */

const PIECE_UNICODE = {
  "K": "♔", "Q": "♕", "R": "♖", "B": "♗", "N": "♘", "P": "♙",
  "k": "♚", "q": "♛", "r": "♜", "b": "♝", "n": "♞", "p": "♟"
};

class UI {
  constructor() {
    this.boardEl = document.getElementById("board");
    this.coordsTop = document.getElementById("coordsTop");
    this.coordsLeft = document.getElementById("coordsLeft");
    this.moveListEl = document.getElementById("moveList");
    this.capturedWhite = document.getElementById("capturedWhite");
    this.capturedBlack = document.getElementById("capturedBlack");

    this.clockWhite = document.getElementById("clockWhite");
    this.clockBlack = document.getElementById("clockBlack");
    this.nameWhite = document.getElementById("nameWhite");
    this.nameBlack = document.getElementById("nameBlack");
    this.statusWhite = document.getElementById("statusWhite");
    this.statusBlack = document.getElementById("statusBlack");
    this.eloWhite = document.getElementById("eloWhite");
    this.eloBlack = document.getElementById("eloBlack");
    this.deltaWhite = document.getElementById("deltaWhite");
    this.deltaBlack = document.getElementById("deltaBlack");
    this.turnText = document.getElementById("turnText");
    this.turnDotWhite = document.querySelector(".turn-dot-white");
    this.turnDotBlack = document.querySelector(".turn-dot-black");

    this.selectedSquare = null;
    this.highlighted = [];
    this.lastMove = null;
    this.checkSquare = null;

    this.onSquareClick = null;

    this._coordLabels();
  }

  _coordLabels() {
    const files = "abcdefgh";
    this.coordsTop.innerHTML = files.split("").map(f => `<div>${f}</div>`).join("");
    this.coordsLeft.innerHTML = "87654321".split("").map(r => `<div>${r}</div>`).join("");
  }

  // -----------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------

  render(chess, theme) {
    document.documentElement.setAttribute("data-theme", theme || "green");
    this.boardEl.innerHTML = "";

    const ranks = [7, 6, 5, 4, 3, 2, 1, 0];
    const files = [0, 1, 2, 3, 4, 5, 6, 7];

    ranks.forEach(r => {
      files.forEach(f => {
        const idx = r * 8 + f;
        const sqEl = document.createElement("div");
        const light = (r + f) % 2 === 0;
        sqEl.className = `square ${light ? "light" : "dark"}`;
        sqEl.dataset.index = idx;

        const piece = chess.square(idx);
        if (piece && piece !== ".") {
          sqEl.textContent = PIECE_UNICODE[piece] || piece;
          sqEl.classList.add("piece");
          sqEl.dataset.piece = piece;
          sqEl.dataset.color = piece === piece.toUpperCase() ? "white" : "black";
        }

        if (this.selectedSquare === idx) sqEl.classList.add("selected");
        if (this.highlighted.includes(idx)) sqEl.classList.add("highlight");
        if (this.lastMove && (this.lastMove.from === idx || this.lastMove.to === idx)) {
          sqEl.classList.add("last-move");
        }
        if (this.checkSquare === idx) sqEl.classList.add("check");

        sqEl.addEventListener("click", () => this._onSquare(idx));
        this.boardEl.appendChild(sqEl);
      });
    });
  }

  setHighlights(squares) { this.highlighted = squares || []; }
  setSelection(idx) { this.selectedSquare = idx; }
  setLastMove(from, to) { this.lastMove = { from, to }; }
  setCheck(idx) { this.checkSquare = idx; }
  clearSelection() { this.selectedSquare = null; this.highlighted = []; }

  _onSquare(idx) {
    if (this.onSquareClick) this.onSquareClick(idx);
  }

  // -----------------------------------------------------------------
  // Move list
  // -----------------------------------------------------------------

  addMove(moveNumber, whiteMove, blackMove) {
    const pair = document.createElement("div");
    pair.className = "move-pair";

    const num = document.createElement("div");
    num.className = "move-number";
    num.textContent = moveNumber + ".";

    const w = document.createElement("div");
    w.className = "move-single";
    w.textContent = whiteMove;

    pair.appendChild(num);
    pair.appendChild(w);

    if (blackMove) {
      const b = document.createElement("div");
      b.className = "move-single";
      b.textContent = blackMove;
      pair.appendChild(b);
    }

    this.moveListEl.appendChild(pair);
    pair.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  clearMoves() { this.moveListEl.innerHTML = ""; }

  setCurrentMove(index) {
    const pairs = this.moveListEl.querySelectorAll(".move-pair");
    pairs.forEach((p, i) => p.classList.toggle("current", i === index));
  }

  // -----------------------------------------------------------------
  // Captured pieces
  // -----------------------------------------------------------------

  setCaptured(color, pieces) {
    const el = color === "white" ? this.capturedWhite : this.capturedBlack;
    el.innerHTML = pieces.map(p => `<span class="piece" title="${p}">${PIECE_UNICODE[p] || p}</span>`).join("");
  }

  // -----------------------------------------------------------------
  // Status / clocks
  // -----------------------------------------------------------------

  setClock(color, seconds) {
    const el = color === "white" ? this.clockWhite : this.clockBlack;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("low-time", seconds > 0 && seconds <= 30);
  }

  setTurn(color) {
    const white = color === "white";
    this.turnText.textContent = white ? "White to move" : "Black to move";
    this.turnDotWhite.classList.toggle("active", white);
    this.turnDotBlack.classList.toggle("active", !white);
  }

  setStatus(color, text) {
    const el = color === "white" ? this.statusWhite : this.statusBlack;
    if (el) el.textContent = text;
  }

  setPlayerName(color, name) {
    const el = color === "white" ? this.nameWhite : this.nameBlack;
    if (el) el.textContent = name;
  }

  setElo(color, value, delta) {
    const el = color === "white" ? this.eloWhite : this.eloBlack;
    const dEl = color === "white" ? this.deltaWhite : this.deltaBlack;
    el.textContent = value;
    if (dEl) {
      if (delta !== undefined && delta !== 0) {
        dEl.textContent = (delta > 0 ? "+" : "") + delta;
        dEl.className = "stat-delta " + (delta > 0 ? "pos" : "neg");
        dEl.style.display = "inline";
      } else {
        dEl.style.display = "none";
      }
    }
  }

  setFooter(text, antiCheatText) {
    const fs = document.getElementById("footerStatus");
    const fac = document.getElementById("footerAntiCheat");
    if (fs) fs.textContent = text;
    if (fac && antiCheatText !== undefined) fac.textContent = antiCheatText;
  }

  // -----------------------------------------------------------------
  // Modals
  // -----------------------------------------------------------------

  openModal(id) { const el = document.getElementById(id); if (el) el.classList.add("open"); }
  closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove("open"); }

  // -----------------------------------------------------------------
  // Settings wiring
  // -----------------------------------------------------------------

  applyToModal(settings) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val;
    };
    // Gameplay
    set("smGameMode", settings.gameMode);
    set("smResignAllowed", settings.resignAllowed);
    set("smDrawOffersAllowed", settings.drawOffersAllowed);
    set("smPromotionPrompt", settings.promotionPrompt);
    set("smAutoQueenPromotion", settings.autoQueenPromotion);
    set("smMoveSound", settings.moveSound !== false);
    set("smTimeControl", settings.timeControl);
    set("smCustomTimeMinutes", settings.customTimeMinutes);
    set("smIncrementSeconds", settings.incrementSeconds);
    set("smDelaySeconds", settings.delaySeconds);
    set("smAutoFlagOnTimeout", settings.autoFlagOnTimeout);
    // Board
    set("smBoardTheme", settings.boardTheme);
    set("smPieceSet", settings.pieceSet);
    set("smSquareSize", settings.squareSize);
    set("smBoardBorderWidth", settings.boardBorderWidth);
    set("smCoordinatesShown", settings.coordinatesShown);
    set("smLastMoveHighlight", settings.lastMoveHighlight);
    set("smSelectedSquareHighlight", settings.selectedSquareHighlight);
    set("smLegalMoveHighlights", settings.legalMoveHighlights);
    set("smCheckHighlight", settings.checkHighlight);
    set("smAnimationSpeed", settings.animationSpeed);
    set("smPieceDropShadow", settings.pieceDropShadow);
    set("smBoardReflection", settings.boardReflection);
    set("smGlowIntensity", settings.glowIntensity);
    set("smGlassmorphismOpacity", settings.glassmorphismOpacity);
    set("smBackgroundBlur", settings.backgroundBlur);
    set("smFloatingParticles", settings.floatingParticles);
    set("smConfettiOnGameEnd", settings.confettiOnGameEnd);
    set("smCursorTrail", settings.cursorTrail);
    set("smHoverEffects", settings.hoverEffects);
    set("smClickRipple", settings.clickRipple);
    set("smSmoothPieceMovement", settings.smoothPieceMovement);
    set("smMoveTrail", settings.moveTrail);
    // AI
    set("smAutoMoveEnabled", settings.autoMoveEnabled);
    set("smHumanizeEnabled", settings.humanizeEnabled);
    set("smBotStrength", settings.botStrength);
    set("smAiPersonality", settings.aiPersonality);
    set("smMoveTimeMin", settings.moveTimeMin);
    set("smMoveTimeMax", settings.moveTimeMax);
    set("smMistakeFrequency", settings.mistakeFrequency);
    set("smBlunderFrequency", settings.blunderFrequency);
    set("smTimePressureSimulation", settings.timePressureSimulation);
    // Stealth
    set("smAntiCheatEnabled", settings.antiCheatEnabled);
    set("smStealthMode", settings.stealthMode);
    set("smAcMinTime", settings.acMinTime);
    set("smAcMaxAcc", settings.acMaxAcc);
    set("smPerfectStreakLimit", settings.perfectStreakLimit);
    set("smTrustScoreVisible", settings.trustScoreVisible);
    set("smHumanizeTiming", settings.humanizeTiming);
    set("smOccasionalBlunders", settings.occasionalBlunders);
    set("smTimePressureBehavior", settings.timePressureBehavior);
    set("smMouseMovementSimulation", settings.mouseMovementSimulation);
    set("smClickTimingVariance", settings.clickTimingVariance);
    set("smMoveHesitation", settings.moveHesitation);
    set("smDeepThinkPauses", settings.deepThinkPauses);
    set("smUndetectableMode", settings.undetectableMode);
    // Sound
    set("smSoundEnabled", settings.soundEnabled);
    set("smMasterVolume", settings.masterVolume);
    set("smMoveSoundVolume", settings.moveSoundVolume);
    set("smCaptureSoundVolume", settings.captureSoundVolume);
    set("smCastleSoundVolume", settings.castleSoundVolume);
    set("smPromotionSoundVolume", settings.promotionSoundVolume);
    set("smCheckSoundVolume", settings.checkSoundVolume);
    set("smGameOverSoundVolume", settings.gameOverSoundVolume);
    set("smUIClickSound", settings.uiclickSound);
    set("smSoundPack", settings.soundPack);
    set("smBackgroundMusic", settings.backgroundMusic);
    set("smMusicVolume", settings.musicVolume);
    set("smMusicTrack", settings.musicTrack);
    // Elo
    set("smStartEloWhite", settings.startEloWhite);
    set("smStartEloBlack", settings.startEloBlack);
    set("smKFactor", settings.kFactor);
    set("smEloDisplay", settings.eloDisplay);
    set("smEloChangeAnimation", settings.eloChangeAnimation);
    set("smRatingHistory", settings.ratingHistory);
    set("smBestEloTracking", settings.bestEloTracking);
    set("smWinStreakTracking", settings.winStreakTracking);
    set("smLossStreakTracking", settings.lossStreakTracking);
    set("smDrawStreakTracking", settings.drawStreakTracking);
    set("smPerformanceRating", settings.performanceRating);
    set("smAccuracyTracking", settings.accuracyTracking);
    // Time
    set("smTimePreset", settings.timePreset);
    set("smLowTimeWarningSeconds", settings.lowTimeWarningSeconds);
    set("smLowTimePulse", settings.lowTimePulse);
    set("smClockDisplayFormat", settings.clockDisplayFormat);
    set("smClockColor", settings.clockColor);
    set("smClockShadow", settings.clockShadow);
    set("smShowOpponentClock", settings.showOpponentClock);
    set("smTimePenaltyPerMove", settings.timePenaltyPerMove);
    // Notify
    set("smToastNotifications", settings.toastNotifications);
    set("smGameOverAlert", settings.gameOverAlert);
    set("smMoveMadeAlert", settings.moveMadeAlert);
    set("smCheckAlert", settings.checkAlert);
    set("smLowTimeAlert", settings.lowTimeAlert);
    set("smSoundNotifications", settings.soundNotifications);
    set("smDesktopNotifications", settings.desktopNotifications);
    set("smNotificationDuration", settings.notificationDuration);
    set("smNotificationPosition", settings.notificationPosition);
    // Advanced
    set("smEngineAnalysisDepth", settings.engineAnalysisDepth);
    set("smShowEvaluationBar", settings.showEvaluationBar);
    set("smShowBestMoveLine", settings.showBestMoveLine);
    set("smShowPrincipalVariation", settings.showPrincipalVariation);
    set("smAutoFlipBoard", settings.autoFlipBoard);
    set("smCoordinatesStyle", settings.coordinatesStyle);
    set("smMoveListFont", settings.moveListFont);
    set("smMoveListDensity", settings.moveListDensity);
    set("smCompactMode", settings.compactMode);
    set("smDarkMode", settings.darkMode);
    set("smHighContrast", settings.highContrast);
    set("smReducedMotion", settings.reducedMotion);
    set("smKeyboardShortcuts", settings.keyboardShortcuts);
    set("smExportFormat", settings.exportFormat);
    set("smAutoSaveGames", settings.autoSaveGames);
    set("smLocalOnlyMode", settings.localOnlyMode);
    set("smDebugMode", settings.debugMode);
  }

  readFromModal() {
    const g = (id) => document.getElementById(id).value;
    const gc = (id) => document.getElementById(id).checked;
    return {
      gameMode: g("smGameMode"),
      resignAllowed: gc("smResignAllowed"),
      drawOffersAllowed: gc("smDrawOffersAllowed"),
      promotionPrompt: gc("smPromotionPrompt"),
      autoQueenPromotion: gc("smAutoQueenPromotion"),
      moveSound: gc("smMoveSound"),
      timeControl: g("smTimeControl"),
      customTimeMinutes: parseInt(g("smCustomTimeMinutes")) || 10,
      incrementSeconds: parseInt(g("smIncrementSeconds")) || 0,
      delaySeconds: parseInt(g("smDelaySeconds")) || 0,
      autoFlagOnTimeout: gc("smAutoFlagOnTimeout"),
      boardTheme: g("smBoardTheme"),
      pieceSet: g("smPieceSet"),
      squareSize: parseInt(g("smSquareSize")) || 60,
      boardBorderWidth: parseInt(g("smBoardBorderWidth")) || 14,
      coordinatesShown: gc("smCoordinatesShown"),
      lastMoveHighlight: gc("smLastMoveHighlight"),
      selectedSquareHighlight: gc("smSelectedSquareHighlight"),
      legalMoveHighlights: gc("smLegalMoveHighlights"),
      checkHighlight: gc("smCheckHighlight"),
      animationSpeed: parseFloat(g("smAnimationSpeed")) || 1,
      pieceDropShadow: gc("smPieceDropShadow"),
      boardReflection: gc("smBoardReflection"),
      glowIntensity: parseFloat(g("smGlowIntensity")) || 0.5,
      glassmorphismOpacity: parseFloat(g("smGlassmorphismOpacity")) || 0.72,
      backgroundBlur: parseInt(g("smBackgroundBlur")) || 20,
      floatingParticles: gc("smFloatingParticles"),
      confettiOnGameEnd: gc("smConfettiOnGameEnd"),
      cursorTrail: gc("smCursorTrail"),
      hoverEffects: gc("smHoverEffects"),
      clickRipple: gc("smClickRipple"),
      smoothPieceMovement: gc("smSmoothPieceMovement"),
      moveTrail: gc("smMoveTrail"),
      autoMoveEnabled: gc("smAutoMoveEnabled"),
      humanizeEnabled: gc("smHumanizeEnabled"),
      botStrength: g("smBotStrength"),
      aiPersonality: g("smAiPersonality"),
      moveTimeMin: parseFloat(g("smMoveTimeMin")) || 1.5,
      moveTimeMax: parseFloat(g("smMoveTimeMax")) || 5,
      mistakeFrequency: parseFloat(g("smMistakeFrequency")) || 0.25,
      blunderFrequency: parseFloat(g("smBlunderFrequency")) || 0.05,
      timePressureSimulation: gc("smTimePressureSimulation"),
      antiCheatEnabled: gc("smAntiCheatEnabled"),
      stealthMode: gc("smStealthMode"),
      acMinTime: parseFloat(g("smAcMinTime")) || 0.5,
      acMaxAcc: parseInt(g("smAcMaxAcc")) || 95,
      perfectStreakLimit: parseInt(g("smPerfectStreakLimit")) || 14,
      trustScoreVisible: gc("smTrustScoreVisible"),
      humanizeTiming: gc("smHumanizeTiming"),
      occasionalBlunders: gc("smOccasionalBlunders"),
      timePressureBehavior: gc("smTimePressureBehavior"),
      mouseMovementSimulation: gc("smMouseMovementSimulation"),
      clickTimingVariance: gc("smClickTimingVariance"),
      moveHesitation: gc("smMoveHesitation"),
      deepThinkPauses: gc("smDeepThinkPauses"),
      undetectableMode: gc("smUndetectableMode"),
      soundEnabled: gc("smSoundEnabled"),
      masterVolume: parseFloat(g("smMasterVolume")) || 0.8,
      moveSoundVolume: parseFloat(g("smMoveSoundVolume")) || 0.6,
      captureSoundVolume: parseFloat(g("smCaptureSoundVolume")) || 0.8,
      castleSoundVolume: parseFloat(g("smCastleSoundVolume")) || 0.7,
      promotionSoundVolume: parseFloat(g("smPromotionSoundVolume")) || 0.9,
      checkSoundVolume: parseFloat(g("smCheckSoundVolume")) || 0.9,
      gameOverSoundVolume: parseFloat(g("smGameOverSoundVolume")) || 1,
      uiclickSound: gc("smUIClickSound"),
      soundPack: g("smSoundPack"),
      backgroundMusic: gc("smBackgroundMusic"),
      musicVolume: parseFloat(g("smMusicVolume")) || 0.3,
      musicTrack: g("smMusicTrack"),
      startEloWhite: parseInt(g("smStartEloWhite")) || 1500,
      startEloBlack: parseInt(g("smStartEloBlack")) || 1500,
      kFactor: parseInt(g("smKFactor")) || 32,
      eloDisplay: gc("smEloDisplay"),
      eloChangeAnimation: gc("smEloChangeAnimation"),
      ratingHistory: gc("smRatingHistory"),
      bestEloTracking: gc("smBestEloTracking"),
      winStreakTracking: gc("smWinStreakTracking"),
      lossStreakTracking: gc("smLossStreakTracking"),
      drawStreakTracking: gc("smDrawStreakTracking"),
      performanceRating: gc("smPerformanceRating"),
      accuracyTracking: gc("smAccuracyTracking"),
      timePreset: g("smTimePreset"),
      lowTimeWarningSeconds: parseInt(g("smLowTimeWarningSeconds")) || 30,
      lowTimePulse: gc("smLowTimePulse"),
      clockDisplayFormat: g("smClockDisplayFormat"),
      clockColor: g("smClockColor"),
      clockShadow: gc("smClockShadow"),
      showOpponentClock: gc("smShowOpponentClock"),
      timePenaltyPerMove: parseInt(g("smTimePenaltyPerMove")) || 0,
      toastNotifications: gc("smToastNotifications"),
      gameOverAlert: gc("smGameOverAlert"),
      moveMadeAlert: gc("smMoveMadeAlert"),
      checkAlert: gc("smCheckAlert"),
      lowTimeAlert: gc("smLowTimeAlert"),
      soundNotifications: gc("smSoundNotifications"),
      desktopNotifications: gc("smDesktopNotifications"),
      notificationDuration: parseInt(g("smNotificationDuration")) || 3000,
      notificationPosition: g("smNotificationPosition"),
      engineAnalysisDepth: parseInt(g("smEngineAnalysisDepth")) || 3,
      showEvaluationBar: gc("smShowEvaluationBar"),
      showBestMoveLine: gc("smShowBestMoveLine"),
      showPrincipalVariation: gc("smShowPrincipalVariation"),
      autoFlipBoard: gc("smAutoFlipBoard"),
      coordinatesStyle: g("smCoordinatesStyle"),
      moveListFont: g("smMoveListFont"),
      moveListDensity: g("smMoveListDensity"),
      compactMode: gc("smCompactMode"),
      darkMode: gc("smDarkMode"),
      highContrast: gc("smHighContrast"),
      reducedMotion: gc("smReducedMotion"),
      keyboardShortcuts: gc("smKeyboardShortcuts"),
      exportFormat: g("smExportFormat"),
      autoSaveGames: gc("smAutoSaveGames"),
      localOnlyMode: gc("smLocalOnlyMode"),
      debugMode: gc("smDebugMode")
    };
  }

  // Toasts
  toast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = "toast " + (type === "ok" ? "ok" : type === "warn" ? "warn" : type === "err" ? "err" : "");
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
}

if (typeof window !== "undefined") window.UI = UI;
if (typeof window !== "undefined") window.PIECE_UNICODE = PIECE_UNICODE;
