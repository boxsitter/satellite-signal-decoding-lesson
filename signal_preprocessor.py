"""
NOAA APT Signal Preprocessor
Converts WAV file to normalized signal data for fast decoding
Based on work by Charles Mercieca and Martin Bernardi
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import hilbert, resample
import sys
import io

# Configurable constants
RESAMPLE_RATE = 20800
DOWNSAMPLE_FACTOR = 5
LOW_PERCENTILE = 5
HIGH_PERCENTILE = 95
MIN_PIXEL_VALUE = 0
MAX_PIXEL_VALUE = 255


def load_wav_file(wav_path_or_bytes):
    """Load WAV file from path, bytes, or file-like object. Convert to mono if needed."""
    if isinstance(wav_path_or_bytes, (str, bytes)):
        if isinstance(wav_path_or_bytes, str):
            print(f"Loading WAV file: {wav_path_or_bytes}")
            fs, audio = wavfile.read(wav_path_or_bytes)
        else:
            print("Loading WAV from bytes...")
            fs, audio = wavfile.read(io.BytesIO(wav_path_or_bytes))
    else:
        print("Loading WAV from file-like object...")
        fs, audio = wavfile.read(wav_path_or_bytes)
    
    if len(audio.shape) > 1:
        audio = audio[:, 0]
    
    print(f"Original sample rate: {fs} Hz, Audio length: {len(audio)} samples")
    return fs, audio


def resample_audio(audio, original_fs):
    """Resample audio to APT standard rate."""
    print(f"Resampling from {original_fs} Hz to {RESAMPLE_RATE} Hz")
    coef = RESAMPLE_RATE / original_fs
    samples = int(coef * len(audio))
    resampled = resample(audio, samples)
    print(f"Resampled to {len(resampled)} samples")
    return resampled


def demodulate_am_signal(audio):
    """Demodulate AM signal using Hilbert transform."""
    print("Applying Hilbert transform for AM demodulation...")
    hilbert_transformed = np.abs(hilbert(audio))
    
    print(f"Downsampling by factor of {DOWNSAMPLE_FACTOR}...")
    demodulated = resample(hilbert_transformed, len(hilbert_transformed) // DOWNSAMPLE_FACTOR)
    print(f"Demodulated signal length: {len(demodulated)} samples")
    
    return demodulated


def normalize_to_8bit(signal):
    """Normalize signal to 8-bit grayscale using percentile clipping."""
    print("Normalizing signal to 8-bit grayscale...")
    low, high = np.percentile(signal, (LOW_PERCENTILE, HIGH_PERCENTILE))
    print(f"Normalization range: {low:.2f} to {high:.2f}")
    
    normalized = np.round(
        (MAX_PIXEL_VALUE * (signal - low)) / (high - low)
    ).clip(MIN_PIXEL_VALUE, MAX_PIXEL_VALUE)
    
    return normalized


def preprocess_signal(wav_path_or_bytes, output_path=None):
    """Preprocess WAV file into normalized signal data. Returns normalized array."""
    print("="*70)
    print("NOAA APT SIGNAL PREPROCESSOR")
    print("="*70)
    
    fs, audio = load_wav_file(wav_path_or_bytes)
    resampled_audio = resample_audio(audio, fs)
    demodulated = demodulate_am_signal(resampled_audio)
    normalized = normalize_to_8bit(demodulated)
    
    if output_path:
        print(f"Saving normalized signal to: {output_path}")
        np.save(output_path, normalized)
        print("="*70)
        print("PREPROCESSING COMPLETE!")
        print(f"Signal data saved. Use image_decoder.py to generate image.")
        print("="*70)
    else:
        print("="*70)
        print("PREPROCESSING COMPLETE!")
        print("="*70)
    
    return normalized


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python signal_preprocessor.py <input_wav> [output_npy]")
        print("  input_wav  : Path to NOAA APT WAV recording")
        print("  output_npy : (Optional) Path to save normalized signal (.npy file)")
        sys.exit(1)
    
    wav_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    preprocess_signal(wav_file, output_file)
