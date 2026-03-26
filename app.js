/**
 * ClearDrop — app.js
 * Logique principale de l'interface : glisser-déposer, pool de workers, image unique, file de lots, ZIP différé
 */

// ── URLs des ressources (relatives à l'emplacement de ce fichier) ───────────
const BG_48_URL = new URL('./assets/bg_48.png', location.href).href;
const BG_96_URL = new URL('./assets/bg_96.png', location.href).href;
const WORKER_URL = new URL('./workers/watermarkWorker.js', location.href).href;

// ── Configuration ───────────────────────────────────────────────────────────
const MAX_BATCH = 50;
const POOL_SIZE = Math.min(navigator.hardwareConcurrency || 2, 4);
const ACCEPT_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// ── État ────────────────────────────────────────────────────────────────────
let queue = [];   // { id, file, objectUrl, status, blob, confidence }
let processing = 0;
let completed = 0;
let singleMode = false;
let workerQueue = [];
let pendingResolvers = new Map();

// ── Pool de workers ─────────────────────────────────────────────────────────
const workers = Array.from({ length: POOL_SIZE }, () => {
    const w = new Worker(WORKER_URL, { type: 'module' });
    w.busy = false;
    w.addEventListener('message', onWorkerMessage);
    return w;
});

function getFreeWorker() { return workers.find(w => !w.busy) || null; }

let jobId = 0;
function dispatchJob(file) {
    return new Promise((resolve, reject) => {
        const id = ++jobId;
        pendingResolvers.set(id, { resolve, reject, file });
        workerQueue.push(id);
        drainQueue();
    });
}

function drainQueue() {
    while (workerQueue.length > 0) {
        const worker = getFreeWorker();
        if (!worker) break;
        const id = workerQueue.shift();
        const entry = pendingResolvers.get(id);
        if (!entry) continue;
        worker.busy = true;
        createImageBitmap(entry.file).then(bitmap => {
            worker.postMessage({ id, imageBitmap: bitmap, bg48Url: BG_48_URL, bg96Url: BG_96_URL }, [bitmap]);
        }).catch(err => {
            worker.busy = false;
            entry.reject(err);
            pendingResolvers.delete(id);
            drainQueue();
        });
    }
}

function onWorkerMessage(event) {
    const { id, blob, confidence, position, ok, error } = event.data;
    const worker = workers.find(w => w.busy && true); // un worker occupé (le message vient de lui)
    // Trouver quel worker a envoyé ce message
    const senderWorker = workers.find(w => w === event.target);
    if (senderWorker) senderWorker.busy = false;

    const entry = pendingResolvers.get(id);
    if (!entry) { drainQueue(); return; }
    pendingResolvers.delete(id);

    if (ok) {
        entry.resolve({ blob, confidence, position });
    } else {
        entry.reject(new Error(error || 'Échec du traitement'));
    }

    drainQueue();
}

// ── Références DOM ──────────────────────────────────────────────────────────
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const resultSection = document.getElementById('result-section');
const heroSection = document.getElementById('hero-section');
const toastEl = document.getElementById('toast');

// ── Glisser-Déposer ─────────────────────────────────────────────────────────
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', e => {
    if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    handleFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
    handleFiles([...fileInput.files]);
    fileInput.value = '';
});

