// ── 輪っか状のカラーピッカー ──────────────────────────
// 外側の輪で色相（H）、内側の四角で彩度（S・横）と明るさ（V・縦）を選ぶ。
// マウス・指・Apple Pencil のどれでも操作できるよう、Pointer Events で受け取る。
//   const wheel = new ColorWheel(要素, { size: 220, onChange: hex => ... });
//   wheel.setHex('#ff0000'); wheel.getHex();
(() => {
  const RING_WIDTH = 22;  // 色相の輪の太さ
  const GAP = 8;          // 輪と四角の間のすき間

  function hsvToRgb(h, s, v) {
    const f = n => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function hexToHsv(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
  }

  class ColorWheel {
    constructor(container, { size = 220, onChange = () => {} } = {}) {
      this.size = size;
      this.onChange = onChange;
      this.h = 0; this.s = 1; this.v = 1;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'color-wheel-canvas';
      this.canvas.style.width = this.canvas.style.height = size + 'px';
      this.canvas.style.touchAction = 'none'; // 指で動かしても画面がスクロール・拡大しないように
      container.appendChild(this.canvas);
      this.dragging = null; // 'ring' | 'square'
      this.canvas.addEventListener('pointerdown', e => this.onPointer(e, true));
      this.canvas.addEventListener('pointermove', e => { if (this.dragging) this.onPointer(e, false); });
      const end = () => { this.dragging = null; };
      this.canvas.addEventListener('pointerup', end);
      this.canvas.addEventListener('pointercancel', end);
      this.draw();
    }

    // 内側の四角の位置と大きさ（輪の内側の円にぴったり収まる正方形）
    get square() {
      const inner = this.size / 2 - RING_WIDTH - GAP;
      const side = inner * Math.SQRT2;
      const x = (this.size - side) / 2;
      return { x, y: x, side };
    }

    setHex(hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
      const { h, s, v } = hexToHsv(hex);
      // 白・黒・灰色は色相を持たないので、今の色相を残す（輪の印が勝手に動かないように）
      if (s > 0 && v > 0) this.h = h;
      this.s = s;
      this.v = v;
      this.draw();
    }

    getHex() {
      return rgbToHex(hsvToRgb(this.h, this.s, this.v));
    }

    onPointer(e, start) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.size / rect.width);
      const y = (e.clientY - rect.top) * (this.size / rect.height);
      const c = this.size / 2;
      if (start) {
        // 押し始めた場所で、輪と四角のどちらを動かすかを決める
        const dist = Math.hypot(x - c, y - c);
        const sq = this.square;
        if (dist >= c - RING_WIDTH - GAP / 2 && dist <= c) this.dragging = 'ring';
        else if (x >= sq.x && x <= sq.x + sq.side && y >= sq.y && y <= sq.y + sq.side) this.dragging = 'square';
        else return;
        try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 捕捉できなくても動かせる */ }
      }
      if (this.dragging === 'ring') {
        this.h = (Math.atan2(y - c, x - c) * 180 / Math.PI + 450) % 360; // 真上を0°にする
      } else {
        const sq = this.square;
        this.s = Math.max(0, Math.min(1, (x - sq.x) / sq.side));
        this.v = Math.max(0, Math.min(1, 1 - (y - sq.y) / sq.side));
      }
      this.draw();
      this.onChange(this.getHex());
    }

    draw() {
      const dpr = window.devicePixelRatio || 1;
      const px = Math.round(this.size * dpr);
      if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
      const ctx = this.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = this.size / 2;
      ctx.clearRect(0, 0, this.size, this.size);

      // 色相の輪（1°ずつ扇形を塗る。どのブラウザでも同じに描ける方法）
      for (let deg = 0; deg < 360; deg++) {
        const a0 = (deg - 90.6) * Math.PI / 180, a1 = (deg - 89.4) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(c, c, c, a0, a1);
        ctx.arc(c, c, c - RING_WIDTH, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = `hsl(${deg}, 100%, 50%)`;
        ctx.fill();
      }

      // 彩度・明るさの四角（今の色相の純色に、白から透明・透明から黒を重ねる）
      const sq = this.square;
      ctx.fillStyle = rgbToHex(hsvToRgb(this.h, 1, 1));
      ctx.fillRect(sq.x, sq.y, sq.side, sq.side);
      const white = ctx.createLinearGradient(sq.x, 0, sq.x + sq.side, 0);
      white.addColorStop(0, '#ffffff');
      white.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = white;
      ctx.fillRect(sq.x, sq.y, sq.side, sq.side);
      const black = ctx.createLinearGradient(0, sq.y, 0, sq.y + sq.side);
      black.addColorStop(0, 'rgba(0,0,0,0)');
      black.addColorStop(1, '#000000');
      ctx.fillStyle = black;
      ctx.fillRect(sq.x, sq.y, sq.side, sq.side);

      // 今の位置の印（どんな色の上でも見えるよう、白と黒の二重丸）
      const mark = (x, y) => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#000000';
        ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.stroke();
      };
      const a = (this.h - 90) * Math.PI / 180, rr = c - RING_WIDTH / 2;
      mark(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      mark(sq.x + this.s * sq.side, sq.y + (1 - this.v) * sq.side);
    }
  }

  window.ColorWheel = ColorWheel;
})();
