/* ============================================================
   Chess Test Net — Settings manager
   Reads/writes settings to localStorage so the app remembers
   your choices after download / re-upload.
   ============================================================ */

const DEFAULTS = {
  gameMode: "pvb",           // pvb | pvp
  timeControl: "blitz",      // none | bullet | blitz | rapid | classical
  increment: 0,
  boardTheme: "green",       // green | blue | wood | dark
  pieceSet: "classic",       // classic | modern
  autoMoveEnabled: true,
  humanizeEnabled: true,
  moveTimeMin: 1.5,
  moveTimeMax: 5,
  botStrength: "medium",     // random | weak | medium | strong
  aiPersonality: "balanced", // balanced | aggressive | positional
  antiCheatEnabled: true,
  acMinTime: 0.3,
  acMaxAcc: 98,
  startElo: 1500,
  kFactor: 32
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

  timeSeconds() {
    const tc = this.values.timeControl;
    if (tc === "bullet") return 120;
    if (tc === "blitz") return 300;
    if (tc === "rapid") return 900;
    if (tc === "classical") return 1800;
    return 0;
  }

  incrementSeconds() {
    return this.values.increment || 0;
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
}

const settings = new Settings();
if (typeof window !== "undefined") window.settings = settings;
if (typeof window !== "undefined") window.DEFAULTS = DEFAULTS;
