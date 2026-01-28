import numpy as np
from PIL import Image
import os

# Correlation Threshold for Sync Detection
# 
# When correlating the sync pattern against the signal, a perfect match yields
# a dot product of approximately 580,000 (sum of squares of the centered pattern).
# We set the threshold lower to account for:
#   - Atmospheric noise during transmission
#   - Signal attenuation from distance
#   - Doppler shift from satellite velocity
#   - Receiver imperfections
# A value of 50,000 (~8.6% of perfect match) provides reliable detection while
# rejecting false positives from random noise.
SYNC_DETECTION_THRESHOLD = 50000

# APT Image Channel Boundaries
#
# Each APT scan line is 2080 pixels wide, containing two interleaved channels:
#   - Channel A (pixels 86-990):  Visible light (0.58-0.68 μm wavelength)
#   - Channel B (pixels 1126-2030): Near-infrared (10.5-12.5 μm wavelength)
#   - Sync markers, telemetry, and calibration data occupy the remaining space
IMAGE_A_START = 0
IMAGE_A_END = 2030 

def load_signal_data(filename="signal1.normalized.npy"):
    """
    Loads preprocessed APT signal data from disk.
    
    The signal has already been:
      1. Demodulated from the raw 137 MHz RF carrier
      2. Resampled to 4160 samples/second (double the Nyquist rate for 2080 pixels/line)
      3. Normalized to 0-255 range
    
    Args:
        filename (str): Path to the .npy file containing normalized signal data
        
    Returns:
        numpy.ndarray: 1D array of pixel intensity values (0-255, dtype=float64)
                       Returns empty array on error
    """
    print(f" [SYSTEM] Accessing data: {filename}")
    
    if not os.path.exists(filename):
        print(" [ERROR] CRITICAL: Signal data file not found.")
        print("         Ensure you have run the pre-baking script.")
        return np.array([])

    try:
        # Load the numpy array and keep it as numpy for performance
        data = np.load(filename)
        
        print(" [SYSTEM] Data stream loaded successfully.")
        return data
        
    except Exception as e:
        print(f" [ERROR] Corrupt data file: {e}")
        return np.array([])


def look_for_sync_in_window(signal_data, center_pointer, window_size=2000, sync_pattern=None):
    """
    Locates the optimal sync marker position within a search window using vectorized correlation.
    
    APT scan lines are transmitted approximately every 0.5 seconds (2 lines/second).
    At 4160 samples/second, this translates to roughly 2080 samples per line.
    However, satellite velocity variations, Doppler effects, and receiver clock drift
    can cause line spacing to vary by ±10%. We search a window to find the peak
    correlation position rather than assuming fixed spacing.
    
    Algorithm:
      1. Extract search window from signal
      2. Center the window around zero (remove DC offset)
      3. Use numpy.correlate() for efficient vectorized computation across all positions
      4. Find position of maximum correlation value
      5. Return position if correlation exceeds detection threshold
    
    Vectorization advantage: Computing correlation at N positions sequentially
    would require N loop iterations. numpy.correlate() performs all N correlations
    in a single optimized operation using BLAS/LAPACK libraries, typically 10-100x faster.
    
    Args:
        signal_data (numpy.ndarray): Complete signal array
        center_pointer (int): Center of search window
        window_size (int): Number of samples to search (default 2000 ≈ one scan line period)
        sync_pattern (list or numpy.ndarray): Sync pattern to search for (defaults to SYNC_A_PATTERN)
        
    Returns:
        int or None: Index of best sync position, or None if no correlation exceeds threshold
    """
    # Convert to numpy array and center around zero for correlation
    sync_pattern_np = np.array(sync_pattern, dtype=np.float32) - 128
    
    # Calculate search boundaries centered around the pointer
    sync_len = len(sync_pattern_np)
    
    # Calculate ideal window bounds (centered on center_pointer)
    half_window = window_size // 2
    start_pointer = center_pointer - half_window
    end_pointer = center_pointer + half_window
    
    # Clamp to valid array bounds
    start_pointer = max(0, start_pointer)
    end_pointer = min(end_pointer, len(signal_data) - sync_len)
    
    if end_pointer <= start_pointer:
        return None
    
    # Extract the search region (includes extra sync_len samples for full pattern matching)
    search_window = signal_data[start_pointer:end_pointer + sync_len]
    
    # Center the window around zero for correlation
    window_centered = search_window - 128
    
    # Compute correlation at all possible positions simultaneously
    # mode='valid': only compute where pattern fully overlaps with signal
    # This returns an array of correlation values, one for each tested position
    correlations = np.correlate(window_centered, sync_pattern_np, mode='valid')
    
    # Handle edge case of empty correlation array
    if len(correlations) == 0:
        return None
        
    # Find the position with maximum correlation strength
    max_idx = np.argmax(correlations)
    max_score = correlations[max_idx]
    
    # Only return position if correlation is strong enough to confidently indicate sync
    if max_score > SYNC_DETECTION_THRESHOLD:
        return start_pointer + max_idx
    else:
        return None


def display_image(image_rows):
    """
    Reconstructs and displays the decoded APT image from scan line data.
    
    APT Image Structure:
      - Each row is a complete scan line (2080 pixels)
      - Channel A (visible light): pixels 86-990 (904 pixels wide)
      - Channel B (near-IR): pixels 1126-2030 (904 pixels wide)  
      - Remaining pixels: sync markers, telemetry, calibration wedges
    
    This function:
      1. Converts list of pixel rows into a 2D numpy array
      2. Extracts only Channel A (visible spectrum imagery)
      3. Converts to 8-bit grayscale PIL Image
      4. Saves as PNG and displays
    
    Args:
        image_rows (list[list[int]] or list[numpy.ndarray]): 
            Decoded scan lines, each containing 2080 pixel values (0-255)
    """
    if not image_rows:
        print(" [ERROR] No image data to display. The list is empty.")
        return

    print(" [SYSTEM] Constructing image from decoded rows...")
    
    try:
        # Image dimensions
        height = len(image_rows)
        # Handle potentially irregular row lengths (defensive programming for student code)
        width = max(len(row) for row in image_rows)
        
        # Allocate image array (8-bit unsigned integer for grayscale)
        img_array = np.zeros((height, width), dtype=np.uint8)
        
        # Copy each row into the image array
        # Rows shorter than width will leave zeros (black pixels) in remaining columns
        for i, row in enumerate(image_rows):
            length = min(len(row), width)
            img_array[i, :length] = row[:length]

        # Apply crop
        img_array = img_array[:, IMAGE_A_START:IMAGE_A_END]
        print(f" [SYSTEM] Image A size: {img_array.shape[1]} x {img_array.shape[0]} pixels")

        # Convert numpy array to PIL Image object
        img = Image.fromarray(img_array)
        
        # Save and display the decoded image
        output_filename = "decoded_earth.png"
        img.save(output_filename)
        print(f" [SUCCESS] Image saved to '{output_filename}'")
        
        # Attempt to open in system image viewer (works in local Python environments)
        img.show()
        
    except Exception as e:
        print(f" [ERROR] Could not create image: {e}")