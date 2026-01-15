/**
 * Web interface for NOAA APT satellite decoder
 * Handles UI interactions and calls Python modules via PyScript
 */

let currentSignalData = null;
let normalizedSignal = null;
let currentSignalPath = null;
let pythonReady = false;
let pyInterpreter = null;
let pyWorker = null;
let pyWorkerApi = null;
let preprocessInFlight = false;
let decodeInFlight = false;

// Audio UI/state
let audioEl, audioToggleBtn, audioScrub, audioTime;
let audioObjectUrl = null;
let wsWaveformEl = null;
let wsSpectrogramEl = null;
let waveSurfer = null;
let scrubIsDragging = false;
let wsSpectrogramPlayheadEl = null;
let spectrogramIsDragging = false;

// Dedicated Pyodide worker (no SharedArrayBuffer required)
let computeWorker = null;
let workerReady = false;
let workerInitFailed = false;
let workerReqId = 0;
const workerPending = new Map();
// Bump this to force browsers/SW to fetch a fresh worker script.
const WORKER_VERSION = '2026-01-14b';

function ensureComputeWorker() {
    if (computeWorker || workerInitFailed) return;
    computeWorker = new Worker(`./pyodide_worker.js?v=${encodeURIComponent(WORKER_VERSION)}`);
    computeWorker.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'init_step') {
            const suffix = msg.detail ? ` (${msg.detail})` : '';
            console.log(`[pyodide worker init] ${msg.step}${suffix}`);
            updateStatus(`Starting Python worker...\n${msg.step}${suffix}`);
            return;
        }
        if (msg.type === 'ready') {
            workerReady = true;
            const suffix = msg.version ? ` (worker ${msg.version})` : '';
            updateStatus(`Python worker ready.${suffix}`);
            return;
        }
        if (msg.type === 'py_stdout') {
            console.log('[pyodide worker stdout]', msg.text);
            return;
        }
        if (msg.type === 'py_stderr') {
            console.warn('[pyodide worker stderr]', msg.text);
            return;
        }
        if (msg.type === 'init_error') {
            console.error('Worker init error:', msg.error);
            updateStatus(`Python worker failed to init:\n${msg.error}`);
            workerInitFailed = true;
            workerReady = false;
            try { computeWorker.terminate(); } catch (_) {}
            computeWorker = null;
            preprocessBtn.disabled = true;
            decodeBtn.disabled = true;
            return;
        }
        if (msg.type === 'error') {
            const pending = workerPending.get(msg.id);
            if (pending) {
                workerPending.delete(msg.id);
                pending.reject(new Error(msg.error || 'Worker error'));
            }
            return;
        }
        if (msg.type === 'preprocess_done' || msg.type === 'prebaked_load_done' || msg.type === 'decode_done' || msg.type === 'reload_done' || msg.type === 'set_decoder_done') {
            const pending = workerPending.get(msg.id);
            if (pending) {
                workerPending.delete(msg.id);
                pending.resolve(msg);
            }
        }
    };
}

function workerCall(message, transfer) {
    ensureComputeWorker();
    const id = ++workerReqId;
    return new Promise((resolve, reject) => {
        workerPending.set(id, { resolve, reject });
        computeWorker.postMessage({ ...message, id }, transfer || []);
    });
}

// Get DOM elements
let signalSelector, loadBtn, preprocessBtn, decodeBtn, statusDiv, outputImage;
let progressContainer, progressBar, progressDetails;
let audioInitialized = false;
let volumeSlider, volumeValue, lessAnnoyingCheckbox;

// Live decoder editor
let decoderTextarea, applyDecoderBtn, resetDecoderBtn, decoderStatus;
let decoderEditor = null;
let defaultDecoderSource = null;
let lastAppliedDecoderSource = null;

let uiVolume = 0.5;
let uiLessAnnoying = true;
let lowpassFilterNode = null;

