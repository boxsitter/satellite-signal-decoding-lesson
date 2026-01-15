"""
NOAA APT Image Decoder
Decodes preprocessed signal data into satellite images
Based on work by Charles Mercieca and Martin Bernardi
"""

import numpy as np
from PIL import Image
import sys
import base64
import io

# Configurable constants
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


def pil_image_to_base64_png(pil_image):
    """Encode a PIL image as base64 PNG text (ASCII)."""
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("ascii")


def centered_sync_pattern_from_0_to_255(pattern_0_to_255):
    """Convert a 0..255 sync pattern into a centered array.

    This helper exists so student-facing code can stay in plain Python lists.
    """
    return np.asarray(pattern_0_to_255, dtype=np.float32) - 128.0


def decode_visible_image(
    normalized_samples,
    *,
    sync_pattern_0_to_255=None,
    row_width=ROW_WIDTH,
    minimum_row_separation=MINIMUM_ROW_SEPARATION,
    image_a_start=IMAGE_A_START,
    image_a_end=IMAGE_A_END,
    palette_path=None,
):
    """Student-friendly entrypoint: decode the visible channel and return a PIL Image.

    Accepts plain Python lists; handles dtype conversions internally.
    """
    normalized = np.asarray(normalized_samples, dtype=np.float32)

    if sync_pattern_0_to_255 is None:
        # Convert the built-in centered sync sequence (-128/127-ish) back into 0..255.
        sync_pattern_0_to_255 = (np.asarray(SYNC_SEQUENCE) + 128).astype(np.uint8).tolist()

    sync_sequence = centered_sync_pattern_from_0_to_255(sync_pattern_0_to_255)
    return decode_image(
        normalized,
        palette_path=palette_path,
        save_full_image=False,
        sync_sequence=sync_sequence,
        row_width=row_width,
        minimum_row_separation=minimum_row_separation,
        image_a_start=image_a_start,
        image_a_end=image_a_end,
    )


def decode_visible_base64(
    normalized_samples,
    *,
    sync_pattern_0_to_255=None,
    row_width=ROW_WIDTH,
    minimum_row_separation=MINIMUM_ROW_SEPARATION,
    image_a_start=IMAGE_A_START,
    image_a_end=IMAGE_A_END,
    palette_path=None,
):
    """Student-friendly entrypoint: decode visible channel and return base64 PNG text."""
    pil_image = decode_visible_image(
        normalized_samples,
        sync_pattern_0_to_255=sync_pattern_0_to_255,
        row_width=row_width,
        minimum_row_separation=minimum_row_separation,
        image_a_start=image_a_start,
        image_a_end=image_a_end,
        palette_path=palette_path,
    )
    return pil_image_to_base64_png(pil_image)


def decode_visible_grayscale_rows(
    normalized_samples,
    *,
    sync_pattern_0_to_255=None,
    row_width=ROW_WIDTH,
    minimum_row_separation=MINIMUM_ROW_SEPARATION,
    image_a_start=IMAGE_A_START,
    image_a_end=IMAGE_A_END,
):
    """Decode visible channel and return pixels as a plain Python 2D list.

    Returns: list[list[int]] where each inner list is one image row of 0..255.
    This is intentionally "student-friendly" so classroom code can use for-loops
    without needing NumPy.
    """
    normalized = np.asarray(normalized_samples, dtype=np.float32)

    if sync_pattern_0_to_255 is None:
        sync_pattern_0_to_255 = (np.asarray(SYNC_SEQUENCE) + 128).astype(np.uint8).tolist()

    sync_sequence = centered_sync_pattern_from_0_to_255(sync_pattern_0_to_255)

    rows = find_sync_sequences(
        normalized,
        sync_sequence=sync_sequence,
        row_width=row_width,
        minimum_row_separation=minimum_row_separation,
    )
    image = build_image(rows, row_width=row_width)
    image_a = crop_image_a(image, image_a_start=image_a_start, image_a_end=image_a_end)
    return image_a.astype(np.uint8).tolist()


