// ── 状態 ──────────────────────────────────────────────
const PALETTE_COLORS = [
  '#ffffff','#d0d0d0','#888888','#444444','#1a1a18','#000000',
  '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db',
  '#9b59b6','#e91e8c','#ff7675','#fdcb6e','#55efc4','#74b9ff',
  '#a29bfe','#fd79a8','#dfe6e9','#b2bec3','#636e72','#2d3436',
  '#c0392b','#d35400','#f39c12','#27ae60','#16a085','#2980b9',
  '#8e44ad','#ff006e','#ff8c00','#00b894','#0984e3','#6c5ce7',
  '#fab1a0','#ffeaa7','#81ecec','#a29bfe','#fd79a8','#636e72',
  '#2c3e50','#34495e','#7f8c8d','#95a5a6','#bdc3c7','#ecf0f1',
];

let cols = 32, rows = 32;
let cells = [];          // cells[row][col] = '#rrggbb' or null
let history = [];
let zoom = 1;
let currentTool = 'pen';
let currentColor = '#3a3a38';
let convertMethod = 'mode';
let showGrid = true;
let uploadedImage = null;
let isPainting = false;
let lastCell = null;
let started = false;
let brushSize = 1;

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
const colorPicker = document.getElementById('color-picker');

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

function resizeCanvases() {
  const {w, h} = canvasSize();
  [cBg, cMain, cOv].forEach(c => { c.width = w; c.height = h; });
  wrap.style.width  = (w * zoom) + 'px';
  wrap.style.height = (h * zoom) + 'px';
  [cBg, cMain, cOv].forEach(c => {
    c.style.width  = (w * zoom) + 'px';
    c.style.height = (h * zoom) + 'px';
  });
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

function drawOverlayCell(col, row) {
  const px = cellPx();
  const ctx = cOv.getContext('2d');
  ctx.clearRect(0, 0, cOv.width, cOv.height);
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

function paintBrush(col, row, value) {
  const b = brushRect(col, row);
  for (let r = b.r1; r <= b.r2; r++) {
    for (let c = b.c1; c <= b.c2; c++) {
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
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

function applyToolSingle(col, row) {
  if (col < 0 || col >= cols || row < 0 || row >= rows) return;
  if (currentTool === 'pen') {
    paintBrush(col, row, currentColor);
  } else if (currentTool === 'erase') {
    paintBrush(col, row, null);
  } else if (currentTool === 'pick') {
    const c = cells[row][col];
    if (c) { setColor(c); }
  } else if (currentTool === 'fill') {
    floodFill(col, row, currentColor);
  }
}

function floodFill(startCol, startRow, newColor) {
  const target = cells[startRow][startCol];
  if (target === newColor) return;
  const stack = [[startCol, startRow]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    if (cells[r][c] !== target) continue;
    cells[r][c] = newColor;
    stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
}

cOv.addEventListener('mousedown', e => {
  if (!started) return;
  pushHistory();
  isPainting = true;
  const {col, row} = getCell(e);
  lastCell = {col, row};
  applyToolSingle(col, row);
  drawCells();
});
cOv.addEventListener('mousemove', e => {
  if (!started) return;
  const {col, row} = getCell(e);
  drawOverlayCell(col, row);
  statPos.textContent = `${col+1}, ${row+1}`;
  const c = cells[row] && cells[row][col];
  statColor.textContent = c || '—';
  if (!isPainting) return;
  if (lastCell && lastCell.col === col && lastCell.row === row) return;
  applyToolLine(lastCell.col, lastCell.row, col, row);
  lastCell = {col, row};
});
document.addEventListener('mouseup', () => { isPainting = false; lastCell = null; });
cOv.addEventListener('mouseleave',() => {
  cOv.getContext('2d').clearRect(0,0,cOv.width,cOv.height);
  statPos.textContent = '—';
});

// タッチ対応
cOv.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!started) return;
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
  if (!isPainting || !started) return;
  const t = e.touches[0];
  const {col, row} = getCell(t);
  if (lastCell && lastCell.col === col && lastCell.row === row) return;
  applyToolLine(lastCell.col, lastCell.row, col, row);
  lastCell = {col, row};
}, {passive: false});
cOv.addEventListener('touchend', () => { isPainting = false; lastCell = null; });

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
function setColor(hex) {
  currentColor = hex;
  colorPicker.value = hex;
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
colorPicker.addEventListener('input', e => setColor(e.target.value));

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
}
document.querySelectorAll('.tool-btn').forEach(b => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
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

colsSlider.addEventListener('input', () => { colsVal.value = colsSlider.value; });
colsVal.addEventListener('change', () => {
  const v = clampSize(colsVal.value);
  colsVal.value = v; colsSlider.value = v;
});

rowsSlider.addEventListener('input', () => { rowsVal.value = rowsSlider.value; });
rowsVal.addEventListener('change', () => {
  const v = clampSize(rowsVal.value);
  rowsVal.value = v; rowsSlider.value = v;
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

// ── 画像変換 ──────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

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

document.getElementById('btn-convert').addEventListener('click', () => {
  if (!uploadedImage) return;
  pushHistory();
  convertImage(uploadedImage);
});

function convertImage(img) {
  if (!started) startEditor();
  const off = document.createElement('canvas');
  off.width = cols; off.height = rows;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      cells[r][c] = `#${[data[i],data[i+1],data[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
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
    const cw = sx / cols, ch = sy / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.round(c * cw), y = Math.round(r * ch);
        const w = Math.round(cw), h = Math.round(ch);
        const map = {};
        let best = 0, bestColor = null;
        for (let py = y; py < y+h && py < sy; py++) {
          for (let px = x; px < x+w && px < sx; px++) {
            const i = (py * sx + px) * 4;
            const key = ((hdata[i]>>4)<<8)|((hdata[i+1]>>4)<<4)|(hdata[i+2]>>4);
            map[key] = (map[key]||0) + 1;
            if (map[key] > best) { best = map[key]; bestColor = [hdata[i],hdata[i+1],hdata[i+2]]; }
          }
        }
        if (bestColor) cells[r][c] = `#${bestColor.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
      }
    }
  }
  drawCells();
}

// ── スタート ──────────────────────────────────────────
function startEditor() {
  started = true;
  overlay.style.display = 'none';
  initCells(cols, rows, false);
  resizeCanvases();
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
const MIN_PANEL_W = 240;
let panelCollapsed = false;
let savedPanelWidth = panel.offsetWidth || 260;

function isMobile() { return window.innerWidth <= 640; }

function syncTogglePosition() {
  panelToggle.textContent = panelCollapsed ? '▶' : '◀';
  if (isMobile()) {
    panelToggle.style.left = '0px';
    panelBackdrop.classList.toggle('visible', !panelCollapsed);
  } else {
    const w = panel.getBoundingClientRect().width;
    const handleW = panelCollapsed ? 0 : 4;
    panelToggle.style.left = (w + handleW) + 'px';
    panelBackdrop.classList.remove('visible');
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
  panelResize.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  savedPanelWidth = panel.offsetWidth;
});

// ── 起動 ─────────────────────────────────────────────
buildPalette();
setColor('#3a3a38');
initCells(cols, rows, false);
resizeCanvases();
syncTogglePosition();
