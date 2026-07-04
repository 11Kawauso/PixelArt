// ── 状態 ──────────────────────────────────────────────
const PALETTE_COLORS = [
  '#ffffff','#d0d0d0','#888888','#444444','#1a1a18','#000000',
  '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db',
  '#9b59b6','#e91e8c','#ff7675','#fdcb6e','#55efc4','#74b9ff',
  '#a29bfe','#fd79a8','#dfe6e9','#b2bec3','#636e72','#2d3436',
  '#c0392b','#d35400','#f39c12','#27ae60','#16a085','#2980b9',
  '#8e44ad','#ff006e','#ff8c00','#00b894','#0984e3','#6c5ce7',
  '#fab1a0','#ffeaa7','#81ecec','#6366f1','#fd79a8','#636e72',
  '#2c3e50','#34495e','#7f8c8d','#95a5a6','#bdc3c7','#ecf0f1',
];

let cols = 32, rows = 32;
let cells = [];          // cells[row][col] = '#rrggbb' or null
let history = [];
let zoom = 1;
let currentTool = 'pen';
let currentColor = '#3a3a38';
let convertMethod = 'mode';
let convertColorCount = 32;
let showGrid = true;
let uploadedImage = null;
let isPainting = false;
let lastCell = null;
let started = false;
let brushSize = 1;
let drawStyle = 'normal';
let detectLine = false;
let selectionMode = 'none'; // 'none', 'range', 'color'
let selectionMask = null;   // null = all editable, or bool[][]
let rangeStart = null;
let rangeSelectMode = 'rect'; // 'rect' = 四角で囲う, 'free' = 自分で指定
let rangePath = [];
let shapeType = 'circle'; // 'line', 'circle', 'rect', 'diamond', 'heart'
let shapeFill = true;
let shapeStart = null;
let heartImage = null; // ハート図形に使う差し替え用の画像（用意されていれば数式の代わりに使う）
(() => {
  const img = new Image();
  img.onload = () => { heartImage = img; };
  img.src = 'images/heart.png';
})();

// ── DOM ───────────────────────────────────────────────
const cBg  = document.getElementById('canvas-bg');
const cMain= document.getElementById('canvas-main');
const cOv  = document.getElementById('canvas-overlay');
const wrap = document.getElementById('canvas-wrap');
const overlay = document.getElementById('start-overlay');
const statPos   = document.getElementById('stat-pos');
const statColor = document.getElementById('stat-color');
const statGrid  = document.getElementById('stat-grid');
const zoomLabel = document.getElementById('zoom-label');

// 1マスのピクセル数をグリッドサイズに応じて自動調整
function cellPx() {
  const n = Math.max(cols, rows);
  if (n <= 32)  return 14;
  if (n <= 64)  return 8;
  if (n <= 128) return 4;
  return 2;
}

// ── 初期化 ────────────────────────────────────────────
function initCells(c, r, keepOld) {
  const old = cells;
  cells = Array.from({length: r}, (_, ri) =>
    Array.from({length: c}, (_, ci) =>
      keepOld && old[ri] && old[ri][ci] !== undefined ? old[ri][ci] : null
    )
  );
  cols = c; rows = r;
  document.getElementById('stat-grid').textContent = `${cols}×${rows}`;
}

function canvasSize() {
  const px = cellPx();
  return { w: cols * px, h: rows * px };
}

const scrollPad = document.querySelector('.canvas-scroll-pad');
const canvasArea = document.getElementById('canvas-area');

function updateScrollPadding() {
  const areaW = canvasArea.clientWidth;
  const areaH = canvasArea.clientHeight;
  const {w, h} = canvasSize();
  const canvasW = w * zoom;
  const canvasH = h * zoom;
  const padX = Math.max(areaW, canvasW);
  const padY = Math.max(areaH * 0.5, canvasH * 0.5);
  scrollPad.style.padding = `${padY}px ${padX}px`;
}

function resizeCanvases() {
  const {w, h} = canvasSize();
  [cBg, cMain, cOv].forEach(c => { c.width = w; c.height = h; });
  wrap.style.width  = (w * zoom) + 'px';
  wrap.style.height = (h * zoom) + 'px';
  [cBg, cMain, cOv].forEach(c => {
    c.style.width  = (w * zoom) + 'px';
    c.style.height = (h * zoom) + 'px';
  });
  updateScrollPadding();
  drawAll();
}

function drawAll() {
  drawBg();
  drawCells();
  drawGridLines();
}

function drawBg() {
  const px = cellPx();
  const ctx = cBg.getContext('2d');
  ctx.clearRect(0, 0, cBg.width, cBg.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#cccccc' : '#eeeeee';
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
}

function drawCells() {
  const px = cellPx();
  const ctx = cMain.getContext('2d');
  ctx.clearRect(0, 0, cMain.width, cMain.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c]) {
        ctx.fillStyle = cells[r][c];
        ctx.fillRect(c * px, r * px, px, px);
      }
    }
  }
  drawGridLines();
}

function drawGridLines() {
  const px = cellPx();
  const ctx = cMain.getContext('2d');
  if (!showGrid) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * px, 0);
    ctx.lineTo(c * px, rows * px);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * px);
    ctx.lineTo(cols * px, r * px);
    ctx.stroke();
  }
}

function drawGrid() {
  drawBg();
  drawCells();
  drawGridLines();
}

function brushRect(col, row) {
  const half = Math.floor(brushSize / 2);
  return {
    c1: col - half,
    r1: row - half,
    c2: col - half + brushSize - 1,
    r2: row - half + brushSize - 1,
  };
}

function drawSelectionOverlay(ctx) {
  if (!selectionMask) return;
  const px = cellPx();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!selectionMask[r][c]) {
        ctx.fillRect(c * px, r * px, px, px);
      }
    }
  }
}

function drawOverlayCell(col, row) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  drawSelectionOverlay(ctx);
  if (selectionMode === 'range' && rangeStart) return;
  if (col < 0 || col >= cols || row < 0 || row >= rows) return;
  const b = brushRect(col, row);
  const x1 = Math.max(0, b.c1) * px;
  const y1 = Math.max(0, b.r1) * px;
  const x2 = (Math.min(cols - 1, b.c2) + 1) * px;
  const y2 = (Math.min(rows - 1, b.r2) + 1) * px;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1 - 1, y2 - y1 - 1);
}

// ── イベント：キャンバス ───────────────────────────────
function getCell(e) {
  const px = cellPx();
  const rect = cOv.getBoundingClientRect();
  const x = (e.clientX - rect.left) / zoom;
  const y = (e.clientY - rect.top)  / zoom;
  return { col: Math.floor(x / px), row: Math.floor(y / px) };
}

function isCellEditable(r, c) {
  return !selectionMask || (selectionMask[r] && selectionMask[r][c]);
}

function paintBrush(col, row, value) {
  const b = brushRect(col, row);
  for (let r = b.r1; r <= b.r2; r++) {
    for (let c = b.c1; c <= b.c2; c++) {
      if (c >= 0 && c < cols && r >= 0 && r < rows && isCellEditable(r, c)) {
        cells[r][c] = value;
      }
    }
  }
}

function interpolateCells(c0, r0, c1, r1) {
  const points = [];
  let dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    points.push({col: c0, row: r0});
    if (c0 === c1 && r0 === r1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; c0 += sx; }
    if (e2 < dx)  { err += dx; r0 += sy; }
  }
  return points;
}

function applyToolLine(fromCol, fromRow, toCol, toRow) {
  const points = interpolateCells(fromCol, fromRow, toCol, toRow);
  for (const {col, row} of points) {
    applyToolSingle(col, row);
  }
  drawCells();
}