// Initialize DOM elements after page loads
function initializeElements() {
    signalSelector = document.getElementById('signal-selector');
    loadBtn = document.getElementById('load-signal-btn');
    preprocessBtn = document.getElementById('preprocess-btn');
    decodeBtn = document.getElementById('decode-btn');
    statusDiv = document.getElementById('status');
    outputImage = document.getElementById('output-image');
    progressContainer = document.getElementById('progress-container');
    progressBar = document.getElementById('progress-bar');
    progressDetails = document.getElementById('progress-details');

    decoderTextarea = document.getElementById('decoder-code');
    applyDecoderBtn = document.getElementById('apply-decoder-btn');
    resetDecoderBtn = document.getElementById('reset-decoder-btn');
    decoderStatus = document.getElementById('decoder-status');

    audioEl = document.getElementById('audio-player');
    audioToggleBtn = document.getElementById('audio-toggle-btn');
    audioScrub = document.getElementById('audio-scrub');
    audioTime = document.getElementById('audio-time');
    wsWaveformEl = document.getElementById('ws-waveform');
    wsSpectrogramEl = document.getElementById('ws-spectrogram');

    volumeSlider = document.getElementById('volume-slider');
    volumeValue = document.getElementById('volume-value');
    lessAnnoyingCheckbox = document.getElementById('less-annoying');
}

function setDecoderStatus(text) {
    if (decoderStatus) decoderStatus.textContent = text || '';
}

function initDecoderEditor() {
    if (!decoderTextarea) return;
    if (decoderEditor) return;

    if (!window.CodeMirror) {
        // Fallback: plain textarea.
        decoderTextarea.style.width = '100%';
        decoderTextarea.style.minHeight = '360px';
        return;
    }

    decoderEditor = window.CodeMirror.fromTextArea(decoderTextarea, {
        mode: 'python',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        viewportMargin: Infinity,
    });
}

function getDecoderSource() {
    if (decoderEditor) return decoderEditor.getValue();
    if (decoderTextarea) return decoderTextarea.value;
    return '';
}

function setDecoderSource(source) {
    const s = String(source ?? '');
    if (decoderEditor) {
        decoderEditor.setValue(s);
        return;
    }
    if (decoderTextarea) decoderTextarea.value = s;
}

async function loadDefaultDecoderSource() {
    if (!decoderTextarea) return;
    initDecoderEditor();

    try {
        setDecoderStatus('Loading default decoder…');
        if (applyDecoderBtn) applyDecoderBtn.disabled = true;
        if (resetDecoderBtn) resetDecoderBtn.disabled = true;

        const resp = await fetch(`/student_decoder.py?v=${encodeURIComponent(WORKER_VERSION)}`, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`Failed to load /student_decoder.py (HTTP ${resp.status})`);
        const text = await resp.text();

        defaultDecoderSource = text;
        setDecoderSource(text);
        lastAppliedDecoderSource = null;

        if (applyDecoderBtn) applyDecoderBtn.disabled = false;
        if (resetDecoderBtn) resetDecoderBtn.disabled = false;
        setDecoderStatus('Loaded.');
    } catch (e) {
        console.error(e);
        setDecoderStatus(`Failed: ${e?.message || String(e)}`);
    }
}

async function applyDecoderSourceToWorker(source) {
    ensureComputeWorker();
    if (workerInitFailed) throw new Error('Python worker failed to initialize. Refresh and try again.');

    const src = String(source ?? '');
    if (src === lastAppliedDecoderSource) return;

    setDecoderStatus('Applying code…');
    await workerCall({ type: 'set_decoder_source', source: src });
    lastAppliedDecoderSource = src;
    setDecoderStatus('Applied.');
}

async function onApplyDecoderClicked() {
    try {
        await applyDecoderSourceToWorker(getDecoderSource());
        updateStatus('Decoder code applied. Ready to decode.');
    } catch (e) {
        console.error(e);
        updateStatus(`Error applying decoder code:\n${e?.message || String(e)}`);
        setDecoderStatus('Apply failed.');
    }
}

