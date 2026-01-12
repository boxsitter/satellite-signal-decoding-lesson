from pyscript import window
from pyscript.util import as_bytearray

import base64
import io

import numpy as np

import signal_preprocessor
import image_decoder


def __export__():
    return {
        "ping": ping,
        "preprocess_wav": preprocess_wav,
        "decode_to_base64": decode_to_base64,
    }


def ping():
    return "ok"


def preprocess_wav(wav_u8):
    """Accepts a JS Uint8Array of WAV bytes, returns a Python list[int]."""
    wav_bytes = bytes(as_bytearray(wav_u8.buffer))
    normalized = signal_preprocessor.preprocess_signal(wav_bytes)
    # Keep it JSON/structured-clone friendly for the return trip.
    return normalized.astype(np.uint8).tolist()


def decode_to_base64(normalized_list):
    """Accepts a list[int] of normalized samples, returns base64 PNG string."""
    normalized = np.array(normalized_list, dtype=np.uint8)
    pil_image = image_decoder.decode_image(normalized, save_full_image=False)

    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("ascii")