function brushColRange(col) {
  const half = Math.floor(brushSize / 2);
  return { c1: Math.max(0, col - half), c2: Math.min(cols - 1, col - half + brushSize - 1) };
}
function brushRowRange(row) {
  const half = Math.floor(brushSize / 2);
  return { r1: Math.max(0, row - half), r2: Math.min(rows - 1, row - half + brushSize - 1) };
}

function snapshotHasFilledInCols(snap, r, c1, c2) {
  for (let c = c1; c <= c2; c++) {
    if (snap[r] && snap[r][c]) return true;
  }
  return false;
}
function snapshotHasFilledInRows(snap, c, r1, r2) {
  for (let r = r1; r <= r2; r++) {
    if (snap[r] && snap[r][c]) return true;
  }
  return false;
}

function paintRow(r, c1, c2, value) {
  for (let c = c1; c <= c2; c++) {
    if (c >= 0 && c < cols && r >= 0 && r < rows && isCellEditable(r, c)) {
      cells[r][c] = value;
    }
  }
}

function paintCol(c, r1, r2, value) {
  for (let r = r1; r <= r2; r++) {
    if (c >= 0 && c < cols && r >= 0 && r < rows && isCellEditable(r, c)) {
      cells[r][c] = value;
    }
  }
}

function paintStyle(col, row, value) {
  if (drawStyle === 'col' && (currentTool === 'pen' || currentTool === 'erase')) {
    const {c1, c2} = brushColRange(col);
    if (detectLine) {
      const snap = cells.map(r => [...r]);
      for (let r = row; r >= 0; r--) {
        if (snapshotHasFilledInCols(snap, r, c1, c2)) break;
        paintRow(r, c1, c2, value);
      }
      for (let r = row + 1; r < rows; r++) {
        if (snapshotHasFilledInCols(snap, r, c1, c2)) break;
        paintRow(r, c1, c2, value);
      }
    } else {
      for (let r = 0; r < rows; r++) paintRow(r, c1, c2, value);
    }
  } else if (drawStyle === 'row' && (currentTool === 'pen' || currentTool === 'erase')) {
    const {r1, r2} = brushRowRange(row);
    if (detectLine) {
      const snap = cells.map(r => [...r]);
      for (let c = col; c >= 0; c--) {
        if (snapshotHasFilledInRows(snap, c, r1, r2)) break;
        paintCol(c, r1, r2, value);
      }
      for (let c = col + 1; c < cols; c++) {
        if (snapshotHasFilledInRows(snap, c, r1, r2)) break;
        paintCol(c, r1, r2, value);
      }
    } else {
      for (let c = 0; c < cols; c++) paintCol(c, r1, r2, value);
    }
  } else {
    paintBrush(col, row, value);
  }
}

function applyToolSingle(col, row) {
  if (col < 0 || col >= cols || row < 0 || row >= rows) return;
  if (currentTool === 'pen') {
    paintStyle(col, row, currentColor);
  } else if (currentTool === 'erase') {
    paintBrush(col, row, null);
  } else if (currentTool === 'pick') {
    const c = cells[row][col];
    if (c) { setColor(c); }
  } else if (currentTool === 'fill') {
    floodFill(col, row, currentColor);
  }
}

// ── テンプレート図形 ──────────────────────────────────
// 定番のハート曲線（x=16sin³t, y=13cost-5cos2t-2cos3t-cos4t）を
// u,v それぞれ -1..1 に正規化したポリゴンとして用意し、内外判定する。
const HEART_POLYGON = (() => {
  const N = 36;
  const raw = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push([x, y]);
  }
  // 先端（t=π）の近くは接線がほぼ垂直になり、縦長の箱で描くと細い棒が
  // 飛び出て見える。先端に近すぎる点を間引いて先端まで直線でつなぎ、
  // 自然な対角線のテーパーにする。
  const tipIndex = N / 2;
  const TRIM = 5;
  const trimmed = raw.filter((_, i) => {
    const dist = Math.min(Math.abs(i - tipIndex), N - Math.abs(i - tipIndex));
    return dist === 0 || dist > TRIM;
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of raw) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // y の最小値（曲線の先端）が v=+1（キャンバス下方向）にくるよう反転する
  return trimmed.map(([x, y]) => [
    ((x - minX) / (maxX - minX)) * 2 - 1,
    -(((y - minY) / (maxY - minY)) * 2 - 1),
  ]);
})();

function isInsideShape(type, u, v) {
  if (type === 'circle') return u * u + v * v <= 1;
  if (type === 'diamond') return Math.abs(u) + Math.abs(v) <= 1;
  return true; // rect：バウンディングボックス全体
}

// 水平線 v とハートの輪郭との交点の u 座標を求める（走査線法）。
// 偶奇の並びで区間ペア [x0,x1], [x2,x3], ... が「内側」を表す。
function heartRowIntersections(v) {
  const pts = HEART_POLYGON;
  const xs = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ui, vi] = pts[i];
    const [uj, vj] = pts[j];
    if ((vi <= v && vj > v) || (vj <= v && vi > v)) {
      const t = (v - vi) / (vj - vi);
      xs.push(ui + t * (uj - ui));
    }
  }
  xs.sort((a, b) => a - b);
  return xs;
}

// u区間 [x0,x1] を列インデックスへ変換して塗る。区間がどの列中心も
// 含まないほど狭い場合は、区間の中央に最も近い列を1マスだけ塗る。
// これにより「本来塗られるべき行が丸ごと空になる」ことを避け、
// 先端が不自然に伸びたり途切れたりしない滑らかなテーパーになる。
function fillRowInterval(row, w, x0, x1) {
  const toColF = (x) => ((x + 1) / 2) * w - 0.5;
  let c0 = Math.max(0, Math.ceil(toColF(x0)));
  let c1 = Math.min(w - 1, Math.floor(toColF(x1)));
  if (c0 > c1) {
    const c = Math.max(0, Math.min(w - 1, Math.round(toColF((x0 + x1) / 2))));
    row[c] = true;
  } else {
    for (let c = c0; c <= c1; c++) row[c] = true;
  }
}

function buildShapeMask(type, minC, minR, maxC, maxR) {
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const mask = Array.from({length: h}, () => Array(w).fill(false));
  for (let r = 0; r < h; r++) {
    const v = ((r + 0.5) / h) * 2 - 1;
    const row = mask[r];
    if (type === 'heart') {
      const xs = heartRowIntersections(v);
      for (let i = 0; i + 1 < xs.length; i += 2) fillRowInterval(row, w, xs[i], xs[i + 1]);
    } else {
      for (let c = 0; c < w; c++) {
        const u = ((c + 0.5) / w) * 2 - 1;
        row[c] = isInsideShape(type, u, v);
      }
    }
  }
  return mask;
}

function toOutlineMask(mask) {
  const h = mask.length, w = mask[0].length;
  const outline = Array.from({length: h}, () => Array(w).fill(false));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!mask[r][c]) continue;
      const hasEmptyNeighbor =
        !(mask[r - 1] && mask[r - 1][c]) ||
        !(mask[r + 1] && mask[r + 1][c]) ||
        !mask[r][c - 1] ||
        !mask[r][c + 1];
      outline[r][c] = hasEmptyNeighbor;
    }
  }
  return outline;
}