function onResetDecoderClicked() {
    if (defaultDecoderSource == null) return;
    setDecoderSource(defaultDecoderSource);
    lastAppliedDecoderSource = null;
    setDecoderStatus('Reset.');
}

function setVolumeUI(vol01) {
    uiVolume = Math.max(0, Math.min(1, Number(vol01)));
    if (volumeSlider) volumeSlider.value = String(Math.round(uiVolume * 100));
    if (volumeValue) volumeValue.textContent = `${Math.round(uiVolume * 100)}%`;
}

function applyAudioComfortSettings() {
    if (!waveSurfer) return;
    // Volume
    try {
        waveSurfer.setVolume(uiVolume);
    } catch (e) {
        console.warn('Could not set volume:', e);
    }

    // Lowpass filter ("Less Annoying Mode")
    try {
        const backend = waveSurfer.backend;
        if (!backend || typeof backend.setFilters !== 'function' || !backend.ac) return;

        if (!uiLessAnnoying) {
            lowpassFilterNode = null;
            backend.setFilters([]);
            return;
        }

        // Create a fresh node for the current backend/context.
        lowpassFilterNode = backend.ac.createBiquadFilter();
        lowpassFilterNode.type = 'lowpass';
        lowpassFilterNode.frequency.value = 800;
        lowpassFilterNode.Q.value = 0.707;
        backend.setFilters([lowpassFilterNode]);
    } catch (e) {
        console.warn('Could not apply lowpass filter:', e);
    }
}

function setSpectrogramPlayhead(frac) {
    if (!wsSpectrogramEl) return;
    if (!wsSpectrogramPlayheadEl) {
        wsSpectrogramPlayheadEl = document.createElement('div');
        wsSpectrogramPlayheadEl.className = 'ws-playhead';
        wsSpectrogramPlayheadEl.style.left = '0%';
        wsSpectrogramEl.appendChild(wsSpectrogramPlayheadEl);
    }
    const clamped = Math.max(0, Math.min(1, frac || 0));
    wsSpectrogramPlayheadEl.style.left = `${clamped * 100}%`;
}

