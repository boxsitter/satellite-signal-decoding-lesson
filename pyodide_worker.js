// Dedicated Pyodide worker: runs decoding off the UI thread.
// No SharedArrayBuffer sync required; communicates via postMessage.

self.window = self;

const WORKER_VERSION = '2026-01-27b';

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

  // Capture Python stdout/stderr to help debug.
  try {
    pyodide.setStdout({ batched: (s) => self.postMessage({ type: 'py_stdout', text: s }) });
    pyodide.setStderr({ batched: (s) => self.postMessage({ type: 'py_stderr', text: s }) });
  } catch (_) {}

  // Install packages.
  beacon('loadPackage', 'numpy,pillow');
  await pyodide.loadPackage(['numpy', 'pillow']);

  // Load modules.
  beacon('fetch', '/decoder_api.py');
  const apiResp = await fetch(`/decoder_api.py?v=${encodeURIComponent(WORKER_VERSION)}`);
  
  if (!apiResp.ok) throw new Error(`Failed to fetch /decoder_api.py: HTTP ${apiResp.status}`);
  
  const apiCode = await apiResp.text();
  
  beacon('fs.writeFile');
  // Write decoder_api.py to the filesystem so it can be imported
  pyodide.FS.writeFile('/decoder_api.py', apiCode);

  // Setup environment
  beacon('runPython', 'setup');
  pyodide.runPython(`
import sys
import os
if '/' not in sys.path:
    sys.path.insert(0, '/')
import decoder_api
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
      // msg.npyBytes is a transferred ArrayBuffer containing a '.npy' file.
      // Store the filename for later use in run_mission
      const filename = msg.filename || 'signal1.normalized.npy';
      const u8 = new Uint8Array(msg.npyBytes);
      pyodide.FS.writeFile(`/${filename}`, u8);
      
      // Store the filename globally so run_mission can use it
      self.currentSignalFilename = filename;
      
      self.postMessage({ type: 'prebaked_load_done', id: msg.id });
      return;
    }

    if (msg.type === 'run_mission') {
        const studentCode = msg.source;
        const signalFilename = msg.signalFilename || self.currentSignalFilename || 'signal1.normalized.npy';
        
        // Write the current code to a file for debugging/persistence if needed
        pyodide.FS.writeFile('/mission_control.py', studentCode);

        // Run the code. 
        // We ensure we are in the root directory where the files are.
        await pyodide.runPythonAsync("import os; os.chdir('/')");
        
        // Set sys.argv so that when the student code runs with "if __name__ == '__main__'",
        // it will pick up the correct signal filename
        await pyodide.runPythonAsync(`
import sys
sys.argv = ['mission_control.py', '/${signalFilename}']
`);
        
        // Run the student code - the if __name__ == "__main__" block will execute
        await pyodide.runPythonAsync(studentCode);
    
        
        // Check if image exists and send it back
        let imageB64 = null;
        if (pyodide.FS.analyzePath('/decoded_earth.png').exists) {
            const imgBytes = pyodide.FS.readFile('/decoded_earth.png');
            let binary = '';
            const len = imgBytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(imgBytes[i]);
            }
            imageB64 = btoa(binary);
        }

        self.postMessage({ type: 'decode_done', id: msg.id, image: imageB64 });
        return;
    }

    throw new Error(`Unknown message type: ${msg.type}`);

  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      error: String(err?.message || err)
    });
  }
};