// 枠線を描画サイズ(ブラシサイズ)ぶん太らせる。brushRect と同じ形で
// 各セルを膨らませる。太らせた分は図形の元のバウンディングボックスの外に
// はみ出すことがあるため、配列自体を必要な分だけパディングして拡張し、
// 端で切り詰められない（平らにならない）ようにする。呼び出し側は返り値の
// padTop/padLeft を使って元のキャンバス座標に変換する。
function thickenMask(mask, size) {
  const h = mask.length, w = mask[0].length;
  if (size <= 1) return {mask, padTop: 0, padLeft: 0};
  const half = Math.floor(size / 2);
  const newH = h + size - 1, newW = w + size - 1;
  const result = Array.from({length: newH}, () => Array(newW).fill(false));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!mask[r][c]) continue;
      for (let dr = 0; dr < size; dr++) {
        for (let dc = 0; dc < size; dc++) {
          result[r + dr][c + dc] = true;
        }
      }
    }
  }
  return {mask: result, padTop: half, padLeft: half};
}

function shapeBounds(c1, r1, c2, r2) {
  return {
    minC: Math.max(0, Math.min(c1, c2)),
    maxC: Math.min(cols - 1, Math.max(c1, c2)),
    minR: Math.max(0, Math.min(r1, r2)),
    maxR: Math.min(rows - 1, Math.max(r1, r2)),
  };
}

function applyShapeToCells(type, fill, c1, r1, c2, r2) {
  const {minC, maxC, minR, maxR} = shapeBounds(c1, r1, c2, r2);
  if (minC > maxC || minR > maxR) return;
  let mask = buildShapeMask(type, minC, minR, maxC, maxR);
  let padTop = 0, padLeft = 0;
  if (!fill) {
    const t = thickenMask(toOutlineMask(mask), brushSize);
    mask = t.mask; padTop = t.padTop; padLeft = t.padLeft;
  }
  for (let r = 0; r < mask.length; r++) {
    for (let c = 0; c < mask[0].length; c++) {
      if (!mask[r][c]) continue;
      const rr = minR + r - padTop, cc = minC + c - padLeft;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      if (!isCellEditable(rr, cc)) continue;
      cells[rr][cc] = currentColor;
    }
  }
}

function drawShapePreview(type, fill, c1, r1, c2, r2) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  const {minC, maxC, minR, maxR} = shapeBounds(c1, r1, c2, r2);
  if (minC > maxC || minR > maxR) return;
  let mask = buildShapeMask(type, minC, minR, maxC, maxR);
  let padTop = 0, padLeft = 0;
  if (!fill) {
    const t = thickenMask(toOutlineMask(mask), brushSize);
    mask = t.mask; padTop = t.padTop; padLeft = t.padLeft;
  }
  ctx.fillStyle = 'rgba(59,130,246,0.5)';
  for (let r = 0; r < mask.length; r++) {
    for (let c = 0; c < mask[0].length; c++) {
      if (!mask[r][c]) continue;
      const rr = minR + r - padTop, cc = minC + c - padLeft;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      ctx.fillRect(cc * px, rr * px, px, px);
    }
  }
  ctx.strokeStyle = 'rgba(59,130,246,0.8)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minC * px + 0.5, minR * px + 0.5, (maxC - minC + 1) * px - 1, (maxR - minR + 1) * px - 1);
  ctx.setLineDash([]);
}

function applyLineToCells(c1, r1, c2, r2) {
  for (const {col, row} of interpolateCells(c1, r1, c2, r2)) {
    paintBrush(col, row, currentColor); // 描画サイズ（ブラシサイズ）を反映する
  }
}

function drawLinePreview(c1, r1, c2, r2) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  ctx.fillStyle = 'rgba(59,130,246,0.6)';
  for (const {col, row} of interpolateCells(c1, r1, c2, r2)) {
    const b = brushRect(col, row);
    const x1 = Math.max(0, b.c1) * px;
    const y1 = Math.max(0, b.r1) * px;
    const x2 = (Math.min(cols - 1, b.c2) + 1) * px;
    const y2 = (Math.min(rows - 1, b.r2) + 1) * px;
    if (x2 > x1 && y2 > y1) ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }
}

// 画像からシルエット（bool[][]）を作る。左上のピクセルを背景色とみなし、
// 背景色に近い（または透明な）部分を「外側」とする。色は使わず、選択中の
// 色で塗るための形だけを取り出す。
function buildImageSilhouetteMask(img, w, h) {
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const bgR = data[0], bgG = data[1], bgB = data[2], bgA = data[3];
  const THRESH = 40;
  const mask = Array.from({length: h}, () => Array(w).fill(false));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4;
      if (data[i + 3] < 128) continue; // 透明はすべて外側
      if (bgA >= 128) {
        const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
        if (Math.sqrt(dr * dr + dg * dg + db * db) < THRESH) continue; // 背景色に近い
      }
      mask[r][c] = true;
    }
  }
  return mask;
}

function applyHeartImageToCells(fill, c1, r1, c2, r2) {
  const {minC, maxC, minR, maxR} = shapeBounds(c1, r1, c2, r2);
  if (minC > maxC || minR > maxR) return;
  const w = maxC - minC + 1, h = maxR - minR + 1;
  let mask = buildImageSilhouetteMask(heartImage, w, h);
  let padTop = 0, padLeft = 0;
  if (!fill) {
    const t = thickenMask(toOutlineMask(mask), brushSize);
    mask = t.mask; padTop = t.padTop; padLeft = t.padLeft;
  }
  for (let r = 0; r < mask.length; r++) {
    for (let c = 0; c < mask[0].length; c++) {
      if (!mask[r][c]) continue;
      const rr = minR + r - padTop, cc = minC + c - padLeft;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      if (!isCellEditable(rr, cc)) continue;
      cells[rr][cc] = currentColor;
    }
  }
}

function drawHeartImagePreview(fill, c1, r1, c2, r2) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  const {minC, maxC, minR, maxR} = shapeBounds(c1, r1, c2, r2);
  if (minC > maxC || minR > maxR) return;
  const w = maxC - minC + 1, h = maxR - minR + 1;
  let mask = buildImageSilhouetteMask(heartImage, w, h);
  let padTop = 0, padLeft = 0;
  if (!fill) {
    const t = thickenMask(toOutlineMask(mask), brushSize);
    mask = t.mask; padTop = t.padTop; padLeft = t.padLeft;
  }
  ctx.fillStyle = 'rgba(59,130,246,0.5)';
  for (let r = 0; r < mask.length; r++) {
    for (let c = 0; c < mask[0].length; c++) {
      if (!mask[r][c]) continue;
      const rr = minR + r - padTop, cc = minC + c - padLeft;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      ctx.fillRect(cc * px, rr * px, px, px);
    }
  }
  ctx.strokeStyle = 'rgba(59,130,246,0.8)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minC * px + 0.5, minR * px + 0.5, w * px - 1, h * px - 1);
  ctx.setLineDash([]);
}

