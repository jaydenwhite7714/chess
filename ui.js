/* ============================================================
   Chess Test Net — UI layer
   Board rendering, square interaction, move list, clocks,
   settings modal, game-over modal, toasts.
   ============================================================ */

const PIECE_UNICODE = {
  "K": "♔", "Q": "♕", "R": "♖", "B": "♗", "N": "♘", "P": "♙",
  "k": "♚", "q": "♛", "r": "♜", "b": "♝", "n": "♞", "p": "♟"
};

class UI {
  constructor() {
    this.boardEl = document.getElementById("board");
    this.coordsTop = document.getElementById("coordsTop");
    this.coordsLeft = document.getElementById("coordsLeft");
    this.moveListEl = document.getElementById("moveList");
    this.capturedWhite = document.getElementById("capturedWhite");
    this.capturedBlack = document.getElementById("capturedBlack");

    this.clockWhite = document.getElementById("clockWhite");
    this.clockBlack = document.getElementById("clockBlack");
    this.nameWhite = document.getElementById("nameWhite");
    this.nameBlack = document.getElementById("nameBlack");
    this.statusWhite = document.getElementById("statusWhite");
    this.statusBlack = document.getElementById("statusBlack");
    this.eloWhite = document.getElementById("eloWhite");
    this.eloBlack = document.getElementById("eloBlack");
    this.deltaWhite = document.getElementById("deltaWhite");
    this.deltaBlack = document.getElementById("deltaBlack");
    this.turnText = document.getElementById("turnText");
    this.turnDotWhite = document.querySelector(".turn-dot-white");
    this.turnDotBlack = document.querySelector(".turn-dot-black");

    this.footerStatus = document.getElementById("footerStatus");
    this.footerAntiCheat = document.getElementById("footerAntiCheat");

    this.selectedSquare = null;
    this.highlighted = [];
    this.lastMove = null;
    this.checkSquare = null;

    this.onSquareClick = null;
    this.onSettingsChange = null;

    this._bindSettings();
    this._coordLabels();
  }

  _coordLabels() {
    const files = "abcdefgh";
    this.coordsTop.innerHTML = files.split("").map(f => `<div>${f}</div>`).join("");
    this.coordsLeft.innerHTML = "87654321".split("").map(r => `<div>${r}</div>`).join("");
  }

  // -----------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------

  render(chess, theme) {
    document.documentElement.setAttribute("data-theme", theme || "green");
    this.boardEl.innerHTML = "";

    const ranks = [7, 6, 5, 4, 3, 2, 1, 0]; // display rank 8 at top
    const files = [0, 1, 2, 3, 4, 5, 6, 7];

    ranks.forEach(r => {
      files.forEach(f => {
        const idx = r * 8 + f;
        const sqEl = document.createElement("div");
        const light = (r + f) % 2 === 0;
        sqEl.className = `square ${light ? "light" : "dark"}`;
        sqEl.dataset.index = idx;

        const piece = chess.square(idx);
        if (piece && piece !== ".") {
          sqEl.textContent = PIECE_UNICODE[piece] || piece;
          sqEl.classList.add("piece");
          sqEl.dataset.piece = piece;
          sqEl.dataset.color = piece === piece.toUpperCase() ? "white" : "black";
        }

        // Highlights
        if (this.selectedSquare === idx) sqEl.classList.add("selected");
        if (this.highlighted.includes(idx)) sqEl.classList.add("highlight");
        if (this.lastMove && (this.lastMove.from === idx || this.lastMove.to === idx)) {
          sqEl.classList.add("last-move");
        }
        if (this.checkSquare === idx) sqEl.classList.add("check");

        sqEl.addEventListener("click", () => this._onSquare(idx));
        this.boardEl.appendChild(sqEl);
      });
    });
  }

  setHighlights(squares) {
    this.highlighted = squares || [];
  }

  setSelection(idx) {
    this.selectedSquare = idx;
  }

  setLastMove(from, to) {
    this.lastMove = { from, to };
  }

  setCheck(idx) {
    this.checkSquare = idx;
  }

