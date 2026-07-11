// ── クラウド保存（Firebase Auth + Firestore） ─────────
// script.js のグローバル関数（serializeProject / loadProjectData /
// projectThumbnailDataURL / isEditorStarted）を利用する。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDocs, deleteDoc,
  serverTimestamp, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyADQEdNXOxDd4WOsBsnYcIjBXCwRWl2LuY',
  authDomain: 'pixelart-editor-339e1.firebaseapp.com',
  projectId: 'pixelart-editor-339e1',
  storageBucket: 'pixelart-editor-339e1.firebasestorage.app',
  messagingSenderId: '234832987740',
  appId: '1:234832987740:web:5378cad089cf3f728b0899',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 現在開いているクラウド作品（上書き保存の対象）
let currentArtworkId = null;
let currentArtworkName = '';

// ── DOM ──
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userChip = document.getElementById('user-chip');
const userAvatar = document.getElementById('user-avatar');
const cloudSaveMenu = document.getElementById('cloud-save-menu');
const btnCloudSave = document.getElementById('btn-cloud-save');
const cloudSaveDropdown = document.getElementById('cloud-save-dropdown');
const btnSaveNew = document.getElementById('btn-cloud-save-new');
const btnSaveOver = document.getElementById('btn-cloud-save-over');
const btnGallery = document.getElementById('btn-gallery');
const galleryModal = document.getElementById('gallery-modal');
const galleryTitle = document.getElementById('gallery-title');
const galleryList = document.getElementById('gallery-list');
const btnGalleryClose = document.getElementById('btn-gallery-close');
const saveNameModal = document.getElementById('save-name-modal');
const saveNameInput = document.getElementById('save-name-input');
const btnSaveOk = document.getElementById('btn-save-ok');
const btnSaveCancel = document.getElementById('btn-save-cancel');
const toastEl = document.getElementById('cloud-toast');
const logoutConfirmModal = document.getElementById('logout-confirm-modal');
const btnLogoutOk = document.getElementById('btn-logout-ok');
const btnLogoutCancel = document.getElementById('btn-logout-cancel');
const artworkChip = document.getElementById('artwork-chip');
const artworkChipName = document.getElementById('artwork-chip-name');

let toastTimer = null;
function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', !!isError);
  toastEl.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
}

// 開いている作品を切り替え、ヘッダーの作品名チップに反映する
function setCurrentArtwork(id, name) {
  currentArtworkId = id;
  currentArtworkName = name || '';
  if (id) {
    artworkChipName.textContent = currentArtworkName;
    artworkChip.style.display = 'inline-flex';
    btnSaveOver.textContent = `♻️ 上書き保存（${currentArtworkName}）`;
  } else {
    artworkChip.style.display = 'none';
    btnSaveOver.textContent = '♻️ 上書き保存（作品を選択…）';
  }
}

// ── クラウド保存ドロップダウン ──
function closeCloudSaveMenu() {
  cloudSaveDropdown.style.display = 'none';
}

btnCloudSave.addEventListener('click', e => {
  e.stopPropagation();
  cloudSaveDropdown.style.display = cloudSaveDropdown.style.display === 'none' ? 'flex' : 'none';
});

document.addEventListener('click', e => {
  if (!cloudSaveMenu.contains(e.target)) closeCloudSaveMenu();
});

// ── 認証 ──
onAuthStateChanged(auth, user => {
  const loggedIn = !!user;
  btnLogin.style.display = loggedIn ? 'none' : '';
  userChip.style.display = loggedIn ? 'flex' : 'none';
  cloudSaveMenu.style.display = loggedIn ? '' : 'none';
  btnGallery.style.display = loggedIn ? '' : 'none';
  btnLogout.style.display = loggedIn ? '' : 'none';
  if (!loggedIn) closeCloudSaveMenu();
  if (loggedIn) {
    userAvatar.src = user.photoURL || '';
    userAvatar.title = user.displayName || user.email || '';
  } else {
    setCurrentArtwork(null, '');
  }
});

