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

// 現在開いているクラウド作品（上書き保存用）
let currentArtworkId = null;
let currentArtworkName = '';

// ── DOM ──
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userChip = document.getElementById('user-chip');
const userAvatar = document.getElementById('user-avatar');
const btnCloudSave = document.getElementById('btn-cloud-save');
const btnGallery = document.getElementById('btn-gallery');
const galleryModal = document.getElementById('gallery-modal');
const galleryList = document.getElementById('gallery-list');
const btnGalleryClose = document.getElementById('btn-gallery-close');
const saveNameModal = document.getElementById('save-name-modal');
const saveNameInput = document.getElementById('save-name-input');
const btnSaveOk = document.getElementById('btn-save-ok');
const btnSaveCancel = document.getElementById('btn-save-cancel');
const toastEl = document.getElementById('cloud-toast');

let toastTimer = null;
function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', !!isError);
  toastEl.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
}

// ── 認証 ──
onAuthStateChanged(auth, user => {
  const loggedIn = !!user;
  btnLogin.style.display = loggedIn ? 'none' : '';
  userChip.style.display = loggedIn ? 'flex' : 'none';
  btnCloudSave.style.display = loggedIn ? '' : 'none';
  btnGallery.style.display = loggedIn ? '' : 'none';
  if (loggedIn) {
    userAvatar.src = user.photoURL || '';
    userAvatar.title = user.displayName || user.email || '';
  } else {
    currentArtworkId = null;
    currentArtworkName = '';
  }
});

btnLogin.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました: ' + (err.code || err.message), true);
    }
  }
});

btnLogout.addEventListener('click', async () => {
  await signOut(auth);
  showToast('ログアウトしました');
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

btnCloudSave.addEventListener('click', () => {
  if (!auth.currentUser || !window.isEditorStarted()) return;
  if (currentArtworkId) {
    // 開いている作品に上書き保存
    saveArtwork(currentArtworkName, currentArtworkId)
      .then(() => showToast(`「${currentArtworkName}」に上書き保存しました`))
      .catch(err => showToast('保存に失敗しました: ' + (err.code || err.message), true));
  } else {
    saveNameInput.value = '';
    saveNameModal.style.display = 'flex';
    saveNameInput.focus();
  }
});

btnSaveOk.addEventListener('click', async () => {
  const name = saveNameInput.value.trim() || '無題';
  saveNameModal.style.display = 'none';
  try {
    currentArtworkId = await saveArtwork(name, null);
    currentArtworkName = name;
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

// ── ギャラリー ──
async function renderGallery() {
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
    const btnOpen = document.createElement('button');
    btnOpen.className = 'primary';
    btnOpen.textContent = '開く';
    btnOpen.addEventListener('click', () => {
      try {
        window.loadProjectData(JSON.parse(data.project));
        currentArtworkId = d.id;
        currentArtworkName = data.name || '無題';
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
        if (currentArtworkId === d.id) { currentArtworkId = null; currentArtworkName = ''; }
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

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(actions);
    galleryList.appendChild(item);
  });
}

btnGallery.addEventListener('click', () => {
  galleryModal.style.display = 'flex';
  renderGallery();
});

btnGalleryClose.addEventListener('click', () => {
  galleryModal.style.display = 'none';
});