function floodFill(startCol, startRow, newColor) {
  if (!isCellEditable(startRow, startCol)) return;
  const target = cells[startRow][startCol];
  if (target === newColor) return;
  const stack = [[startCol, startRow]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    if (!isCellEditable(r, c)) continue;
    if (cells[r][c] !== target) continue;
    cells[r][c] = newColor;
    stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
}

cOv.addEventListener('mousedown', e => {
  if (!started || e.button !== 0) return;
  const {col, row} = getCell(e);
  if (selectionMode === 'range') {
    rangeStart = {col, row};
    rangePath = [{col, row}];
    return;
  }
  if (selectionMode === 'color') {
    applyColorSelection(col, row);
    selectionMode = 'none';
    updateSelectionButtons();
    return;
  }
  if (selectionMode === 'flood') {
    applyFloodSelection(col, row);
    selectionMode = 'none';
    updateSelectionButtons();
    return;
  }
  if (currentTool === 'shape') {
    shapeStart = {col, row};
    return;
  }
  pushHistory();
  isPainting = true;
  lastCell = {col, row};
  applyToolSingle(col, row);
  drawCells();
});
cOv.addEventListener('mousemove', e => {
  if (!started) return;
  const {col, row} = getCell(e);
  if (selectionMode === 'range' && rangeStart) {
    if (rangeSelectMode === 'free') {
      const last = rangePath[rangePath.length - 1];
      if (last.col !== col || last.row !== row) {
        for (const p of interpolateCells(last.col, last.row, col, row)) {
          const lp = rangePath[rangePath.length - 1];
          if (!lp || lp.col !== p.col || lp.row !== p.row) rangePath.push(p);
        }
      }
      drawFreeRangePreview(rangePath, col, row);
    } else {
      drawRangePreview(rangeStart.col, rangeStart.row, col, row);
    }
    return;
  }
  if (currentTool === 'shape' && shapeStart) {
    if (shapeType === 'line') {
      drawLinePreview(shapeStart.col, shapeStart.row, col, row);
    } else if (shapeType === 'heart' && heartImage) {
      drawHeartImagePreview(shapeFill, shapeStart.col, shapeStart.row, col, row);
    } else {
      drawShapePreview(shapeType, shapeFill, shapeStart.col, shapeStart.row, col, row);
    }
    statPos.textContent = `${col+1}, ${row+1}`;
    return;
  }
  drawOverlayCell(col, row);
  statPos.textContent = `${col+1}, ${row+1}`;
  const c = cells[row] && cells[row][col];
  statColor.textContent = c || '—';
  if (!isPainting) return;
  if (lastCell && lastCell.col === col && lastCell.row === row) return;
  applyToolLine(lastCell.col, lastCell.row, col, row);
  lastCell = {col, row};
});
document.addEventListener('mouseup', e => {
  if (selectionMode === 'range' && rangeStart) {
    const {col, row} = getCell(e);
    if (rangeSelectMode === 'free') {
      applyFreeRangeSelection(rangePath, col, row);
    } else {
      applyRangeSelection(rangeStart.col, rangeStart.row, col, row);
    }
    rangeStart = null;
    rangePath = [];
    selectionMode = 'none';
    updateSelectionButtons();
    return;
  }
  if (currentTool === 'shape' && shapeStart) {
    const {col, row} = getCell(e);
    pushHistory();
    if (shapeType === 'line') {
      applyLineToCells(shapeStart.col, shapeStart.row, col, row);
    } else if (shapeType === 'heart' && heartImage) {
      applyHeartImageToCells(shapeFill, shapeStart.col, shapeStart.row, col, row);
    } else {
      applyShapeToCells(shapeType, shapeFill, shapeStart.col, shapeStart.row, col, row);
    }
    shapeStart = null;
    drawCells();
    const ctx = cOv.getContext('2d');
    ctx.clearRect(0, 0, cOv.width, cOv.height);
    drawSelectionOverlay(ctx);
    return;
  }
  isPainting = false; lastCell = null;
});
cOv.addEventListener('mouseleave',() => {
  cOv.getContext('2d').clearRect(0,0,cOv.width,cOv.height);
  statPos.textContent = '—';
});

// タッチ対応（1本指：描画、2本指：ピンチズーム＋パン）
let pinchStartDist = 0;
let pinchStartZoom = 1;
let isPinching = false;
let pinchStartScrollX = 0, pinchStartScrollY = 0;
let pinchStartCX = 0, pinchStartCY = 0;

function getTouchDist(e) {
  const t0 = e.touches[0], t1 = e.touches[1];
  const dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(e) {
  const t0 = e.touches[0], t1 = e.touches[1];
  return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
}

cOv.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length >= 2) {
    isPainting = false;
    lastCell = null;
    isPinching = true;
    pinchStartDist = getTouchDist(e);
    pinchStartZoom = zoom;
    pinchStartScrollX = canvasArea.scrollLeft;
    pinchStartScrollY = canvasArea.scrollTop;
    const ctr = getTouchCenter(e);
    pinchStartCX = ctr.x;
    pinchStartCY = ctr.y;
    return;
  }
  if (!started) return;
  isPinching = false;
  pushHistory();
  isPainting = true;
  const t = e.touches[0];
  const {col, row} = getCell(t);
  lastCell = {col, row};
  applyToolSingle(col, row);
  drawCells();
}, {passive: false});

cOv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (isPinching && e.touches.length >= 2) {
    const dist = getTouchDist(e);
    const scale = dist / pinchStartDist;
    const newZoom = Math.max(0.5, Math.min(8, pinchStartZoom * scale));
    const zoomRatio = newZoom / pinchStartZoom;

    const ctr = getTouchCenter(e);
    const areaRect = canvasArea.getBoundingClientRect();
    const pointX = pinchStartScrollX + (pinchStartCX - areaRect.left);
    const pointY = pinchStartScrollY + (pinchStartCY - areaRect.top);

    setZoom(newZoom);

    canvasArea.scrollLeft = pointX * zoomRatio - (ctr.x - areaRect.left);
    canvasArea.scrollTop  = pointY * zoomRatio - (ctr.y - areaRect.top);
    return;
  }
  if (!isPainting || !started) return;
  const t = e.touches[0];
  const {col, row} = getCell(t);
  if (lastCell && lastCell.col === col && lastCell.row === row) return;
  applyToolLine(lastCell.col, lastCell.row, col, row);
  lastCell = {col, row};
}, {passive: false});

cOv.addEventListener('touchend', e => {
  if (e.touches.length < 2) isPinching = false;
  if (e.touches.length === 0) { isPainting = false; lastCell = null; }
});

// ── ヒストリー ────────────────────────────────────────
function pushHistory() {
  history.push(cells.map(r => [...r]));
  if (history.length > 50) history.shift();
  document.getElementById('btn-undo').disabled = false;
}
function undo() {
  if (!history.length) return;
  cells = history.pop();
  drawCells();
  if (!history.length) document.getElementById('btn-undo').disabled = true;
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
});
document.getElementById('btn-undo').addEventListener('click', undo);

// ── 色履歴の位置更新 ──────────────────────────────────
const colorHistoryEl = document.getElementById('color-history');
function updateColorHistoryPos(panelEdge) {
  const rect = canvasArea.getBoundingClientRect();
  const left = panelEdge != null ? panelEdge : rect.left;
  colorHistoryEl.style.left = (left + 10) + 'px';
  colorHistoryEl.style.bottom = (window.innerHeight - rect.bottom + 30) + 'px';
}
window.addEventListener('resize', updateColorHistoryPos);

// ── カラーパレット ────────────────────────────────────
function buildPalette() {
  const grid = document.getElementById('palette');
  grid.innerHTML = '';
  PALETTE_COLORS.forEach(hex => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = hex;
    s.title = hex;
    s.addEventListener('click', () => setColor(hex));
    grid.appendChild(s);
  });
}
const COLOR_HISTORY_SIZE = 5;
const colorHistoryList = Array(COLOR_HISTORY_SIZE).fill(null);
const colorDots = Array.from({length: COLOR_HISTORY_SIZE}, (_, i) => document.getElementById('dot-' + i));

function updateColorDots() {
  colorDots.forEach((dot, i) => {
    const c = colorHistoryList[i];
    dot.style.background = c || 'transparent';
    dot.style.visibility = c ? 'visible' : 'hidden';
  });
}

function pushColorHistory(hex) {
  if (colorHistoryList[0] === hex) return;
  for (let i = COLOR_HISTORY_SIZE - 1; i > 0; i--) {
    colorHistoryList[i] = colorHistoryList[i - 1];
  }
  colorHistoryList[0] = hex;
  updateColorDots();
}