btnLogin.addEventListener('click', async () => {
  if (window.closeFileMenu) window.closeFileMenu();
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました: ' + (err.code || err.message), true);
    }
  }
});

btnLogout.addEventListener('click', () => {
  if (window.closeFileMenu) window.closeFileMenu();
  logoutConfirmModal.style.display = 'flex';
});

btnLogoutOk.addEventListener('click', async () => {
  logoutConfirmModal.style.display = 'none';
  await signOut(auth);
  showToast('ログアウトしました');
});

btnLogoutCancel.addEventListener('click', () => {
  logoutConfirmModal.style.display = 'none';
});

// ── 保存 ──
function artworksCol(uid) {
  return collection(db, 'users', uid, 'artworks');
}

async function saveArtwork(name, artworkId) {
  const user = auth.currentUser;
  if (!user) return;
  const payload = {
    name,
    project: JSON.stringify(window.serializeProject()),
    thumb: window.projectThumbnailDataURL(),
    updatedAt: serverTimestamp(),
  };
  if (artworkId) {
    await setDoc(doc(db, 'users', user.uid, 'artworks', artworkId), payload, { merge: true });
    return artworkId;
  }
  payload.createdAt = serverTimestamp();
  const ref = await addDoc(artworksCol(user.uid), payload);
  return ref.id;
}

// 新規保存: 常に名前を付けて新しい作品として保存し、以後の上書き対象にする
btnSaveNew.addEventListener('click', () => {
  window.closeFileMenu();
  if (!auth.currentUser || !window.isEditorStarted()) return;
  saveNameInput.value = '';
  saveNameModal.style.display = 'flex';
  saveNameInput.focus();
});

btnSaveOk.addEventListener('click', async () => {
  const name = saveNameInput.value.trim() || '無題';
  saveNameModal.style.display = 'none';
  try {
    const id = await saveArtwork(name, null);
    setCurrentArtwork(id, name);
    showToast(`「${name}」を保存しました`);
  } catch (err) {
    showToast('保存に失敗しました: ' + (err.code || err.message), true);
  }
});

btnSaveCancel.addEventListener('click', () => {
  saveNameModal.style.display = 'none';
});

saveNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnSaveOk.click();
  if (e.key === 'Escape') btnSaveCancel.click();
  e.stopPropagation();
});

// 上書き保存: 開いている作品があればそこへ、なければ上書き先を選ぶ
btnSaveOver.addEventListener('click', () => {
  window.closeFileMenu();
  if (!auth.currentUser || !window.isEditorStarted()) return;
  if (currentArtworkId) {
    saveArtwork(currentArtworkName, currentArtworkId)
      .then(() => showToast(`「${currentArtworkName}」に上書き保存しました`))
      .catch(err => showToast('保存に失敗しました: ' + (err.code || err.message), true));
  } else {
    openGallery('overwrite');
  }
});

// ── ギャラリー ──
// mode: 'browse' = 開く/削除、'overwrite' = 上書き先の選択
function openGallery(mode) {
  galleryTitle.textContent = mode === 'overwrite' ? '上書き保存する作品を選択' : 'マイギャラリー';
  galleryModal.style.display = 'flex';
  renderGallery(mode);
}