def grayscale_rows_to_base64_png(grayscale_rows):
    """Convert a 2D list of grayscale pixels (0..255) to base64 PNG text."""
    arr = np.asarray(grayscale_rows, dtype=np.uint8)
    pil_image = Image.fromarray(arr)
    return pil_image_to_base64_png(pil_image)


def rgb_rows_to_base64_png(rgb_rows):
    """Convert a 3D list of RGB pixels to base64 PNG text.

    rgb_rows format: list[list[list[int]]] with shape [H][W][3]
    """
    arr = np.asarray(rgb_rows, dtype=np.uint8)
    pil_image = Image.fromarray(arr)
    return pil_image_to_base64_png(pil_image)


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


def find_sync_sequences(
    normalized_signal,
    *,
    sync_sequence=SYNC_SEQUENCE,
    row_width=ROW_WIDTH,
    minimum_row_separation=MINIMUM_ROW_SEPARATION,
):
    """Locate sync sequences using correlation to identify scan line boundaries."""
    print("Searching for sync sequences...")
    
    rows = [None]
    previous_corr = -np.inf
    previous_pointer = 0
    sync_count = 0
    
    sync_sequence = np.asarray(sync_sequence)
    sync_len = int(sync_sequence.shape[0])

    for pointer in range(len(normalized_signal) - sync_len):
        window = normalized_signal[pointer : pointer + sync_len] - 128
        current_corr = np.dot(sync_sequence, window)
        
        if pointer - previous_pointer > minimum_row_separation:
            previous_corr, previous_pointer = -np.inf, pointer
            rows.append(normalized_signal[pointer : pointer + row_width])
            sync_count += 1
            
        elif current_corr > previous_corr:
            previous_corr, previous_pointer = current_corr, pointer
            rows[-1] = normalized_signal[pointer : pointer + row_width]
    
    print(f"Found {sync_count} sync sequences")
    return rows


def build_image(rows, *, row_width=ROW_WIDTH):
    """Stack rows to create final image."""
    print("Building image from scan lines...")
    
    valid_rows = [row for row in rows if len(row) == row_width]
    image = np.row_stack(valid_rows).astype(np.uint8)
    
    print(f"Final image size: {image.shape[1]} x {image.shape[0]} pixels")
    return image


def crop_image_a(image, *, image_a_start=IMAGE_A_START, image_a_end=IMAGE_A_END):
    """Extract Image A (visible light channel) from full transmission."""
    print("Extracting Image A (visible light channel)...")
    image_a = image[:, image_a_start:image_a_end]
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


def decode_image(
    npy_path_or_array,
    output_path=None,
    palette_path=None,
    save_full_image=True,
    *,
    sync_sequence=SYNC_SEQUENCE,
    row_width=ROW_WIDTH,
    minimum_row_separation=MINIMUM_ROW_SEPARATION,
    image_a_start=IMAGE_A_START,
    image_a_end=IMAGE_A_END,
):
    """Decode preprocessed signal into satellite image. Returns PIL Image.

    This function supports an "advanced" parameterized API so a student-friendly wrapper
    script can tweak key constants without copying the whole implementation.
    """
    print("="*70)
    print("NOAA APT IMAGE DECODER")
    print("="*70)
    
    normalized_signal = load_signal_data(npy_path_or_array)
    rows = find_sync_sequences(
        normalized_signal,
        sync_sequence=sync_sequence,
        row_width=row_width,
        minimum_row_separation=minimum_row_separation,
    )
    image = build_image(rows, row_width=row_width)
    
    if save_full_image:
        pil_image = Image.fromarray(image)
        if output_path:
            print(f"Saving full image to: {output_path}")
            pil_image.save(output_path)
    else:
        image_a = crop_image_a(image, image_a_start=image_a_start, image_a_end=image_a_end)
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
