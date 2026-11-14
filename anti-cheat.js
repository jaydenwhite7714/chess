/* ============================================================
   Chess Test Net — Anti-cheat module
   
   Protects play by validating every move and monitoring timing /
   accuracy. Humanization keeps moves looking natural so accounts
   stay unbanned.
   
   Flags:
     - "fast_move"     : move made faster than the minimum time
     - "high_accuracy" : move matches engine top choice too often
     - "illegal_move"  : move not in legal move list (blocked)
     - "perfect_streak": long run of engine-perfect moves
   
   A "trust score" (0-100) is maintained; low trust triggers warnings.
   ============================================================ */

class AntiCheat {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.minMoveTime = options.minMoveTime || 300; // ms
    this.maxAccuracy = options.maxAccuracy || 98;   // percent
    this.perfectStreakLimit = 12;

    this.sessionId = this._sessionId();
    this.startTime = Date.now();

    this.trust = 100;
    this.flags = [];
    this.warnings = [];

    this.moveTimes = [];        // { ply, ms, san }
    this.perfectStreak = 0;
    this.totalMoves = 0;
    this.engineMatches = 0;

    this._lastMoveStart = null;
  }

  _sessionId() {
    return "sc_" + Math.random().toString(36).slice(2, 12) +
           "_" + Date.now().toString(36);
  }

  // Call before a player move is made
  startMove() {
    this._lastMoveStart = Date.now();
  }

  // Validate + record a completed player move
  // legalMoves: array of legal move objects (from/to/promotion/san)
  // move: the attempted move { from, to, promotion }
  // engineTop: boolean whether this move matches engine's top choice
  validate(move, legalMoves, engineTop = false) {
    if (!this.enabled) return { ok: true, trust: this.trust };

    const result = { ok: true, flags: [], trust: this.trust };

    // 1. Legality check (block illegal / engine-injected moves)
    const legal = legalMoves.find(lm =>
      lm.from === move.from && lm.to === move.to &&
      (!move.promotion || lm.promotion === move.promotion)
    );
    if (!legal) {
      result.ok = false;
      result.flags.push("illegal_move");
      this._addFlag("illegal_move", "Move rejected: not a legal position move.", -25);
      return result;
    }

    // 2. Timing check
    const elapsed = this._lastMoveStart ? Date.now() - this._lastMoveStart : 0;
    if (elapsed < this.minMoveTime) {
      result.flags.push("fast_move");
      this._addFlag("fast_move", `Move too fast (${elapsed}ms < ${this.minMoveTime}ms).`, -8);
    }

    // 3. Accuracy / engine match
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

    if (accuracy > this.maxAccuracy && this.totalMoves >= 6) {
      result.flags.push("high_accuracy");
      this._addFlag("high_accuracy",
        `Accuracy ${accuracy}% exceeds ${this.maxAccuracy}% threshold.`, -10);
    }

    if (this.perfectStreak >= this.perfectStreakLimit) {
      result.flags.push("perfect_streak");
      this._addFlag("perfect_streak",
        `${this.perfectStreak} consecutive engine-precise moves.`, -6);
    }

    // Record timing
    this.moveTimes.push({
      ply: this.totalMoves,
      ms: elapsed,
      san: legal.san || ""
    });

    // Trust decay / recovery
    const penalty = result.flags.reduce((sum, f) => sum + this._flagPenalty(f), 0);
    this.trust = Math.max(0, Math.min(100, this.trust - penalty));
    if (result.flags.length === 0) {
      this.trust = Math.min(100, this.trust + 1); // slow recovery
    }
    result.trust = this.trust;

    return result;
  }

  _flagPenalty(flag) {
    switch (flag) {
      case "illegal_move": return 25;
      case "high_accuracy": return 10;
      case "perfect_streak": return 6;
      case "fast_move": return 8;
      default: return 0;
    }
  }

  _addFlag(code, description, penalty) {
    const flag = {
      code, description, penalty,
      time: Date.now() - this.startTime,
      trust: this.trust
    };
    this.flags.push(flag);
    if (penalty < 0) {
      this.warnings.push({
        code, description,
        severity: penalty <= -15 ? "high" : "medium",
        time: flag.time
      });
    }
  }

  // Suggest a humanized delay so the player's own moves look natural
  suggestedDelay(min, max) {
    const base = Math.random() * (max - min) + min;
    const jitter = Math.random() < 0.15 ? base * 0.4 : 0;
    return Math.round(base + jitter);
  }

  status() {
    return {
      sessionId: this.sessionId,
      enabled: this.enabled,
      trust: this.trust,
      totalMoves: this.totalMoves,
      accuracy: this.totalMoves
        ? Math.round((this.engineMatches / this.totalMoves) * 100)
        : 0,
      perfectStreak: this.perfectStreak,
      flags: this.flags.length,
      warnings: this.warnings.length,
      healthy: this.trust > 60
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
