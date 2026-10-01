// ── タブレット用レイアウト ────────────────────────────
// iPadなどのタブレットでは、お絵かきソフトのように「左に道具バー・右に色パネル」を並べ、
// キャンバスを大きく使えるようにする。それ以外の設定（グリッドサイズ・画像から変換・
// トレース・表示など）とレイヤーは、ヘッダーの ⚙・🗂 で左から引き出すパネルにまとめる。
//
// 部品は作り直さず、左パネルにある既存の部品（DOM）をそのまま道具バーや色パネルへ移す。
// 移しても登録済みのイベントはそのまま残るので、動きは今までと同じになる。
// タブレットかどうかの判定は editor.html の head、Pencilと指の使い分けは script.js で行う。
// script.js のグローバル（panelCollapsed, togglePanel, switchPanelTab など）を使うため、
// script.js の後に読み込むこと。
(() => {
  if (!document.documentElement.classList.contains('tablet-ui')) return;

  const $ = id => document.getElementById(id);
  const sectionOf = id => $(id).closest('.panel-section');

  // ── 右の色パネル：今の色（色の履歴）・移動の対象・描画サイズ・カラー・カスタムカラー ──
  const dock = $('color-dock');
  const current = document.createElement('div');
  current.className = 'panel-section dock-current';
  const label = document.createElement('div');
  label.className = 'panel-label';
  label.textContent = '今の色';
  current.append(label, $('color-history'));
  // 縦向きでは格子状に並べるため、それぞれに置き場所の名前（クラス）を付けておく
  const parts = [
    [current, 'dock-current'],
    [$('move-target-section'), 'dock-move'],
    [sectionOf('brush-slider'), 'dock-brush'],
    [sectionOf('palette'), 'dock-palette'],
    [sectionOf('custom-palette'), 'dock-custom'],
  ];
  parts.forEach(([el, cls]) => {
    el.classList.add(cls);
    dock.appendChild(el);
  });

  // 色選択などのモーダルは、左パネルの中にあると、パネルを閉じている間（画面外へずらしている間）に
  // 一緒にずれて見えなくなるため、パネルの外へ出しておく
  ['palette-export-modal', 'color-pick-modal', 'confirm-delete-all'].forEach(id => document.body.appendChild($(id)));

  // ── 左の道具バー：選択・描画スタイルは押すと横に開く小窓、図形はメニューごと移す ──
  $('rail-pop-select').appendChild($('selection-section'));
  $('rail-pop-style').appendChild($('draw-style-section'));
  $('rail-shape-slot').appendChild($('shape-menu'));

  // 画面の右上・右下に浮かべていたボタン類は、右に色パネルがあるので、キャンバスの枠の中へ移す
  const stage = $('canvas-stage');
  stage.append(document.querySelector('.zoom-controls'), $('btn-ref-toggle'));

  const popoverBtns = [...document.querySelectorAll('.rail-btn[data-popover]')];
  function closePopovers() {
    popoverBtns.forEach(b => {
      b.classList.remove('open');
      $(b.dataset.popover).classList.remove('open');
    });
  }
  popoverBtns.forEach(btn => {
    const pop = $(btn.dataset.popover);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !pop.classList.contains('open');
      closePopovers();
      pop.classList.toggle('open', open);
      btn.classList.toggle('open', open);
    });
  });
  // 小窓の外を押したら閉じる。キャンバスに Pencil で描き始めたときも閉じる
  // （Pencilのタッチはクリックにならないので、pointerdownで受け取る）
  document.addEventListener('click', e => {
    if (!e.target.closest('.rail-item')) closePopovers();
  });
  stage.addEventListener('pointerdown', closePopovers);

  // ── ヘッダーの 🗂（レイヤー）・⚙（設定）：左から引き出すパネルを、そのタブで開く ──
  function toggleDrawer(tab) {
    const showingTab = $('tab-layers').classList.contains('active') ? 'layers' : 'draw';
    if (!panelCollapsed && showingTab === tab) {
      togglePanel(); // 同じボタンをもう一度押したら閉じる
      return;
    }
    switchPanelTab(tab);
    if (panelCollapsed) togglePanel();
  }
  $('btn-tablet-layers').addEventListener('click', () => toggleDrawer('layers'));
  $('btn-tablet-settings').addEventListener('click', () => toggleDrawer('draw'));
})();
