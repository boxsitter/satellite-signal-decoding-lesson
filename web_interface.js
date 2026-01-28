/**
 * Web interface for NOAA APT satellite decoder
 * Handles UI interactions and calls Python modules via PyScript
 */

// Tab switching
function switchLeftPanel(panelName) {
    document.querySelectorAll('.left-panel .panel-content').forEach(panel => {
        panel.classList.remove('active');
    });
    document.querySelectorAll('.left-panel .panel-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const panel = document.getElementById(panelName + '-panel');
    if (panel) {
        panel.classList.add('active');
    }
    
    const tabButtons = document.querySelectorAll('.left-panel .panel-tab');
    tabButtons.forEach((tab, index) => {
        const panelNames = ['audio', 'decoder'];
        if (panelNames[index] === panelName) {
            tab.classList.add('active');
        }
    });
    
    // Show/hide decoder-only buttons
    const decoderOnlyButtons = document.querySelectorAll('.decoder-only');
    decoderOnlyButtons.forEach(btn => {
        if (panelName === 'decoder') {
            btn.style.display = '';
        } else {
            btn.style.display = 'none';
        }
    });
    
    // Refresh CodeMirror when decoder panel is shown
    if (panelName === 'decoder' && decoderEditor) {
        decoderEditor.refresh();
    }
}

function switchAudioSubTab(tabName) {
    document.querySelectorAll('.nested-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.nested-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const content = document.getElementById(tabName + '-tab');
    if (content) {
        content.classList.add('active');
    }
    
    const tabButtons = document.querySelectorAll('.nested-tab');
    tabButtons.forEach((tab, index) => {
        const tabNames = ['audio-viz', 'data-viz'];
        if (tabNames[index] === tabName) {
            tab.classList.add('active');
        }
    });
}

function switchRightPanel(panelName) {
    document.querySelectorAll('.right-panel .panel-content').forEach(panel => {
        panel.classList.remove('active');
    });
    document.querySelectorAll('.right-panel .panel-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const panel = document.getElementById(panelName + '-panel');
    if (panel) {
        panel.classList.add('active');
    }
    
    const tabButtons = document.querySelectorAll('.right-panel .panel-tab');
    tabButtons.forEach((tab, index) => {
        const panelNames = ['output', 'terminal', 'api'];
        if (panelNames[index] === panelName) {
            tab.classList.add('active');
        }
    });
    
    // Hide notification dot when switching to output panel
    if (panelName === 'output') {
        const notification = document.getElementById('output-notification');
        if (notification) {
            notification.classList.add('hidden');
        }
    }
    
    // Refresh CodeMirror when API panel is shown
    if (panelName === 'api' && apiReferenceEditor) {
        apiReferenceEditor.refresh();
    }
}

// Legacy function for compatibility
function switchOutputPanel(panelName) {
    switchRightPanel(panelName);
}

async function exportProject() {
    try {
        // Check if JSZip is available
        if (typeof JSZip === 'undefined') {
            alert('Export functionality is not available. Please refresh the page and try again.');
            return;
        }
        
        // Check if there's an image to export
        const img = document.getElementById('output-image');
        if (!img || img.classList.contains('hidden') || !img.src) {
            alert('No decoded image available to export. Run the mission first.');
            return;
        }
        
        // Get the current student code
        const studentCode = getDecoderSource();
        if (!studentCode) {
            alert('No code to export.');
            return;
        }
        
        // Create a new JSZip instance
        const zip = new JSZip();
        
        // Add the student code
        zip.file('mission_control.py', studentCode);
        
        // Convert image to blob and add to zip
        // Extract base64 data from data URL
        const base64Data = img.src.split(',')[1];
        zip.file('decoded_earth.png', base64Data, { base64: true });
        
        // Add a README
        const readme = `NOAA Satellite Signal Decoder - Exported Project
======================================================

This export contains:
- mission_control.py: Your decoder implementation
- decoded_earth.png: The decoded satellite image

Export Date: ${new Date().toLocaleString()}

To run this code locally:
1. Install required packages: pip install numpy pillow
2. Ensure you have the signal data files
3. Run: python mission_control.py
`;
        zip.file('README.txt', readme);
        
        // Generate the zip file
        const blob = await zip.generateAsync({ type: 'blob' });
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `satellite-decoder-${timestamp}.zip`;
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up the object URL
        URL.revokeObjectURL(url);
        
        console.log('Project exported successfully');
        
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export project. Please try again.');
    }
}

function visualizeSignalData(signalArray, centerSample) {
    if (!signalArray || signalArray.length === 0) {
        return;
    }
    
    // If centerSample not provided, default to start
    if (centerSample === undefined || centerSample === null) {
        centerSample = 0;
    }
    
    // Calculate statistics
    const length = signalArray.length;
    const min = Math.min(...signalArray.slice(0, Math.min(10000, length)));
    const max = Math.max(...signalArray.slice(0, Math.min(10000, length)));
    const sum = signalArray.slice(0, Math.min(10000, length)).reduce((a, b) => a + b, 0);
    const mean = sum / Math.min(10000, length);
    
    // Display statistics
    const statsDiv = document.getElementById('signal-stats');
    if (statsDiv) {
        statsDiv.innerHTML = `
            <div><strong>Total Samples:</strong> ${length.toLocaleString()} points</div>
            <div><strong>Sample Rate:</strong> 4160 Hz (after preprocessing)</div>
            <div><strong>Duration:</strong> ~${(length / 4160).toFixed(2)} seconds</div>
            <div><strong>Current Position:</strong> Sample ${centerSample.toLocaleString()} (${(centerSample / 4160).toFixed(2)}s)</div>
            <div><strong>Value Range:</strong> ${min.toFixed(2)} to ${max.toFixed(2)}</div>
            <div><strong>Mean Value:</strong> ${mean.toFixed(2)}</div>
        `;
    }
    
    // Calculate window around center sample
    const windowSize = signalZoomLevel;
    const halfWindow = Math.floor(windowSize / 2);
    const startSample = Math.max(0, centerSample - halfWindow);
    const endSample = Math.min(length, centerSample + halfWindow);
    
    // Draw signal visualization
    const canvas = document.getElementById('signal-canvas');
    const canvasHeading = canvas?.previousElementSibling;
    if (canvasHeading && canvasHeading.tagName === 'H3') {
        canvasHeading.textContent = `Signal Window (Samples ${startSample.toLocaleString()}-${endSample.toLocaleString()})`;
    }
    
    // Draw signal visualization
    if (canvas) {
        const ctx = canvas.getContext('2d');
        
        // Set canvas resolution for sharp rendering
        const displayWidth = 800;
        const displayHeight = 300;
        const dpr = window.devicePixelRatio || 1;
        
        // Set actual canvas size (accounting for device pixel ratio)
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        
        // Set display size via CSS
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        
        // Scale context to match device pixel ratio
        ctx.scale(dpr, dpr);
        
        const width = displayWidth;
        const height = displayHeight;
        
        // Clear canvas
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const y = (i / 10) * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw center line (playhead position)
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const centerX = width / 2;
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();
        
        // Sample the signal window using min-max envelope for anti-aliasing
        const samplesToShow = endSample - startSample;
        const samplesPerPixel = samplesToShow / width;
        
        ctx.strokeStyle = '#3498db';
        ctx.fillStyle = '#3498db';
        ctx.lineWidth = 1;
        
        if (samplesPerPixel <= 1) {
            // High zoom: draw line through each sample
            ctx.beginPath();
            for (let i = 0; i < width; i++) {
                const sampleIndex = startSample + Math.floor(i * samplesPerPixel);
                if (sampleIndex >= endSample) break;
                
                const value = signalArray[sampleIndex];
                const x = i;
                const y = height - (value / 255) * height;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } else {
            // Low zoom: use min-max envelope to prevent aliasing
            for (let i = 0; i < width; i++) {
                const startIdx = startSample + Math.floor(i * samplesPerPixel);
                const endIdx = startSample + Math.floor((i + 1) * samplesPerPixel);
                
                if (startIdx >= endSample) break;
                
                // Find min and max in this pixel's sample range
                let min = Infinity;
                let max = -Infinity;
                for (let j = startIdx; j < Math.min(endIdx, endSample); j++) {
                    const value = signalArray[j];
                    if (value < min) min = value;
                    if (value > max) max = value;
                }
                
                // Draw vertical line from min to max
                const x = i;
                const yMin = height - (min / 255) * height;
                const yMax = height - (max / 255) * height;
                
                ctx.beginPath();
                ctx.moveTo(x, yMax);
                ctx.lineTo(x, yMin);
                ctx.stroke();
            }
        }
        
        // Draw axis labels
        ctx.fillStyle = 'black';
        ctx.font = '11px monospace';
        ctx.fillText('0', 5, height - 5);
        ctx.fillText('255', 5, 15);
        ctx.fillText(`Samples ${startSample.toLocaleString()} - ${endSample.toLocaleString()}`, width - 220, height - 5);
        
        // Draw raw data window indicator (100 samples around playhead)
        const rawDataWindowSize = 100;
        const rawDataStart = centerSample;
        const rawDataEnd = centerSample + rawDataWindowSize;
        
        // Calculate pixel positions for the raw data window
        if (rawDataStart >= startSample && rawDataStart < endSample) {
            const rawStartPixel = ((rawDataStart - startSample) / samplesToShow) * width;
            const rawEndPixel = Math.min(((rawDataEnd - startSample) / samplesToShow) * width, width);
            const rawWidth = rawEndPixel - rawStartPixel;
            
            // Draw semi-transparent overlay
            ctx.fillStyle = 'rgba(46, 204, 113, 0.2)'; // Green with 20% opacity
            ctx.fillRect(rawStartPixel, 0, rawWidth, height);
            
            // Draw borders
            ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(rawStartPixel, 0);
            ctx.lineTo(rawStartPixel, height);
            ctx.stroke();
            
            if (rawEndPixel < width) {
                ctx.beginPath();
                ctx.moveTo(rawEndPixel, 0);
                ctx.lineTo(rawEndPixel, height);
                ctx.stroke();
            }
            
            // Add label
            ctx.fillStyle = 'rgba(46, 204, 113, 1)';
            ctx.font = 'bold 10px monospace';
            const labelX = Math.min(rawStartPixel + 5, width - 80);
            ctx.fillText('Raw Data', labelX, 15);
        }
    }
    
    // Show raw data sample around center
    const rawSamplePre = document.getElementById('signal-raw-sample');
    if (rawSamplePre) {
        const rawStart = Math.max(0, centerSample);
        const rawEnd = Math.min(length, centerSample + 100);
        const sample = Array.from(signalArray.slice(rawStart, rawEnd));
        
        // Update the heading
        const rawHeading = rawSamplePre.previousElementSibling;
        if (rawHeading && rawHeading.tagName === 'H3') {
            rawHeading.textContent = `Raw Data (Samples ${rawStart.toLocaleString()}-${rawEnd.toLocaleString()})`;
        }
        
        let formatted = '';
        for (let i = 0; i < sample.length; i += 10) {
            const chunk = sample.slice(i, i + 10);
            const actualIndex = rawStart + i;
            const values = chunk.map(v => v.toFixed(1).padStart(6, ' ')).join(', ');
            formatted += `[${actualIndex.toString().padStart(7, ' ')}]: ${values}\n`;
        }
        rawSamplePre.textContent = formatted;
    }
}

function updateSignalVisualization() {
    if (!currentSignalData) return;
    
    // Get current time from WaveSurfer
    if (!waveSurfer) return;
    
    // Convert current audio time to sample number
    // Sample rate is 4160 Hz after preprocessing
    const currentTime = waveSurfer.getCurrentTime();
    const sampleRate = 4160;
    const centerSample = Math.floor(currentTime * sampleRate);
    
    // Update the visualization
    visualizeSignalData(currentSignalData, centerSample);
}

function showImageOnOutputTab(imageData) {
    const outputImage = document.getElementById('output-image');
    const outputEmpty = document.getElementById('output-empty');
    
    if (imageData) {
        outputImage.src = imageData;
        outputImage.classList.remove('hidden');
        if (outputEmpty) outputEmpty.classList.add('hidden');
    } else {
        outputImage.classList.add('hidden');
        if (outputEmpty) outputEmpty.classList.remove('hidden');
    }
}

let currentSignalData = null;
let normalizedSignal = null;
let currentSignalPath = null;
let pythonReady = false;
let pyInterpreter = null;
let pyWorker = null;
let pyWorkerApi = null;
let preprocessInFlight = false;
let decodeInFlight = false;
let currentLoadingAbortController = null;

// Audio UI/state
let audioEl, audioToggleBtn, audioScrub, audioTime;
let audioObjectUrl = null;
let wsWaveformEl = null;
let wsSpectrogramEl = null;
let waveSurfer = null;
let scrubIsDragging = false;
let wsSpectrogramPlayheadEl = null;
let spectrogramIsDragging = false;
let audioViewerLoading = null;
let audioViewerContent = null;

// Dedicated Pyodide worker (no SharedArrayBuffer required)
let computeWorker = null;
let workerReady = false;
let workerInitFailed = false;
let workerReqId = 0;
const workerPending = new Map();
// Bump this to force browsers/SW to fetch a fresh worker script.
const WORKER_VERSION = '2026-01-27b';

function logToMission(text) {
    if (!missionLog) return;
    missionLog.textContent += text + '\n';
    missionLog.scrollTop = missionLog.scrollHeight;
}

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
            logToMission(msg.text);
            console.log('[pyodide worker stdout]', msg.text);
            return;
        }
        if (msg.type === 'py_stderr') {
            logToMission('[STDERR] ' + msg.text);
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
let signalSelector, loadBtn, statusDiv, missionLog, outputImage;
let progressContainer, progressBar, progressDetails;
let audioInitialized = false;
let volumeSlider, volumeValue, lessAnnoyingCheckbox;

// Live decoder editor
let decoderTextarea, applyDecoderBtn, resetDecoderBtn, decoderStatus;
let decoderEditor = null;
let defaultDecoderSource = null;
let lastAppliedDecoderSource = null;
let apiReferenceEditor = null;
let signalZoomLevel = 8000; // Default zoom level in samples
let signalCanvasDragging = false;
let signalCanvasDragStart = 0;

let uiVolume = 0.5; // Default to 50% volume (25 on slider)
let uiLessAnnoying = true;
let lowpassFilterNode = null;

// Initialize DOM elements after page loads
function initializeElements() {
    signalSelector = document.getElementById('signal-selector');
    loadBtn = document.getElementById('load-signal-btn');
    statusDiv = document.getElementById('status');
    missionLog = document.getElementById('mission-log');
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
    audioViewerLoading = document.getElementById('audio-viewer-loading');
    audioViewerContent = document.getElementById('audio-viewer-content');

    volumeSlider = document.getElementById('volume-slider');
    volumeValue = document.getElementById('volume-value');
    lessAnnoyingCheckbox = document.getElementById('less-annoying');
}

function showAudioLoading() {
    if (audioViewerLoading) audioViewerLoading.classList.remove('hidden');
    if (audioViewerContent) audioViewerContent.classList.add('loading');
}

function hideAudioLoading() {
    if (audioViewerLoading) audioViewerLoading.classList.add('hidden');
    if (audioViewerContent) audioViewerContent.classList.remove('loading');
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

function initApiReferenceEditor() {
    const apiTextarea = document.getElementById('api-reference');
    if (!apiTextarea) return;
    if (apiReferenceEditor) return;

    if (!window.CodeMirror) {
        apiTextarea.style.width = '100%';
        apiTextarea.style.minHeight = '360px';
        return;
    }

    apiReferenceEditor = window.CodeMirror.fromTextArea(apiTextarea, {
        mode: 'python',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        viewportMargin: Infinity,
        readOnly: true,
        cursorBlinkRate: -1, // Hide cursor for read-only
    });
}

async function loadApiReference() {
    try {
        const resp = await fetch('/decoder_api.py', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`Failed to load decoder_api.py (HTTP ${resp.status})`);
        const text = await resp.text();
        
        const apiTextarea = document.getElementById('api-reference');
        if (apiTextarea) {
            apiTextarea.value = text;
        }
        
        initApiReferenceEditor();
        
        if (apiReferenceEditor) {
            apiReferenceEditor.setValue(text);
        }
    } catch (e) {
        console.error('Failed to load API reference:', e);
    }
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
    if (decoderTextarea) {
        decoderTextarea.value = s;
    }
}

async function loadDefaultDecoderSource() {
    if (!decoderTextarea) return;

    try {
        setDecoderStatus('Loading default decoder…');
        if (resetDecoderBtn) resetDecoderBtn.disabled = true;

        const resp = await fetch(`/mission_control.py?v=${encodeURIComponent(WORKER_VERSION)}`, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`Failed to load /mission_control.py (HTTP ${resp.status})`);
        const text = await resp.text();

        defaultDecoderSource = text;
        lastAppliedDecoderSource = null;
        
        // Set the code using the proper setter which handles both textarea and CodeMirror
        setDecoderSource(text);

        if (resetDecoderBtn) resetDecoderBtn.disabled = false;
        setDecoderStatus('Ready.');
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
    
    // Show confirmation dialog
    const confirmed = confirm(
        "Are you sure you want to reset?\n\n" +
        "This will discard all your current changes and restore the default code. " +
        "This action cannot be undone."
    );
    
    if (!confirmed) {
        return; // User cancelled
    }
    
    setDecoderSource(defaultDecoderSource);
    lastAppliedDecoderSource = null;
    setDecoderStatus('Reset.');
}

function setVolumeUI(vol01) {
    // vol01 is actual volume (0 to 2 range)
    // Convert back to slider value (0-100)
    uiVolume = Math.max(0, Math.min(2, Number(vol01)));
    const sliderVal = uiVolume * 50;
    if (volumeSlider) volumeSlider.value = String(Math.round(sliderVal));
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
    waveSurfer.on('audioprocess', () => {
        syncUI();
        updateSignalVisualization();
    });
    waveSurfer.on('seek', () => {
        syncUI();
        updateSignalVisualization();
    });
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
    const imgSrc = `data:image/png;base64,${imageData}`;
    outputImage.src = imgSrc;
    outputImage.classList.remove('hidden');
    
    // Show export button when image is available
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.classList.remove('hidden');
    }
    
    // Update the output panel
    showImageOnOutputTab(imgSrc);
    
    // Show notification dot if output panel is not currently active
    const outputPanel = document.getElementById('output-panel');
    const notification = document.getElementById('output-notification');
    if (outputPanel && !outputPanel.classList.contains('active') && notification) {
        notification.classList.remove('hidden');
    }
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
    
    // Abort any previous loading operation
    if (currentLoadingAbortController) {
        currentLoadingAbortController.abort();
    }
    currentLoadingAbortController = new AbortController();
    const abortSignal = currentLoadingAbortController.signal;
    
    try {
        loadBtn.disabled = true;
        
        // Show loading overlay
        showAudioLoading();
        
        updateStatus(`Loading ${selected}...`);

        // Reset UI state for a fresh run.
        hideProgress();
        if (outputImage) {
            outputImage.classList.add('hidden');
            outputImage.removeAttribute('src');
        }
        
        const response = await fetch(selected, { signal: abortSignal });
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

        // Load audio in WaveSurfer and wait for it to be ready
        const ws = ensureWaveSurfer();
        
        // Create a promise that resolves when WaveSurfer is ready
        const waveSurferReady = new Promise((resolve) => {
            ws.once('ready', resolve);
        });
        
        // This triggers a full decode; spectrogram plugin renders the entire file.
        ws.load(audioObjectUrl);
        
        updateStatus(`Rendering waveform and spectrogram...`);
        
        // Wait for WaveSurfer to finish loading and rendering
        await waveSurferReady;
        
        updateStatus(`Audio loaded. Fetching preprocessed data...`);
        const npyPath = prebakedNpyPathForWav(selected);
        const npyResp = await fetch(npyPath, { signal: abortSignal });
        if (!npyResp.ok) throw new Error(`Missing preprocessed data: ${npyPath}`);
        const npyBytes = await npyResp.arrayBuffer();

        // Parse the signal data BEFORE transferring to worker
        // Simple numpy .npy parser for float64 arrays
        const npyView = new DataView(npyBytes);
        const headerLen = npyView.getUint16(8, true); // Little-endian
        const arrayDataStart = 10 + headerLen;
        
        // Create Float64Array from the data portion
        const signalData = new Float64Array(npyBytes, arrayDataStart);
        
        // Clone the data for visualization (since we'll transfer npyBytes to worker)
        const signalDataCopy = new Float64Array(signalData);
        
        // Store for playhead updates
        currentSignalData = signalDataCopy;

        updateStatus(`Sending data to Mission Control...`);
        // Extract just the filename from the path
        const filename = npyPath.split('/').pop();
        await workerCall({ type: 'load_prebaked_npy', npyBytes, filename }, [npyBytes]);
    

        updateStatus(`Mission Ready. Signal: ${selected}`);
        if (applyDecoderBtn) applyDecoderBtn.disabled = false;
        
        // Visualize the signal data at the start
        visualizeSignalData(signalDataCopy, 0);
        
        // Add listener to update visualization on playhead changes
        const audioPlayer = document.getElementById('audio-player');
        if (audioPlayer) {
            // Remove any existing listener
            audioPlayer.removeEventListener('timeupdate', updateSignalVisualization);
            // Add new listener
            audioPlayer.addEventListener('timeupdate', updateSignalVisualization);
        }
        
        // Hide loading overlay once everything is ready
        hideAudioLoading();
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Load operation was aborted');
            return;
        }
        hideAudioLoading();
        updateStatus(`Error loading signal: ${error.message}. Make sure you're running a local web server (e.g., 'python -m http.server 8000') and the file exists in the signals/ folder.`);
        console.error('Fetch error:', error);
        console.error('Attempted to load:', selected);
    } finally {
        loadBtn.disabled = false;
        currentLoadingAbortController = null;
    }
}

// Run the mission (Python)
async function runMission() {
    ensureComputeWorker();
    if (workerInitFailed) {
        updateStatus('Python worker failed to initialize. Refresh and try again.');
        return;
    }
    if (!workerReady) {
        updateStatus('Python worker not ready yet. Please wait...');
        return;
    }

    if (decodeInFlight) return;
    
    try {
        decodeInFlight = true;
        if (applyDecoderBtn) applyDecoderBtn.disabled = true;
        
        updateStatus('Mission Control: Executing decoding sequence...');
        
        if (outputImage) outputImage.classList.add('hidden');
        if (missionLog) missionLog.textContent = ''; // Clear log

        // Run the mission in the worker
        const source = getDecoderSource();
        // Extract just the filename from the path for the worker filesystem
        // e.g., "signals/signal1.wav" -> "signal1.normalized.npy"
        let signalFilename = 'signal1.normalized.npy'; // default
        if (currentSignalPath) {
            const npyPath = prebakedNpyPathForWav(currentSignalPath);
            signalFilename = npyPath.split('/').pop();
        }
        const resp = await workerCall({ type: 'run_mission', source, signalFilename });
    

        if (resp.image) {
            showImage(resp.image);
            updateStatus('Mission Success: Image recovered from signal.');
        } else {
            updateStatus('Mission Complete. No image output generated.');
        }
        
    } catch (error) {
        updateStatus(`Mission Failed:\n${error.message}`);
        console.error(error);
    } finally {
        decodeInFlight = false;
        if (applyDecoderBtn) applyDecoderBtn.disabled = false;
    }
}

// Event handlers
function setupEventHandlers() {
    signalSelector.addEventListener('change', () => {
        loadBtn.disabled = (signalSelector.value === '');
    });

    loadBtn.addEventListener('click', loadSignal);
    
    if (applyDecoderBtn) {
        applyDecoderBtn.addEventListener('click', runMission);
    }
    if (resetDecoderBtn) {
        resetDecoderBtn.addEventListener('click', onResetDecoderClicked);
    }

    // Volume + comfort mode controls
    if (volumeSlider) {
        // Set defaults
        setVolumeUI(Number(volumeSlider.value) / 100);
        volumeSlider.addEventListener('input', () => {
            // Slider range 0-100, where 50 = 100% volume
            // Formula: actualVolume = sliderValue / 50
            const sliderVal = Number(volumeSlider.value);
            const actualVolume = sliderVal / 50; // 0-2 range
            setVolumeUI(actualVolume);
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
                
                // Update signal visualization when scrubbing
                updateSignalVisualization();
            } catch (e) {
                console.error(e);
            }
        });

        audioScrub?.addEventListener('pointerdown', () => { scrubIsDragging = true; });
        audioScrub?.addEventListener('pointerup', () => { scrubIsDragging = false; });
        audioScrub?.addEventListener('change', () => { scrubIsDragging = false; });

        // Signal zoom slider
        const signalZoomSlider = document.getElementById('signal-zoom-slider');
        const signalZoomLabel = document.getElementById('signal-zoom-label');
        signalZoomSlider?.addEventListener('input', () => {
            signalZoomLevel = Number(signalZoomSlider.value);
            if (signalZoomLabel) {
                signalZoomLabel.textContent = `${signalZoomLevel.toLocaleString()} samples`;
            }
            // Update visualization immediately
            updateSignalVisualization();
        });

        // Signal canvas dragging for scrubbing
        const signalCanvas = document.getElementById('signal-canvas');
        if (signalCanvas) {
            signalCanvas.style.cursor = 'grab';
            
            signalCanvas.addEventListener('pointerdown', (e) => {
                signalCanvasDragging = true;
                signalCanvasDragStart = e.clientX;
                signalCanvas.style.cursor = 'grabbing';
                e.preventDefault();
            });
            
            signalCanvas.addEventListener('pointermove', (e) => {
                if (!signalCanvasDragging) return;
                if (!waveSurfer || !currentSignalData) return;
                
                const deltaX = e.clientX - signalCanvasDragStart;
                signalCanvasDragStart = e.clientX;
                
                // Calculate time delta based on drag distance and zoom level
                // More zoomed in = more sensitive (smaller window = larger time change per pixel)
                const canvasWidth = 800; // Display width
                const sampleRate = 4160;
                const samplesPerPixel = signalZoomLevel / canvasWidth;
                const sampleDelta = -deltaX * samplesPerPixel; // Negative because drag left = move forward
                const timeDelta = sampleDelta / sampleRate;
                
                // Update audio position
                const currentTime = waveSurfer.getCurrentTime();
                const duration = waveSurfer.getDuration();
                const newTime = Math.max(0, Math.min(duration, currentTime + timeDelta));
                
                waveSurfer.seekTo(newTime / duration);
                
                e.preventDefault();
            });
            
            signalCanvas.addEventListener('pointerup', () => {
                signalCanvasDragging = false;
                signalCanvas.style.cursor = 'grab';
            });
            
            signalCanvas.addEventListener('pointerleave', () => {
                if (signalCanvasDragging) {
                    signalCanvasDragging = false;
                    signalCanvas.style.cursor = 'grab';
                }
            });
        }

        // Scrub directly on the waveform (click + drag)
        if (wsWaveformEl) {
            wsWaveformEl.addEventListener('pointerdown', (ev) => {
                try {
                    const ws = ensureWaveSurfer();
                    scrubIsDragging = true;
                    wsWaveformEl.setPointerCapture(ev.pointerId);
                    const frac = fracFromPointerEvent(ev, wsWaveformEl);
                    ws.seekTo(frac);
                } catch (e) {
                    console.error(e);
                }
            });
            wsWaveformEl.addEventListener('pointermove', (ev) => {
                if (!scrubIsDragging) return;
                try {
                    const ws = ensureWaveSurfer();
                    const frac = fracFromPointerEvent(ev, wsWaveformEl);
                    ws.seekTo(frac);
                } catch (e) {
                    console.error(e);
                }
            });
            const endDrag = (ev) => {
                scrubIsDragging = false;
                try { wsWaveformEl.releasePointerCapture(ev.pointerId); } catch (_) {}
            };
            wsWaveformEl.addEventListener('pointerup', endDrag);
            wsWaveformEl.addEventListener('pointercancel', endDrag);
        }

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
    
    // Initialize CodeMirror first, then load the default code
    // Use setTimeout to ensure all deferred scripts have fully executed
    setTimeout(() => {
        initDecoderEditor();
        loadDefaultDecoderSource();
        loadApiReference();
    }, 0);
    
    updateStatus('Starting Python worker...');
    updateProgress(5, 'Starting Python...');
    ensureComputeWorker();
});
