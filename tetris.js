// ── テトリス ──────────────────────────────────────────
// 今のキャンバスサイズがそのまま盤面になるネタ機能。
// サイズは自由に変えられるので、やろうと思えば横1000マス以上のテトリスもできる。
// ブロックの色はカスタムカラーに色があればその中から選び、無ければランダムな色にする。
// script.js のグローバル（cols, rows, layers, customColors, wrap, canvasArea など）を
// 使うため、script.js の後に読み込むこと。
(() => {
  // 各ブロックの形（n×nの枠の中のマス座標[x, y]）。回転はこの枠の中で行う
  const PIECES = {
    I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  const TYPES = Object.keys(PIECES);
  // 4方向ぶんの形を先に作っておく（右回転：(x, y) → (n-1-y, x)）
  const SHAPES = {};
  TYPES.forEach(t => {
    const { n, cells } = PIECES[t];
    const rots = [cells];
    for (let i = 1; i < 4; i++) rots.push(rots[i - 1].map(([x, y]) => [n - 1 - y, x]));
    SHAPES[t] = rots;
  });
  // 回転して壁や他のブロックにぶつかったとき、ずらして収まる位置を順に試す
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];

  const DAS = 170;             // 左右キーを押しっぱなしにしてから連続移動が始まるまで
  const ARR = 35;              // 連続移動の間隔
  const SOFT_DROP_INTERVAL = 16;
  const LOCK_DELAY = 500;      // 着地してから固定されるまでの猶予
  const MAX_LOCK_RESETS = 15;  // 着地後に動かして猶予を延ばせる回数
  const LINE_SCORES = [0, 100, 300, 500, 800];
  const LINE_NAMES = ['', 'シングル', 'ダブル', 'トリプル', 'テトリス！'];

  const startModal = document.getElementById('tetris-start-modal');
  const startSize = document.getElementById('tetris-start-size');
  const startNote = document.getElementById('tetris-start-note');
  const useArtCheck = document.getElementById('tetris-use-art');
  const hud = document.getElementById('tetris-hud');
  const pad = document.getElementById('tetris-pad');
  const elSize = document.getElementById('tetris-size');
  const elScore = document.getElementById('tetris-score');
  const elLines = document.getElementById('tetris-lines');
  const elLevel = document.getElementById('tetris-level');
  const elMsg = document.getElementById('tetris-msg');
  const elNote = document.getElementById('tetris-note');
  const nextCanvas = document.getElementById('tetris-next');
  const holdCanvas = document.getElementById('tetris-hold');
  const panel = document.getElementById('tetris-panel');
  const panelTitle = document.getElementById('tetris-panel-title');
  const btnPause = document.getElementById('btn-tetris-pause');
  const btnResume = document.getElementById('btn-tetris-resume');
  const btnRetry = document.getElementById('btn-tetris-retry');
  const btnKeep = document.getElementById('btn-tetris-keep');

  let g = null; // 遊んでいる間のゲーム状態。遊んでいないときはnull

  // ── 色 ──
  function paletteColors() {
    return customColors.filter(Boolean);
  }

  function randomHex() {
    // 真っ白・真っ黒に近い色だと背景に紛れて見えないので、明るさと鮮やかさは程々にする
    const h = Math.random() * 360;
    const s = 0.55 + Math.random() * 0.4;
    const l = 0.4 + Math.random() * 0.2;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  function pickColor() {
    const hex = g.palette.length
      ? g.palette[Math.floor(Math.random() * g.palette.length)]
      : randomHex();
    const u32 = hexToU32(hex);
    g.hexOf.set(u32, hex); // レイヤーに残すときに色へ戻すため
    return { hex, u32 };
  }

  // 7種類を1巡ずつシャッフルして出す（同じ形ばかり続かないように）
  function nextPiece() {
    if (!g.bag.length) {
      g.bag = [...TYPES];
      for (let i = g.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [g.bag[i], g.bag[j]] = [g.bag[j], g.bag[i]];
      }
    }
    return { type: g.bag.pop(), color: pickColor() };
  }

  // ── 盤面 ──
  function collides(type, rot, x, y) {
    for (const [dx, dy] of SHAPES[type][rot]) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cx >= g.w || cy >= g.h) return true;
      if (cy >= 0 && g.field[cy * g.w + cx]) return true; // 盤面より上はまだ空いている扱い
    }
    return false;
  }

  function spawn(piece) {
    const n = PIECES[piece.type].n;
    g.cur = {
      ...piece,
      rot: 0,
      x: Math.floor((g.w - n) / 2),
      y: piece.type === 'I' ? -1 : 0, // Iは枠の2段目にあるので、1段上げて最上段に出す
    };
    g.lockAt = null;
    g.lockResets = 0;
    g.lastFall = performance.now();
    if (collides(g.cur.type, g.cur.rot, g.cur.x, g.cur.y)) {
      gameOver();
      return;
    }
    g.dirty = true;
    followPiece();
  }

  // 着地中に動かせたら、固定までの猶予を延ばす
  function afterMove() {
    if (g.lockAt !== null && g.lockResets < MAX_LOCK_RESETS) {
      g.lockAt = performance.now() + LOCK_DELAY;
      g.lockResets++;
    }
    g.dirty = true;
    followPiece();
  }

  function tryMove(dx, dy) {
    const c = g.cur;
    if (collides(c.type, c.rot, c.x + dx, c.y + dy)) return false;
    c.x += dx;
    c.y += dy;
    afterMove();
    return true;
  }

  function rotate(dir) {
    const c = g.cur;
    if (c.type === 'O') return;
    const rot = (c.rot + dir + 4) % 4;
    for (const [kx, ky] of KICKS) {
      if (!collides(c.type, rot, c.x + kx, c.y + ky)) {
        c.rot = rot;
        c.x += kx;
        c.y += ky;
        afterMove();
        return;
      }
    }
  }

  function ghostY() {
    const c = g.cur;
    let y = c.y;
    while (!collides(c.type, c.rot, c.x, y + 1)) y++;
    return y;
  }

  function hardDrop() {
    const y = ghostY();
    g.score += (y - g.cur.y) * 2;
    g.cur.y = y;
    lockPiece();
  }

  function hold() {
    if (g.holdUsed) return;
    const { type, color } = g.cur;
    const held = g.hold;
    g.hold = { type, color };
    g.holdUsed = true;
    if (held) spawn(held);
    else { spawn(g.next); g.next = nextPiece(); }
    updateHud();
  }

  function lockPiece() {
    const c = g.cur;
    const fctx = g.fieldCtx;
    fctx.fillStyle = c.color.hex;
    let lockedOut = false;
    for (const [dx, dy] of SHAPES[c.type][c.rot]) {
      const cx = c.x + dx, cy = c.y + dy;
      if (cy < 0) { lockedOut = true; continue; } // 盤面からはみ出したまま積もった
      g.field[cy * g.w + cx] = c.color.u32;
      g.rowFill[cy]++;
      fctx.fillRect(cx, cy, 1, 1);
    }
    g.cur = null;
    clearLines();
    if (lockedOut) { gameOver(); return; }
    g.holdUsed = false;
    spawn(g.next);
    g.next = nextPiece();
    updateHud();
  }

  // 揃った行を消し、上の行を詰めて落とす
  function clearLines() {
    const { w, h, field, rowFill } = g;
    let cleared = 0;
    for (let r = 0; r < h; r++) if (rowFill[r] === w) cleared++;
    if (!cleared) return;
    let dst = h - 1;
    for (let r = h - 1; r >= 0; r--) {
      if (rowFill[r] === w) continue;
      if (dst !== r) {
        field.copyWithin(dst * w, r * w, r * w + w);
        rowFill[dst] = rowFill[r];
      }
      dst--;
    }
    field.fill(0, 0, (dst + 1) * w);
    rowFill.fill(0, 0, dst + 1);
    g.fieldCtx.putImageData(g.fieldImg, 0, 0);

    const level = currentLevel();
    g.score += LINE_SCORES[Math.min(cleared, 4)] * level;
    g.lines += cleared;
    showMessage(LINE_NAMES[Math.min(cleared, 4)]);
  }

  function currentLevel() {
    return 1 + Math.floor(g.lines / 10);
  }

  function fallInterval() {
    return Math.max(30, 800 * Math.pow(0.85, currentLevel() - 1));
  }

  // ── 表示 ──
  function renderPiece() {
    const ctx = g.pieceCtx;
    ctx.clearRect(0, 0, g.w, g.h);
    const c = g.cur;
    if (!c) return;
    const cells = SHAPES[c.type][c.rot];
    const gy = ghostY();
    ctx.fillStyle = c.color.hex;
    ctx.globalAlpha = 0.25;
    for (const [dx, dy] of cells) if (gy + dy >= 0) ctx.fillRect(c.x + dx, gy + dy, 1, 1);
    ctx.globalAlpha = 1;
    for (const [dx, dy] of cells) if (c.y + dy >= 0) ctx.fillRect(c.x + dx, c.y + dy, 1, 1);
  }

  // ネクスト・ホールドの小さな表示（8×8ピクセルに1マス2ピクセルで中央寄せ）
  function drawPreview(canvas, piece) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 8, 8);
    if (!piece) return;
    const cells = SHAPES[piece.type][0];
    const xs = cells.map(p => p[0]), ys = cells.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const ox = 4 - (Math.max(...xs) - minX + 1);
    const oy = 4 - (Math.max(...ys) - minY + 1);
    ctx.fillStyle = piece.color.hex;
    for (const [x, y] of cells) ctx.fillRect(ox + (x - minX) * 2, oy + (y - minY) * 2, 2, 2);
  }

  function updateHud() {
    elScore.textContent = g.score.toLocaleString();
    elLines.textContent = g.lines.toLocaleString();
    elLevel.textContent = currentLevel();
    drawPreview(nextCanvas, g.next);
    drawPreview(holdCanvas, g.hold);
    holdCanvas.style.opacity = g.holdUsed ? 0.4 : 1;
  }

  let msgTimer = null;
  function showMessage(text) {
    elMsg.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { elMsg.textContent = ''; }, 1200);
  }

  // 大きな盤面では落下中のブロックが画面外に出てしまうので、端に近づいたらスクロールする。
  // 少しずつ追いかけると落ちる先が見えないため、横は中央、縦は上から1/3の位置まで一度に動かす。
  // 操作パネル（右側またはスマホでは上部）やタッチ用ボタンに隠れる範囲は見えない扱いにする。
  function followPiece() {
    const c = g && g.cur;
    if (!c) return;
    const a = canvasArea.getBoundingClientRect();
    let left = a.left, right = a.right, top = a.top, bottom = a.bottom;
    const hr = hud.getBoundingClientRect();
    if (hr.left > a.left + a.width / 2) right = Math.min(right, hr.left - 8);
    else if (hr.top < a.top + a.height / 2) top = Math.max(top, hr.bottom + 8);
    if (getComputedStyle(pad).display !== 'none') bottom = Math.min(bottom, pad.getBoundingClientRect().top - 8);

    const wr = wrap.getBoundingClientRect();
    const cw = wr.width / g.w, ch = wr.height / g.h;
    const cells = SHAPES[c.type][c.rot];
    const xs = cells.map(p => c.x + p[0]), ys = cells.map(p => Math.max(0, c.y + p[1]));
    const pl = wr.left + Math.min(...xs) * cw, pr = wr.left + (Math.max(...xs) + 1) * cw;
    const pt = wr.top + Math.min(...ys) * ch, pb = wr.top + (Math.max(...ys) + 1) * ch;
    const mx = Math.min(60, (right - left) / 4), my = Math.min(60, (bottom - top) / 4);
    if (pl < left + mx || pr > right - mx) {
      canvasArea.scrollLeft += (pl + pr) / 2 - (left + right) / 2;
    }
    if (pt < top + my || pb > bottom - my) {
      canvasArea.scrollTop += (pt + pb) / 2 - (top + (bottom - top) / 3);
    }
  }

  // ── ループ ──
  function horizontalDir() {
    const { left, right } = g.held;
    if (left && right) return g.lastDir;
    return left ? 'left' : right ? 'right' : null;
  }

  // 押しっぱなしの時間が長いほど1回に進むマス数を増やす。
  // 横1000マスの盤面を1マスずつ運んでいたら日が暮れるため（32マス程度の盤面では常に1マス）
  function shiftSteps(heldFor) {
    const max = Math.max(1, Math.floor(g.w / 32));
    return Math.min(max, 1 + Math.floor((heldFor - DAS) / 500));
  }

  function tick(now) {
    if (!g) return;
    g.raf = requestAnimationFrame(tick);
    if (g.state !== 'playing' || !g.cur) return;

    const dir = horizontalDir();
    if (dir) {
      const heldFor = now - g.held[dir];
      if (heldFor >= DAS && now - g.lastShift >= ARR) {
        const dx = dir === 'left' ? -1 : 1;
        for (let i = shiftSteps(heldFor); i > 0; i--) if (!tryMove(dx, 0)) break;
        g.lastShift = now;
      }
    }

    const c = g.cur;
    if (collides(c.type, c.rot, c.x, c.y + 1)) {
      if (g.lockAt === null) g.lockAt = now + LOCK_DELAY;
      else if (now >= g.lockAt) lockPiece();
    } else {
      g.lockAt = null;
      const interval = g.held.down ? Math.min(SOFT_DROP_INTERVAL, fallInterval()) : fallInterval();
      if (now - g.lastFall >= interval) {
        c.y++;
        g.lastFall = now;
        if (g.held.down) { g.score++; updateHud(); }
        g.dirty = true;
        followPiece();
      }
    }

    if (g.dirty && g.cur) { renderPiece(); g.dirty = false; }
  }

  // ── 操作 ──
  function press(act) {
    if (!g || g.state !== 'playing' || !g.cur) return;
    const now = performance.now();
    switch (act) {
      case 'left':
      case 'right':
        g.held[act] = now;
        g.lastDir = act;
        g.lastShift = now;
        tryMove(act === 'left' ? -1 : 1, 0);
        break;
      case 'down':
        g.held.down = now;
        g.lastFall = 0; // 押した瞬間に1段落とす
        break;
      case 'cw': rotate(1); break;
      case 'ccw': rotate(-1); break;
      case 'drop': hardDrop(); break;
      case 'hold': hold(); break;
    }
    if (g && g.cur) renderPiece();
  }

  function release(act) {
    if (g && act in g.held) g.held[act] = 0;
  }

  const KEY_ACTIONS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'cw', KeyX: 'cw', KeyW: 'cw',
    KeyZ: 'ccw',
    Space: 'drop',
    KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
  };

  // 遊んでいる間はエディタのショートカット（ツール切替・Undo・Dキーの確認モードなど）を
  // 一切効かせないよう、どのリスナーより先に受け取って止める
  window.addEventListener('keydown', e => {
    if (!g || isTypingTarget(e.target)) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (g.state === 'playing') pause();
      else if (g.state === 'paused') resume();
      return;
    }
    if (g.state !== 'playing') return; // 一時停止中などはパネルのボタン操作（Enter・Space）を妨げない
    const act = KEY_ACTIONS[e.code];
    if (!act) return;
    e.preventDefault();
    if (e.repeat) return; // 押しっぱなしはループ側で処理する
    press(act);
  }, true);

  window.addEventListener('keyup', e => {
    if (!g) return;
    e.stopImmediatePropagation();
    const act = KEY_ACTIONS[e.code];
    if (!act) return;
    if (g.state === 'playing') e.preventDefault();
    release(act);
  }, true);

  // 別のウィンドウに移ったら一時停止（押しっぱなしのキーの離した通知も来なくなるため）
  window.addEventListener('blur', () => { if (g && g.state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && g && g.state === 'playing') pause();
  });

  pad.querySelectorAll('button').forEach(b => {
    const act = b.dataset.act;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* 捕捉できなくても押している間は効く */ }
      press(act);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
      b.addEventListener(type, () => release(act));
    });
    b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // ── 開始・一時停止・終了 ──
  function showPanel(title, mode) {
    panelTitle.textContent = title;
    btnResume.style.display = mode === 'paused' ? '' : 'none';
    btnRetry.style.display = mode === 'over' ? '' : 'none';
    btnKeep.disabled = !g.field.some(Boolean);
    panel.style.display = '';
    btnPause.style.display = 'none';
  }

  function hidePanel() {
    panel.style.display = 'none';
    btnPause.style.display = '';
  }

  function pause() {
    g.state = 'paused';
    g.held = { left: 0, right: 0, down: 0 };
    showPanel('⏸ 一時停止中', 'paused');
  }

  function resume() {
    g.state = 'playing';
    g.lastFall = performance.now();
    if (g.lockAt !== null) g.lockAt = performance.now() + LOCK_DELAY;
    hidePanel();
    if (document.activeElement) document.activeElement.blur(); // Spaceでボタンが押されないように
  }

  function gameOver() {
    g.state = 'over';
    g.cur = null;
    g.pieceCtx.clearRect(0, 0, g.w, g.h);
    showPanel(`GAME OVER\nスコア ${g.score.toLocaleString()}`, 'over');
  }

  function makeLayerCanvas() {
    const cv = document.createElement('canvas');
    cv.className = 'tetris-layer';
    cv.width = cols;
    cv.height = rows;
    return cv;
  }

  // 盤面を用意する。useArtなら今の絵（見えているレイヤーを重ねた色）を積もったブロックとして置く
  function resetBoard(useArt) {
    const w = cols, h = rows;
    g.fieldImg = g.fieldCtx.createImageData(w, h);
    g.field = new Uint32Array(g.fieldImg.data.buffer);
    g.rowFill = new Int32Array(h);
    if (useArt) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const hex = compositeAt(r, c);
          if (!hex) continue;
          const u32 = hexToU32(hex);
          g.hexOf.set(u32, hex);
          g.field[r * w + c] = u32;
          g.rowFill[r]++;
        }
      }
    }
    g.fieldCtx.putImageData(g.fieldImg, 0, 0);
    g.pieceCtx.clearRect(0, 0, w, h);
    g.bag = [];
    g.score = 0;
    g.lines = 0;
    g.hold = null;
    g.holdUsed = false;
    g.held = { left: 0, right: 0, down: 0 };
    g.lastDir = null;
    g.lastShift = 0;
    g.state = 'playing';
    elMsg.textContent = '';
    hidePanel();
    g.next = nextPiece();
    spawn(nextPiece());
    updateHud();
  }

  function startGame() {
    const useArt = useArtCheck.checked;
    const fieldCanvas = makeLayerCanvas();
    const pieceCanvas = makeLayerCanvas();
    cMain.after(fieldCanvas, pieceCanvas);
    g = {
      w: cols, h: rows,
      useArt,
      palette: paletteColors(),
      hexOf: new Map(),
      fieldCanvas, pieceCanvas,
      fieldCtx: fieldCanvas.getContext('2d'),
      pieceCtx: pieceCanvas.getContext('2d'),
      raf: 0,
    };
    document.body.classList.add('tetris-playing');
    elSize.textContent = `${cols}×${rows}`;
    elNote.textContent = cols >= 100 ? `1列そろえるのに ${cols.toLocaleString()} マス必要です` : '';
    if (document.activeElement) document.activeElement.blur();
    resetBoard(useArt);
    g.raf = requestAnimationFrame(tick);
  }

  // 盤面を新しいレイヤーとして残す（Undoで取り消せる）
  function keepBoardAsLayer() {
    pushHistory();
    addLayerAboveActive();
    const layer = layers[activeLayerIndex];
    layer.name = 'テトリス';
    for (let r = 0; r < g.h; r++) {
      const row = layer.cells[r];
      for (let c = 0; c < g.w; c++) {
        const v = g.field[r * g.w + c];
        if (v) row[c] = g.hexOf.get(v);
      }
    }
    drawCells();
    updateLayerPanel();
  }

  function endGame(keep) {
    if (keep) keepBoardAsLayer();
    cancelAnimationFrame(g.raf);
    g.fieldCanvas.remove();
    g.pieceCanvas.remove();
    g = null;
    document.body.classList.remove('tetris-playing');
    clearTimeout(msgTimer);
  }

  document.getElementById('btn-tetris').addEventListener('click', () => {
    if (!started || g) return;
    closeFileMenu();
    startSize.textContent = `${cols}×${rows}`;
    const n = paletteColors().length;
    const notes = [
      n ? `ブロックの色：カスタムカラーの ${n} 色` : 'ブロックの色：ランダム（カスタムカラーが空のため）',
    ];
    if (cols >= 100) notes.push(`※ 1列そろえるのに ${cols.toLocaleString()} マス必要です`);
    notes.push('遊び終わったら、盤面をレイヤーとして残すこともできます');
    startNote.textContent = notes.join('\n');
    startNote.style.whiteSpace = 'pre-line';
    startModal.style.display = 'flex';
  });
  document.getElementById('btn-tetris-start').addEventListener('click', () => {
    startModal.style.display = 'none';
    startGame();
  });
  document.getElementById('btn-tetris-cancel').addEventListener('click', () => {
    startModal.style.display = 'none';
  });

  btnPause.addEventListener('click', () => { if (g && g.state === 'playing') pause(); });
  btnResume.addEventListener('click', () => { if (g && g.state === 'paused') resume(); });
  btnRetry.addEventListener('click', () => {
    if (!g) return;
    resetBoard(g.useArt);
    if (document.activeElement) document.activeElement.blur();
  });
  btnKeep.addEventListener('click', () => { if (g) endGame(true); });
  document.getElementById('btn-tetris-quit').addEventListener('click', () => { if (g) endGame(false); });
})();
