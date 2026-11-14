/* ============================================================
   Chess Test Net — Elo rating system
   Standard FIDE-style Elo with configurable K-factor.
   ============================================================ */

class EloSystem {
  constructor(options = {}) {
    this.kFactor = options.kFactor || 32;
    this.startingElo = options.startingElo || 1500;
    this.ratings = { white: this.startingElo, black: this.startingElo };
    this.history = [];
    this.games = 0;
    this.wins = 0;
    this.losses = 0;
    this.draws = 0;
  }

  setOptions(options) {
    if (options.startingElo !== undefined) this.startingElo = options.startingElo;
    if (options.kFactor !== undefined) this.kFactor = options.kFactor;
  }

  reset() {
    this.ratings = { white: this.startingElo, black: this.startingElo };
    this.history = [];
    this.games = 0;
    this.wins = 0;
    this.losses = 0;
    this.draws = 0;
  }

  expected(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  record(result) {
    const before = { white: this.ratings.white, black: this.ratings.black };

    let scoreWhite, scoreBlack;
    if (result === "white") { scoreWhite = 1; scoreBlack = 0; }
    else if (result === "black") { scoreWhite = 0; scoreBlack = 1; }
    else { scoreWhite = 0.5; scoreBlack = 0.5; }

    const expWhite = this.expected(this.ratings.white, this.ratings.black);
    const expBlack = this.expected(this.ratings.black, this.ratings.white);

    const changeWhite = Math.round(this.kFactor * (scoreWhite - expWhite));
    const changeBlack = Math.round(this.kFactor * (scoreBlack - expBlack));

    this.ratings.white += changeWhite;
    this.ratings.black += changeBlack;

    const entry = {
      game: ++this.games,
      result,
      before, after: { ...this.ratings },
      change: { white: changeWhite, black: changeBlack },
      at: Date.now()
    };
    this.history.push(entry);

    if (result === "white") this.wins++;
    else if (result === "black") this.losses++;
    else this.draws++;

    return {
      white: { before: before.white, after: this.ratings.white, change: changeWhite },
      black: { before: before.black, after: this.ratings.black, change: changeBlack }
    };
  }

  get ratingWhite() { return this.ratings.white; }
  get ratingBlack() { return this.ratings.black; }
}

if (typeof window !== "undefined") window.EloSystem = EloSystem;
