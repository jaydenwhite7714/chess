/* ============================================================
   Chess Test Net — Anti-Cheat / Stealth
   
   Purpose: keep play looking 100% human so accounts stay
   unbanned / undetectable.
   
   What it does:
   - Validates every move is legal (blocks engine-injected moves that
     would be instantly detectable)
   - Tracks move timing and accuracy
   - Suggests human-like delays so timing never looks robotic
   - Maintains a "trust score" — high trust = looks human
   - Flags only truly suspicious patterns (impossible speeds,
     engine-perfect long streaks) and nudges toward human behavior
   
   Stealth principles:
   - Never flag a good move as cheating
   - Encourage natural variance in timing and move quality
   - Trust score recovers when you play naturally
   ============================================================ */

class AntiCheat {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.minMoveTime = options.minMoveTime || 500;   // ms, human floor
    this.maxAccuracy = options.maxAccuracy || 95;    // percent engine-match cap
    this.perfectStreakLimit = 14;

    this.sessionId = this._sessionId();
    this.startTime = Date.now();

    this.trust = 100;       // 100 = looks perfectly human
    this.flags = [];
    this.warnings = [];

    this.moveTimes = [];
    this.perfectStreak = 0;
    this.totalMoves = 0;
    this.engineMatches = 0;

    this._lastMoveStart = null;
  }

  _sessionId() {
    return "sc_" + Math.random().toString(36).slice(2, 14) +
           "_" + Date.now().toString(36);
  }

  // Call right before making a move
  startMove() {
    this._lastMoveStart = Date.now();
  }

  // Validate a completed move.
  // legalMoves: legal move objects from chess.moves({verbose:true})
  // move: { from, to, promotion }
  // engineTop: does this match the engine's best move?
  validate(move, legalMoves, engineTop = false) {
    if (!this.enabled) return { ok: true, trust: this.trust };

    const result = { ok: true, flags: [], trust: this.trust, stealthy: true };

    // 1. Legality — only block truly illegal moves (engine injection)
    const legal = legalMoves.find(lm =>
      lm.from === move.from && lm.to === move.to &&
      (!move.promotion || lm.promotion === lm.promotion)
    );
    if (!legal) {
      result.ok = false;
      result.flags.push("illegal_move");
      result.stealthy = false;
      this._addFlag("illegal_move", "Illegal move blocked.", -30);
      return result;
    }

    // 2. Timing — too fast is suspicious
    const elapsed = this._lastMoveStart ? Date.now() - this._lastMoveStart : 0;
    if (elapsed < this.minMoveTime && elapsed > 0) {
      result.flags.push("fast_move");
      result.stealthy = false;
      this._addFlag("fast_move", `Move ${elapsed}ms (too fast, human floor ${this.minMoveTime}ms).`, -6);
    }

    // 3. Accuracy tracking — engine-perfect streaks are the #1 ban trigger
    this.totalMoves++;
    if (engineTop) {
      this.engineMatches++;
      this.perfectStreak++;
    } else {
      this.perfectStreak = 0;
    }

    const accuracy = this.totalMoves > 0
      ? Math.round((this.engineMatches / this.totalMoves) * 100)
      : 0;

    if (accuracy > this.maxAccuracy && this.totalMoves >= 8) {
      result.flags.push("high_accuracy");
      result.stealthy = false;
      this._addFlag("high_accuracy",
        `Accuracy ${accuracy}% — play a few non-best moves to look human.`, -8);
    }

    if (this.perfectStreak >= this.perfectStreakLimit) {
      result.flags.push("perfect_streak");
      result.stealthy = false;
      this._addFlag("perfect_streak",
        `${this.perfectStreak} engine-perfect moves in a row — mix it up.`, -10);
    }

    // Record timing
    this.moveTimes.push({ ply: this.totalMoves, ms: elapsed, san: legal.san || "" });

    // Trust: decay on flags, slow recovery when clean
    const penalty = result.flags.reduce((sum, f) => sum + this._flagPenalty(f), 0);
    this.trust = Math.max(0, Math.min(100, this.trust - penalty));
    if (result.flags.length === 0) this.trust = Math.min(100, this.trust + 0.5);
    result.trust = Math.round(this.trust);
    result.stealthy = this.trust > 70;

    return result;
  }

  _flagPenalty(f) {
    switch (f) {
      case "illegal_move": return 30;
      case "high_accuracy": return 8;
      case "perfect_streak": return 10;
      case "fast_move": return 6;
      default: return 0;
    }
  }

  _addFlag(code, description, penalty) {
    this.flags.push({
      code, description, penalty,
      time: Date.now() - this.startTime,
      trust: this.trust
    });
    if (penalty < 0) {
      this.warnings.push({
        code, description,
        severity: penalty <= -15 ? "high" : "medium",
        time: Date.now() - this.startTime
      });
    }
  }

  // Suggest a human-like delay for the next move.
  // Complexity (0-1) — more pieces on board = longer think.
  suggestDelay(options = {}) {
    const min = options.minTime || this.minMoveTime;
    const max = options.maxTime || Math.max(this.minMoveTime * 5, 5000);
    const complexity = options.complexity || 0.5;

    let d = min + (max - min) * (0.25 + complexity * 0.6 + Math.random() * 0.25);

    // Occasional instant move
    if (Math.random() < 0.08) d *= 0.3;
    // Occasional deep think
    if (Math.random() < 0.10) d *= 2.2;

    return Math.round(d);
  }

  status() {
    return {
      sessionId: this.sessionId,
      enabled: this.enabled,
      trust: Math.round(this.trust),
      totalMoves: this.totalMoves,
      accuracy: this.totalMoves ? Math.round((this.engineMatches / this.totalMoves) * 100) : 0,
      perfectStreak: this.perfectStreak,
      flags: this.flags.length,
      warnings: this.warnings.length,
      healthy: this.trust > 60,
      undetectable: this.trust > 80
    };
  }

  reset() {
    this.trust = 100;
    this.flags = [];
    this.warnings = [];
    this.moveTimes = [];
    this.perfectStreak = 0;
    this.totalMoves = 0;
    this.engineMatches = 0;
    this.sessionId = this._sessionId();
    this.startTime = Date.now();
  }
}

if (typeof window !== "undefined") window.AntiCheat = AntiCheat;