  clearSelection() {
    this.selectedSquare = null;
    this.highlighted = [];
  }

  _onSquare(idx) {
    if (this.onSquareClick) this.onSquareClick(idx);
  }

  // -----------------------------------------------------------------
  // Move list
  // -----------------------------------------------------------------

  addMove(moveNumber, whiteMove, blackMove) {
    const pair = document.createElement("div");
    pair.className = "move-pair";

    const num = document.createElement("div");
    num.className = "move-number";
    num.textContent = moveNumber + ".";

    const w = document.createElement("div");
    w.className = "move-single";
    w.textContent = whiteMove;

    pair.appendChild(num);
    pair.appendChild(w);

    if (blackMove) {
      const b = document.createElement("div");
      b.className = "move-single";
      b.textContent = blackMove;
      pair.appendChild(b);
    }

    this.moveListEl.appendChild(pair);
    pair.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  clearMoves() {
    this.moveListEl.innerHTML = "";
  }

  setCurrentMove(index) {
    // highlight the current move pair by index
    const pairs = this.moveListEl.querySelectorAll(".move-pair");
    pairs.forEach((p, i) => p.classList.toggle("current", i === index));
  }

  // -----------------------------------------------------------------
  // Captured pieces
  // -----------------------------------------------------------------

  setCaptured(color, pieces) {
    const el = color === "white" ? this.capturedWhite : this.capturedBlack;
    el.innerHTML = pieces.map(p => `<span class="piece" title="${p}">${PIECE_UNICODE[p] || p}</span>`).join("");
  }

  // -----------------------------------------------------------------
  // Status / clocks
  // -----------------------------------------------------------------

  setClock(color, seconds) {
    const el = color === "white" ? this.clockWhite : this.clockBlack;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("low-time", seconds > 0 && seconds <= 30);
  }

  setTurn(color) {
    const white = color === "white";
    this.turnText.textContent = white ? "White to move" : "Black to move";
    this.turnDotWhite.classList.toggle("active", white);
    this.turnDotBlack.classList.toggle("active", !white);
  }

  setStatus(color, text) {
    const el = color === "white" ? this.statusWhite : this.statusBlack;
    if (el) el.textContent = text;
  }

  setPlayerName(color, name) {
    const el = color === "white" ? this.nameWhite : this.nameBlack;
    if (el) el.textContent = name;
  }

  setElo(color, value, delta) {
    const el = color === "white" ? this.eloWhite : this.eloBlack;
    const dEl = color === "white" ? this.deltaWhite : this.deltaBlack;
    el.textContent = value;
    if (dEl) {
      if (delta !== undefined && delta !== 0) {
        dEl.textContent = (delta > 0 ? "+" : "") + delta;
        dEl.className = "stat-delta " + (delta > 0 ? "pos" : "neg");
        dEl.style.display = "inline";
      } else {
        dEl.style.display = "none";
      }
    }
  }

  setFooter(text, antiCheatText) {
    if (this.footerStatus) this.footerStatus.textContent = text;
    if (this.footerAntiCheat && antiCheatText !== undefined) {
      this.footerAntiCheat.textContent = antiCheatText;
    }
  }

  // -----------------------------------------------------------------
  // Modals
  // -----------------------------------------------------------------

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }

  bind(modalId, closeCallback) {
    const el = document.getElementById(modalId);
    const backdrop = document.getElementById(modalId + "Backdrop") ||
                   document.getElementById("goBackdrop");
    const closeBtn = document.getElementById("btnClose" + modalId.replace("Modal", "")) ||
                     document.getElementById("btnCloseSettings") ||
                     document.getElementById("btnCloseGameOver");

    const close = () => { this.closeModal(modalId); if (closeCallback) closeCallback(); };

    if (backdrop) backdrop.addEventListener("click", close);
    const btnClose = document.getElementById("btnCloseSettings") ||
                     document.getElementById("btnCloseGameOver");
    if (btnClose) btnClose.addEventListener("click", close);
  }

  // -----------------------------------------------------------------
  // Settings wiring
  // -----------------------------------------------------------------