colorDots.forEach((dot, i) => {
  dot.addEventListener('click', () => { if (colorHistoryList[i]) setColor(colorHistoryList[i]); });
});

function setColor(hex) {
  currentColor = hex;
  pushColorHistory(hex);
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('selected', s.style.background === hexToRgb(hex) || s.style.background === hex);
  });
  if (currentTool === 'pick' || currentTool === 'erase') {
    setTool('pen');
  }
}
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ── カスタムカラーパレット ──────────────────────────
const CUSTOM_PALETTE_SIZE = 48;
const customPaletteGrid = document.getElementById('custom-palette');
const customColorPicker = document.getElementById('custom-color-picker');
const btnDeleteMode = document.getElementById('btn-delete-mode');
const btnDeleteAll = document.getElementById('btn-delete-all');
const confirmModal = document.getElementById('confirm-delete-all');
let customColors = Array(CUSTOM_PALETTE_SIZE).fill(null);
let deleteMode = false;
let pendingSlotIndex = -1;

function buildCustomPalette() {
  customPaletteGrid.innerHTML = '';
  customColors.forEach((color, i) => {
    if (color) {
      const s = document.createElement('div');
      s.className = 'swatch' + (deleteMode ? ' delete-target' : '');
      s.style.background = color;
      s.title = color;
      s.addEventListener('click', () => {
        if (deleteMode) {
          customColors[i] = null;
          buildCustomPalette();
        } else {
          setColor(color);
        }
      });
      customPaletteGrid.appendChild(s);
    } else {
      const s = document.createElement('div');
      s.className = 'swatch-empty';
      s.textContent = '＋';
      if (deleteMode) {
        s.style.opacity = '0.3';
        s.style.pointerEvents = 'none';
      }
      s.addEventListener('click', () => {
        pendingSlotIndex = i;
        document.getElementById('color-pick-modal').style.display = 'flex';
      });
      customPaletteGrid.appendChild(s);
    }
  });
}

document.getElementById('btn-color-ok').addEventListener('click', () => {
  if (pendingSlotIndex >= 0) {
    customColors[pendingSlotIndex] = customColorPicker.value;
    setColor(customColorPicker.value);
    buildCustomPalette();
    pendingSlotIndex = -1;
  }
  document.getElementById('color-pick-modal').style.display = 'none';
});

document.getElementById('btn-color-cancel').addEventListener('click', () => {
  pendingSlotIndex = -1;
  document.getElementById('color-pick-modal').style.display = 'none';
});

btnDeleteMode.addEventListener('click', () => {
  deleteMode = !deleteMode;
  btnDeleteMode.classList.toggle('active', deleteMode);
  buildCustomPalette();
});

btnDeleteAll.addEventListener('click', () => {
  confirmModal.style.display = 'flex';
});

document.getElementById('btn-confirm-ok').addEventListener('click', () => {
  customColors.fill(null);
  buildCustomPalette();
  confirmModal.style.display = 'none';
});

document.getElementById('btn-confirm-no').addEventListener('click', () => {
  confirmModal.style.display = 'none';
});

// ── 選択機能 ──────────────────────────────────────────
const btnSelRange = document.getElementById('btn-sel-range');
const btnSelColor = document.getElementById('btn-sel-color');
const btnSelFlood = document.getElementById('btn-sel-flood');
const btnSelClear = document.getElementById('btn-sel-clear');
const rangeModeRow = document.getElementById('range-mode-row');
const btnRangeRect = document.getElementById('btn-range-rect');
const btnRangeFree = document.getElementById('btn-range-free');
const rangeAutoCloseLabel = document.getElementById('range-autoclose-label');
const rangeAutoCloseCheckbox = document.getElementById('range-autoclose');

function updateSelectionButtons() {
  btnSelRange.classList.toggle('active', selectionMode === 'range');
  btnSelColor.classList.toggle('active', selectionMode === 'color');
  btnSelFlood.classList.toggle('active', selectionMode === 'flood');
  btnSelClear.style.display = selectionMask ? '' : 'none';
  rangeModeRow.style.display = selectionMode === 'range' ? '' : 'none';
  rangeAutoCloseLabel.style.display = (selectionMode === 'range' && rangeSelectMode === 'free') ? 'flex' : 'none';
  btnRangeRect.classList.toggle('active', rangeSelectMode === 'rect');
  btnRangeFree.classList.toggle('active', rangeSelectMode === 'free');
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  drawSelectionOverlay(ctx);
}

btnRangeRect.addEventListener('click', () => {
  rangeSelectMode = 'rect';
  updateSelectionButtons();
});
btnRangeFree.addEventListener('click', () => {
  rangeSelectMode = 'free';
  updateSelectionButtons();
});

function applyRangeSelection(c1, r1, c2, r2) {
  const minC = Math.max(0, Math.min(c1, c2));
  const maxC = Math.min(cols - 1, Math.max(c1, c2));
  const minR = Math.max(0, Math.min(r1, r2));
  const maxR = Math.min(rows - 1, Math.max(r1, r2));
  selectionMask = Array.from({length: rows}, (_, r) =>
    Array.from({length: cols}, (_, c) => r >= minR && r <= maxR && c >= minC && c <= maxC)
  );
  updateSelectionButtons();
}

function applyColorSelection(col, row) {
  if (col < 0 || col >= cols || row < 0 || row >= rows) return;
  const targetColor = cells[row][col];
  selectionMask = Array.from({length: rows}, (_, r) =>
    Array.from({length: cols}, (_, c) => cells[r][c] === targetColor)
  );
  updateSelectionButtons();
}

function applyFloodSelection(col, row) {
  if (col < 0 || col >= cols || row < 0 || row >= rows) return;
  const targetColor = cells[row][col];
  selectionMask = Array.from({length: rows}, () => Array(cols).fill(false));
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    if (selectionMask[r][c]) continue;
    if (cells[r][c] !== targetColor) continue;
    selectionMask[r][c] = true;
    stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
  updateSelectionButtons();
}

function applyFreeRangeSelection(path, endCol, endRow) {
  if (!path.length) return;
  const start = path[0];
  const releasedAtStart = endCol === start.col && endRow === start.row;
  const traced = Array.from({length: rows}, () => Array(cols).fill(false));
  const markCell = (c, r) => { if (c >= 0 && c < cols && r >= 0 && r < rows) traced[r][c] = true; };
  for (const p of path) markCell(p.col, p.row);
  if (!releasedAtStart && !rangeAutoCloseCheckbox.checked) {
    // 始点に戻らず終了したので、なぞった軌跡のみを選択する
    selectionMask = traced;
    updateSelectionButtons();
    return;
  }
  if (!releasedAtStart) {
    for (const p of interpolateCells(endCol, endRow, start.col, start.row)) markCell(p.col, p.row);
  }
  // 外周からたどれるセルを「外部」とし、なぞった線とそれ以外(内部)を選択対象にする
  const outside = Array.from({length: rows}, () => Array(cols).fill(false));
  const stack = [];
  for (let c = 0; c < cols; c++) { stack.push([c, 0]); stack.push([c, rows - 1]); }
  for (let r = 0; r < rows; r++) { stack.push([0, r]); stack.push([cols - 1, r]); }
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    if (outside[r][c] || traced[r][c]) continue;
    outside[r][c] = true;
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  selectionMask = Array.from({length: rows}, (_, r) =>
    Array.from({length: cols}, (_, c) => traced[r][c] || !outside[r][c])
  );
  updateSelectionButtons();
}