document.addEventListener('paste', e => {
    const items = [...(e.clipboardData?.items || [])];
    const files = items.filter(i => ACCEPT_MIME.includes(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (files.length > 0) handleFiles(files);
});

// ── Gestion des fichiers ────────────────────────────────────────────────────
function handleFiles(files) {
    const valid = files.filter(f => ACCEPT_MIME.includes(f.type)).slice(0, MAX_BATCH);
    if (valid.length === 0) { showToast('Type de fichier non supporté. Utilisez JPG, PNG ou WebP.'); return; }
    if (files.length > MAX_BATCH) showToast(`Seules les ${MAX_BATCH} premières images seront traitées.`);

    singleMode = valid.length === 1;
    queue = valid.map((file, i) => ({
        id: Date.now() + i, file,
        objectUrl: URL.createObjectURL(file),
        status: 'pending', blob: null, confidence: null,
    }));
    completed = 0;

    heroSection.style.display = 'none';
    resultSection.classList.add('visible');

    if (singleMode) {
        renderSinglePlaceholder(queue[0]);
        processItemAsync(queue[0]);
    } else {
        renderBatchGrid();
        processNextItems();
    }
}

// ── Interface image unique ──────────────────────────────────────────────────
function renderSinglePlaceholder(item) {
    resultSection.innerHTML = `
      <div class="result-header">
        <span class="result-title">Traitement…</span>
        <span class="confidence-badge" id="conf-badge" style="display:none"></span>
      </div>
      <div class="before-after-wrap" id="ba-wrap">
        <img src="${item.objectUrl}" alt="Original" id="ba-before" style="visibility:hidden">
        <div class="ba-after" id="ba-after-div" style="display:none">
          <img src="" alt="Nettoyé" id="ba-after-img">
        </div>
        <div class="ba-divider" id="ba-divider" style="display:none">
          <div class="ba-handle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6-6 6-6"/><path d="m15 18 6-6-6-6"/></svg>
          </div>
        </div>
        <span class="ba-label ba-label-before" id="ba-lb" style="display:none">AVANT</span>
        <span class="ba-label ba-label-after"  id="ba-la" style="display:none">APRÈS</span>
        <div class="batch-item-spinner" id="spin-overlay"><div class="spinner"></div></div>
      </div>
      <div class="single-actions" id="single-actions" style="display:none">
        <button class="btn-secondary" onclick="resetApp()">Traiter une autre</button>
        <button class="btn-primary" id="dl-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Télécharger PNG
        </button>
      </div>`;

    // Charger l'image "avant" une fois qu'elle est prête
    const beforeImg = document.getElementById('ba-before');
    beforeImg.onload = () => { beforeImg.style.visibility = 'visible'; };
}

async function processItemAsync(item) {
    try {
        const { blob, confidence } = await dispatchJob(item.file);
        item.blob = blob;
        item.confidence = confidence;
        item.status = 'done';
        renderSingleResult(item);
    } catch (err) {
        item.status = 'error';
        showToast('Erreur lors du traitement de l\'image. Veuillez réessayer.');
        console.error(err);
    }
}

function renderSingleResult(item) {
    const afterUrl = URL.createObjectURL(item.blob);
    const pct = Math.round(item.confidence * 100);
    const isHigh = pct >= 60;

    document.querySelector('.result-title').textContent = 'Filigrane supprimé';

    const confBadge = document.getElementById('conf-badge');
    confBadge.style.display = '';
    confBadge.className = `confidence-badge ${isHigh ? 'confidence-high' : 'confidence-low'}`;
    confBadge.textContent = isHigh ? `✓ ${pct}% de confiance` : `⚠ ${pct}% — le résultat peut être imparfait`;

    document.getElementById('spin-overlay').remove();

    const baWrap = document.getElementById('ba-wrap');
    const afterDiv = document.getElementById('ba-after-div');
    const afterImg = document.getElementById('ba-after-img');
    const beforeImg = document.getElementById('ba-before');
    const divider = document.getElementById('ba-divider');

    afterImg.src = afterUrl;
    afterDiv.style.display = '';
    divider.style.display = '';
    document.getElementById('ba-lb').style.display = '';
    document.getElementById('ba-la').style.display = '';

    setupBeforeAfterSlider(baWrap, afterDiv, divider);

    document.getElementById('single-actions').style.display = 'flex';
    document.getElementById('dl-btn').onclick = () => downloadBlob(item.blob, sanitizeName(item.file.name));
}

function setupBeforeAfterSlider(wrap, afterDiv, divider) {
    let pct = 50;

    const update = (x) => {
        const rect = wrap.getBoundingClientRect();
        pct = Math.min(100, Math.max(0, ((x - rect.left) / rect.width) * 100));
        divider.style.left = pct + '%';
        afterDiv.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    };

    update(wrap.getBoundingClientRect().left + wrap.getBoundingClientRect().width / 2);

    wrap.addEventListener('mousemove', e => update(e.clientX));
    wrap.addEventListener('touchmove', e => { e.preventDefault(); update(e.touches[0].clientX); }, { passive: false });
    wrap.addEventListener('touchstart', e => update(e.touches[0].clientX), { passive: true });
}

// ── Interface par lots ──────────────────────────────────────────────────────
function renderBatchGrid() {
    resultSection.innerHTML = `
      <div class="result-header">
        <span class="result-title">Traitement de ${queue.length} images…</span>
        <button class="btn-secondary" onclick="resetApp()">Recommencer</button>
      </div>
      <div class="overall-progress"><div class="overall-progress-bar" id="overall-bar" style="width:0"></div></div>
      <div class="batch-grid" id="batch-grid"></div>
      <div class="batch-zip-row" id="zip-row" style="display:none">
        <button class="btn-secondary" onclick="resetApp()">Traiter plus</button>
        <button class="btn-accent" id="zip-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Tout télécharger en ZIP
        </button>
      </div>`;

    const grid = document.getElementById('batch-grid');
    queue.forEach(item => {
        const card = document.createElement('div');
        card.className = 'batch-item';
        card.id = `card-${item.id}`;
        card.innerHTML = `
          <img class="batch-thumb" src="${item.objectUrl}" alt="${item.file.name}">
          <div class="batch-item-info">
            <div class="batch-item-name">${item.file.name}</div>
            <div class="batch-item-status status-pending" id="status-${item.id}">En attente…</div>
          </div>
          <button class="batch-item-dl" id="dl-${item.id}" disabled>Télécharger</button>
          <div class="batch-item-spinner" id="spin-${item.id}" style="display:none"><div class="spinner"></div></div>`;
        grid.appendChild(card);
    });

    document.getElementById('zip-btn')?.addEventListener('click', downloadZip);
    processNextItems();
}

function processNextItems() {
    for (const item of queue) {
        if (item.status === 'pending' && processing < POOL_SIZE) {
            item.status = 'processing';
            processing++;
            updateBatchItemUI(item);
            dispatchJob(item.file).then(result => {
                item.blob = result.blob;
                item.confidence = result.confidence;
                item.status = 'done';
                processing--;
                completed++;
                updateBatchItemUI(item);
                updateOverallProgress();
                processNextItems();
            }).catch(err => {
                item.status = 'error';
                processing--;
                completed++;
                updateBatchItemUI(item);
                updateOverallProgress();
                processNextItems();
            });
        }
    }
}

function updateBatchItemUI(item) {
    const spinEl = document.getElementById(`spin-${item.id}`);
    const statusEl = document.getElementById(`status-${item.id}`);
    const dlBtn = document.getElementById(`dl-${item.id}`);

    if (!statusEl) return;

    switch (item.status) {
        case 'processing':
            if (spinEl) spinEl.style.display = 'flex';
            statusEl.textContent = 'Traitement…';
            statusEl.className = 'batch-item-status status-processing';
            break;
        case 'done':
            if (spinEl) spinEl.remove();
            const pct = Math.round((item.confidence || 0) * 100);
            statusEl.textContent = `✓ ${pct}% de confiance`;
            statusEl.className = `batch-item-status ${pct >= 60 ? 'status-done' : 'status-error'}`;
            if (dlBtn) {
                dlBtn.disabled = false;
                dlBtn.addEventListener('click', () => downloadBlob(item.blob, sanitizeName(item.file.name)));
            }
            // Mettre à jour la vignette pour afficher la version nettoyée
            const thumb = document.querySelector(`#card-${item.id} .batch-thumb`);
            if (thumb && item.blob) thumb.src = URL.createObjectURL(item.blob);
            break;
        case 'error':
            if (spinEl) spinEl.remove();
            statusEl.textContent = '✗ Échoué';
            statusEl.className = 'batch-item-status status-error';
            break;
    }
}

function updateOverallProgress() {
    const bar = document.getElementById('overall-bar');
    const title = document.querySelector('.result-title');
    const done = queue.filter(i => i.status === 'done' || i.status === 'error').length;
    const pct = Math.round((done / queue.length) * 100);
    if (bar) bar.style.width = pct + '%';
    if (title) title.textContent = done < queue.length ? `Traitement de ${done}/${queue.length}…` : 'Terminé !';

    if (done === queue.length) {
        const zipRow = document.getElementById('zip-row');
        if (zipRow) zipRow.style.display = 'flex';
    }
}

// ── Export ZIP différé ──────────────────────────────────────────────────────
async function downloadZip() {
    const zipBtn = document.getElementById('zip-btn');
    if (zipBtn) { zipBtn.disabled = true; zipBtn.textContent = 'Préparation du ZIP…'; }

    try {
        // Chargement différé de jszip uniquement quand nécessaire
        const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
        const zip = new JSZip();

        for (const item of queue) {
            if (item.blob) {
                const buf = await item.blob.arrayBuffer();
                zip.file(sanitizeName(item.file.name), buf);
            }
        }

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadBlob(blob, `cleardrop-${Date.now()}.zip`);
    } catch (err) {
        showToast('Échec de la génération du ZIP. Essayez de télécharger individuellement.');
        console.error(err);
    } finally {
        if (zipBtn) { zipBtn.disabled = false; zipBtn.textContent = 'Tout télécharger en ZIP'; }
    }
}

// ── Utilitaires ─────────────────────────────────────────────────────────────
function sanitizeName(name) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    return base + '_nettoye.png';
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function showToast(msg, duration = 3000) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ── Réinitialisation ────────────────────────────────────────────────────────
window.resetApp = function () {
    queue.forEach(item => { if (item.objectUrl) URL.revokeObjectURL(item.objectUrl); });
    queue = []; completed = 0; processing = 0;
    resultSection.classList.remove('visible');
    resultSection.innerHTML = '';
    heroSection.style.display = '';
};

// ── Utilisateurs en ligne (fausse métrique) ─────────────────────────────────
const liveUsersEl = document.getElementById('live-users-count');
if (liveUsersEl) {
    let currentUsers = 12 + Math.floor(Math.random() * 8);
    liveUsersEl.textContent = currentUsers;
    setInterval(() => {
        // varier aléatoirement de -1, 0 ou +1
        const change = Math.floor(Math.random() * 3) - 1;
        currentUsers = Math.max(8, currentUsers + change);
        liveUsersEl.textContent = currentUsers;
    }, 4500);
}
