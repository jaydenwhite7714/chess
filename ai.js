/* ============================================================
   Chess Test Net — AI / auto-move module
   - Picks a move based on strength (random / weak / medium / strong)
   - Humanization: occasional suboptimal moves + natural timing
   - Returns { move, delayMs }
   ============================================================ */

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

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
    const victim = PIECE_VALUES[m.capture.toLowerCase()] || 0;
    const attacker = PIECE_VALUES[m.fromPiece.toLowerCase()] || 0;
    s += 1000 + victim - attacker; // MVV-LVA
  }
  if (m.promotion) s += 900;
  const center = [sq(3,3), sq(4,3), sq(3,4), sq(4,4)];
  if (center.includes(m.to)) s += 10;
  return s;
}

class ChessAI {
  constructor(options = {}) {
    this.strength = options.strength || "medium";
    this.humanize = options.humanize !== false;
    this.minTime = options.minTime || 1500;
    this.maxTime = options.maxTime || 5000;
    this._setMistakeChance();
  }

  setOptions(options) {
    if (options.strength) this.strength = options.strength;
    if (options.humanize !== undefined) this.humanize = options.humanize;
    if (options.minTime !== undefined) this.minTime = options.minTime;
    if (options.maxTime !== undefined) this.maxTime = options.maxTime;
    this._setMistakeChance();
  }

  _setMistakeChance() {
    this.mistakeChance = {
      random: 0.50,
      weak: 0.35,
      medium: 0.15,
      strong: 0.05
    }[this.strength] || 0.15;
  }

  // Human-like delay in ms within [minTime, maxTime], with occasional variance
  delay() {
    let d = Math.random() * (this.maxTime - this.minTime) + this.minTime;
    if (Math.random() < 0.12) d *= 2.2;   // deep think
    if (Math.random() < 0.08) d *= 0.5;   // quick instinct
    return Math.round(d);
  }

  pick(chess) {
    const legal = chess.legalMoves();
    if (!legal.length) return null;
    legal.forEach(m => { m.fromPiece = chess.square(m.from); });

    const choice = this._chooseMove(chess, legal);

    return {
      move: { from: choice.from, to: choice.to, promotion: choice.promotion },
      delayMs: this.delay(),
      san: choice.san,
      strength: this.strength
    };
  }

  _chooseMove(chess, legal) {
    if (this.strength === "random") {
      return legal[Math.floor(Math.random() * legal.length)];
    }

    const scored = legal.map(m => ({ m, score: scoreMove(chess, m) }));
    const maxScore = Math.max(...scored.map(s => s.score));
    const best = scored.filter(s => s.score === maxScore);

    // Humanization: occasionally play a non-best move (looks natural, avoids bans)
    if (this.humanize && Math.random() < this.mistakeChance && scored.length > 1) {
      const nonBest = scored.filter(s => s.score < maxScore);
      if (nonBest.length) {
        nonBest.sort((a, b) => b.score - a.score);
        const pick = nonBest[Math.floor(Math.random() * Math.min(3, nonBest.length))];
        return pick.m;
      }
    }

    if (this.strength === "strong") return best[0].m;
    const top = scored.sort((a, b) => b.score - a.score).slice(0, this.strength === "weak" ? 6 : 4);
    return top[Math.floor(Math.random() * top.length)].m;
  }
}

if (typeof window !== "undefined") window.ChessAI = ChessAI;