function drawFreeRangePreview(path, curCol, curRow) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, cOv.width, cOv.height);
  const cx = c => c * px + px / 2, cy = r => r * px + px / 2;
  ctx.strokeStyle = 'rgba(59,130,246,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  path.forEach((p, i) => {
    if (i === 0) ctx.moveTo(cx(p.col), cy(p.row));
    else ctx.lineTo(cx(p.col), cy(p.row));
  });
  ctx.stroke();
  const start = path[0];
  if (rangeAutoCloseCheckbox.checked) {
    ctx.strokeStyle = 'rgba(59,130,246,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx(curCol), cy(curRow));
    ctx.lineTo(cx(start.col), cy(start.row));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = 'rgba(59,130,246,0.9)';
  ctx.beginPath();
  ctx.arc(cx(start.col), cy(start.row), Math.max(3, px * 0.25), 0, Math.PI * 2);
  ctx.fill();
}

function drawRangePreview(c1, r1, c2, r2) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
  const minC = Math.max(0, Math.min(c1, c2));
  const maxC = Math.min(cols - 1, Math.max(c1, c2));
  const minR = Math.max(0, Math.min(r1, r2));
  const maxR = Math.min(rows - 1, Math.max(r1, r2));
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, cOv.width, cOv.height);
  ctx.clearRect(minC * px, minR * px, (maxC - minC + 1) * px, (maxR - minR + 1) * px);
  ctx.strokeStyle = 'rgba(59,130,246,0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minC * px, minR * px, (maxC - minC + 1) * px, (maxR - minR + 1) * px);
  ctx.setLineDash([]);
}

function clearSelection() {
  selectionMask = null;
  selectionMode = 'none';
  rangeStart = null;
  rangePath = [];
  updateSelectionButtons();
}

btnSelRange.addEventListener('click', () => {
  if (selectionMode === 'range') { clearSelection(); return; }
  selectionMode = 'range';
  selectionMask = null;
  updateSelectionButtons();
});

btnSelColor.addEventListener('click', () => {
  if (selectionMode === 'color') { clearSelection(); return; }
  selectionMode = 'color';
  selectionMask = null;
  updateSelectionButtons();
});

btnSelFlood.addEventListener('click', () => {
  if (selectionMode === 'flood') { clearSelection(); return; }
  selectionMode = 'flood';
  selectionMask = null;
  updateSelectionButtons();
});

btnSelClear.addEventListener('click', clearSelection);

// ── 描画スタイル ──────────────────────────────────────
const drawStyleSection = document.getElementById('draw-style-section');
const detectLineLabel = document.getElementById('detect-line-label');
const detectLineCheck = document.getElementById('detect-line');

function updateDetectLineVisibility() {
  detectLineLabel.style.display = (drawStyle === 'col' || drawStyle === 'row') ? 'flex' : 'none';
}

document.querySelectorAll('.style-btn').forEach(b => {
  b.addEventListener('click', () => {
    drawStyle = b.dataset.style;
    document.querySelectorAll('.style-btn').forEach(x => x.classList.toggle('active', x.dataset.style === drawStyle));
    updateDetectLineVisibility();
  });
});

detectLineCheck.addEventListener('change', () => {
  detectLine = detectLineCheck.checked;
});

function updateDrawStyleVisibility() {
  drawStyleSection.style.display = currentTool === 'pen' ? '' : 'none';
}

// ── 描画サイズ ────────────────────────────────────────
const brushSlider = document.getElementById('brush-slider');
const brushVal = document.getElementById('brush-val');
brushSlider.addEventListener('input', () => {
  brushSize = parseInt(brushSlider.value);
  brushVal.textContent = brushSize;
});

// ── ツール選択 ────────────────────────────────────────
function setTool(t) {
  currentTool = t;
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === t);
  });
  updateDrawStyleVisibility();
  updateShapeMenuUI();
}
document.querySelectorAll('.tool-btn').forEach(b => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
});

// ── テンプレート図形メニュー ──────────────────────────
const shapeMenu = document.getElementById('shape-menu');
const shapeMenuBtn = document.getElementById('btn-shape-menu');
const shapeMenuDropdown = document.getElementById('shape-menu-dropdown');

function updateShapeMenuUI() {
  shapeMenuBtn.classList.toggle('active', currentTool === 'shape');
  document.querySelectorAll('.shape-opt[data-shape]').forEach(b => {
    const matches = currentTool === 'shape' && b.dataset.shape === shapeType && (b.dataset.fill === '1') === shapeFill;
    b.classList.toggle('active', matches);
  });
}

function closeShapeMenu() {
  shapeMenuDropdown.style.display = 'none';
}

shapeMenuBtn.addEventListener('click', e => {
  e.stopPropagation();
  shapeMenuDropdown.style.display = shapeMenuDropdown.style.display === 'none' ? 'flex' : 'none';
});

document.querySelectorAll('.shape-opt[data-shape]').forEach(b => {
  b.addEventListener('click', () => {
    shapeType = b.dataset.shape;
    shapeFill = b.dataset.fill === '1';
    currentTool = 'shape';
    document.querySelectorAll('.tool-btn').forEach(x => x.classList.remove('active'));
    updateDrawStyleVisibility();
    updateShapeMenuUI();
    closeShapeMenu();
  });
});

document.addEventListener('click', e => {
  if (!shapeMenu.contains(e.target)) closeShapeMenu();
});

// ── グリッドサイズ ────────────────────────────────────
const bothSlider = document.getElementById('both-slider');
const colsSlider = document.getElementById('cols-slider');
const rowsSlider = document.getElementById('rows-slider');
const bothVal = document.getElementById('both-val');
const colsVal = document.getElementById('cols-val');
const rowsVal = document.getElementById('rows-val');

function clampSize(v) { return Math.max(4, Math.min(256, Math.round(v) || 4)); }

function setSizeAll(v) {
  bothSlider.value = v; bothVal.value = v;
  colsSlider.value = v; colsVal.value = v;
  rowsSlider.value = v; rowsVal.value = v;
}

function syncBothDisplay() {
  const c = parseInt(colsSlider.value), r = parseInt(rowsSlider.value);
  if (c === r) {
    bothSlider.value = c;
    bothVal.value = c;
  } else {
    bothSlider.value = Math.max(c, r);
    bothVal.value = '';
    bothVal.placeholder = '-';
  }
}

function updatePresetHighlight() {
  const c = parseInt(colsSlider.value), r = parseInt(rowsSlider.value);
  document.querySelectorAll('.preset-btn').forEach(b => {
    const s = parseInt(b.dataset.size);
    b.classList.toggle('active', s === c && s === r);
  });
}

document.querySelectorAll('.preset-btn').forEach(b => {
  b.addEventListener('click', () => {
    const v = parseInt(b.dataset.size);
    setSizeAll(v);
    pushHistory();
    initCells(v, v, true);
    resizeCanvases();
    updatePresetHighlight();
  });
});

bothSlider.addEventListener('input', () => {
  const v = bothSlider.value;
  bothVal.value = v;
  colsSlider.value = v; colsVal.value = v;
  rowsSlider.value = v; rowsVal.value = v;
});
bothVal.addEventListener('change', () => {
  const v = clampSize(bothVal.value);
  bothVal.value = v; bothSlider.value = v;
  colsSlider.value = v; colsVal.value = v;
  rowsSlider.value = v; rowsVal.value = v;
});

colsSlider.addEventListener('input', () => { colsVal.value = colsSlider.value; syncBothDisplay(); });
colsVal.addEventListener('change', () => {
  const v = clampSize(colsVal.value);
  colsVal.value = v; colsSlider.value = v; syncBothDisplay();
});

