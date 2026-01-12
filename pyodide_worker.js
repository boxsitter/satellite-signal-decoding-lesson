// Dedicated Pyodide worker: runs preprocessing/decoding off the UI thread.
// No SharedArrayBuffer sync required; communicates via postMessage.

self.window = self;

let pyodide = null;
let ready = false;
let initFailed = false;

function beacon(step, detail) {
  self.postMessage({ type: 'init_step', step, detail: detail ? String(detail) : undefined });
}

async function init() {
  // Load Pyodide.
  beacon('importScripts');
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');

  beacon('loadPyodide');
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
  });

  // Capture Python stdout/stderr to help debug init/import failures.
  try {
    pyodide.setStdout({ batched: (s) => self.postMessage({ type: 'py_stdout', text: s }) });
    pyodide.setStderr({ batched: (s) => self.postMessage({ type: 'py_stderr', text: s }) });
  } catch (_) {}

  // Install packages.
  // NOTE: Avoid SciPy here. It can fail to load reliably in some Pyodide+Firefox worker setups.
  beacon('loadPackage', 'numpy,pillow');
  await pyodide.loadPackage(['numpy', 'pillow']);

  // Load local student-editable modules.
  beacon('fetch', '/signal_preprocessor.py');
  const preResp = await fetch('/signal_preprocessor.py');
  beacon('fetch', '/image_decoder.py');
  const decResp = await fetch('/image_decoder.py');
  if (!preResp.ok) throw new Error(`Failed to fetch /signal_preprocessor.py: HTTP ${preResp.status}`);
  if (!decResp.ok) throw new Error(`Failed to fetch /image_decoder.py: HTTP ${decResp.status}`);
  const [pre, dec] = await Promise.all([preResp.text(), decResp.text()]);
  beacon('fs.writeFile');
  pyodide.FS.writeFile('/signal_preprocessor.py', pre);
  pyodide.FS.writeFile('/image_decoder.py', dec);

  // Import modules once (surface Python traceback on failure).
  beacon('runPython', 'import modules');
  pyodide.runPython(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')

import signal_preprocessor
import image_decoder

# Quick sanity check: ensure key functions exist.
assert hasattr(signal_preprocessor, 'preprocess_signal')
assert hasattr(image_decoder, 'decode_image')
`);

  ready = true;
  beacon('ready');
  self.postMessage({ type: 'ready' });
}

const initPromise = init().catch((err) => {
  initFailed = true;
  const message = (err && (err.message || err.toString && err.toString())) ? (err.message || err.toString()) : String(err);
  self.postMessage({
    type: 'init_error',
    error: String(err?.stack || message || err),
  });
});

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (!ready) {
    if (initFailed) return;
    await initPromise;
  }
  if (!ready) return;

  try {
    if (msg.type === 'preprocess') {
      // msg.wavBytes is transferred ArrayBuffer
      const u8 = new Uint8Array(msg.wavBytes);
      pyodide.globals.set('__wav_u8', u8);
        const out = await pyodide.runPythonAsync(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')
import numpy as np
import signal_preprocessor

wav_bytes = bytes(__wav_u8.to_py())
normalized = signal_preprocessor.preprocess_signal(wav_bytes)
normalized.astype(np.uint8).tolist()
`);
      // Pyodide can return a PyProxy; convert to a plain JS array for postMessage.
      const normalizedJs = (out && typeof out.toJs === 'function')
        ? out.toJs({ create_proxies: false })
        : out;
      try { if (out && typeof out.destroy === 'function') out.destroy(); } catch (_) {}
      self.postMessage({ type: 'preprocess_done', id: msg.id, normalized: normalizedJs });
      return;
    }

    if (msg.type === 'decode') {
      pyodide.globals.set('__normalized_list', msg.normalized);
        const b64 = await pyodide.runPythonAsync(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')
import numpy as np
import image_decoder
import io, base64

normalized = np.array(__normalized_list, dtype=np.uint8)
pil_image = image_decoder.decode_image(normalized, save_full_image=False)

buf = io.BytesIO()
pil_image.save(buf, format='PNG')
buf.seek(0)
base64.b64encode(buf.read()).decode('ascii')
`);
      const b64Js = (b64 && typeof b64.toJs === 'function')
        ? b64.toJs({ create_proxies: false })
        : b64;
      try { if (b64 && typeof b64.destroy === 'function') b64.destroy(); } catch (_) {}
      self.postMessage({ type: 'decode_done', id: msg.id, imageBase64: b64Js });
      return;
    }

    if (msg.type === 'reload_modules') {
      const [pre, dec] = await Promise.all([
        fetch('/signal_preprocessor.py').then(r => r.text()),
        fetch('/image_decoder.py').then(r => r.text()),
      ]);
      pyodide.FS.writeFile('/signal_preprocessor.py', pre);
      pyodide.FS.writeFile('/image_decoder.py', dec);
      await pyodide.runPythonAsync(`
import importlib
import signal_preprocessor, image_decoder
importlib.reload(signal_preprocessor)
importlib.reload(image_decoder)
`);
      self.postMessage({ type: 'reload_done', id: msg.id });
      return;
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      phase: msg.type,
      error: String(err?.stack || err),
    });
  }
};
