"""
NOAA APT Image Decoder
Decodes preprocessed signal data into satellite images
Based on work by Charles Mercieca and Martin Bernardi
"""

import numpy as np
from PIL import Image
import sys

# Configurable constants
SYNC_SEQUENCE_LENGTH = 36
ROW_WIDTH = 2080
MINIMUM_ROW_SEPARATION = 2000

SYNC_SEQUENCE = np.array([
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 0, 0, 0,
    0, 0, 0
]) - 128

IMAGE_A_START = 86
IMAGE_A_END = 990


def load_signal_data(npy_path_or_array):
    """Load preprocessed signal data from .npy file or numpy array."""
    if isinstance(npy_path_or_array, np.ndarray):
        print("Using provided numpy array")
        normalized_signal = npy_path_or_array
    else:
        print(f"Loading signal data: {npy_path_or_array}")
        normalized_signal = np.load(npy_path_or_array)
    print(f"Signal length: {len(normalized_signal)} samples")
    return normalized_signal


def find_sync_sequences(normalized_signal):
    """Locate sync sequences using correlation to identify scan line boundaries."""
    print("Searching for sync sequences...")
    
    rows = [None]
    previous_corr = -np.inf
    previous_pointer = 0
    sync_count = 0
    
    for pointer in range(len(normalized_signal) - SYNC_SEQUENCE_LENGTH):
        window = normalized_signal[pointer : pointer + SYNC_SEQUENCE_LENGTH] - 128
        current_corr = np.dot(SYNC_SEQUENCE, window)
        
        if pointer - previous_pointer > MINIMUM_ROW_SEPARATION:
            previous_corr, previous_pointer = -np.inf, pointer
            rows.append(normalized_signal[pointer : pointer + ROW_WIDTH])
            sync_count += 1
            
        elif current_corr > previous_corr:
            previous_corr, previous_pointer = current_corr, pointer
            rows[-1] = normalized_signal[pointer : pointer + ROW_WIDTH]
    
    print(f"Found {sync_count} sync sequences")
    return rows


def build_image(rows):
    """Stack rows to create final image."""
    print("Building image from scan lines...")
    
    valid_rows = [row for row in rows if len(row) == ROW_WIDTH]
    image = np.row_stack(valid_rows).astype(np.uint8)
    
    print(f"Final image size: {image.shape[1]} x {image.shape[0]} pixels")
    return image


def crop_image_a(image):
    """Extract Image A (visible light channel) from full transmission."""
    print("Extracting Image A (visible light channel)...")
    image_a = image[:, IMAGE_A_START:IMAGE_A_END]
    print(f"Image A size: {image_a.shape[1]} x {image_a.shape[0]} pixels")
    return image_a


def apply_color_palette(grayscale_image, palette_path=None):
    """Apply color palette to grayscale image."""
    if palette_path is None:
        return grayscale_image
    
    print(f"Applying color palette: {palette_path}")
    
    try:
        palette_img = Image.open(palette_path)
        palette = np.array(palette_img)
        indices = np.arange(256)
        palette_colors = palette[indices, indices]
        
        height, width = grayscale_image.shape
        colored = np.zeros((height, width, 3), dtype=np.uint8)
        flat_gray = grayscale_image.flatten()
        colored_flat = palette_colors[flat_gray, :3]
        colored = colored_flat.reshape(height, width, 3)
        
        print("Color palette applied successfully")
        return colored
        
    except Exception as e:
        print(f"Warning: Could not apply palette ({e}). Using grayscale.")
        return grayscale_image


def decode_image(npy_path_or_array, output_path=None, palette_path=None, save_full_image=True):
    """Decode preprocessed signal into satellite image. Returns PIL Image."""
    print("="*70)
    print("NOAA APT IMAGE DECODER")
    print("="*70)
    
    normalized_signal = load_signal_data(npy_path_or_array)
    rows = find_sync_sequences(normalized_signal)
    image = build_image(rows)
    
    if save_full_image:
        pil_image = Image.fromarray(image)
        if output_path:
            print(f"Saving full image to: {output_path}")
            pil_image.save(output_path)
    else:
        image_a = crop_image_a(image)
        final_image = apply_color_palette(image_a, palette_path)
        pil_image = Image.fromarray(final_image)
        if output_path:
            print(f"Saving Image A to: {output_path}")
            pil_image.save(output_path)
    
    print("="*70)
    print("DECODING COMPLETE!")
    print("="*70)
    
    return pil_image


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python image_decoder.py <input_npy> [output_image] [palette_path] [--full]")
        print("  input_npy    : Path to preprocessed signal (.npy file)")
        print("  output_image : (Optional) Path to save decoded image")
        print("  palette_path : (Optional) Path to color palette image")
        print("  --full       : (Optional) Save full image instead of just Image A")
        sys.exit(1)
    
    npy_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
    palette = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else None
    save_full = '--full' in sys.argv
    
    decode_image(npy_file, output_file, palette, save_full)
