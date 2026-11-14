/* ============================================================
   Chess Test Net — main application
   Fully integrated: human-like AI, stealth anti-cheat, sound,
   particles, Elo, settings (120+), smooth UX.
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
    startingElo: settings.get("startEloWhite"),
    kFactor: settings.get("kFactor")
  });

  // -----------------------------------------------------------------
  // Sound (Web Audio API)
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
      const vol = settings.get("masterVolume") || 0.8;

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

      const v = vol * ((cfg.type === "sine" && type === "move") ? settings.get("moveSoundVolume") : 1);
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
      gain.gain.setValueAtTime(0.1 * v, now);
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
    setupSettingsTabs();
    newGame();
    render();
    ui.setFooter("Ready", "Anti-cheat: active · stealth mode");

    document.body.addEventListener("click", () => { soundEnabled = true; ensureAudio(); }, { once: true });
    document.body.addEventListener("keydown", () => { soundEnabled = true; ensureAudio(); }, { once: true });

    document.getElementById("btnNewGame").addEventListener("click", () => { playTone("ui"); newGame(); });
    document.getElementById("btnResign").addEventListener("click", () => { playTone("lose"); endGame("black"); });
    document.getElementById("btnDraw").addEventListener("click", () => { playTone("draw"); endGame("draw"); });
    document.getElementById("btnClearMoves").addEventListener("click", () => { ui.clearMoves(); playTone("ui"); });
    document.getElementById("btnSettings").addEventListener("click", openSettings);
    document.getElementById("btnOpenTab").addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
      } else {
        window.open(window.location.href, "_blank");
      }
    });

    document.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
    document.getElementById("btnCloseSettings2").addEventListener("click", closeSettings);
    document.getElementById("modalBackdrop").addEventListener("click", closeSettings);
    document.getElementById("btnResetStats").addEventListener("click", resetStats);
    document.getElementById("btnResetSettings").addEventListener("click", resetSettingsAll);
    document.getElementById("btnExport").addEventListener("click", exportData);
    document.getElementById("btnImport").addEventListener("click", importData);

    document.getElementById("btnCloseGameOver").addEventListener("click", closeGameOver);
    document.getElementById("goBackdrop").addEventListener("click", closeGameOver);
    document.getElementById("btnPlayAgain").addEventListener("click", () => { closeGameOver(); newGame(); });
  }

  // -----------------------------------------------------------------
  // Settings tabs
  // -----------------------------------------------------------------
  function setupSettingsTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    const panes = document.querySelectorAll(".tab-pane");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        panes.forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        playTone("ui");
      });
    });
  }

  function openSettings() {
    applySettingsToUI();
    ui.openModal("settingsModal");
  }

  function closeSettings() { ui.closeModal("settingsModal"); }

  function applySettingsToUI() {
    // Sync every setting ID to the modal inputs
    const setInput = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val;
    };
    const setLabel = (id, val, unit) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val + unit;
    };

    setInput("smGameMode", settings.gameMode);
    setInput("smResignAllowed", settings.resignAllowed);
    setInput("smDrawOffersAllowed", settings.drawOffersAllowed);
    setInput("smPromotionPrompt", settings.promotionPrompt);
    setInput("smAutoQueenPromotion", settings.autoQueenPromotion);
    setInput("smMoveSound", settings.moveSound !== false);
    setInput("smTimeControl", settings.timeControl);
    setInput("smCustomTimeMinutes", settings.customTimeMinutes);
    setInput("smIncrementSeconds", settings.incrementSeconds);
    setInput("smDelaySeconds", settings.delaySeconds());
    setInput("smAutoFlagOnTimeout", settings.autoFlagOnTimeout);

    setInput("smBoardTheme", settings.boardTheme);
    setInput("smPieceSet", settings.pieceSet);
    setInput("smSquareSize", settings.squareSize);
    setInput("smBoardBorderWidth", settings.boardBorderWidth);
    setInput("smCoordinatesShown", settings.coordinatesShown);
    setInput("smLastMoveHighlight", settings.lastMoveHighlight);
    setInput("smSelectedSquareHighlight", settings.selectedSquareHighlight);
    setInput("smLegalMoveHighlights", settings.legalMoveHighlights);
    setInput("smCheckHighlight", settings.checkHighlight);
    setInput("smAnimationSpeed", settings.animationSpeed);
    setInput("smPieceDropShadow", settings.pieceDropShadow);
    setInput("smBoardReflection", settings.boardReflection);
    setInput("smGlowIntensity", settings.glowIntensity);
    setInput("smGlassmorphismOpacity", settings.glassmorphismOpacity);
    setInput("smBackgroundBlur", settings.backgroundBlur);
    setInput("smFloatingParticles", settings.floatingParticles);
    setInput("smConfettiOnGameEnd", settings.confettiOnGameEnd);
    setInput("smCursorTrail", settings.cursorTrail);
    setInput("smHoverEffects", settings.hoverEffects);
    setInput("smClickRipple", settings.clickRipple);
    setInput("smSmoothPieceMovement", settings.smoothPieceMovement);
    setInput("smMoveTrail", settings.moveTrail);

    setInput("smAutoMoveEnabled", settings.autoMoveEnabled);
    setInput("smHumanizeEnabled", settings.humanizeEnabled);
    setInput("smBotStrength", settings.botStrength);
    setInput("smAiPersonality", settings.aiPersonality);
    setInput("smMoveTimeMin", settings.moveTimeMin);
    setInput("smMoveTimeMax", settings.moveTimeMax);
    setInput("smMistakeFrequency", settings.mistakeFrequency);
    setInput("smBlunderFrequency", settings.blunderFrequency);
    setInput("smTimePressureSimulation", settings.timePressureSimulation);

    setInput("smAntiCheatEnabled", settings.antiCheatEnabled);
    setInput("smStealthMode", settings.stealthMode);
    setInput("smAcMinTime", settings.acMinTime);
    setInput("smAcMaxAcc", settings.acMaxAcc);
    setInput("smPerfectStreakLimit", settings.perfectStreakLimit);
    setInput("smTrustScoreVisible", settings.trustScoreVisible);
    setInput("smHumanizeTiming", settings.humanizeTiming);
    setInput("smOccasionalBlunders", settings.occasionalBlunders);
    setInput("smTimePressureBehavior", settings.timePressureBehavior);
    setInput("smMouseMovementSimulation", settings.mouseMovementSimulation);
    setInput("smClickTimingVariance", settings.clickTimingVariance);
    setInput("smMoveHesitation", settings.moveHesitation);
    setInput("smDeepThinkPauses", settings.deepThinkPauses);
    setInput("smUndetectableMode", settings.undetectableMode);

    setInput("smSoundEnabled", settings.soundEnabled);
    setInput("smMasterVolume", settings.masterVolume);
    setInput("smMoveSoundVolume", settings.moveSoundVolume);
    setInput("smCaptureSoundVolume", settings.captureSoundVolume);
    setInput("smCastleSoundVolume", settings.castleSoundVolume);
    setInput("smPromotionSoundVolume", settings.promotionSoundVolume);
    setInput("smCheckSoundVolume", settings.checkSoundVolume);
    setInput("smGameOverSoundVolume", settings.gameOverSoundVolume);
    setInput("smUIClickSound", settings.uiclickSound);
    setInput("smSoundPack", settings.soundPack);
    setInput("smBackgroundMusic", settings.backgroundMusic);
    setInput("smMusicVolume", settings.musicVolume);
    setInput("smMusicTrack", settings.musicTrack);

    setInput("smStartEloWhite", settings.startEloWhite);
    setInput("smStartEloBlack", settings.startEloBlack);
    setInput("smKFactor", settings.kFactor);
    setInput("smEloDisplay", settings.eloDisplay);
    setInput("smEloChangeAnimation", settings.eloChangeAnimation);
    setInput("smRatingHistory", settings.ratingHistory);
    setInput("smBestEloTracking", settings.bestEloTracking);
    setInput("smWinStreakTracking", settings.winStreakTracking);
    setInput("smLossStreakTracking", settings.lossStreakTracking);
    setInput("smDrawStreakTracking", settings.drawStreakTracking);
    setInput("smPerformanceRating", settings.performanceRating);
    setInput("smAccuracyTracking", settings.accuracyTracking);

    setInput("smTimePreset", settings.timePreset);
    setInput("smLowTimeWarningSeconds", settings.lowTimeWarningSeconds);
    setInput("smLowTimePulse", settings.lowTimePulse);
    setInput("smClockDisplayFormat", settings.clockDisplayFormat);
    setInput("smClockColor", settings.clockColor);
    setInput("smClockShadow", settings.clockShadow);
    setInput("smShowOpponentClock", settings.showOpponentClock);
    setInput("smTimePenaltyPerMove", settings.timePenaltyPerMove);

    setInput("smToastNotifications", settings.toastNotifications);
    setInput("smGameOverAlert", settings.gameOverAlert);
    setInput("smMoveMadeAlert", settings.moveMadeAlert);
    setInput("smCheckAlert", settings.checkAlert);
    setInput("smLowTimeAlert", settings.lowTimeAlert);
    setInput("smSoundNotifications", settings.soundNotifications);
    setInput("smDesktopNotifications", settings.desktopNotifications);
    setInput("smNotificationDuration", settings.notificationDuration);
    setInput("smNotificationPosition", settings.notificationPosition);

    setInput("smEngineAnalysisDepth", settings.engineAnalysisDepth);
    setInput("smShowEvaluationBar", settings.showEvaluationBar);
    setInput("smShowBestMoveLine", settings.showBestMoveLine);
    setInput("smShowPrincipalVariation", settings.showPrincipalVariation);
    setInput("smAutoFlipBoard", settings.autoFlipBoard);
    setInput("smCoordinatesStyle", settings.coordinatesStyle);
    setInput("smMoveListFont", settings.moveListFont);
    setInput("smMoveListDensity", settings.moveListDensity);
    setInput("smCompactMode", settings.compactMode);
    setInput("smDarkMode", settings.darkMode);
    setInput("smHighContrast", settings.highContrast);
    setInput("smReducedMotion", settings.reducedMotion);
    setInput("smKeyboardShortcuts", settings.keyboardShortcuts);
    setInput("smExportFormat", settings.exportFormat);
    setInput("smAutoSaveGames", settings.autoSaveGames);
    setInput("smLocalOnlyMode", settings.localOnlyMode);
    setInput("smDebugMode", settings.debugMode);

    // Range labels
    setLabel("smValMoveTimeMin", settings.moveTimeMin, "s");
    setLabel("smValMoveTimeMax", settings.moveTimeMax, "s");
    setLabel("smValSquareSize", settings.squareSize, "px");
    setLabel("smValBoardBorderWidth", settings.boardBorderWidth, "px");
    setLabel("smValAnimationSpeed", settings.animationSpeed, "x");
    setLabel("smValGlowIntensity", Math.round(settings.glowIntensity * 100), "%");
    setLabel("smValGlassmorphismOpacity", Math.round(settings.glassmorphismOpacity * 100), "%");
    setLabel("smValBackgroundBlur", settings.backgroundBlur, "px");
    setLabel("smValAcMinTime", settings.acMinTime, "s");
    setLabel("smValAcMaxAcc", settings.acMaxAcc, "%");
    setLabel("smValMistakeFrequency", Math.round(settings.mistakeFrequency * 100), "%");
    setLabel("smValBlunderFrequency", Math.round(settings.blunderFrequency * 100), "%");
    setLabel("smValMasterVolume", Math.round(settings.masterVolume * 100), "%");
    setLabel("smValMoveSoundVolume", Math.round(settings.moveSoundVolume * 100), "%");
    setLabel("smValCaptureSoundVolume", Math.round(settings.captureSoundVolume * 100), "%");
    setLabel("smValCastleSoundVolume", Math.round(settings.castleSoundVolume * 100), "%");
    setLabel("smValPromotionSoundVolume", Math.round(settings.promotionSoundVolume * 100), "%");
    setLabel("smValCheckSoundVolume", Math.round(settings.checkSoundVolume * 100), "%");
    setLabel("smValGameOverSoundVolume", Math.round(settings.gameOverSoundVolume * 100), "%");
    setLabel("smValMusicVolume", Math.round(settings.musicVolume * 100), "%");
    setLabel("smValEngineAnalysisDepth", settings.engineAnalysisDepth);

    // Range input listeners for labels
    wireRangeLabel("smMoveTimeMin", "smValMoveTimeMin", "s");
    wireRangeLabel("smMoveTimeMax", "smValMoveTimeMax", "s");
    wireRangeLabel("smSquareSize", "smValSquareSize", "px");
    wireRangeLabel("smBoardBorderWidth", "smValBoardBorderWidth", "px");
    wireRangeLabel("smAnimationSpeed", "smValAnimationSpeed", "x");
    wireRangeLabel("smGlowIntensity", "smValGlowIntensity", "%");
    wireRangeLabel("smGlassmorphismOpacity", "smValGlassmorphismOpacity", "%");
    wireRangeLabel("smBackgroundBlur", "smValBackgroundBlur", "px");
    wireRangeLabel("smAcMinTime", "smValAcMinTime", "s");
    wireRangeLabel("smAcMaxAcc", "smValAcMaxAcc", "%");
    wireRangeLabel("smMistakeFrequency", "smValMistakeFrequency", "%");
    wireRangeLabel("smBlunderFrequency", "smValBlunderFrequency", "%");
    wireRangeLabel("smMasterVolume", "smValMasterVolume", "%");
    wireRangeLabel("smMoveSoundVolume", "smValMoveSoundVolume", "%");
    wireRangeLabel("smCaptureSoundVolume", "smValCaptureSoundVolume", "%");
    wireRangeLabel("smCastleSoundVolume", "smValCastleSoundVolume", "%");
    wireRangeLabel("smPromotionSoundVolume", "smValPromotionSoundVolume", "%");
    wireRangeLabel("smCheckSoundVolume", "smValCheckSoundVolume", "%");
    wireRangeLabel("smGameOverSoundVolume", "smValGameOverSoundVolume", "%");
    wireRangeLabel("smMusicVolume", "smValMusicVolume", "%");
    wireRangeLabel("smEngineAnalysisDepth", "smValEngineAnalysisDepth");
  }

  function wireRangeLabel(inputId, labelId, unit) {
    const el = document.getElementById(inputId);
    const lab = document.getElementById(labelId);
    if (!el || !lab) return;
    el.addEventListener("input", () => {
      const v = el.value;
      lab.textContent = v + (unit || "");
      if (unit === "%") lab.textContent = Math.round(parseFloat(v) * 100) + "%";
    });
  }

  function readFromModal() {
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

  function saveSettings() {
    const next = readFromModal();
    Object.entries(next).forEach(([k, v]) => settings.set(k, v));

    gameMode = next.gameMode;
    soundEnabled = true;

    ai.setOptions({
      strength: next.botStrength,
      humanize: next.humanizeEnabled,
      minTime: next.moveTimeMin * 1000,
      maxTime: next.moveTimeMax * 1000,
      personality: next.aiPersonality
    });
    antiCheat.enabled = next.antiCheatEnabled;
    antiCheat.minMoveTime = next.acMinTime * 1000;
    antiCheat.maxAccuracy = next.acMaxAcc;
    antiCheat.perfectStreakLimit = next.perfectStreakLimit;
    elo.setOptions({ startingElo: next.startEloWhite, kFactor: next.kFactor });

    timeWhite = settings.timeSeconds();
    timeBlack = settings.timeSeconds();
    ui.setClock("white", timeWhite);
    ui.setClock("black", timeBlack);
    ui.setElo("white", elo.ratingWhite);
    ui.setElo("black", elo.ratingBlack);

    closeSettings();
    newGame();
    ui.toast("Settings saved — " + Object.keys(next).length + " options", "ok");
    playTone("ui");
  }

  function resetStats() {
    if (!confirm("Reset Elo and stats?")) return;
    stats = { games: 0, wins: 0, losses: 0, draws: 0, bestElo: 0 };
    localStorage.setItem("chess_testnet_stats", JSON.stringify(stats));
    newGame();
    ui.toast("Stats reset", "ok");
  }

  function resetSettingsAll() {
    if (!confirm("Reset ALL settings to defaults?")) return;
    settings.reset();
    closeSettings();
    newGame();
    ui.toast("Settings reset to defaults", "ok");
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

  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.settings) {
            Object.entries(data.settings).forEach(([k, v]) => settings.set(k, v));
            applySettingsToUI();
            ui.toast("Settings imported", "ok");
          }
          if (data.stats) { stats = data.stats; localStorage.setItem("chess_testnet_stats", JSON.stringify(stats)); }
          newGame();
        } catch (err) {
          ui.toast("Import failed", "err");
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
    const targetBefore = chess.square(move.to);
    playTone(targetBefore !== "." ? "capture" : "move");

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
        const pick = ai.pick(chess, { moveCount, timeLeft });
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

        let promotion = chosen.promotion;
        const movingPiece = chess.square(ui.selectedSquare);
        const toRank = 8 - rankOf(idx);
        if (movingPiece && movingPiece.toLowerCase() === "p" && (toRank === 8 || toRank === 1)) {
          if (settings.get("autoQueenPromotion")) {
            promotion = "q";
          } else if (settings.get("promotionPrompt")) {
            promotion = prompt("Promote pawn to:\nq = Queen\nr = Rook\nb = Bishop\nn = Knight\n\nEnter: q/r/b/n", "q");
            if (!promotion || !"qrbn".includes(promotion.toLowerCase())) promotion = "q";
            promotion = promotion.toLowerCase();
          }
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

    if (settings.get("confettiOnGameEnd")) {
      if (result === "white") fireConfetti(["#6366f1", "#22d3ee", "#22c55e", "#fbbf24"]);
      else if (result === "black") fireConfetti(["#ef4444", "#f59e0b", "#6366f1"]);
      else fireConfetti(["#94a3b8", "#6366f1", "#22d3ee"]);
    }

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
  // Helpers
  // -----------------------------------------------------------------
  function colorOfPiece(p) {
    return p === p.toUpperCase() ? "w" : "b";
  }
  window.sqName = (i) => String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1);

  // Kick off
  init();

})();
