/* ============================================================
   Chess Test Net — Anti-cheat / Stealth module
   
   Protects play by validating every move and monitoring timing /
   accuracy. Humanization keeps moves looking natural so accounts
   stay undetectable.
   
   Stealth features:
     - Variable, human-like move timing (not robotic)
     - Occasional deliberate imperfections (blunders, inaccuracy)
     - Trust score decay/recovery
     - Move legality validation (blocks engine-injected moves)
   
   Flags:
     - "fast_move"     : move made faster than human minimum
     - "high_accuracy" : move matches engine too often
     - "illegal_move"  : move not in legal list (blocked)
     - "perfect_streak": long run of engine-perfect moves
   
   A "trust score" (0-100) is maintained; low trust triggers warnings.
   ============================================================ */

class AntiCheat {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.minMoveTime = options.minMoveTime || 600;   // ms, human minimum
    this.maxAccuracy = options.maxAccuracy || 92;    // percent, engine-match cap
    this.perfectStreakLimit = 10;

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

  // Call before a move is made
  startMove() {
    this._lastMoveStart = Date.now();
  }

  // Validate + record a completed move
  // legalMoves: array of legal move objects (from/to/promotion/san)
  // move: the attempted move { from, to, promotion }
  // engineTop: boolean whether this move matches engine's top choice
  validate(move, legalMoves, engineTop = false) {
    if (!this.enabled) return { ok: true, trust: this.trust };

    const result = { ok: true, flags: [], trust: this.trust };

    // 1. Legality check (block illegal / engine-injected moves)
    const legal = legalMoves.find(lm =>
      lm.from === move.from && lm.to === move.to &&
      (!move.promotion || lm.promotion === lm.promotion)
    );
    if (!legal) {
      result.ok = false;
      result.flags.push("illegal_move");
      this._addFlag("illegal_move", "Move rejected: not a legal position move.", -25);
      return result;
    }

    // 2. Timing check — human minimum
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

  // Generate a stealthy, human-like delay for a move.
  // Considers position complexity so thinking time looks natural.
  stealthDelay(options = {}) {
    const min = options.minTime || this.minMoveTime;
    const max = options.maxTime || Math.max(this.minMoveTime * 4, 4000);

    // Base random delay within range
    let d = Math.random() * (max - min) + min;

    // Occasional "deep think" on complex positions
    if (Math.random() < 0.15) d *= 2.0;
    // Occasional "quick instinct" move
    if (Math.random() < 0.10) d *= 0.55;
    // Small jitter so no two moves have identical timing
    d *= (0.9 + Math.random() * 0.2);

    return Math.round(d);
  }

  // Deliberately lower accuracy sometimes so play looks human.
  // Returns true if this move should be a deliberate imperfection.
  shouldBlunder(strength = "medium") {
    const chance = {
      random: 0.50,
      weak: 0.40,
      medium: 0.20,
      strong: 0.08
    }[strength] || 0.20;
    return Math.random() < chance;
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
