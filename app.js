/**
 * IIA — Main App
 * Orchestrates UI, file handling, analysis pipeline, and results rendering.
 */

import { analyzeMetadata } from './analyzer.js';
import { hashFile }        from './hasher.js';
import { generateReport }  from './report.js';

// ── State ──
let currentFile      = null;
let currentArrayBuffer = null;
let analysisResult   = null;
let deferredPrompt   = null;
let ocrWorker        = null;

// ── DOM refs ──
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const pickBtn         = document.getElementById('pickBtn');
const previewContainer= document.getElementById('previewContainer');
const previewImage    = document.getElementById('previewImage');
const previewFrame    = document.getElementById('previewFrame');
const chipName        = document.getElementById('chipName');
const chipSize        = document.getElementById('chipSize');
const chipType        = document.getElementById('chipType');
const chipDims        = document.getElementById('chipDims');
const analyzeBtn      = document.getElementById('analyzeBtn');
const clearBtn        = document.getElementById('clearBtn');
const emptyState      = document.getElementById('emptyState');
const resultsContainer= document.getElementById('resultsContainer');
const statusDot       = document.getElementById('statusDot');
const installBanner   = document.getElementById('installBanner');
const installLink     = document.getElementById('installLink');
const toast           = document.getElementById('toast');
const toastMsg        = document.getElementById('toastMsg');

// ── PWA Install prompt ──
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBanner.classList.add('visible');
});

if (installLink) {
  installLink.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBanner.classList.remove('visible');
    deferredPrompt = null;
  });
}

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Drop zone ──
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
  else showToast('Solo se admiten archivos de imagen.', 'warning');
});

dropZone.addEventListener('click', () => fileInput.click());
pickBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

// ── Load file ──
async function loadFile(file) {
  currentFile = file;
  currentArrayBuffer = await file.arrayBuffer();

  // Preview
  const url = URL.createObjectURL(file);
  previewImage.src = url;
  previewContainer.classList.add('visible');

  // Chips
  chipName.textContent = truncate(file.name, 22);
  chipSize.textContent = formatBytes(file.size);
  chipType.textContent = file.type.replace('image/', '').toUpperCase() || '?';

  // Get dimensions from image
  const img = new Image();
  img.onload = () => { chipDims.textContent = `${img.naturalWidth}×${img.naturalHeight}`; };
  img.src = url;

  analyzeBtn.disabled = false;
  setStatus('ready');
  resultsContainer.classList.remove('visible');
  emptyState.classList.remove('hidden');
  emptyState.classList.add('hidden');
}

// ── Analyze ──
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!currentFile) return;

  analyzeBtn.disabled = true;
  analyzeBtn.classList.add('loading');
  analyzeBtn.querySelector('.btn-text').textContent = 'Analizando…';
  setStatus('scanning');

  // Scan animation
  previewFrame.classList.add('scanning');

  emptyState.classList.add('hidden');
  resultsContainer.classList.remove('visible');

  try {
    // 1. Metadata
    const metadata = await analyzeMetadata(currentFile);

    // 2. Hashes
    const hashes = await hashFile(currentArrayBuffer);

    // 3. OCR (Tesseract)
    const ocrText = await runOCR(currentFile);

    // 4. Report
    const report = generateReport(metadata, hashes, ocrText);

    analysisResult = { metadata, hashes, ocrText, report };

    // Render
    renderResults(analysisResult);

    setStatus('ready');
    showToast('Análisis completado.', 'success');

  } catch (err) {
    console.error('[IIA] Analysis error:', err);
    showToast('Error durante el análisis. Intenta con otra imagen.', 'error');
    setStatus('ready');
  } finally {
    previewFrame.classList.remove('scanning');
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('loading');
    analyzeBtn.querySelector('.btn-text').textContent = 'Analizar imagen';
  }
}

// ── OCR ──
async function runOCR(file) {
  const progressContainer = document.getElementById('ocrProgress');
  const progressFill      = document.getElementById('ocrProgressFill');
  const progressPct       = document.getElementById('ocrProgressPct');

  if (progressContainer) progressContainer.classList.add('visible');

  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker('eng+spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (progressPct)  progressPct.textContent   = `${pct}%`;
        }
      },
    });

    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    if (progressContainer) progressContainer.classList.remove('visible');
    return text;
  } catch (err) {
    console.warn('[IIA] OCR error:', err);
    if (progressContainer) progressContainer.classList.remove('visible');
    return '';
  }
}