function fracFromPointerEvent(ev, el) {
    const rect = el.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function ensureWaveSurfer() {
    if (waveSurfer) return waveSurfer;
    if (!window.WaveSurfer) {
        throw new Error('WaveSurfer library not loaded');
    }
    if (!wsWaveformEl || !wsSpectrogramEl) {
        throw new Error('WaveSurfer containers missing');
    }
    const SpectrogramPlugin = window.WaveSurfer.spectrogram;
    if (!SpectrogramPlugin) {
        throw new Error('WaveSurfer spectrogram plugin not loaded');
    }

    wsWaveformEl.innerHTML = '';
    wsSpectrogramEl.innerHTML = '';
    wsSpectrogramPlayheadEl = null;
    lowpassFilterNode = null;

    waveSurfer = window.WaveSurfer.create({
        container: wsWaveformEl,
        height: 160,
        responsive: true,
        normalize: true,
        waveColor: '#111',
        progressColor: '#e11d48',
        cursorColor: '#e11d48',
        plugins: [
            SpectrogramPlugin.create({
                container: wsSpectrogramEl,
                labels: true,
                fftSamples: 1024,
                height: 160,
                frequencyMin: 0,
                frequencyMax: 5500,
                windowFunc: 'hann',
            })
        ]
    });

    const syncUI = () => {
        const dur = waveSurfer.getDuration() || 0;
        const cur = waveSurfer.getCurrentTime() || 0;
        if (audioTime) audioTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
        if (audioToggleBtn) audioToggleBtn.textContent = waveSurfer.isPlaying() ? 'Pause' : 'Play';
        if (audioScrub && !scrubIsDragging) {
            audioScrub.value = dur > 0 ? String(cur / dur) : '0';
        }
        setSpectrogramPlayhead(dur > 0 ? (cur / dur) : 0);
    };

    waveSurfer.on('ready', () => {
        if (audioToggleBtn) audioToggleBtn.disabled = false;
        if (audioScrub) audioScrub.disabled = false;
        setSpectrogramPlayhead(0);
        applyAudioComfortSettings();
        syncUI();
    });
    waveSurfer.on('audioprocess', syncUI);
    waveSurfer.on('seek', syncUI);
    waveSurfer.on('play', syncUI);
    waveSurfer.on('pause', syncUI);
    waveSurfer.on('finish', syncUI);
    waveSurfer.on('error', (e) => {
        console.error('WaveSurfer error:', e);
        updateStatus(`Audio render error:\n${String(e)}`);
    });

    return waveSurfer;
}

// Update status display
function updateStatus(message) {
    if (statusDiv) {
        statusDiv.innerHTML = message;
    }
    console.log('Status:', message);
}

// Update progress bar
function updateProgress(percent, message) {
    if (progressContainer && progressBar) {
        progressContainer.classList.remove('hidden');
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${Math.round(percent)}%`;
    }
    if (progressDetails && message) {
        progressDetails.classList.remove('hidden');
        progressDetails.textContent = message;
    }
}

// Hide progress bar
function hideProgress() {
    if (progressContainer) {
        progressContainer.classList.add('hidden');
    }
    if (progressDetails) {
        progressDetails.classList.add('hidden');
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function prebakedNpyPathForWav(wavPath) {
    // Example: signals/signal1.wav -> signals/preprocessed/signal1.normalized.npy
    const file = String(wavPath || '').split('/').pop() || '';
    const base = file.replace(/\.wav$/i, '');
    return `signals/preprocessed/${base}.normalized.npy`;
}

// Convert PIL Image to base64 and display
function showImage(imageData) {
    outputImage.src = `data:image/png;base64,${imageData}`;
    outputImage.classList.remove('hidden');
}

// Populate signal file list
async function populateSignalList() {
    try {
        const signals = ['noise_48000hz.wav', 'signal1.wav', 'signal2.wav', 'signal3.wav'];
        
        signals.forEach(sig => {
            const option = document.createElement('option');
            option.value = `signals/${sig}`;
            option.text = sig;
            signalSelector.appendChild(option);
        });
        
        updateStatus('Signal files loaded. Select one to begin.');
    } catch (error) {
        updateStatus(`Error loading signal list: ${error.message}`);
    }
}

// Load selected WAV file
async function loadSignal() {
    const selected = signalSelector.value;
    if (!selected) {
        updateStatus('Please select a signal file');
        return;
    }
    
    try {
        loadBtn.disabled = true;
        updateStatus(`Loading ${selected}...`);

        // Reset UI state for a fresh run.
        hideProgress();
        if (outputImage) {
            outputImage.classList.add('hidden');
            outputImage.removeAttribute('src');
        }
        preprocessBtn.disabled = true;
        decodeBtn.disabled = true;
        
        const response = await fetch(selected);
        if (!response.ok) {
            throw new Error(`Failed to load file: HTTP ${response.status}`);
        }
        
        currentSignalData = await response.arrayBuffer();
        currentSignalPath = selected;
        normalizedSignal = null;

        // Audio setup: WaveSurfer waveform + full-file spectrogram
        if (audioObjectUrl) {
            try { URL.revokeObjectURL(audioObjectUrl); } catch (_) {}
            audioObjectUrl = null;
        }

        const blob = new Blob([currentSignalData.slice(0)], { type: 'audio/wav' });
        audioObjectUrl = URL.createObjectURL(blob);

        if (audioEl) audioEl.classList.add('hidden');
        if (audioToggleBtn) {
            audioToggleBtn.disabled = true;
            audioToggleBtn.textContent = 'Play';
        }
        if (audioScrub) {
            audioScrub.disabled = true;
            audioScrub.value = '0';
        }
        if (audioTime) audioTime.textContent = '0:00 / 0:00';

        const ws = ensureWaveSurfer();
        // This triggers a full decode; spectrogram plugin renders the entire file.
        ws.load(audioObjectUrl);
        
        updateStatus(`Loaded ${selected} (${currentSignalData.byteLength} bytes). Ready to preprocess.`);
        preprocessBtn.disabled = false;
        
    } catch (error) {
        updateStatus(`Error loading signal: ${error.message}. Make sure you're running a local web server (e.g., 'python -m http.server 8000') and the file exists in the signals/ folder.`);
        console.error('Fetch error:', error);
        console.error('Attempted to load:', selected);
    } finally {
        loadBtn.disabled = false;
    }
}

// Run signal preprocessor (Python)
async function runPreprocessor() {
    if (!currentSignalPath) {
        updateStatus('No signal loaded');
        return;
    }

    // Preprocessing is done offline now (SciPy). In the browser, we simulate a short
    // "processing" delay and load the pre-baked normalized signal from a `.npy` file.
    ensureComputeWorker();
    if (workerInitFailed) {
        updateStatus('Python worker failed to initialize. Refresh and try again.');
        return;
    }
    if (!workerReady) updateStatus('Starting Python worker...');

    if (preprocessInFlight) return;
    
    try {
        preprocessInFlight = true;
        preprocessBtn.disabled = true;
        decodeBtn.disabled = true;
        updateStatus('Preprocessing signal...');
        updateProgress(10, 'Initializing…');

        // Fake a short delay so the lesson flow still makes sense.
        await sleep(450);
        updateProgress(55, 'Loading pre-baked data…');

        const npyPath = prebakedNpyPathForWav(currentSignalPath);
        const response = await fetch(npyPath, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Missing preprocessed file: ${npyPath} (HTTP ${response.status}). Run the offline preprocessor step.`);
        }

        const npyBytes = await response.arrayBuffer();
        updateProgress(85, 'Preparing data for decoder…');

        const timeoutMs = 30000;
        const resp = await Promise.race([
            workerCall({ type: 'load_prebaked_npy', npyBytes }, [npyBytes]),
            new Promise((_, reject) => setTimeout(() => reject(new Error(
                `Pre-baked load timed out after ${Math.round(timeoutMs / 1000)}s. Hard-refresh the page (Ctrl+Shift+R). If it persists, unregister the COOP/COEP service worker and reload.`
            )), timeoutMs)),
        ]);
        normalizedSignal = resp.normalized;

        updateProgress(100, 'Ready to decode');
        await sleep(150);
        hideProgress();
        
        updateStatus(`Preprocessing complete! Ready to decode.`);
        decodeBtn.disabled = false;
        
    } catch (error) {
        hideProgress();
        updateStatus(`Error during preprocessing:\n${error.message}`);
        console.error(error);
    } finally {
        preprocessInFlight = false;
        preprocessBtn.disabled = false;
    }
}

// Run image decoder (Python)
async function runDecoder() {
    if (!normalizedSignal) {
        updateStatus('No preprocessed signal available');
        return;
    }
    
    ensureComputeWorker();
    if (!workerReady) {
        updateStatus('Python worker not ready yet. Please wait...');
        return;
    }

    if (decodeInFlight) return;
    
    try {
        decodeInFlight = true;
        decodeBtn.disabled = true;
        updateStatus('Decoding image...');

        // Run decoding against the current editor contents.
        if (decoderTextarea) {
            await applyDecoderSourceToWorker(getDecoderSource());
        }

        const timeoutMs = 180000;
        const resp = await Promise.race([
            workerCall({ type: 'decode', normalized: normalizedSignal }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Decode timed out. Try again or refresh.')), timeoutMs)),
        ]);
        showImage(resp.imageBase64);
        
        updateStatus('Decoding complete! Image displayed below.');
        
    } catch (error) {
        updateStatus(`Error during decoding:\n${error.message}`);
        console.error(error);
    } finally {
        decodeInFlight = false;
        decodeBtn.disabled = false;
    }
}

// Event handlers
function setupEventHandlers() {
    signalSelector.addEventListener('change', () => {
        loadBtn.disabled = (signalSelector.value === '');
    });

    loadBtn.addEventListener('click', loadSignal);
    preprocessBtn.addEventListener('click', runPreprocessor);
    decodeBtn.addEventListener('click', runDecoder);

    if (applyDecoderBtn) {
        applyDecoderBtn.addEventListener('click', onApplyDecoderClicked);
    }
    if (resetDecoderBtn) {
        resetDecoderBtn.addEventListener('click', onResetDecoderClicked);
    }

    // Volume + comfort mode controls
    if (volumeSlider) {
        // Set defaults
        setVolumeUI(Number(volumeSlider.value) / 100);
        volumeSlider.addEventListener('input', () => {
            setVolumeUI(Number(volumeSlider.value) / 100);
            applyAudioComfortSettings();
        });
    } else {
        setVolumeUI(uiVolume);
    }

    if (lessAnnoyingCheckbox) {
        uiLessAnnoying = !!lessAnnoyingCheckbox.checked;
        lessAnnoyingCheckbox.addEventListener('change', () => {
            uiLessAnnoying = !!lessAnnoyingCheckbox.checked;
            applyAudioComfortSettings();
        });
    }

    if (!audioInitialized && audioToggleBtn) {
        audioInitialized = true;

        audioToggleBtn?.addEventListener('click', async () => {
            try {
                const ws = ensureWaveSurfer();
                ws.playPause();
            } catch (e) {
                console.error(e);
            }
        });

        audioScrub?.addEventListener('input', () => {
            try {
                scrubIsDragging = true;
                const ws = ensureWaveSurfer();
                const frac = Number(audioScrub.value);
                if (!Number.isFinite(frac)) return;
                ws.seekTo(Math.max(0, Math.min(1, frac)));
            } catch (e) {
                console.error(e);
            }
        });

        audioScrub?.addEventListener('pointerdown', () => { scrubIsDragging = true; });
        audioScrub?.addEventListener('pointerup', () => { scrubIsDragging = false; });
        audioScrub?.addEventListener('change', () => { scrubIsDragging = false; });

        // Scrub directly on the spectrogram (click + drag)
        if (wsSpectrogramEl) {
            wsSpectrogramEl.addEventListener('pointerdown', (ev) => {
                try {
                    const ws = ensureWaveSurfer();
                    spectrogramIsDragging = true;
                    wsSpectrogramEl.setPointerCapture(ev.pointerId);
                    const frac = fracFromPointerEvent(ev, wsSpectrogramEl);
                    ws.seekTo(frac);
                } catch (e) {
                    console.error(e);
                }
            });
            wsSpectrogramEl.addEventListener('pointermove', (ev) => {
                if (!spectrogramIsDragging) return;
                try {
                    const ws = ensureWaveSurfer();
                    const frac = fracFromPointerEvent(ev, wsSpectrogramEl);
                    ws.seekTo(frac);
                } catch (e) {
                    console.error(e);
                }
            });
            const endDrag = (ev) => {
                spectrogramIsDragging = false;
                try { wsSpectrogramEl.releasePointerCapture(ev.pointerId); } catch (_) {}
            };
            wsSpectrogramEl.addEventListener('pointerup', endDrag);
            wsSpectrogramEl.addEventListener('pointercancel', endDrag);
        }
    }
}

// PyScript removed; UI is ready immediately.
pythonReady = true;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    initializeElements();
    setupEventHandlers();
    populateSignalList();
    loadDefaultDecoderSource();
    updateStatus('Starting Python worker...');
    updateProgress(5, 'Starting Python...');
    ensureComputeWorker();
});