rowsSlider.addEventListener('input', () => { rowsVal.value = rowsSlider.value; syncBothDisplay(); });
rowsVal.addEventListener('change', () => {
  const v = clampSize(rowsVal.value);
  rowsVal.value = v; rowsSlider.value = v; syncBothDisplay();
});

document.getElementById('btn-resize').addEventListener('click', () => {
  pushHistory();
  initCells(parseInt(colsSlider.value), parseInt(rowsSlider.value), true);
  resizeCanvases();
  updatePresetHighlight();
});

// ── グリッド表示切替 ──────────────────────────────────
document.getElementById('show-grid').addEventListener('change', e => {
  showGrid = e.target.checked;
  drawGrid();
});

// ── ズーム ────────────────────────────────────────────
function setZoom(z) {
  zoom = Math.max(0.5, Math.min(8, z));
  const {w, h} = canvasSize();
  wrap.style.width  = (w * zoom) + 'px';
  wrap.style.height = (h * zoom) + 'px';
  [cBg, cMain, cOv].forEach(c => {
    c.style.width  = (w * zoom) + 'px';
    c.style.height = (h * zoom) + 'px';
  });
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
  updateScrollPadding();
}
document.getElementById('btn-zoom-in').addEventListener('click',  () => setZoom(zoom * 1.5));
document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoom / 1.5));

// マウスホイールズーム
document.getElementById('canvas-area').addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const delta = -e.deltaY * (e.deltaMode === 1 ? 20 : 1);
  const factor = 1 + Math.min(Math.abs(delta) * 0.002, 0.15);
  setZoom(delta > 0 ? zoom * factor : zoom / factor);
}, {passive: false});

// ── 右クリックドラッグでパン ──────────────────────────
let isPanning = false;
let panStartX = 0, panStartY = 0;
let scrollStartX = 0, scrollStartY = 0;

canvasArea.addEventListener('mousedown', e => {
  if (e.button !== 2) return;
  e.preventDefault();
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  scrollStartX = canvasArea.scrollLeft;
  scrollStartY = canvasArea.scrollTop;
  canvasArea.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', e => {
  if (!isPanning) return;
  canvasArea.scrollLeft = scrollStartX - (e.clientX - panStartX);
  canvasArea.scrollTop  = scrollStartY - (e.clientY - panStartY);
});

document.addEventListener('mouseup', e => {
  if (e.button !== 2 || !isPanning) return;
  isPanning = false;
  canvasArea.style.cursor = '';
});

canvasArea.addEventListener('contextmenu', e => e.preventDefault());

// ── クリア ────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!started) return;
  pushHistory();
  cells = cells.map(r => r.map(() => null));
  drawCells();
});

// ── ダウンロード ──────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', () => {
  const out = document.createElement('canvas');
  const px = Math.max(1, Math.round(512 / Math.max(cols, rows)));
  out.width  = cols * px;
  out.height = rows * px;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c]) {
        ctx.fillStyle = cells[r][c];
        ctx.fillRect(c * px, r * px, px, px);
      }
    }
  }
  const a = document.createElement('a');
  a.download = 'pixel-art.png';
  a.href = out.toDataURL('image/png');
  a.click();
});

document.getElementById('btn-download-transparent').addEventListener('click', () => {
  const out = document.createElement('canvas');
  const px = Math.max(1, Math.round(512 / Math.max(cols, rows)));
  out.width  = cols * px;
  out.height = rows * px;
  const ctx = out.getContext('2d');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c]) {
        ctx.fillStyle = cells[r][c];
        ctx.fillRect(c * px, r * px, px, px);
      }
    }
  }
  const a = document.createElement('a');
  a.download = 'pixel-art-transparent.png';
  a.href = out.toDataURL('image/png');
  a.click();
});

