/* ============================================================
   Chess Test Net — Settings Manager (MASSIVE)
   120+ settings organized into categories. Everything is
   persisted to localStorage so your setup survives downloads
   and re-uploads.
   ============================================================ */

const DEFAULTS = {
  // ---------------- GAMEPLAY ----------------
  gameMode: "pvb",                    // pvb | pvp | puzzle | engine
  autoMoveEnabled: true,
  humanizeEnabled: true,
  moveTimeMin: 1.5,
  moveTimeMax: 5,
  botStrength: "medium",              // random | weak | medium | strong | master | grandmaster
  aiPersonality: "balanced",          // balanced | aggressive | positional | tactical | chaotic
  mistakeFrequency: 0.25,             // 0-1
  blunderFrequency: 0.05,             // 0-1
  timePressureSimulation: true,
  timeControl: "blitz",               // none | bullet | blitz | rapid | classical | custom
  customTimeMinutes: 10,
  customIncrementSeconds: 0,
  increment: 0,
  resignAllowed: true,
  drawOffersAllowed: true,
  promotionPrompt: true,
  autoQueenPromotion: false,

  // ---------------- BOARD & VISUALS ----------------
  boardTheme: "green",                // green | blue | wood | dark | marble | neon | cat | space | ocean | fire | ice | candy | retro | minimal
  pieceSet: "classic",                // classic | modern | fantasy | minimal | pixel | marble | glass | neon
  squareSize: 60,                     // px (responsive override)
  boardBorderWidth: 14,
  boardShadowIntensity: 0.6,
  coordinatesShown: true,
  lastMoveHighlight: true,
  selectedSquareHighlight: true,
  legalMoveHighlights: true,
  checkHighlight: true,
  animationSpeed: 1.0,                // 0.25 - 3
  pieceDropShadow: true,
  boardReflection: false,
  glowIntensity: 0.5,
  glassmorphismOpacity: 0.72,
  backgroundBlur: 20,
  backgroundGradientSpeed: 12,        // seconds
  floatingParticles: true,
  confettiOnGameEnd: true,
  cursorTrail: false,
  hoverEffects: true,
  clickRipple: true,
  smoothPieceMovement: true,
  moveTrail: false,

  // ---------------- SOUND & AUDIO ----------------
  soundEnabled: true,
  masterVolume: 0.8,
  moveSoundVolume: 0.6,
  captureSoundVolume: 0.8,
  castleSoundVolume: 0.7,
  promotionSoundVolume: 0.9,
  checkSoundVolume: 0.9,
  gameOverSoundVolume: 1.0,
  uiclickSound: true,
  soundPack: "classic",               // classic | electronic | orchestral | retro | minimal
  backgroundMusic: false,
  musicVolume: 0.3,
  musicTrack: "ambient",              // ambient | lofi | classical | electronic | jazz

  // ---------------- ANTI-CHEAT & STEALTH ----------------
  antiCheatEnabled: true,
  stealthMode: true,
  acMinTime: 0.5,
  acMaxAcc: 95,
  perfectStreakLimit: 14,
  trustScoreVisible: true,
  humanizeTiming: true,
  occasionalBlunders: true,
  timePressureBehavior: true,
  mouseMovementSimulation: true,
  clickTimingVariance: true,
  moveHesitation: true,
  deepThinkPauses: true,
  trustRecoveryRate: 0.5,
  undetectableMode: true,

  // ---------------- ELO & RATING ----------------
  startEloWhite: 1500,
  startEloBlack: 1500,
  kFactor: 32,
  eloDisplay: true,
  eloChangeAnimation: true,
  ratingHistory: true,
  bestEloTracking: true,
  winStreakTracking: true,
  lossStreakTracking: true,
  drawStreakTracking: true,
  performanceRating: true,
  accuracyTracking: true,

  // ---------------- TIME CONTROLS ----------------
  timePreset: "blitz",
  baseTimeMinutes: 10,
  incrementSeconds: 0,
  delaySeconds: 0,                    // Fischer/Bronstein delay
  timePenaltyPerMove: 0,
  autoFlagOnTimeout: true,
  lowTimeWarningSeconds: 30,
  lowTimePulse: true,
  clockDisplayFormat: "mm:ss",        // mm:ss | h:mm:ss | seconds
  clockColor: "accent",               // accent | white | red | blue | green
  clockShadow: true,
  showOpponentClock: true,

  // ---------------- NOTIFICATIONS & ALERTS ----------------
  toastNotifications: true,
  gameOverAlert: true,
  moveMadeAlert: false,
  checkAlert: true,
  lowTimeAlert: true,
  premoveAlert: false,
  soundNotifications: true,
  desktopNotifications: false,
  notificationDuration: 3000,         // ms
  notificationPosition: "bottom",     // bottom | top | top-right | bottom-right

  // ---------------- ADVANCED / EXPERIMENTAL ----------------
  engineAnalysisDepth: 3,             // 1-10
  showEvaluationBar: false,
  showBestMoveLine: false,
  showPrincipalVariation: false,
  autoFlipBoard: false,
  coordinatesStyle: "standard",       // standard | algebraic | none
  moveListFont: "mono",               // mono | sans | serif
  moveListSize: 0.82,                 // rem multiplier
  moveListDensity: "normal",          // compact | normal | spacious
  compactMode: false,
  darkMode: true,
  highContrast: false,
  reducedMotion: false,
  keyboardShortcuts: true,
  exportFormat: "json",               // json | pgn | fen
  autoSaveGames: true,
  localOnlyMode: true,
  debugMode: false
};

class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem("chess_testnet_settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        this.values = { ...DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.warn("Settings load failed", e);
    }
  }

  save() {
    try {
      localStorage.setItem("chess_testnet_settings", JSON.stringify(this.values));
    } catch (e) {
      console.warn("Settings save failed", e);
    }
  }

  get(key) { return this.values[key]; }
  set(key, value) {
    this.values[key] = value;
    this.save();
  }

  // Time control seconds
  timeSeconds() {
    const tc = this.values.timeControl;
    if (tc === "bullet") return 120;
    if (tc === "blitz") return 300;
    if (tc === "rapid") return 900;
    if (tc === "classical") return 1800;
    if (tc === "custom") return this.values.customTimeMinutes * 60;
    return 300;
  }

  incrementSeconds() {
    return this.values.incrementSeconds || 0;
  }

  delaySeconds() {
    return this.values.delaySeconds || 0;
  }

  reset() {
    this.values = { ...DEFAULTS };
    this.save();
  }

  export() {
    return JSON.stringify(this.values, null, 2);
  }

  import(json) {
    try {
      const parsed = JSON.parse(json);
      this.values = { ...DEFAULTS, ...parsed };
      this.save();
      return true;
    } catch (e) {
      return false;
    }
  }

  // Get all settings in a category
  getCategory(prefix) {
    const out = {};
    for (const [k, v] of Object.entries(this.values)) {
      if (k.startsWith(prefix)) out[k] = v;
    }
    return out;
  }
}

const settings = new Settings();
if (typeof window !== "undefined") window.settings = settings;
if (typeof window !== "undefined") window.DEFAULTS = DEFAULTS;
