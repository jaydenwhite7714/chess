/* ============================================================
   Chess Test Net — Content Script for chess.com
   Injects a floating control panel onto chess.com so you can
   use the human-like auto-move bot and engine suggestions
   directly on chess.com.
   ============================================================ */

(function() {
  'use strict';

  // Prevent double injection
  if (window.chessTestNetInjected) return;
  window.chessTestNetInjected = true;

  // -----------------------------------------------------------------
  // Config / state
  // -----------------------------------------------------------------
  const STATE = {
    enabled: false,
    autoMove: false,
    strength: 'medium',
    humanize: true,
    minTime: 1500,
    maxTime: 5000,
    timer: null,
    lastMoveTime: 0,
    engine: null,
    ai: null,
    board: null, // chess.js instance tracking the position
    color: 'w',  // our color on chess.com
    moveTimer: null
  };

  // -----------------------------------------------------------------
  // Create floating panel UI
  // -----------------------------------------------------------------
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'chess-testnet-panel';
    panel.style.cssText = `
      position: fixed;
      top: 120px;
      right: 16px;
      z-index: 2147483647;
      width: 260px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 16px;
      color: #f8fafc;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
      font-size: 13px;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#22d3ee);display:grid;place-items:center;font-size:16px;">♟</div>
        <div style="font-weight:800;font-size:14px;letter-spacing:-0.5px;">Chess Test Net</div>
      </div>

      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px;">
        Auto-move on chess.com
      </div>

      <button id="ctn-toggle-auto" style="width:100%;padding:10px;border-radius:10px;border:none;background:#6366f1;color:#fff;font-weight:700;cursor:pointer;box-shadow:0 0 20px rgba(99,102,241,0.4);">
        ▶ Enable Auto-Move
      </button>

      <div style="display:flex;gap:6px;margin-top:8px;">
        <button id="ctn-strength-weak" style="flex:1;padding:7px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#f8fafc;font-size:11px;cursor:pointer;">Weak</button>
        <button id="ctn-strength-med" style="flex:1;padding:7px;border-radius:8px;border:1px solid #6366f1;background:#6366f1;color:#fff;font-size:11px;cursor:pointer;">Medium</button>
        <button id="ctn-strength-strong" style="flex:1;padding:7px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#f8fafc;font-size:11px;cursor:pointer;">Strong</button>
      </div>

      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:#cbd5e1;">
        <input type="checkbox" id="ctn-humanize" checked style="accent-color:#6366f1;">
        Humanize (mistakes + timing)
      </label>

      <div style="margin-top:8px;">
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Min move time (s)</label>
        <input id="ctn-min-time" type="range" min="1" max="10" step="0.5" value="1.5" style="width:100%;accent-color:#6366f1;">
      </div>
      <div style="margin-top:6px;">
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Max move time (s)</label>
        <input id="ctn-max-time" type="range" min="2" max="30" step="0.5" value="5" style="width:100%;accent-color:#6366f1;">
      </div>

      <div id="ctn-status" style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.05);font-size:11px;color:#94a3b8;">
        Status: Ready
      </div>

      <div id="ctn-best-move" style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);font-size:11px;color:#a5b4fc;font-family:'JetBrains Mono',monospace;">
        Best move: —
      </div>

      <button id="ctn-close" style="margin-top:10px;width:100%;padding:8px;border-radius:8px;border:none;background:rgba(255,255,255,0.05);color:#94a3b8;font-size:11px;cursor:pointer;">Close</button>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  // -----------------------------------------------------------------
  // chess.com DOM detection (best effort across site redesigns)
  // -----------------------------------------------------------------
  function findBoardElement() {
    // Try common chess.com board selectors
    const selectors = [
      '.board', '.cg-wrap', '.chessboard', '[class*="board"]',
      '.board-B8Ka7', '.board-r652h', '.board-L6XbS'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findSquareElement(sanFrom, sanTo) {
    // chess.com square elements typically have data-square attributes
    // like data-square="e2" or classes like square-e2
    const fromEl = document.querySelector(`[data-square="${sanFrom}"]`) ||
                   document.querySelector(`.square-${sanFrom}`);
    const toEl = document.querySelector(`[data-square="${sanTo}"]`) ||
                 document.querySelector(`.square-${sanTo}`);
    return { from: fromEl, to: toEl };
  }

  function getPieceAtSquare(squareName) {
    const el = document.querySelector(`[data-square="${squareName}"]`) ||
               document.querySelector(`.square-${squareName}`);
    if (!el) return null;
    // Look for piece element inside square
    const piece = el.querySelector('[class*="piece"]') || el.querySelector('img');
    if (!piece) return null;
    const cls = piece.className || piece.getAttribute('src') || '';
    // Determine color and type from class/src
    const isWhite = cls.includes('w') && !cls.includes('wp'); // rough
    const typeMap = { 'p': 'p', 'n': 'n', 'b': 'b', 'r': 'r', 'q': 'q', 'k': 'k' };
    let type = 'p';
    for (const [k, v] of Object.entries(typeMap)) {
      if (cls.includes(k)) { type = v; break; }
    }
    return { color: isWhite ? 'w' : 'b', type, element: el };
  }

  // -----------------------------------------------------------------
  // Sync chess.com board -> our chess engine
  // -----------------------------------------------------------------
  function syncBoardFromDOM() {
    // This is best-effort; chess.com's DOM is complex and changes often.
    // We try to read piece positions from square elements.
    const boardEl = findBoardElement();
    if (!boardEl) return null;

    const newBoard = [
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.'
    ];

    const files = 'abcdefgh';
    let foundAny = false;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sqName = files[f] + (8 - r);
        const piece = getPieceAtSquare(sqName);
        if (piece) {
          foundAny = true;
          const idx = r * 8 + f;
          newBoard[idx] = piece.color === 'w'
            ? piece.type.toUpperCase()
            : piece.type;
        }
      }
    }

    if (!foundAny) return null;
    return newBoard;
  }

  // -----------------------------------------------------------------
  // Try to make a move on chess.com's board
  // -----------------------------------------------------------------
  function attemptChessDotComMove(fromSan, toSan, promotion) {
    const squares = findSquareElement(fromSan, toSan);
    if (!squares.from || !squares.to) {
      console.log('[CTN] Could not find square elements', fromSan, toSan);
      return false;
    }

    // Click from square then to square (chess.com's interaction pattern)
    try {
      squares.from.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      squares.from.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      squares.from.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

      setTimeout(() => {
        squares.to.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        squares.to.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        squares.to.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      }, 150);

      return true;
    } catch (e) {
      console.error('[CTN] Move click failed', e);
      return false;
    }
  }

  // -----------------------------------------------------------------
  // AI move loop
  // -----------------------------------------------------------------
  function startAutoMove() {
    stopAutoMove();
    if (!STATE.engine) return;

    STATE.moveTimer = setInterval(async () => {
      if (!STATE.autoMove) return;

      // Only move if it's our turn
      const ourTurn = STATE.engine.side === STATE.color;
      if (!ourTurn) return;

      const now = Date.now();
      if (now - STATE.lastMoveTime < STATE.minTime) return;

      const legal = STATE.engine.legalMoves();
      if (!legal.length) return;

      // Pick move using AI logic
      const scored = legal.map(m => {
        const from = sqName(m.from);
        const to = sqName(m.to);
        let score = 0;
        if (m.capture !== '.') {
          const victim = { p:100,n:320,b:330,r:500,q:900,k:0 }[m.capture.toLowerCase()] || 0;
          const attacker = { p:100,n:320,b:330,r:500,q:900,k:0 }[m.fromPiece.toLowerCase()] || 0;
          score += 2000 + victim - attacker;
        }
        if (m.promotion) score += 1800;
        return { m, score };
      });
      scored.sort((a, b) => b.score - a.score);

      // Humanize: sometimes pick non-best
      let chosen;
      if (STATE.humanize && Math.random() < 0.25 && scored.length > 2) {
        const mid = Math.floor(scored.length / 2);
        const tier = scored.slice(mid, Math.min(scored.length, mid + 3));
        chosen = tier[Math.floor(Math.random() * tier.length)].m;
      } else {
        chosen = scored[0].m;
      }

      const from = sqName(chosen.from);
      const to = sqName(chosen.to);

      // Update status
      const statusEl = document.getElementById('ctn-status');
      if (statusEl) statusEl.textContent = `Playing: ${from}${to}`;
      const bestEl = document.getElementById('ctn-best-move');
      if (bestEl) bestEl.textContent = `Best move: ${from}${to}`;

      // Attempt move on chess.com
      attemptChessDotComMove(from, to, chosen.promotion);

      // Apply to our engine
      STATE.engine.move(chosen);

      STATE.lastMoveTime = now;

    }, 1000);
  }

  function stopAutoMove() {
    if (STATE.moveTimer) {
      clearInterval(STATE.moveTimer);
      STATE.moveTimer = null;
    }
  }

  function sqName(i) {
    return String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1);
  }

  // -----------------------------------------------------------------
  // Initialize engine + panel
  // -----------------------------------------------------------------
  function init() {
    // Load chess engine and AI
    const engineScript = document.createElement('script');
    engineScript.textContent = `
      (function(){
        const WHITE="w",BLACK="b",EMPTY=".",PIECE_VALUES={p:100,n:320,b:330,r:500,q:900,k:0};
        function sq(f,r){return r*8+f;}function fileOf(s){return s%8;}function rankOf(s){return (s/8)|0;}
        function boardRankOf(s){return 8-rankOf(s);}function sqName(s){return String.fromCharCode(97+fileOf(s))+boardRankOf(s);}
        function sqFromName(name){if(!name||typeof name!=="string"||name.length<2)return-1;const f=name.charCodeAt(0)-97;const boardRank=parseInt(name[1],10);const r=8-boardRank;if(f<0||f>7||r<0||r>7||isNaN(boardRank))return-1;return sq(f,r);}
        function colorOf(p){if(!p||p===EMPTY)return null;return p===p.toUpperCase()?WHITE:BLACK;}
        function isOpponent(p,c){return p!==EMPTY&&colorOf(p)!==c;}
        const START=["r","n","b","q","k","b","n","r","p","p","p","p","p","p","p","p",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".",".","P","P","P","P","P","P","P","P","R","N","B","Q","K","B","N","R"];
        class Chess{
          constructor(){this.reset();}
          reset(){this.board=[...START];this.side=WHITE;this.castling={K:true,Q:true,k:true,q:true};this.enPassant=-1;this.halfmove=0;this.fullmove=1;this.history=[];this.moveNumber=1;this.gameOver=false;this.result=null;this.termination=null;this.inCheck=false;}
          _clone(){const c=new Chess();c.board=[...this.board];c.side=this.side;c.castling={...this.castling};c.enPassant=this.enPassant;c.halfmove=this.halfmove;c.fullmove=this.fullmove;c.history=[...this.history];c.moveNumber=this.moveNumber;return c;}
          _addMove(m,f,t,pr,cap,fl){m.push({from:f,to:t,promotion:pr||null,capture:cap||EMPTY,flags:fl||"n",lan:sqName(f)+sqName(t)+(pr||"")});}
          _sliding(moves,f,dirs){const ff=fileOf(f),rr=rankOf(f);const p=this.board[f];const c=colorOf(p);for(const [df,dr] of dirs){let nf=ff+df,nr=rr+dr;while(nf>=0&&nf<=7&&nr>=0&&nr<=7){const t=sq(nf,nr);const tar=this.board[t];if(tar===EMPTY){this._addMove(moves,f,t);}else{if(isOpponent(tar,c))this._addMove(moves,f,t,null,tar,"c");break;}nf+=df;nr+=dr;}}
          _knight(moves,f){const ff=fileOf(f),rr=rankOf(f);const p=this.board[f];const c=colorOf(p);const st=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];for(const [df,dr] of st){let nf=ff+df,nr=rr+dr;if(nf<0||nf>7||nr<0||nr>7)continue;const t=sq(nf,nr);const tar=this.board[t];if(tar===EMPTY)this._addMove(moves,f,t);else if(isOpponent(tar,c))this._addMove(moves,f,t,null,tar,"c");}}
          _pawn(moves,f){const p=this.board[f];const c=colorOf(p);const dir=c===WHITE?-1:1;const sr=c===WHITE?6:1;const pr=c===WHITE?0:7;const ff=fileOf(f),rr=rankOf(f);const one=sq(ff,rr+dir);if(rr+dir>=0&&rr+dir<=7&&this.board[one]===EMPTY){if(rankOf(one)===pr){for(const prm of ["q","r","b","n"])this._addMove(moves,f,one,prm,EMPTY,"p");}else this._addMove(moves,f,one);const two=sq(ff,rr+2*dir);if(rr===sr&&this.board[two]===EMPTY)this._addMove(moves,f,two);}for(const df of [-1,1]){let nf=ff+df;if(nf<0||nf>7)continue;let t=sq(nf,rr+dir);if(rr+dir<0||rr+dir>7)continue;const tar=this.board[t];if(tar!==EMPTY&&isOpponent(tar,c)){if(rankOf(t)===pr){for(const prm of ["q","r","b","n"])this._addMove(moves,f,t,prm,tar,"c");}else this._addMove(moves,f,t,null,tar,"c");}if(t===this.enPassant)this._addMove(moves,f,t,null,EMPTY,"e");}}
          _king(moves,f){const ff=fileOf(f),rr=rankOf(f);const p=this.board[f];const c=colorOf(p);const st=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];for(const [df,dr] of st){let nf=ff+df,nr=rr+dr;if(nf<0||nf>7||nr<0||nr>7)continue;const t=sq(nf,nr);const tar=this.board[t];if(tar===EMPTY)this._addMove(moves,f,t);else if(isOpponent(tar,c))this._addMove(moves,f,t,null,tar,"c");}}
          _gen(moves){const c=this.side;for(let f=0;f<64;f++){const p=this.board[f];if(p===EMPTY||colorOf(p)!==c)continue;const t=p.toLowerCase();switch(t){case"p":this._pawn(moves,f);break;case"n":this._knight(moves,f);break;case"b":this._sliding(moves,f,[[1,1],[1,-1],[-1,1],[-1,-1]]);break;case"r":this._sliding(moves,f,[[1,0],[-1,0],[0,1],[0,-1]]);break;case"q":this._sliding(moves,f,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);break;case"k":this._king(moves,f);break;}}}
          _attacked(si,bc){for(let i=0;i<64;i++){const p=this.board[i];if(p===EMPTY||colorOf(p)!==bc)continue;const t=p.toLowerCase();const f=fileOf(i),r=rankOf(i);const tf=fileOf(si),tr=rankOf(si);if(t==="p"){const dir=bc===WHITE?-1:1;if((tf===f+1||tf===f-1)&&tr===r+dir)return true;continue;}if(t==="n"){const df=Math.abs(tf-f),dr=Math.abs(tr-r);if((df===1&&dr===2)||(df===2&&dr===1))return true;continue;}if(t==="k"){if(Math.abs(tf-f)<=1&&Math.abs(tr-r)<=1)return true;continue;}if((t==="b"||t==="q")&&Math.abs(tf-f)===Math.abs(tr-r)&&this._path(i,si))return true;if((t==="r"||t==="q")&&(f===tf||r===tr)&&this._path(i,si))return true;}}return false;}
          _path(a,b){const fa=fileOf(a),ra=rankOf(a);const fb=fileOf(b),rb=rankOf(b);const df=fb===fa?0:(fb>fa?1:-1);const dr=rb===ra?0:(rb>ra?1:-1);let f=fa+df,r=ra+dr;while(f!==fb||r!==rb){if(this.board[sq(f,r)]!==EMPTY)return false;f+=df;r+=dr;}return true;}
          _ksquare(c){return this.board.indexOf(c===WHITE?"K":"k");}
          _check(c){const ks=this._ksquare(c);return ks!==-1&&this._attacked(ks,c===WHITE?BLACK:WHITE);}
          moves(o){const v=!!o.verbose;const raw=[];this._gen(raw);const l=[];for(const m of raw){if(this._try(m)){if(v)l.push({...m,san:this._san(m),lan:m.lan});else l.push(m.lan);}}return l;}
          _try(m){const p=this.board[m.f];const c=colorOf(p);const cap=this.board[m.t];const ep=this.enPassant;const cl={...this.castling};const hm=this.halfmove;const sd=this.side;const fm=this.fullmove;this.board[m.t]=p;this.board[m.f]=EMPTY;if(m.fl==="e")this.board[c===WHITE?m.t+8:m.t-8]=EMPTY;if(m.fl==="K"){this.board[sq(5,7)]=this.board[sq(7,7)];this.board[sq(7,7)]=EMPTY;}if(m.fl==="Q"){this.board[sq(3,7)]=this.board[sq(0,7)];this.board[sq(0,7)]=EMPTY;}if(m.fl==="k"){this.board[sq(5,0)]=this.board[sq(7,0)];this.board[sq(7,0)]=EMPTY;}if(m.fl==="q"){this.board[sq(3,0)]=this.board[sq(0,0)];this.board[sq(0,0)]=EMPTY;}if(m.promotion)this.board[m.t]=c===WHITE?m.promotion.toUpperCase():m.promotion;if(p==="K"){this.castling.K=false;this.castling.Q=false;}if(p==="k"){this.castling.k=false;this.castling.q=false;}if(m.f===sq(0,7)||m.t===sq(0,7))this.castling.Q=false;if(m.f===sq(7,7)||m.t===sq(7,7))this.castling.K=false;if(m.f===sq(0,0)||m.t===sq(0,0))this.castling.q=false;if(m.f===sq(7,0)||m.t===sq(7,0))this.castling.k=false;this.enPassant=-1;if(p.toLowerCase()==="p"&&Math.abs(rankOf(m.t)-rankOf(m.f))===2){this.enPassant=c===WHITE?m.t+8:m.t-8;}this.halfmove=p.toLowerCase()==="p"||cap!==EMPTY?0:hm+1;this.side=c===WHITE?BLACK:WHITE;if(this.side===WHITE)this.fullmove++;const ok=!this._check(c);this.board[m.f]=p;this.board[m.t]=cap;this.enPassant=ep;this.castling=cl;this.halfmove=hm;this.side=sd;this.fullmove=fm;return ok;}
          _apply(m){const p=this.board[m.f];const c=colorOf(p);const cap=this.board[m.t];this.history.push({f:m.f,t:m.t,p,cap,promotion:m.promotion,flags:m.fl,castling:{...this.castling},enPassant:this.enPassant,halfmove:this.halfmove,fullmove:this.fullmove,side:this.side});this.board[m.t]=m.promotion?(c===WHITE?m.promotion.toUpperCase():m.promotion):p;this.board[m.f]=EMPTY;if(m.fl==="e")this.board[c===WHITE?m.t+8:m.t-8]=EMPTY;if(m.fl==="K"){this.board[sq(5,7)]=this.board[sq(7,7)];this.board[sq(7,7)]=EMPTY;}if(m.fl==="Q"){this.board[sq(3,7)]=this.board[sq(0,7)];this.board[sq(0,7)]=EMPTY;}if(m.fl==="k"){this.board[sq(5,0)]=this.board[sq(7,0)];this.board[sq(7,0)]=EMPTY;}if(m.fl==="q"){this.board[sq(3,0)]=this.board[sq(0,0)];this.board[sq(0,0)]=EMPTY;}if(p==="K"){this.castling.K=false;this.castling.Q=false;}if(p==="k"){this.castling.k=false;this.castling.q=false;}if(m.f===sq(0,7)||m.t===sq(0,7))this.castling.Q=false;if(m.f===sq(7,7)||m.t===sq(7,7))this.castling.K=false;if(m.f===sq(0,0)||m.t===sq(0,0))this.castling.q=false;if(m.f===sq(7,0)||m.t===sq(7,0))this.castling.k=false;this.enPassant=-1;if(p.toLowerCase()==="p"&&Math.abs(rankOf(m.t)-rankOf(m.f))===2){this.enPassant=c===WHITE?m.t+8:m.t-8;}this.halfmove=p.toLowerCase()==="p"||cap!==EMPTY?0:this.halfmove+1;this.side=c===WHITE?BLACK:WHITE;if(this.side===WHITE)this.fullmove++;this.moveNumber=this.fullmove;}
          move(mv){if(!mv)return null;let m;if(typeof mv==="string"){m=this._parse(mv);if(!m)return null;}else m=mv;const l=this.moves({verbose:true});const fnd=l.find(lm=>lm.f===m.f&&lm.t===m.t&&(!m.promotion||lm.promotion===m.promotion));if(!fnd)return null;this._apply(fnd);this.inCheck=this._check(this.side);return fnd;}
          _parse(s){if(!s||s.length<4)return null;const f=sqFromName(s.slice(0,2));const t=sqFromName(s.slice(2,4));if(f===-1||t===-1)return null;const pr=s.length===5?s[4].toLowerCase():null;if(pr&&!["q","r","b","n"].includes(pr))return null;return{from:f,to:t,promotion:pr};}
          square(i){return this.board[i];}
          legalMoves(){return this.moves({verbose:true});}
          isGameOver(){return this.gameOver;}
        }
        window.Chess=Chess;window.sqName=sqName;window.sqFromName=sqFromName;
      })();
    `;
    (document.head || document.documentElement).appendChild(engineScript);

    // Small inline AI for content script
    const aiScript = document.createElement('script');
    aiScript.textContent = `
      (function(){
        const PV={p:100,n:320,b:330,r:500,q:900,k:0};
        function score(c,m){let s=0;if(m.capture!=='.'){const v=PV[m.capture.toLowerCase()]||0;const a=PV[m.fromPiece.toLowerCase()]||0;s+=2000+v-a;}if(m.promotion)s+=1800;const cen=[sq(3,3),sq(4,3),sq(3,4),sq(4,4)];if(cen.includes(m.to))s+=15;return s;}
        window.CTNAI = {
          pick(chess, humanize=true){
            const legal=chess.legalMoves();
            if(!legal.length)return null;
            legal.forEach(m=>{m.fromPiece=chess.square(m.from);});
            const scored=legal.map(m=>({m,score:score(chess,m)}));
            scored.sort((a,b)=>b.score-a.score);
            if(humanize && Math.random()<0.25 && scored.length>2){
              const mid=Math.floor(scored.length/2);
              const tier=scored.slice(mid,Math.min(scored.length,mid+3));
              return tier[Math.floor(Math.random()*tier.length)].m;
            }
            return scored[0].m;
          }
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(aiScript);

    // Wait for scripts to load, then set up
    setTimeout(() => {
      STATE.engine = new window.Chess();
      STATE.ai = window.CTNAI;

      const panel = createPanel();
      wirePanel(panel);

      // Try to detect our color (assume white for now; user can toggle)
      // Detect if we're white or black by looking at whose pieces are at bottom
      setTimeout(() => {
        const board = syncBoardFromDOM();
        if (board) {
          STATE.engine.board = board;
        }
        updateStatus('Engine ready');
      }, 500);

    }, 200);
  }

  function wirePanel(panel) {
    const btnAuto = panel.querySelector('#ctn-toggle-auto');
    const btnWeak = panel.querySelector('#ctn-strength-weak');
    const btnMed = panel.querySelector('#ctn-strength-med');
    const btnStrong = panel.querySelector('#ctn-strength-strong');
    const chkHuman = panel.querySelector('#ctn-humanize');
    const inpMin = panel.querySelector('#ctn-min-time');
    const inpMax = panel.querySelector('#ctn-max-time');
    const btnClose = panel.querySelector('#ctn-close');

    btnAuto.addEventListener('click', () => {
      STATE.autoMove = !STATE.autoMove;
      btnAuto.textContent = STATE.autoMove ? '⏸ Disable Auto-Move' : '▶ Enable Auto-Move';
      btnAuto.style.background = STATE.autoMove ? '#ef4444' : '#6366f1';
      updateStatus(STATE.autoMove ? 'Auto-move ON' : 'Auto-move OFF');
      if (STATE.autoMove) {
        STATE.lastMoveTime = Date.now();
        startAutoMove();
      } else {
        stopAutoMove();
      }
    });

    btnWeak.addEventListener('click', () => { STATE.strength='weak'; setActive(btnWeak); });
    btnMed.addEventListener('click', () => { STATE.strength='medium'; setActive(btnMed); });
    btnStrong.addEventListener('click', () => { STATE.strength='strong'; setActive(btnStrong); });

    chkHuman.addEventListener('change', () => { STATE.humanize = chkHuman.checked; });
    inpMin.addEventListener('input', () => { STATE.minTime = parseFloat(inpMin.value) * 1000; });
    inpMax.addEventListener('input', () => { STATE.maxTime = parseFloat(inpMax.value) * 1000; });

    btnClose.addEventListener('click', () => { panel.remove(); });

    function setActive(el) {
      [btnWeak, btnMed, btnStrong].forEach(b => {
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.borderColor = 'rgba(255,255,255,0.15)';
        b.style.color = '#f8fafc';
      });
      el.style.background = '#6366f1';
      el.style.borderColor = '#6366f1';
      el.style.color = '#fff';
    }
  }

  function updateStatus(msg) {
    const el = document.getElementById('ctn-status');
    if (el) el.textContent = 'Status: ' + msg;
  }

  // Re-sync board periodically (chess.com updates DOM after each move)
  setInterval(() => {
    if (!STATE.engine || !STATE.autoMove) return;
    const board = syncBoardFromDOM();
    if (board) {
      // Only sync if different
      let same = true;
      for (let i = 0; i < 64; i++) {
        if (STATE.engine.board[i] !== board[i]) { same = false; break; }
      }
      if (!same) {
        STATE.engine.board = board;
        // Switch side to move based on chess.com (rough heuristic)
        STATE.engine.side = STATE.engine.side === 'w' ? 'b' : 'w';
      }
    }
  }, 1500);

  init();

})();
