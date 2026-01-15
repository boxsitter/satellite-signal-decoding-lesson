// Dedicated Pyodide worker: runs preprocessing/decoding off the UI thread.
// No SharedArrayBuffer sync required; communicates via postMessage.

self.window = self;

const WORKER_VERSION = '2026-01-14b';

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
  // IMPORTANT: We do not import `signal_preprocessor.py` in the browser worker because it
  // depends on SciPy. Preprocessing is done offline and the web UI loads pre-baked `.npy`.
  beacon('fetch', '/image_decoder.py');
  const decResp = await fetch(`/image_decoder.py?v=${encodeURIComponent(WORKER_VERSION)}`);
  beacon('fetch', '/student_decoder.py');
  const studentResp = await fetch(`/student_decoder.py?v=${encodeURIComponent(WORKER_VERSION)}`);
  if (!decResp.ok) throw new Error(`Failed to fetch /image_decoder.py: HTTP ${decResp.status}`);
  if (!studentResp.ok) throw new Error(`Failed to fetch /student_decoder.py: HTTP ${studentResp.status}`);
  const [dec, student] = await Promise.all([decResp.text(), studentResp.text()]);
  beacon('fs.writeFile');
  pyodide.FS.writeFile('/image_decoder.py', dec);
  pyodide.FS.writeFile('/student_decoder.py', student);

  // Import modules once (surface Python traceback on failure).
  beacon('runPython', 'import modules');
  pyodide.runPython(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')

import image_decoder
import student_decoder

# Quick sanity check: ensure key functions exist.
assert hasattr(image_decoder, 'decode_image')
assert hasattr(student_decoder, 'decode_to_base64')
`);

  ready = true;
  beacon('ready');
  self.postMessage({ type: 'ready', version: WORKER_VERSION });
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
    if (msg.type === 'load_prebaked_npy') {
      // msg.npyBytes is a transferred ArrayBuffer containing a `.npy` file.
      const u8 = new Uint8Array(msg.npyBytes);
      pyodide.globals.set('__npy_u8', u8);
      const out = await pyodide.runPythonAsync(`
import numpy as np
import io

raw = bytes(__npy_u8.to_py())
arr = np.load(io.BytesIO(raw), allow_pickle=False)
arr.astype(np.uint8).tolist()
`);

      const normalizedJs = (out && typeof out.toJs === 'function')
        ? out.toJs({ create_proxies: false })
        : out;
      try { if (out && typeof out.destroy === 'function') out.destroy(); } catch (_) {}
      self.postMessage({ type: 'prebaked_load_done', id: msg.id, normalized: normalizedJs });
      return;
    }

    if (msg.type === 'set_decoder_source') {
      const source = String(msg.source ?? '');
      // Students edit `student_decoder.py`. `image_decoder.py` stays as the stable backend.
      pyodide.FS.writeFile('/student_decoder.py', source);
      await pyodide.runPythonAsync(`
import importlib
    import student_decoder
    importlib.reload(student_decoder)
`);
      self.postMessage({ type: 'set_decoder_done', id: msg.id });
      return;
    }

    if (msg.type === 'decode') {
      pyodide.globals.set('__normalized_list', msg.normalized);
        const b64 = await pyodide.runPythonAsync(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')
import student_decoder

student_decoder.decode_to_base64(__normalized_list)
`);
      const b64Js = (b64 && typeof b64.toJs === 'function')
        ? b64.toJs({ create_proxies: false })
        : b64;
      try { if (b64 && typeof b64.destroy === 'function') b64.destroy(); } catch (_) {}
      self.postMessage({ type: 'decode_done', id: msg.id, imageBase64: b64Js });
      return;
    }

    if (msg.type === 'reload_modules') {
      const dec = await fetch(`/image_decoder.py?v=${encodeURIComponent(WORKER_VERSION)}`).then(r => r.text());
      const student = await fetch(`/student_decoder.py?v=${encodeURIComponent(WORKER_VERSION)}`).then(r => r.text());
      pyodide.FS.writeFile('/image_decoder.py', dec);
      pyodide.FS.writeFile('/student_decoder.py', student);
      await pyodide.runPythonAsync(`
import importlib
import image_decoder
    import student_decoder
importlib.reload(image_decoder)
    importlib.reload(student_decoder)
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
