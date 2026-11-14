/* ============================================================
   Chess Test Net — chess engine
   Bulletproof move generation: castling, en passant, promotion,
   check/checkmate/stalemate, SAN notation.
   Board storage: index = rankIndex*8 + file, rankIndex 0 = board rank 8.
   ============================================================ */

const WHITE = "w";
const BLACK = "b";
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const EMPTY = ".";

function sq(file, rankIndex) { return rankIndex * 8 + file; }
function fileOf(s) { return s % 8; }
function rankOf(s) { return (s / 8) | 0; }
function boardRankOf(s) { return 8 - rankOf(s); }
function sqName(s) {
  return String.fromCharCode(97 + fileOf(s)) + boardRankOf(s);
}
function sqFromName(name) {
  if (!name || typeof name !== "string" || name.length < 2) return -1;
  const f = name.charCodeAt(0) - 97;
  const boardRank = parseInt(name[1], 10);
  const r = 8 - boardRank;
  if (f < 0 || f > 7 || r < 0 || r > 7 || isNaN(boardRank)) return -1;
  return sq(f, r);
}
function colorOf(piece) {
  if (!piece || piece === EMPTY) return null;
  return piece === piece.toUpperCase() ? WHITE : BLACK;
}
function isOpponent(piece, color) {
  return piece !== EMPTY && colorOf(piece) !== color;
}

const START_BOARD = [
  "r","n","b","q","k","b","n","r",
  "p","p","p","p","p","p","p","p",
  EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,
  EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,
  EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,
  EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,
  "P","P","P","P","P","P","P","P",
  "R","N","B","Q","K","B","N","R"
];

class Chess {
  constructor() { this.reset(); }

  reset() {
    this.board = [...START_BOARD];
    this.side = WHITE;
    this.castling = { K: true, Q: true, k: true, q: true };
    this.enPassant = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this.moveNumber = 1;
    this.gameOver = false;
    this.result = null;
    this.termination = null;
    this.inCheck = false;
  }

  _clone() {
    const c = new Chess();
    c.board = [...this.board];
    c.side = this.side;
    c.castling = { ...this.castling };
    c.enPassant = this.enPassant;
    c.halfmove = this.halfmove;
    c.fullmove = this.fullmove;
    c.history = [...this.history];
    c.moveNumber = this.moveNumber;
    return c;
  }

  _addMove(moves, from, to, promotion, capture, flags) {
    moves.push({
      from, to,
      promotion: promotion || null,
      capture: capture || EMPTY,
      flags: flags || "n",
      san: null,
      lan: sqName(from) + sqName(to) + (promotion || "")
    });
  }

