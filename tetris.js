// ── テトリス ──────────────────────────────────────────
// 今のキャンバスサイズがそのまま盤面になるネタ機能。
// サイズは自由に変えられるので、やろうと思えば横1000マス以上のテトリスもできる。
// ブロックの色はカスタムカラーに色があればその中から選び、無ければランダムな色にする。
// script.js のグローバル（cols, rows, layers, customColors, wrap, canvasArea, setZoom など）を
// 使うため、script.js の後に読み込むこと。
//
// 画面の流れ：
//   開始 … キャンバス以外がかくかくと画面外へ消える → キャンバスが右へ寄り、
//          左からサイドパネルが出てくる → READY / GO! で開始
//   終了 … サイドパネルが引っ込み、キャンバスが元の位置へ戻る → ほかの部品が戻ってくる
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

  // 図（#がブロック）から形を作る。回転の中心がずれないよう、正方形の枠の中央に置く
  function fromPattern(lines) {
    const h = lines.length, w = Math.max(...lines.map(l => l.length));
    const n = Math.max(w, h);
    const ox = Math.floor((n - w) / 2), oy = Math.floor((n - h) / 2);
    const cells = [];
    lines.forEach((line, y) => [...line].forEach((ch, x) => { if (ch === '#') cells.push([x + ox, y + oy]); }));
    return { n, cells };
  }

  // 100×100以上の盤面でだけ出てくる特殊ブロック
  const EXTRA_MIN_SIZE = 100;
  const EXTRA_PIECES = {
    PLUS: fromPattern(['.#.', '###', '.#.']),
    U: fromPattern(['#.#', '###']),
    BIG: fromPattern(['###', '###', '###']),
    LONG: fromPattern(['########']),
    HEART: fromPattern(['##.##', '#####', '#####', '.###.', '..#..']),
  };
  const BASE_TYPES = Object.keys(PIECES);
  const EXTRA_TYPES = Object.keys(EXTRA_PIECES);
  const ALL_PIECES = { ...PIECES, ...EXTRA_PIECES };

  // 4方向ぶんの形を先に作っておく（右回転：(x, y) → (n-1-y, x)）
  const SHAPES = {};
  Object.entries(ALL_PIECES).forEach(([t, { n, cells }]) => {
    const rots = [cells];
    for (let i = 1; i < 4; i++) rots.push(rots[i - 1].map(([x, y]) => [n - 1 - y, x]));
    SHAPES[t] = rots;
  });
  // 回転して壁や他のブロックにぶつかったとき、ずらして収まる位置を順に試す。
  // 通常の7種類は本家と同じSRS（スーパーローテーションシステム）の表を使う。
  // 表は本家の資料どおり上向きが+yで書き、下向きが+yの盤面に合わせて符号を反転する。
  // キーは「回転前の向き」「回転後の向き」（0=出現時, 1=右, 2=逆さ, 3=左）
  const flipY = table => Object.fromEntries(
    Object.entries(table).map(([k, list]) => [k, list.map(([x, y]) => [x, -y])])
  );
  const SRS_JLSTZ = flipY({
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  });
  const SRS_I = flipY({
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  });
  // 特殊ブロック用（SRSの表が無いので、左右・上に少しずらして試す）
  const EXTRA_KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
  function kicksFor(type, from, to) {
    if (type === 'I') return SRS_I[`${from}${to}`];
    if (type in PIECES) return SRS_JLSTZ[`${from}${to}`]; // Oは回しても形が変わらないので(0,0)で収まる
    return EXTRA_KICKS;
  }

  // 本家のブロックの色（ホーム画面から直接遊ぶとき）
  const STANDARD_COLORS = {
    I: '#31c7ef', O: '#f7d308', T: '#ad4d9c', S: '#42b642', Z: '#ef2029', J: '#5a65ad', L: '#ef7921',
  };
  const STANDARD_COLS = 10, STANDARD_ROWS = 20;

  const DAS = 170;             // 左右キーを押しっぱなしにしてから連続移動が始まるまで
  const ARR = 33;              // 連続移動の間隔
  const NEXT_COUNT = 3;        // 先に見せるブロックの数
  const SOFT_DROP_INTERVAL = 16;
  const LOCK_DELAY = 500;      // 着地してから固定されるまでの猶予
  const MAX_LOCK_RESETS = 15;  // 着地後に動かして猶予を延ばせる回数
  const FLASH_MS = 260;        // 揃った行が光ってから消えるまで
  const LINE_SCORES = [0, 100, 300, 500, 800];
  const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];

  // 画面の出入りの演出（CSSのアニメーション時間と合わせる）
  const UI_OUT_MS = 1200;      // エディタの部品が消える／戻る
  const SIDE_MS = 1000;        // サイドパネルが出る／引っ込む
  const MOVE_STEPS = 6;        // キャンバスの移動も、かくかくと6段階で動かす

  const side = document.getElementById('tetris-side');
  const pad = document.getElementById('tetris-pad');
  const elSize = document.getElementById('tetris-size');
  const elScore = document.getElementById('tetris-score');
  const elLines = document.getElementById('tetris-lines');
  const elLevel = document.getElementById('tetris-level');
  const elMsg = document.getElementById('tetris-msg');
  const elNote = document.getElementById('tetris-note');
  const colorsBox = document.getElementById('tetris-colors-box');
  const colorsEl = document.getElementById('tetris-colors');
  const nextCanvases = ['tetris-next', 'tetris-next2', 'tetris-next3'].map(id => document.getElementById(id));
  const holdCanvas = document.getElementById('tetris-hold');
  const panel = document.getElementById('tetris-panel');
  const panelTitle = document.getElementById('tetris-panel-title');
  const btnPause = document.getElementById('btn-tetris-pause');
  const btnResume = document.getElementById('btn-tetris-resume');
  const btnKeep = document.getElementById('btn-tetris-keep');
  const btnRetryArt = document.getElementById('btn-tetris-retry-art');

  // 遊んでいる間のゲーム状態。遊んでいないときはnull。
  // state: 'intro'（画面切り替え中）| 'playing' | 'paused' | 'over' | 'outro'（終了演出中）
  let g = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── 色 ──
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

  function pickColor(type) {
    const hex = g.standard ? STANDARD_COLORS[type]
      : g.palette.length ? g.palette[Math.floor(Math.random() * g.palette.length)]
      : randomHex();
    const u32 = hexToU32(hex);
    g.hexOf.set(u32, hex); // レイヤーに残すときに色へ戻すため
    return { hex, u32 };
  }

  // 形を1巡ずつシャッフルして出す（同じ形ばかり続かないように）
  function nextPiece() {
    if (!g.bag.length) {
      g.bag = g.extras ? [...BASE_TYPES, ...EXTRA_TYPES] : [...BASE_TYPES];
      for (let i = g.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [g.bag[i], g.bag[j]] = [g.bag[j], g.bag[i]];
      }
    }
    const type = g.bag.pop();
    return { type, color: pickColor(type) };
  }

  // ネクストの先頭を取り出し、列の最後に新しいブロックを足す
  function takeNext() {
    const piece = g.queue.shift();
    g.queue.push(nextPiece());
    return piece;
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
    const n = ALL_PIECES[piece.type].n;
    const cells = SHAPES[piece.type][0];
    g.cur = {
      ...piece,
      rot: 0,
      x: Math.floor((g.w - n) / 2),
      y: -Math.min(...cells.map(p => p[1])), // 枠の上の空き段を詰めて、最上段に出す
    };
    g.lockAt = null;
    g.lockResets = 0;
    g.lastFall = performance.now();
    if (collides(g.cur.type, g.cur.rot, g.cur.x, g.cur.y)) {
      gameOver();
      return;
    }
    g.dirty = true;
  }

  function nextTurn() {
    g.holdUsed = false;
    spawn(takeNext());
    updateHud();
  }

  // 着地中に動かせたら、固定までの猶予を延ばす
  function afterMove() {
    if (g.lockAt !== null && g.lockResets < MAX_LOCK_RESETS) {
      g.lockAt = performance.now() + LOCK_DELAY;
      g.lockResets++;
    }
    g.dirty = true;
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
    const rot = (c.rot + dir + 4) % 4;
    for (const [kx, ky] of kicksFor(c.type, c.rot, rot)) {
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

  // 得点は横一列が揃ったときだけ入る（落とし方では点を付けない）
  function hardDrop() {
    g.cur.y = ghostY();
    lockPiece();
  }

  function hold() {
    if (g.holdUsed) return;
    const { type, color } = g.cur;
    const held = g.hold;
    g.hold = { type, color };
    spawn(held || takeNext());
    g.holdUsed = true;
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
    if (lockedOut) { gameOver(); return; }
    const full = [];
    for (let r = 0; r < g.h; r++) if (g.rowFill[r] === g.w) full.push(r);
    if (full.length) {
      // すぐには消さず、少しだけ光らせてから消す（ループ側で処理する）
      g.clearing = { rows: full, start: performance.now() };
      return;
    }
    nextTurn();
  }

  // 揃った行を消し、上の行を詰めて落とす
  function clearLines(cleared) {
    const { w, h, field, rowFill } = g;
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

    const n = Math.min(cleared, 4);
    g.score += LINE_SCORES[n] * currentLevel();
    g.lines += cleared;
    showMessage(LINE_NAMES[n]);
  }

  function currentLevel() {
    return 1 + Math.floor(g.lines / 10);
  }

  // 1段落ちるまでの時間。本家（ガイドライン）の式：(0.8 - (レベル-1)×0.007)^(レベル-1) 秒
  function fallInterval() {
    const lv = Math.min(currentLevel(), 20);
    return Math.max(16, 1000 * Math.pow(0.8 - (lv - 1) * 0.007, lv - 1));
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

  // 揃った行を白く光らせる。昔のゲームらしく、なめらかに消さず3段階で明るさを変える
  function renderFlash(t) {
    const ctx = g.pieceCtx;
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = t < 1 / 3 ? 0.85 : t < 2 / 3 ? 0.45 : 0.75;
    for (const r of g.clearing.rows) ctx.fillRect(0, r, g.w, 1);
    ctx.globalAlpha = 1;
  }

  // ネクスト・ホールドの小さな表示（1マス2ピクセルで中央寄せ）
  function drawPreview(canvas, piece) {
    const cells = piece ? SHAPES[piece.type][0] : [];
    const xs = cells.map(p => p[0]), ys = cells.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const bw = piece ? Math.max(...xs) - minX + 1 : 0;
    const bh = piece ? Math.max(...ys) - minY + 1 : 0;
    const size = Math.max(4, bw, bh) + 1; // 周りに少し余白を取る
    canvas.width = canvas.height = size * 2;
    if (!piece) return;
    const ctx = canvas.getContext('2d');
    const ox = size - bw, oy = size - bh;
    ctx.fillStyle = piece.color.hex;
    for (const [x, y] of cells) ctx.fillRect(ox + (x - minX) * 2, oy + (y - minY) * 2, 2, 2);
  }

  function updateHud() {
    elScore.textContent = g.score.toLocaleString();
    elLines.textContent = g.lines.toLocaleString();
    elLevel.textContent = currentLevel();
    nextCanvases.forEach((cv, i) => drawPreview(cv, g.queue[i]));
    drawPreview(holdCanvas, g.hold);
    holdCanvas.style.opacity = g.holdUsed ? 0.4 : 1;
  }

  let msgTimer = null;
  function showMessage(text, ms = 1200) {
    elMsg.textContent = text;
    clearTimeout(msgTimer);
    if (ms) msgTimer = setTimeout(() => { elMsg.textContent = ''; }, ms);
  }

  // サイドパネルに隠れていない、キャンバスが見えている範囲
  function playArea() {
    const a = canvasArea.getBoundingClientRect();
    const left = Math.max(a.left, side.offsetWidth);
    return { left, top: a.top, right: a.right, bottom: a.bottom };
  }

  // ── キャンバスの配置 ──
  function canvasCenter() {
    const r = wrap.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 倍率を変え、キャンバスの中心が画面上の(x, y)に来るようにスクロールする
  function placeCanvas(z, x, y) {
    setZoom(z);
    const c = canvasCenter();
    canvasArea.scrollLeft += c.x - x;
    canvasArea.scrollTop += c.y - y;
  }

  // 今の位置から目的の倍率・位置まで、MOVE_STEPS段階に分けてかくかくと動かす
  async function moveCanvasStepped(z1, x1, y1, duration) {
    const z0 = zoom;
    const { x: x0, y: y0 } = canvasCenter();
    for (let i = 1; i <= MOVE_STEPS; i++) {
      await sleep(duration / MOVE_STEPS);
      const t = i / MOVE_STEPS;
      placeCanvas(z0 * Math.pow(z1 / z0, t), x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  // テトリス画面でのキャンバスの置き場所：サイドパネルの右側の中央。
  // 見える範囲にちょうど収まる倍率にする。ただし巨大な盤面を丸ごと収めると
  // 1マスが見えないほど小さくなるので、1マスが画面上で3px未満になるほどは縮めない
  const MIN_CELL_ON_SCREEN = 3;
  function gameViewTarget() {
    const { left, top, right, bottom } = playArea();
    const { w, h } = canvasSize();
    const fit = Math.min((right - left) * 0.86 / w, (bottom - top) * 0.86 / h);
    const lower = Math.min(zoom, MIN_CELL_ON_SCREEN / cellPx());
    return {
      zoom: Math.max(lower, Math.min(fit, MAX_ZOOM)),
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    };
  }

  // 画面の構成（キャンバスエリアの大きさ）が変わっても、キャンバスが画面上で動かないようにする
  function switchLayout(fn) {
    const pos = canvasScreenPos();
    fn();
    setZoom(zoom); // エリアの大きさに合わせてスクロール用の余白を取り直す
    restoreCanvasScreenPos(pos);
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
    if (!g || g.state === 'outro') return;
    g.raf = requestAnimationFrame(tick);
    if (g.state !== 'playing') return;

    if (g.clearing) {
      const t = (now - g.clearing.start) / FLASH_MS;
      if (t < 1) { renderFlash(t); return; }
      clearLines(g.clearing.rows.length);
      g.clearing = null;
      nextTurn();
    }
    if (!g.cur) return;

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
        g.dirty = true;
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
    if (g && g.held && act in g.held) g.held[act] = 0;
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

  // 遊んでいる間（出入りの演出中も含む）はエディタのショートカット（ツール切替・Undo・
  // Dキーの確認モードなど）を一切効かせないよう、どのリスナーより先に受け取って止める
  window.addEventListener('keydown', e => {
    if (!g || isTypingTarget(e.target)) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (g.state === 'playing') pause();
      else if (g.state === 'paused') resume();
      return;
    }
    if (g.state !== 'playing') return; // ポーズ中などはパネルのボタン操作（Enter・Space）を妨げない
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

  // 別のウィンドウに移ったらポーズ（押しっぱなしのキーの離した通知も来なくなるため）
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

  // テトリス中のキャンバスは、落下中のブロックとは関係なく自由に動かせる。
  // マウスのドラッグでの移動はここで扱う。ホイール・タッチパッドのスクロール、
  // Ctrl+ホイール・ピンチでの拡大縮小、タッチの1本指スクロールはエディタと同じ仕組みがそのまま効く
  let panDrag = null;
  canvasArea.addEventListener('pointerdown', e => {
    if (!g || e.pointerType !== 'mouse' || e.button !== 0) return;
    e.preventDefault();
    panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: canvasArea.scrollLeft, st: canvasArea.scrollTop };
    try { canvasArea.setPointerCapture(e.pointerId); } catch (err) { /* 捕捉できなくても動かせる */ }
    canvasArea.classList.add('tetris-grabbing');
  });
  canvasArea.addEventListener('pointermove', e => {
    if (!panDrag || e.pointerId !== panDrag.id) return;
    canvasArea.scrollLeft = panDrag.sl - (e.clientX - panDrag.x);
    canvasArea.scrollTop = panDrag.st - (e.clientY - panDrag.y);
  });
  ['pointerup', 'pointercancel'].forEach(type => {
    canvasArea.addEventListener(type, e => {
      if (!panDrag || e.pointerId !== panDrag.id) return;
      panDrag = null;
      canvasArea.classList.remove('tetris-grabbing');
    });
  });

  // ── ポーズ・ゲームオーバー ──
  function showPanel(title, mode) {
    panelTitle.textContent = title;
    btnResume.style.display = mode === 'paused' ? '' : 'none';
    btnRetryArt.style.display = g.standard ? 'none' : ''; // 本家モードのキャンバスには絵が無い
    btnKeep.disabled = !g.field.some(Boolean);
    side.scrollTop = 0; // 重ねる画面はパネルの最上部に置いているため、スクロールしていたら戻す
    panel.style.display = '';
  }

  function hidePanel() {
    panel.style.display = 'none';
  }

  function pause() {
    g.state = 'paused';
    g.held = { left: 0, right: 0, down: 0 };
    showPanel('PAUSE', 'paused');
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
    showPanel(`GAME OVER\nSCORE ${g.score.toLocaleString()}`, 'over');
  }

  // ── 盤面の準備 ──
  // useArtなら今の絵（見えているレイヤーを重ねた色）を積もったブロックとして置く
  function resetBoard(useArt) {
    const { w, h } = g;
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
    g.cur = null;
    g.clearing = null;
    g.bag = [];
    g.score = 0;
    g.lines = 0;
    g.hold = null;
    g.holdUsed = false;
    g.held = { left: 0, right: 0, down: 0 };
    g.lastDir = null;
    g.lastShift = 0;
    g.queue = Array.from({ length: NEXT_COUNT }, () => nextPiece());
    elMsg.textContent = '';
    hidePanel();
    updateHud();
  }

  function startRound() {
    g.state = 'playing';
    spawn(takeNext());
    updateHud();
  }

  function retry(useArt) {
    resetBoard(useArt);
    startRound();
    if (document.activeElement) document.activeElement.blur();
  }

  function makeLayerCanvas() {
    const cv = document.createElement('canvas');
    cv.className = 'tetris-layer';
    cv.width = cols;
    cv.height = rows;
    return cv;
  }

  function fillSidePanel() {
    elSize.textContent = `${g.w}×${g.h}`;
    colorsEl.innerHTML = '';
    g.palette.forEach(hex => {
      const sw = document.createElement('i');
      sw.style.background = hex;
      colorsEl.appendChild(sw);
    });
    colorsBox.style.display = g.palette.length ? '' : 'none';
    const notes = [];
    if (g.w >= 100) notes.push(`1列そろえるのに ${g.w.toLocaleString()} マス必要です`);
    if (g.extras) notes.push('巨大盤面ボーナス：特殊ブロック出現中');
    elNote.textContent = notes.join('\n');
  }

  // 画面にドット風の文字を使う（テトリスを始めたときにだけ読み込む）
  function loadRetroFont() {
    if (document.getElementById('tetris-font')) return;
    const link = document.createElement('link');
    link.id = 'tetris-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
    document.head.appendChild(link);
  }

  // ── 開始と終了 ──
  // standard: 本家と同じ設定（10×20・ブロックごとに決まった色）で遊ぶ
  // direct: ホーム画面から直接来た。エディタの部品を消す演出を省き、終了したらホームへ戻る
  async function openGame({ standard = false, direct = false } = {}) {
    loadRetroFont();
    const body = document.body;
    const center = canvasCenter();
    g = {
      state: 'intro',
      standard, direct,
      w: cols, h: rows,
      extras: !standard && cols >= EXTRA_MIN_SIZE && rows >= EXTRA_MIN_SIZE,
      palette: standard ? [] : customColors.filter(Boolean),
      hexOf: new Map(),
      saved: { zoom, x: center.x, y: center.y }, // 終わったらこの表示に戻す
      raf: 0,
    };
    if (document.activeElement) document.activeElement.blur();

    // ① キャンバス以外を画面外へ（直接来たときは一瞬で消す）
    if (direct) body.classList.add('tetris-instant');
    body.classList.add('tetris-playing', 'tetris-out');
    if (!direct) await sleep(UI_OUT_MS);

    // ② キャンバスエリアを画面いっぱいにして盤面を用意する
    switchLayout(() => body.classList.add('tetris-stage'));
    const fieldCanvas = makeLayerCanvas();
    const pieceCanvas = makeLayerCanvas();
    cMain.after(fieldCanvas, pieceCanvas);
    Object.assign(g, {
      fieldCanvas, pieceCanvas,
      fieldCtx: fieldCanvas.getContext('2d'),
      pieceCtx: pieceCanvas.getContext('2d'),
    });
    fillSidePanel();
    resetBoard(false);

    // ③ キャンバスを右へ寄せながら、サイドパネルを左から出す
    //    （直接来たときは最初から右に置いておき、隠していたページをここで見せる）
    const target = gameViewTarget();
    if (direct) {
      placeCanvas(target.zoom, target.x, target.y);
      document.documentElement.classList.remove('tetris-direct');
    }
    body.classList.add('tetris-side-in');
    await Promise.all([
      direct ? null : moveCanvasStepped(target.zoom, target.x, target.y, SIDE_MS),
      sleep(SIDE_MS),
    ]);

    showMessage('READY', 0);
    await sleep(700);
    showMessage('GO!', 800);
    startRound();
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

  async function closeGame(keep) {
    if (!g || g.state === 'outro' || g.state === 'intro') return;
    if (keep) keepBoardAsLayer();
    const body = document.body;
    g.state = 'outro';
    cancelAnimationFrame(g.raf);
    hidePanel();
    clearTimeout(msgTimer);
    elMsg.textContent = '';

    // ③の逆：サイドパネルを引っ込めながら、キャンバスを元の倍率・位置へ戻す
    body.classList.remove('tetris-side-in');
    body.classList.add('tetris-side-out');
    if (g.direct && !keep) {
      // ホームから直接来たときは、パネルが引っ込んだらホームへ戻る
      await sleep(SIDE_MS);
      location.href = 'index.html';
      return;
    }
    if (g.direct) {
      // 盤面を残してエディタに移るので、再読み込みでまたテトリスが始まらないようにする
      // （script.jsのグローバル変数historyはUndo用の配列なので、window.historyを明示する）
      window.history.replaceState(null, '', location.pathname);
    }
    await Promise.all([
      moveCanvasStepped(g.saved.zoom, g.saved.x, g.saved.y, SIDE_MS),
      sleep(SIDE_MS),
    ]);

    // ②の逆：盤面を片付けてエディタの配置に戻す（描いた絵がまた見えるようになる）
    g.fieldCanvas.remove();
    g.pieceCanvas.remove();
    switchLayout(() => body.classList.remove('tetris-stage', 'tetris-side-out'));

    // ①の逆：消えていた部品を戻す
    body.classList.remove('tetris-out', 'tetris-instant');
    body.classList.add('tetris-return');
    await sleep(UI_OUT_MS);
    body.classList.remove('tetris-return', 'tetris-playing');
    g = null;
  }

  document.getElementById('btn-tetris').addEventListener('click', () => {
    if (!started || g) return;
    openGame();
  });
  btnPause.addEventListener('click', () => { if (g && g.state === 'playing') pause(); });
  btnResume.addEventListener('click', () => { if (g && g.state === 'paused') resume(); });
  document.getElementById('btn-tetris-retry').addEventListener('click', () => { if (g) retry(false); });
  document.getElementById('btn-tetris-retry-art').addEventListener('click', () => { if (g) retry(true); });
  btnKeep.addEventListener('click', () => closeGame(true));
  document.getElementById('btn-tetris-quit').addEventListener('click', () => closeGame(false));

  // ホーム画面のテトリスボタン（editor.html?tetris）から来たら、スタート画面を飛ばして
  // 本家と同じ10×20の盤面ですぐに始める。エディタの読み込み完了時にキャンバスを
  // 中央へ寄せる処理（script.jsのcenterCanvasOnBoot）が済んでから配置する。
  if (document.documentElement.classList.contains('tetris-direct')) {
    const boot = () => {
      cols = STANDARD_COLS;
      rows = STANDARD_ROWS;
      startEditor();
      syncSlidersToGrid();
      updatePresetHighlight();
      openGame({ standard: true, direct: true });
    };
    if (document.readyState === 'complete') setTimeout(boot, 0);
    else window.addEventListener('load', () => setTimeout(boot, 0));
  }
})();
