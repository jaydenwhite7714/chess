/* ============================================================
   Chess Test Net — Human-like AI
   Plays like a real person, not an engine:
   - Position-dependent thinking time (complex = longer think)
   - Deliberate but natural mistakes (miscalculations, not random blunders)
   - Occasional instant moves (obvious recaptures, simple develops)
   - Occasional long pauses (calculating tactics)
   - Time-pressure behavior (faster when clock is low)
   - Move personality: sometimes picks 2nd/3rd best instead of best
   - Never plays perfectly — always has a human margin of error
   - Undetectable: no engine-perfect consistency
   ============================================================ */

const AI_PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function fileOf(s) { return s % 8; }
function rankOf(s) { return (s / 8) | 0; }
function sq(f, r) { return r * 8 + f; }
function colorOf(piece) {
  if (!piece || piece === ".") return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

function scoreMove(chess, m) {
  let s = 0;
  if (m.capture !== ".") {
    const victim = AI_PIECE_VALUES[m.capture.toLowerCase()] || 0;
    const attacker = AI_PIECE_VALUES[m.fromPiece.toLowerCase()] || 0;
    s += 2000 + victim - attacker; // MVV-LVA
  }
  if (m.promotion) s += 1800;
  const center = [sq(3,3), sq(4,3), sq(3,4), sq(4,4)];
  if (center.includes(m.to)) s += 15;
  const r = rankOf(m.to);
  if ((colorOf(m.fromPiece) === "w" && r <= 2) || (colorOf(m.fromPiece) === "b" && r >= 5)) s += 8;
  return s;
}

class ChessAI {
  constructor(options = {}) {
    this.strength = options.strength || "medium";
    this.humanize = options.humanize !== false;
    this.minTime = options.minTime || 1200;
    this.maxTime = options.maxTime || 6000;
    this.personality = options.personality || "balanced";
    this._setMistakeChance();
  }

  setOptions(options) {
    if (options.strength) this.strength = options.strength;
    if (options.humanize !== undefined) this.humanize = options.humanize;
    if (options.minTime !== undefined) this.minTime = options.minTime;
    if (options.maxTime !== undefined) this.maxTime = options.maxTime;
    if (options.personality) this.personality = options.personality;
    this._setMistakeChance();
  }

  _setMistakeChance() {
    this.mistakeChance = {
      random: 0.60, weak: 0.45, medium: 0.28, strong: 0.14, master: 0.08, grandmaster: 0.04
    }[this.strength] || 0.28;
  }

  // Human-like delay based on position complexity + personality
  delay(chess = null, moveCount = 0, timeLeft = null) {
    let complexity = 0;
    if (chess) {
      for (let i = 0; i < 64; i++) {
        const p = chess.square(i);
        if (p && p !== ".") complexity++;
      }
    }
    let base = this.minTime + (this.maxTime - this.minTime) * 0.3;
    base += (complexity / 64) * (this.maxTime - this.minTime) * 0.5;

    if (this.personality === "aggressive") base *= 0.85;
    if (this.personality === "positional") base *= 1.15;

    // Time pressure: hurry when clock is low
    if (timeLeft != null && timeLeft < 60) base *= 0.5;
    else if (timeLeft != null && timeLeft < 120) base *= 0.75;

    let d = base * (0.7 + Math.random() * 0.8);

    // Occasional "instant" move
    if (Math.random() < 0.10) d *= 0.25;
    // Occasional "deep think" pause
    if (Math.random() < 0.12) d *= 2.4;
    // Early game: faster development
    if (moveCount < 10 && Math.random() < 0.4) d *= 0.6;

    return Math.round(d);
  }

  pick(chess, options = {}) {
    const legal = chess.legalMoves();
    if (!legal.length) return null;
    legal.forEach(m => { m.fromPiece = chess.square(m.from); });

    const choice = this._chooseMove(chess, legal);

    return {
      move: { from: choice.from, to: choice.to, promotion: choice.promotion },
      delayMs: this.delay(chess, options.moveCount || 0, options.timeLeft),
      san: choice.san,
      strength: this.strength,
      personality: this.personality
    };
  }

  _chooseMove(chess, legal) {
    if (this.strength === "random") {
      return legal[Math.floor(Math.random() * legal.length)];
    }

    const scored = legal.map(m => ({ m, score: scoreMove(chess, m) }));
    scored.sort((a, b) => b.score - a.score);
    const bestScore = scored[0].score;

    // Humanization: occasionally skip the best move (looks like miscalculation)
    if (this.humanize && Math.random() < this.mistakeChance && scored.length > 2) {
      const mid = Math.floor(scored.length / 2);
      const tier = scored.slice(mid, Math.min(scored.length, mid + 4));
      if (tier.length) {
        tier.sort((a, b) => b.score - a.score);
        const pickIdx = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * tier.length);
        return tier[pickIdx].m;
      }
    }

    if (this.strength === "strong") {
      if (Math.random() < 0.9) return scored[0].m;
      return scored[Math.min(2, scored.length - 1)].m;
    }
    if (this.strength === "medium") {
      const top = scored.slice(0, 3);
      const r = Math.random();
      if (r < 0.55) return top[0].m;
      if (r < 0.85) return top[1] || top[0];
      return top[2] || top[0];
    }
    if (this.strength === "master") {
      if (Math.random() < 0.85) return scored[0].m;
      return scored[1] || scored[0];
    }
    if (this.strength === "grandmaster") {
      return scored[0].m;
    }
    // weak: wider spread
    const top = scored.slice(0, 6);
    return top[Math.floor(Math.random() * top.length)];
  }

  shouldInaccurate() {
    return this.humanize && Math.random() < this.mistakeChance;
  }
}

if (typeof window !== "undefined") window.ChessAI = ChessAI;
