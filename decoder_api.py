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
# Perfect match is ~580,000. We set this to prevent false positives on noise.
SYNC_DETECTION_THRESHOLD = 400000 

def load_signal_data(filename="signal1.normalized.npy"):
    """
    Loads the pre-processed satellite signal.
    
    Returns:
        list[int]: A massive list of sensor values (0-255).
    """
    print(f" [SYSTEM] Accessing data archive: {filename}")
    
    if not os.path.exists(filename):
        print(" [ERROR] CRITICAL: Signal data file not found.")
        print("         Ensure you have run the pre-baking script.")
        return []

    try:
        # Load the numpy array
        data = np.load(filename)
        
        # Ensure it's the correct type (0-255 integers)
        # The pre-baker saves as float64, so we cast to int here.
        data_int = data.astype(int)
        
        print(" [SYSTEM] Data stream loaded successfully.")
        return data_int.tolist()
        
    except Exception as e:
        print(f" [ERROR] Corrupt data file: {e}")
        return []


def check_for_sync(signal_data, pointer):
    """
    Checks if the 'Sync A' pattern starts at the current pointer location.
    
    Args:
        signal_data (list): The full signal list.
        pointer (int): The current index to check.
        
    Returns:
        bool: True if a sync marker is found here, False otherwise.
    """
    # Safety check: Don't read past the end of the list
    if pointer + len(SYNC_A_PATTERN) > len(signal_data):
        return False

    # Get the snippet of data at the pointer
    # Convert to numpy for fast math (correlation)
    snippet = np.array(signal_data[pointer : pointer + len(SYNC_A_PATTERN)])
    
    # Center the data (0-255 -> -128 to 127) to match our sync pattern
    snippet_centered = snippet - 128
    
    # Perform a "Dot Product" (Correlation)
    # This multiplies the patterns together. High number = High Match.
    match_score = np.dot(SYNC_A_PATTERN, snippet_centered)
    
    return match_score > SYNC_DETECTION_THRESHOLD


def display_image(image_rows):
    """
    Takes the 2D list of pixels and converts it to a visible image.
    
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