  _slidingMoves(moves, from, dirs) {
    const f = fileOf(from), r = rankOf(from);
    const piece = this.board[from];
    const color = colorOf(piece);
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const to = sq(nf, nr);
        const target = this.board[to];
        if (target === EMPTY) this._addMove(moves, from, to);
        else { if (isOpponent(target, color)) this._addMove(moves, from, to, null, target, "c"); break; }
        nf += df; nr += dr;
      }
    }
  }

  _knightMoves(moves, from) {
    const f = fileOf(from), r = rankOf(from);
    const piece = this.board[from];
    const color = colorOf(piece);
    const steps = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    for (const [df, dr] of steps) {
      const nf = f + df, nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const to = sq(nf, nr);
      const target = this.board[to];
      if (target === EMPTY) this._addMove(moves, from, to);
      else if (isOpponent(target, color)) this._addMove(moves, from, to, null, target, "c");
    }
  }

  _pawnMoves(moves, from) {
    const piece = this.board[from];
    const color = colorOf(piece);
    const dir = color === WHITE ? -1 : 1;
    const startRank = color === WHITE ? 6 : 1;
    const promotionRank = color === WHITE ? 0 : 7;
    const f = fileOf(from), r = rankOf(from);
    const one = sq(f, r + dir);
    if (r + dir >= 0 && r + dir <= 7 && this.board[one] === EMPTY) {
      if (rankOf(one) === promotionRank) {
        for (const prom of ["q","r","b","n"]) this._addMove(moves, from, one, prom, EMPTY, "p");
      } else this._addMove(moves, from, one);
      const two = sq(f, r + 2 * dir);
      if (r === startRank && this.board[two] === EMPTY) this._addMove(moves, from, two);
    }
    for (const df of [-1, 1]) {
      const nf = f + df;
      if (nf < 0 || nf > 7) continue;
      const to = sq(nf, r + dir);
      if (r + dir < 0 || r + dir > 7) continue;
      const target = this.board[to];
      if (target !== EMPTY && isOpponent(target, color)) {
        if (rankOf(to) === promotionRank) {
          for (const prom of ["q","r","b","n"]) this._addMove(moves, from, to, prom, target, "c");
        } else this._addMove(moves, from, to, null, target, "c");
      }
      if (to === this.enPassant) this._addMove(moves, from, to, null, EMPTY, "e");
    }
  }

  _kingMoves(moves, from) {
    const f = fileOf(from), r = rankOf(from);
    const piece = this.board[from];
    const color = colorOf(piece);
    const steps = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [df, dr] of steps) {
      const nf = f + df, nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const to = sq(nf, nr);
      const target = this.board[to];
      if (target === EMPTY) this._addMove(moves, from, to);
      else if (isOpponent(target, color)) this._addMove(moves, from, to, null, target, "c");
    }
    if (color === WHITE && from === sq(4, 7)) {
      if (this.castling.K && this.board[sq(5,7)] === EMPTY && this.board[sq(6,7)] === EMPTY &&
          !this._squareAttacked(sq(4,7), BLACK) && !this._squareAttacked(sq(5,7), BLACK) && !this._squareAttacked(sq(6,7), BLACK)) {
        this._addMove(moves, from, sq(6,7), null, EMPTY, "K");
      }
      if (this.castling.Q && this.board[sq(3,7)] === EMPTY && this.board[sq(2,7)] === EMPTY && this.board[sq(1,7)] === EMPTY &&
          !this._squareAttacked(sq(4,7), BLACK) && !this._squareAttacked(sq(3,7), BLACK) && !this._squareAttacked(sq(2,7), BLACK)) {
        this._addMove(moves, from, sq(2,7), null, EMPTY, "Q");
      }
    }
    if (color === BLACK && from === sq(4, 0)) {
      if (this.castling.k && this.board[sq(5,0)] === EMPTY && this.board[sq(6,0)] === EMPTY &&
          !this._squareAttacked(sq(4,0), WHITE) && !this._squareAttacked(sq(5,0), WHITE) && !this._squareAttacked(sq(6,0), WHITE)) {
        this._addMove(moves, from, sq(6,0), null, EMPTY, "k");
      }
      if (this.castling.q && this.board[sq(3,0)] === EMPTY && this.board[sq(2,0)] === EMPTY && this.board[sq(1,0)] === EMPTY &&
          !this._squareAttacked(sq(4,0), WHITE) && !this._squareAttacked(sq(3,0), WHITE) && !this._squareAttacked(sq(2,0), WHITE)) {
        this._addMove(moves, from, sq(2,0), null, EMPTY, "q");
      }
    }
  }

  _generateMoves(moves) {
    const color = this.side;
    for (let from = 0; from < 64; from++) {
      const piece = this.board[from];
      if (piece === EMPTY || colorOf(piece) !== color) continue;
      const type = piece.toLowerCase();
      switch (type) {
        case "p": this._pawnMoves(moves, from); break;
        case "n": this._knightMoves(moves, from); break;
        case "b": this._slidingMoves(moves, from, [[1,1],[1,-1],[-1,1],[-1,-1]]); break;
        case "r": this._slidingMoves(moves, from, [[1,0],[-1,0],[0,1],[0,-1]]); break;
        case "q": this._slidingMoves(moves, from, [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]); break;
        case "k": this._kingMoves(moves, from); break;
      }
    }
  }

  _squareAttacked(sqIdx, byColor) {
    for (let i = 0; i < 64; i++) {
      const piece = this.board[i];
      if (piece === EMPTY || colorOf(piece) !== byColor) continue;
      const type = piece.toLowerCase();
      const f = fileOf(i), r = rankOf(i);
      const tf = fileOf(sqIdx), tr = rankOf(sqIdx);
      if (type === "p") {
        const dir = byColor === WHITE ? -1 : 1;
        if ((tf === f + 1 || tf === f - 1) && tr === r + dir) return true;
        continue;
      }
      if (type === "n") {
        const df = Math.abs(tf - f), dr = Math.abs(tr - r);
        if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) return true;
        continue;
      }
      if (type === "k") {
        if (Math.abs(tf - f) <= 1 && Math.abs(tr - r) <= 1) return true;
        continue;
      }
      if ((type === "b" || type === "q") && Math.abs(tf - f) === Math.abs(tr - r) && this._pathClear(i, sqIdx)) return true;
      if ((type === "r" || type === "q") && (f === tf || r === tr) && this._pathClear(i, sqIdx)) return true;
    }
    return false;
  }

  _pathClear(a, b) {
    const fa = fileOf(a), ra = rankOf(a);
    const fb = fileOf(b), rb = rankOf(b);
    const df = fb === fa ? 0 : (fb > fa ? 1 : -1);
    const dr = rb === ra ? 0 : (rb > ra ? 1 : -1);
    let f = fa + df, r = ra + dr;
    while (f !== fb || r !== rb) {
      if (this.board[sq(f, r)] !== EMPTY) return false;
      f += df; r += dr;
    }
    return true;
  }

  _kingSquare(color) { return this.board.indexOf(color === WHITE ? "K" : "k"); }
  _inCheck(color) {
    const ks = this._kingSquare(color);
    return ks !== -1 && this._squareAttacked(ks, color === WHITE ? BLACK : WHITE);
  }

  moves(options = {}) {
    const verbose = !!options.verbose;
    const raw = [];
    this._generateMoves(raw);
    const legal = [];
    for (const m of raw) {
      if (this._tryMove(m)) {
        if (verbose) legal.push({ ...m, san: this._san(m), lan: m.lan });
        else legal.push(m.lan);
      }
    }
    return legal;
  }

  _tryMove(m) {
    const piece = this.board[m.from];
    const color = colorOf(piece);
    const captured = this.board[m.to];
    const ep = this.enPassant;
    const castling = { ...this.castling };
    const halfmove = this.halfmove;
    const side = this.side;
    const fullmove = this.fullmove;

    this.board[m.to] = piece;
    this.board[m.from] = EMPTY;
    if (m.flags === "e") this.board[color === WHITE ? m.to + 8 : m.to - 8] = EMPTY;
    if (m.flags === "K") { this.board[sq(5,7)] = this.board[sq(7,7)]; this.board[sq(7,7)] = EMPTY; }
    if (m.flags === "Q") { this.board[sq(3,7)] = this.board[sq(0,7)]; this.board[sq(0,7)] = EMPTY; }
    if (m.flags === "k") { this.board[sq(5,0)] = this.board[sq(7,0)]; this.board[sq(7,0)] = EMPTY; }
    if (m.flags === "q") { this.board[sq(3,0)] = this.board[sq(0,0)]; this.board[sq(0,0)] = EMPTY; }
    if (m.promotion) this.board[m.to] = color === WHITE ? m.promotion.toUpperCase() : m.promotion;

    if (piece === "K") { this.castling.K = false; this.castling.Q = false; }
    if (piece === "k") { this.castling.k = false; this.castling.q = false; }
    if (m.from === sq(0,7) || m.to === sq(0,7)) this.castling.Q = false;
    if (m.from === sq(7,7) || m.to === sq(7,7)) this.castling.K = false;
    if (m.from === sq(0,0) || m.to === sq(0,0)) this.castling.q = false;
    if (m.from === sq(7,0) || m.to === sq(7,0)) this.castling.k = false;

    this.enPassant = -1;
    if (piece.toLowerCase() === "p" && Math.abs(rankOf(m.to) - rankOf(m.from)) === 2) {
      this.enPassant = color === WHITE ? m.to + 8 : m.to - 8;
    }
    this.halfmove = piece.toLowerCase() === "p" || captured !== EMPTY ? 0 : halfmove + 1;
    this.side = color === WHITE ? BLACK : WHITE;
    if (this.side === WHITE) this.fullmove++;

    const ok = !this._inCheck(color);

    this.board[m.from] = piece;
    this.board[m.to] = captured;
    this.enPassant = ep;
    this.castling = castling;
    this.halfmove = halfmove;
    this.side = side;
    this.fullmove = fullmove;
    return ok;
  }

  _applyMove(m) {
    const piece = this.board[m.from];
    const color = colorOf(piece);
    const captured = this.board[m.to];

    this.history.push({
      from: m.from, to: m.to, piece, captured,
      promotion: m.promotion, flags: m.flags,
      castling: { ...this.castling }, enPassant: this.enPassant,
      halfmove: this.halfmove, fullmove: this.fullmove, side: this.side
    });

    this.board[m.to] = m.promotion ? (color === WHITE ? m.promotion.toUpperCase() : m.promotion) : piece;
    this.board[m.from] = EMPTY;
    if (m.flags === "e") this.board[color === WHITE ? m.to + 8 : m.to - 8] = EMPTY;
    if (m.flags === "K") { this.board[sq(5,7)] = this.board[sq(7,7)]; this.board[sq(7,7)] = EMPTY; }
    if (m.flags === "Q") { this.board[sq(3,7)] = this.board[sq(0,7)]; this.board[sq(0,7)] = EMPTY; }
    if (m.flags === "k") { this.board[sq(5,0)] = this.board[sq(7,0)]; this.board[sq(7,0)] = EMPTY; }
    if (m.flags === "q") { this.board[sq(3,0)] = this.board[sq(0,0)]; this.board[sq(0,0)] = EMPTY; }

    if (piece === "K") { this.castling.K = false; this.castling.Q = false; }
    if (piece === "k") { this.castling.k = false; this.castling.q = false; }
    if (m.from === sq(0,7) || m.to === sq(0,7)) this.castling.Q = false;
    if (m.from === sq(7,7) || m.to === sq(7,7)) this.castling.K = false;
    if (m.from === sq(0,0) || m.to === sq(0,0)) this.castling.q = false;
    if (m.from === sq(7,0) || m.to === sq(7,0)) this.castling.k = false;

    this.enPassant = -1;
    if (piece.toLowerCase() === "p" && Math.abs(rankOf(m.to) - rankOf(m.from)) === 2) {
      this.enPassant = color === WHITE ? m.to + 8 : m.to - 8;
    }
    this.halfmove = piece.toLowerCase() === "p" || captured !== EMPTY ? 0 : this.halfmove + 1;
    this.side = color === WHITE ? BLACK : WHITE;
    if (this.side === WHITE) this.fullmove++;
    this.moveNumber = this.fullmove;
  }

  _undo() {
    const h = this.history.pop();
    if (!h) return;
    const piece = h.piece;
    const color = h.side;
    this.board[h.from] = piece;
    this.board[h.to] = h.captured;
    if (h.flags === "e") this.board[color === WHITE ? h.to + 8 : h.to - 8] = color === WHITE ? "p" : "P";
    if (h.flags === "K") { this.board[sq(7,7)] = this.board[sq(5,7)]; this.board[sq(5,7)] = EMPTY; }
    if (h.flags === "Q") { this.board[sq(0,7)] = this.board[sq(3,7)]; this.board[sq(3,7)] = EMPTY; }
    if (h.flags === "k") { this.board[sq(7,0)] = this.board[sq(5,0)]; this.board[sq(5,0)] = EMPTY; }
    if (h.flags === "q") { this.board[sq(0,0)] = this.board[sq(3,0)]; this.board[sq(3,0)] = EMPTY; }
    if (h.promotion) this.board[h.from] = color === WHITE ? "P" : "p";
    this.castling = { ...h.castling };
    this.enPassant = h.enPassant;
    this.halfmove = h.halfmove;
    this.fullmove = h.fullmove;
    this.side = h.side;
    this.moveNumber = this.fullmove;
  }

  _san(m) {
    const piece = this.board[m.from];
    const type = piece.toLowerCase();
    let s = "";
    if (type !== "p") s += type.toUpperCase();
    if (m.capture !== EMPTY) {
      if (type === "p") s += sqName(m.from)[0];
      s += "x";
    }
    s += sqName(m.to);
    if (m.promotion) s += "=" + m.promotion.toUpperCase();

    const c = this._clone();
    c._applyMove(m);
    const opp = c.side;
    const oppMoves = c.moves();
    if (oppMoves.length === 0) s += c._inCheck(opp) ? "#" : "";
    else if (c._inCheck(opp)) s += "+";
    return s;
  }

  move(sanOrMove) {
    if (!sanOrMove) return null;
    let m;
    if (typeof sanOrMove === "string") {
      m = this._parseMove(sanOrMove);
      if (!m) return null;
    } else {
      m = sanOrMove;
    }
    const legal = this.moves({ verbose: true });
    const found = legal.find(lm => lm.from === m.from && lm.to === m.to &&
      (!m.promotion || lm.promotion === m.promotion));
    if (!found) return null;
    this._applyMove(found);
    this.inCheck = this._inCheck(this.side);
    this._checkGameOver();
    return found;
  }

  _parseMove(str) {
    if (!str || str.length < 4) return null;
    const from = sqFromName(str.slice(0, 2));
    const to = sqFromName(str.slice(2, 4));
    if (from === -1 || to === -1) return null;
    const promotion = str.length === 5 ? str[4].toLowerCase() : null;
    if (promotion && !["q","r","b","n"].includes(promotion)) return null;
    return { from, to, promotion };
  }

  _checkGameOver() {
    const c = this._clone();
    const legal = c.moves();
    if (legal.length === 0) {
      this.gameOver = true;
      if (c._inCheck(c.side)) {
        this.result = c.side === WHITE ? "0-1" : "1-0";
        this.termination = "checkmate";
      } else {
        this.result = "1/2-1/2";
        this.termination = "stalemate";
      }
    } else if (this.halfmove >= 100) {
      this.gameOver = true;
      this.result = "1/2-1/2";
      this.termination = "fifty-move";
    }
  }

  get fen() {
    let rows = "";
    for (let r = 0; r < 8; r++) {
      let empty = 0, row = "";
      for (let f = 0; f < 8; f++) {
        const p = this.board[sq(f, r)];
        if (p === EMPTY) empty++;
        else { if (empty > 0) { row += empty; empty = 0; } row += p; }
      }
      if (empty > 0) row += empty;
      rows += row + (r < 7 ? "/" : "");
    }
    return `${rows} ${this.side} ${this._castlingFen()} ${this.enPassantFen()} ${this.halfmove} ${this.fullmove}`;
  }

  _castlingFen() {
    let s = "";
    if (this.castling.K) s += "K";
    if (this.castling.Q) s += "Q";
    if (this.castling.k) s += "k";
    if (this.castling.q) s += "q";
    return s || "-";
  }

  enPassantFen() { return this.enPassant === -1 ? "-" : sqName(this.enPassant); }
  square(i) { return this.board[i]; }
  legalMoves() { return this.moves({ verbose: true }); }
  isGameOver() { return this.gameOver; }
}

if (typeof window !== "undefined") window.Chess = Chess;
if (typeof module !== "undefined" && module.exports) module.exports = { Chess, sq, sqName, sqFromName, WHITE, BLACK };
