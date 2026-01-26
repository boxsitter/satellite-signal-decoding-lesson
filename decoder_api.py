"""
DECODER API - MISSION CONTROL BACKEND
-------------------------------------
Handles loading pre-baked satellite data and image rendering.
Optimized for browser/classroom use (No heavy audio libraries).
"""

import numpy as np
from PIL import Image
import os

# --- INTERNAL CONSTANTS (Hidden from students) ---
# The sync pattern is the "key" to unlocking the image.
# We use a standard NOAA APT sync sequence (A-Pattern).
SYNC_A_PATTERN = np.array([
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 0, 0, 0,
    0, 0, 0
], dtype=np.float32) - 128  # Center around 0 for correlation

# Threshold for detecting the sync pattern
# Perfect match is ~580,000. We set this lower to account for noise and signal drift.
# Adjusted for float64 data type from preprocessor
SYNC_DETECTION_THRESHOLD = 50000

# Image A (visible light channel) boundaries within each row
# NOAA APT transmits two channels side-by-side in each 2080-pixel row
IMAGE_A_START = 86
IMAGE_A_END = 990 

def load_signal_data(filename="signals/preprocessed/signal1.normalized.npy"):
    """
    Loads the pre-processed satellite signal.
    
    Returns:
        numpy.ndarray: Array of sensor values (0-255).
    """
    print(f" [SYSTEM] Accessing data archive: {filename}")
    
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


def check_for_sync(signal_data, pointer):
    """
    Checks if the 'Sync A' pattern starts at the current pointer location.
    
    Args:
        signal_data (numpy.ndarray): The full signal array.
        pointer (int): The current index to check.
        
    Returns:
        bool: True if a sync marker is found here, False otherwise.
    """
    # Safety check: Don't read past the end of the array
    if pointer + len(SYNC_A_PATTERN) > len(signal_data):
        return False

    # Get the snippet of data at the pointer (already numpy)
    snippet = signal_data[pointer : pointer + len(SYNC_A_PATTERN)]
    
    # Center the data (0-255 -> -128 to 127) to match our sync pattern
    snippet_centered = snippet - 128
    
    # Perform a "Dot Product" (Correlation)
    # This multiplies the patterns together. High number = High Match.
    match_score = np.dot(SYNC_A_PATTERN, snippet_centered)
    
    return match_score > SYNC_DETECTION_THRESHOLD


def find_best_sync_in_window(signal_data, start_pointer, window_size=2000):
    """
    Searches for the BEST sync position within a window.
    This matches the original decoder behavior - finding the peak correlation.
    Uses optimized vectorized correlation for speed.
    
    Args:
        signal_data (numpy.ndarray): The full signal array.
        start_pointer (int): Where to start searching.
        window_size (int): How many pixels to search through (default 2000).
        
    Returns:
        int or None: The position with the best sync match, or None if no good sync found.
    """
    # Calculate safe end pointer
    sync_len = len(SYNC_A_PATTERN)
    end_pointer = min(start_pointer + window_size, len(signal_data) - sync_len)
    
    if end_pointer <= start_pointer:
        return None
    
    # Extract the search window
    search_window = signal_data[start_pointer:end_pointer + sync_len]
    
    # Use numpy's correlate for vectorized computation (much faster!)
    # We need to center the window and reverse the pattern for correlate
    window_centered = search_window - 128
    
    # Compute correlation at all positions at once
    # mode='valid' gives us correlations only where the pattern fully overlaps
    correlations = np.correlate(window_centered, SYNC_A_PATTERN, mode='valid')
    
    # Find the position with maximum correlation
    if len(correlations) == 0:
        return None
        
    max_idx = np.argmax(correlations)
    max_score = correlations[max_idx]
    
    # Only return if we found something good enough
    if max_score > SYNC_DETECTION_THRESHOLD:
        return start_pointer + max_idx
    else:
        return None


def display_image(image_rows):
    """
    Takes the 2D list of pixels and converts it to a visible image.
    Automatically crops to Image A (visible light channel).
    
    Args:
        image_rows (list[list[int]]): The decoded image data.
    """
    if not image_rows:
        print(" [ERROR] No image data to display. The list is empty.")
        return

    print(" [SYSTEM] Constructing image from decoded rows...")
    
    try:
        # Determine width from the first row
        height = len(image_rows)
        # Find the maximum width to pad irregular rows (if student code is buggy)
        width = max(len(row) for row in image_rows)
        
        # Create a blank numpy array
        img_array = np.zeros((height, width), dtype=np.uint8)
        
        for i, row in enumerate(image_rows):
            # Clip row to width or pad if necessary
            length = min(len(row), width)
            img_array[i, :length] = row[:length]

        # Extract Image A (visible light channel) from the full transmission
        print(" [SYSTEM] Extracting Image A (visible light channel)...")
        img_array = img_array[:, IMAGE_A_START:IMAGE_A_END]
        print(f" [SYSTEM] Image A size: {img_array.shape[1]} x {img_array.shape[0]} pixels")

        # Convert to PIL Image
        img = Image.fromarray(img_array)
        
        # For the lesson: Show it and save it
        output_filename = "decoded_earth.png"
        img.save(output_filename)
        print(f" [SUCCESS] Image saved to '{output_filename}'")
        
        # In a local environment, this pops up the image viewer
        img.show()
        
    except Exception as e:
        print(f" [ERROR] Could not create image: {e}")