async function renderGallery(mode) {
  galleryList.innerHTML = '<div class="gallery-empty">読み込み中…</div>';
  const user = auth.currentUser;
  if (!user) return;
  let snap;
  try {
    snap = await getDocs(query(artworksCol(user.uid), orderBy('updatedAt', 'desc')));
  } catch (err) {
    galleryList.innerHTML = '';
    showToast('読み込みに失敗しました: ' + (err.code || err.message), true);
    return;
  }
  galleryList.innerHTML = '';
  if (snap.empty) {
    galleryList.innerHTML = '<div class="gallery-empty">保存された作品はまだありません</div>';
    return;
  }
  snap.docs.forEach(d => {
    const data = d.data();
    const item = document.createElement('div');
    item.className = 'gallery-item';

    const img = document.createElement('img');
    img.className = 'gallery-thumb';
    img.src = data.thumb || '';
    img.alt = data.name || '';

    const info = document.createElement('div');
    info.className = 'gallery-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'gallery-name';
    nameEl.textContent = data.name || '無題';
    const dateEl = document.createElement('div');
    dateEl.className = 'gallery-date';
    dateEl.textContent = data.updatedAt && data.updatedAt.toDate
      ? data.updatedAt.toDate().toLocaleString('ja-JP', {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})
      : '';
    info.appendChild(nameEl);
    info.appendChild(dateEl);

    const actions = document.createElement('div');
    actions.className = 'gallery-actions';

    if (mode === 'overwrite') {
      // 上書きは元の絵が消える操作なので2段階クリックで確認する
      const btnOver = document.createElement('button');
      btnOver.className = 'primary';
      btnOver.textContent = 'ここに上書き';
      btnOver.addEventListener('click', async () => {
        if (btnOver.dataset.confirm !== '1') {
          btnOver.dataset.confirm = '1';
          btnOver.textContent = '本当に上書き？';
          setTimeout(() => { btnOver.dataset.confirm = ''; btnOver.textContent = 'ここに上書き'; }, 2500);
          return;
        }
        const name = data.name || '無題';
        try {
          await saveArtwork(name, d.id);
          setCurrentArtwork(d.id, name);
          galleryModal.style.display = 'none';
          showToast(`「${name}」に上書き保存しました`);
        } catch (err) {
          showToast('保存に失敗しました: ' + (err.code || err.message), true);
        }
      });
      actions.appendChild(btnOver);
    } else {
      const btnOpen = document.createElement('button');
      btnOpen.className = 'primary';
      btnOpen.textContent = '開く';
      btnOpen.addEventListener('click', () => {
        try {
          window.loadProjectData(JSON.parse(data.project));
          setCurrentArtwork(d.id, data.name || '無題');
          galleryModal.style.display = 'none';
          showToast(`「${currentArtworkName}」を開きました`);
        } catch (err) {
          showToast('作品データの読み込みに失敗しました', true);
        }
      });
      const btnDel = document.createElement('button');
      btnDel.className = 'danger';
      btnDel.textContent = '削除';
      btnDel.addEventListener('click', async () => {
        // 2段階クリックで誤削除を防ぐ
        if (btnDel.dataset.confirm !== '1') {
          btnDel.dataset.confirm = '1';
          btnDel.textContent = '本当に削除？';
          setTimeout(() => { btnDel.dataset.confirm = ''; btnDel.textContent = '削除'; }, 2500);
          return;
        }
        try {
          await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'artworks', d.id));
          if (currentArtworkId === d.id) setCurrentArtwork(null, '');
          item.remove();
          if (!galleryList.children.length) {
            galleryList.innerHTML = '<div class="gallery-empty">保存された作品はまだありません</div>';
          }
          showToast('削除しました');
        } catch (err) {
          showToast('削除に失敗しました: ' + (err.code || err.message), true);
        }
      });
      actions.appendChild(btnOpen);
      actions.appendChild(btnDel);
    }

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(actions);
    galleryList.appendChild(item);
  });
}

btnGallery.addEventListener('click', () => {
  window.closeFileMenu();
  openGallery('browse');
});

// スタート画面（白紙で始める／画像を読み込む）の「ギャラリーから開く」。
// ログイン済みならそのままギャラリーへ、未ログインならその場でログインを
// 促し、成功したら続けてギャラリーを開く。
const btnStartGallery = document.getElementById('btn-start-gallery');
btnStartGallery.addEventListener('click', async () => {
  if (auth.currentUser) {
    openGallery('browse');
    return;
  }
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    openGallery('browse');
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました: ' + (err.code || err.message), true);
    }
  }
});

btnGalleryClose.addEventListener('click', () => {
  galleryModal.style.display = 'none';
});