// ── 画像変換 ──────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const convertResizeCanvasCheckbox = document.getElementById('convert-resize-canvas');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.background = '#f0f0ee'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.background = ''; });
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.background = '';
  loadImageFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => loadImageFile(e.target.files[0]));

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      document.getElementById('btn-convert').disabled = false;
      dropZone.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="display:block;margin:0 auto 4px"><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2M12 4v12m-4-4l4-4 4 4"/></svg>${file.name}`;
      if (!started) startEditor();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.querySelectorAll('.method-btn').forEach(b => {
  b.addEventListener('click', () => {
    convertMethod = b.dataset.method;
    document.querySelectorAll('.method-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

document.querySelectorAll('.cc-btn').forEach(b => {
  b.addEventListener('click', () => {
    convertColorCount = parseInt(b.dataset.colors);
    document.querySelectorAll('.cc-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

document.getElementById('btn-convert').addEventListener('click', () => {
  if (!uploadedImage) return;
  pushHistory();
  convertImage(uploadedImage);
});

function syncSlidersToGrid() {
  colsSlider.value = cols; colsVal.value = cols;
  rowsSlider.value = rows; rowsVal.value = rows;
  syncBothDisplay();
  updatePresetHighlight();
}

function convertImage(img) {
  if (!started) startEditor();
  // destC0,destR0,destW,destH: 画像を実際に描画する先の範囲（キャンバス座標）。
  // キャンバスサイズを変える場合は全面、変えない場合はアスペクト比を保った
  // まま中央に配置する範囲になる。
  let destC0 = 0, destR0 = 0, destW = cols, destH = rows;
  if (convertResizeCanvasCheckbox.checked) {
    const maxDim = Math.max(cols, rows);
    const aspect = img.width / img.height;
    let newCols, newRows;
    if (aspect >= 1) {
      newCols = maxDim;
      newRows = Math.max(1, Math.round(maxDim / aspect));
    } else {
      newRows = maxDim;
      newCols = Math.max(1, Math.round(maxDim * aspect));
    }
    newCols = Math.min(256, newCols);
    newRows = Math.min(256, newRows);
    initCells(newCols, newRows, false);
    resizeCanvases();
    syncSlidersToGrid();
    destW = cols; destH = rows;
  } else {
    initCells(cols, rows, false); // キャンバスサイズはそのまま、一旦全セルを透明にクリア
    const scale = Math.min(cols / img.width, rows / img.height);
    destW = Math.max(1, Math.round(img.width * scale));
    destH = Math.max(1, Math.round(img.height * scale));
    destC0 = Math.floor((cols - destW) / 2);
    destR0 = Math.floor((rows - destH) / 2);
  }
  const off = document.createElement('canvas');
  off.width = destW; off.height = destH;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, 0, 0, destW, destH);
  const data = ctx.getImageData(0, 0, destW, destH).data;
  for (let r = 0; r < destH; r++) {
    for (let c = 0; c < destW; c++) {
      const i = (r * destW + c) * 4;
      if (data[i+3] < 128) { cells[destR0 + r][destC0 + c] = null; continue; }
      cells[destR0 + r][destC0 + c] = `#${[data[i],data[i+1],data[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
    }
  }
  if (convertMethod === 'avg') {
    // 平均色はすでに縮小時に自動でブレンドされている
  } else {
    // 最頻色：より高解像度から集計
    const hi = document.createElement('canvas');
    const sx = Math.min(1024, img.width);
    const sy = Math.round(img.height * (sx / img.width));
    hi.width = sx; hi.height = sy;
    const hctx = hi.getContext('2d');
    hctx.drawImage(img, 0, 0, sx, sy);
    const hdata = hctx.getImageData(0, 0, sx, sy).data;
    const cw = sx / destW, ch = sy / destH;
    for (let r = 0; r < destH; r++) {
      for (let c = 0; c < destW; c++) {
        const x = Math.round(c * cw), y = Math.round(r * ch);
        const w = Math.round(cw), h = Math.round(ch);
        const map = {};
        let best = 0, bestColor = null;
        let alphaSum = 0, alphaCount = 0;
        for (let py = y; py < y+h && py < sy; py++) {
          for (let px = x; px < x+w && px < sx; px++) {
            const i = (py * sx + px) * 4;
            alphaSum += hdata[i+3]; alphaCount++;
            if (hdata[i+3] < 128) continue;
            const key = ((hdata[i]>>4)<<8)|((hdata[i+1]>>4)<<4)|(hdata[i+2]>>4);
            map[key] = (map[key]||0) + 1;
            if (map[key] > best) { best = map[key]; bestColor = [hdata[i],hdata[i+1],hdata[i+2]]; }
          }
        }
        if (alphaCount > 0 && alphaSum / alphaCount < 128) { cells[destR0 + r][destC0 + c] = null; }
        else if (bestColor) cells[destR0 + r][destC0 + c] = `#${bestColor.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
      }
    }
  }
  quantizeColors(convertColorCount);
  drawCells();
}

function quantizeColors(maxColors) {
  const colorMap = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c]) colorMap[cells[r][c]] = true;
    }
  }
  const uniqueColors = Object.keys(colorMap).map(hex => {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r, g, b, hex];
  });
  if (uniqueColors.length <= maxColors) return;

  const palette = medianCut(uniqueColors.map(c => [c[0],c[1],c[2]]), maxColors);
  const lookup = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hex = cells[r][c];
      if (!hex) continue;
      if (lookup[hex]) { cells[r][c] = lookup[hex]; continue; }
      const cr = parseInt(hex.slice(1,3),16);
      const cg = parseInt(hex.slice(3,5),16);
      const cb = parseInt(hex.slice(5,7),16);
      let bestDist = Infinity, bestHex = hex;
      for (const p of palette) {
        const dr = cr-p[0], dg = cg-p[1], db = cb-p[2];
        const d = dr*dr + dg*dg + db*db;
        if (d < bestDist) { bestDist = d; bestHex = `#${p.map(v=>v.toString(16).padStart(2,'0')).join('')}`; }
      }
      lookup[hex] = bestHex;
      cells[r][c] = bestHex;
    }
  }
}

function medianCut(colors, maxColors) {
  if (colors.length === 0) return [];
  let buckets = [colors];
  while (buckets.length < maxColors) {
    let longest = -1, longestIdx = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length <= 1) continue;
      const ranges = [0,1,2].map(ch => {
        let mn = 255, mx = 0;
        for (const c of buckets[i]) { mn = Math.min(mn, c[ch]); mx = Math.max(mx, c[ch]); }
        return mx - mn;
      });
      const maxRange = Math.max(...ranges);
      if (maxRange > longest) { longest = maxRange; longestIdx = i; }
    }
    if (longest <= 0) break;
    const bucket = buckets[longestIdx];
    const ranges = [0,1,2].map(ch => {
      let mn = 255, mx = 0;
      for (const c of bucket) { mn = Math.min(mn, c[ch]); mx = Math.max(mx, c[ch]); }
      return mx - mn;
    });
    const splitCh = ranges.indexOf(Math.max(...ranges));
    bucket.sort((a, b) => a[splitCh] - b[splitCh]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(longestIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }
  return buckets.map(b => {
    const avg = [0,1,2].map(ch => Math.round(b.reduce((s,c) => s+c[ch], 0) / b.length));
    return avg;
  });
}

// ── スタート ──────────────────────────────────────────
function centerCanvas() {
  const padEl = document.querySelector('.canvas-scroll-pad');
  const {w, h} = canvasSize();
  const cw = w * zoom, ch = h * zoom;
  const padX = parseFloat(padEl.style.paddingLeft) || 0;
  const padY = parseFloat(padEl.style.paddingTop) || 0;
  canvasArea.scrollLeft = padX + cw / 2 - canvasArea.clientWidth / 2;
  canvasArea.scrollTop  = padY + ch / 2 - canvasArea.clientHeight / 2;
}

function startEditor() {
  started = true;
  overlay.style.display = 'none';
  initCells(cols, rows, false);
  resizeCanvases();
  centerCanvas();
}

document.getElementById('btn-new').addEventListener('click', () => {
  startEditor();
});
document.getElementById('btn-load-img').addEventListener('click', () => {
  fileInput.click();
});

// ── パネルリサイズ・開閉 ──────────────────────────────
const panel = document.getElementById('panel');
const panelResize = document.getElementById('panel-resize');
const panelToggle = document.getElementById('panel-toggle');
const panelBackdrop = document.getElementById('panel-backdrop');
const MIN_PANEL_W = 260;
let panelCollapsed = false;
let savedPanelWidth = panel.offsetWidth || 260;

function isMobile() { return window.innerWidth <= 640; }

function syncTogglePosition() {
  panelToggle.textContent = panelCollapsed ? '▶' : '◀';
  if (isMobile()) {
    panelToggle.style.left = '0px';
    panelBackdrop.classList.toggle('visible', !panelCollapsed);
    updateColorHistoryPos();
  } else {
    // パネルはトランジション中のため、実測値ではなく指定済みの目標幅を使う
    const w = panelCollapsed ? 0 : (parseFloat(panel.style.width) || panel.getBoundingClientRect().width);
    const handleW = panelCollapsed ? 0 : 4;
    panelToggle.style.left = (w + handleW) + 'px';
    panelBackdrop.classList.remove('visible');
    updateColorHistoryPos(w + handleW);
  }
}

function togglePanel() {
  if (panelCollapsed) {
    panel.classList.remove('collapsed');
    if (!isMobile()) panel.style.width = savedPanelWidth + 'px';
    panelCollapsed = false;
  } else {
    if (!isMobile()) savedPanelWidth = panel.offsetWidth;
    panel.classList.add('collapsed');
    panelCollapsed = true;
  }
  syncTogglePosition();
}

panelToggle.addEventListener('click', togglePanel);
panelBackdrop.addEventListener('click', () => {
  if (!panelCollapsed) togglePanel();
});

// モバイル時は初期状態で閉じる
if (isMobile()) {
  panel.classList.add('collapsed');
  panelCollapsed = true;
}

// 画面リサイズ時にモード切替
window.addEventListener('resize', () => {
  syncTogglePosition();
});

// ドラッグリサイズ（デスクトップのみ）
let isResizing = false;
panelResize.addEventListener('mousedown', e => {
  if (isMobile()) return;
  e.preventDefault();
  isResizing = true;
  panel.classList.add('no-transition');
  panelResize.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const appRect = document.querySelector('.app').getBoundingClientRect();
  let newWidth = e.clientX - appRect.left;
  newWidth = Math.max(MIN_PANEL_W, Math.min(newWidth, window.innerWidth * 0.5));
  panel.style.width = newWidth + 'px';
  syncTogglePosition();
});

document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  panel.classList.remove('no-transition');
  panelResize.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  savedPanelWidth = panel.offsetWidth;
});

// ── キャンバス表示切替 ────────────────────────────────
let canvasVisible = true;
document.getElementById('btn-toggle-canvas').addEventListener('click', () => {
  canvasVisible = !canvasVisible;
  cBg.style.visibility = canvasVisible ? 'visible' : 'hidden';
  const btn = document.getElementById('btn-toggle-canvas');
  btn.classList.toggle('primary', !canvasVisible);
});

// ── 背景色切替 ────────────────────────────────────────
document.querySelectorAll('.bg-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.bg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    canvasArea.style.background = b.dataset.bg;
  });
});

// ── 起動 ─────────────────────────────────────────────
buildPalette();
buildCustomPalette();
setColor('#3a3a38');
initCells(cols, rows, false);
resizeCanvases();
syncTogglePosition();
updateColorHistoryPos();