  _bindSettings() {
    const sync = (fromId, toId) => {
      const from = document.getElementById(fromId);
      const to = document.getElementById(toId);
      if (!from || !to) return;
      from.addEventListener("input", () => { to.value = from.value; });
      to.addEventListener("input", () => { from.value = to.value; });
    };

    sync("autoMoveEnabled", "smAutoMoveEnabled");
    sync("humanizeEnabled", "smHumanizeEnabled");
    sync("moveTimeMin", "smMoveTimeMin");
    sync("moveTimeMax", "smMoveTimeMax");
    sync("gameMode", "smGameMode");
    sync("timeControl", "smTimeControl");
    sync("boardTheme", "smBoardTheme");
    sync("botStrength", "smBotStrength");
    sync("aiPersonality", "smAiPersonality");

    // Value labels for sliders
    const wireLabel = (id, labelId, unit) => {
      const el = document.getElementById(id);
      const lab = document.getElementById(labelId);
      if (!el || !lab) return;
      const update = () => { lab.textContent = el.value + unit; };
      el.addEventListener("input", update);
      update();
    };
    wireLabel("moveTimeMin", "valMoveTimeMin", "s");
    wireLabel("moveTimeMax", "valMoveTimeMax", "s");
    wireLabel("smMoveTimeMin", "smValMoveTimeMin", "s");
    wireLabel("smMoveTimeMax", "smValMoveTimeMax", "s");
    wireLabel("smAcMinTime", "smValAcMinTime", "s");
    wireLabel("smAcMaxAcc", "smValAcMaxAcc", "%");
  }

  applyToModal(settings) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val;
    };
    set("smGameMode", settings.gameMode);
    set("smTimeControl", settings.timeControl);
    set("smIncrement", settings.increment);
    set("smBoardTheme", settings.boardTheme);
    set("smPieceSet", settings.pieceSet);
    set("smAutoMoveEnabled", settings.autoMoveEnabled);
    set("smHumanizeEnabled", settings.humanizeEnabled);
    set("smMoveTimeMin", settings.moveTimeMin);
    set("smMoveTimeMax", settings.moveTimeMax);
    set("smBotStrength", settings.botStrength);
    set("smAiPersonality", settings.aiPersonality);
    set("smAntiCheatEnabled", settings.antiCheatEnabled);
    set("smAcMinTime", settings.acMinTime);
    set("smAcMaxAcc", settings.acMaxAcc);
    set("smStartElo", settings.startElo);
    set("smKFactor", settings.kFactor);
  }

  readFromModal() {
    const g = (id) => document.getElementById(id).value;
    const gc = (id) => document.getElementById(id).checked;
    return {
      gameMode: g("smGameMode"),
      timeControl: g("smTimeControl"),
      increment: parseInt(g("smIncrement")) || 0,
      boardTheme: g("smBoardTheme"),
      pieceSet: g("smPieceSet"),
      autoMoveEnabled: gc("smAutoMoveEnabled"),
      humanizeEnabled: gc("smHumanizeEnabled"),
      moveTimeMin: parseFloat(g("smMoveTimeMin")),
      moveTimeMax: parseFloat(g("smMoveTimeMax")),
      botStrength: g("smBotStrength"),
      aiPersonality: g("smAiPersonality"),
      antiCheatEnabled: gc("smAntiCheatEnabled"),
      acMinTime: parseFloat(g("smAcMinTime")),
      acMaxAcc: parseInt(g("smAcMaxAcc")),
      startElo: parseInt(g("smStartElo")) || 1500,
      kFactor: parseInt(g("smKFactor")) || 32
    };
  }

  // -----------------------------------------------------------------
  // Toasts
  // -----------------------------------------------------------------

  toast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = "toast " + (type === "ok" ? "ok" : type === "warn" ? "warn" : type === "err" ? "err" : "");
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
}

if (typeof window !== "undefined") window.UI = UI;
if (typeof window !== "undefined") window.PIECE_UNICODE = PIECE_UNICODE;