// ── Render Results ──
function renderResults({ metadata, hashes, ocrText, report }) {
  // Summary
  document.getElementById('reportSummaryText').innerHTML = report.summary;
  document.getElementById('statFields').textContent     = report.fieldsFound;
  document.getElementById('statSections').textContent   = report.sectionsFound.length;
  document.getElementById('statFindings').textContent   = report.findings.length;

  // EXIF
  renderTableSection('exifSection', 'exifBody', metadata.exif, {
    highlightKeys: ['Fabricante', 'Modelo', 'Fecha de captura', 'Software'],
  });

  // GPS
  renderGPS(metadata.gps);

  // IPTC
  renderTableSection('iptcSection', 'iptcBody', metadata.iptc);

  // XMP
  renderTableSection('xmpSection', 'xmpBody', metadata.xmp);

  // OCR
  renderOCR(ocrText);

  // Hashes
  renderHashes(hashes);

  resultsContainer.classList.add('visible');

  // Update section badges
  updateBadge('exifBadge', metadata.exif);
  updateBadge('gpsBadge',  metadata.gps);
  updateBadge('iptcBadge', metadata.iptc);
  updateBadge('xmpBadge',  metadata.xmp);
  updateBadge('ocrBadge',  ocrText && ocrText.trim().length > 10 ? { found: true } : null);
  updateBadge('hashBadge', hashes);

  // Scroll to results
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTableSection(sectionId, bodyId, data, opts = {}) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = '';

  if (!data || Object.keys(data).length === 0) {
    body.innerHTML = `<div class="no-data">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      No se encontraron datos en este bloque.
    </div>`;
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';

  for (const [key, val] of Object.entries(data)) {
    const tr = document.createElement('tr');
    const isHighlight = opts.highlightKeys && opts.highlightKeys.includes(key);
    tr.innerHTML = `
      <td class="field-key">${key}</td>
      <td class="field-val ${isHighlight ? 'highlight' : ''}">${escHtml(val)}</td>
    `;
    table.appendChild(tr);
  }

  body.appendChild(table);
}

function renderGPS(gps) {
  const body = document.getElementById('gpsBody');
  if (!body) return;
  body.innerHTML = '';

  if (!gps) {
    body.innerHTML = `<div class="no-data">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      No se encontraron coordenadas GPS en esta imagen.
    </div>`;
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';

  const rows = [
    ['Latitud',   gps.latitude,  true],
    ['Longitud',  gps.longitude, true],
    ['Altitud',   gps.altitude,  false],
    ['Velocidad', gps.speed,     false],
  ];

  for (const [key, val, isCoord] of rows) {
    if (!val) continue;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="field-key">${key}</td>
      <td class="field-val coords">${escHtml(val)}</td>
    `;
    table.appendChild(tr);
  }

  body.appendChild(table);

  if (gps.mapsUrl) {
    const link = document.createElement('a');
    link.href = gps.mapsUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'gps-link';
    link.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      Ver en Google Maps
    `;
    body.appendChild(link);
  }
}

function renderOCR(text) {
  const body = document.getElementById('ocrBody');
  if (!body) return;
  body.innerHTML = '';

  const trimmed = (text || '').trim();

  if (!trimmed || trimmed.length < 5) {
    body.innerHTML = `<div class="no-data">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      No se detectó texto en la imagen.
    </div>`;
    return;
  }

  const box = document.createElement('div');
  box.className = 'ocr-text-box';
  box.textContent = trimmed;
  body.appendChild(box);

  // Word count
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const charCount = trimmed.length;
  const info = document.createElement('p');
  info.style.cssText = 'font-size:11px; color:var(--text-dim); font-family:var(--font-mono); margin-top:8px;';
  info.textContent = `${wordCount} palabras · ${charCount} caracteres`;
  body.appendChild(info);
}

function renderHashes(hashes) {
  const body = document.getElementById('hashBody');
  if (!body) return;
  body.innerHTML = '';

  if (!hashes) {
    body.innerHTML = `<div class="no-data">Error al generar hashes.</div>`;
    return;
  }

  const algos = [
    { key: 'md5',    label: 'MD5'    },
    { key: 'sha1',   label: 'SHA-1'  },
    { key: 'sha256', label: 'SHA-256'},
  ];

  for (const { key, label } of algos) {
    const val = hashes[key];
    const row = document.createElement('div');
    row.className = 'hash-row';
    row.innerHTML = `
      <div class="hash-algo">${label}</div>
      <div class="hash-value">
        <span id="hash-${key}">${val || 'No disponible'}</span>
        ${val ? `<button class="copy-btn" data-hash="${val}" title="Copiar hash">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>` : ''}
      </div>
    `;
    body.appendChild(row);
  }

  // Copy handlers
  body.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.hash).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 2000);
      });
    });
  });
}

function updateBadge(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  const hasData = data && (typeof data === 'object' ? Object.keys(data).length > 0 : true);
  el.textContent = hasData ? 'Encontrado' : 'Sin datos';
  el.className   = `section-badge ${hasData ? 'found' : 'none'}`;
}

// ── Section toggle ──
document.querySelectorAll('.section-header').forEach(header => {
  header.addEventListener('click', () => {
    const card = header.closest('.section-card');
    card.classList.toggle('collapsed');
  });
});

// ── Clear ──
clearBtn.addEventListener('click', () => {
  currentFile        = null;
  currentArrayBuffer = null;
  analysisResult     = null;
  fileInput.value    = '';
  previewImage.src   = '';
  previewContainer.classList.remove('visible');
  resultsContainer.classList.remove('visible');
  emptyState.classList.remove('hidden');
  analyzeBtn.disabled = true;
  setStatus('idle');
});

// ── Helpers ──
function setStatus(state) {
  statusDot.className = `status-dot ${state}`;
}

function showToast(message, type = 'info') {
  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22D3A0" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F56565" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  toast.querySelector('.toast-icon').innerHTML = icons[type] || icons.info;
  toastMsg.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
