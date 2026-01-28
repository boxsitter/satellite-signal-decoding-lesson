import decoder_api

# Signal Specification:
# Channel A (1040 pixels) + Channel B (1040 pixels)
ROW_WIDTH = 2080

# Define a search window for sync detection
SEARCH_WINDOW = 500

# Sync pattern to look for
SYNC_A_PATTERN = [
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 0, 0, 
    0, 0, 0, 0
]

def run_decoding_sequence(signal_file=None):
    print("INITIALIZING DECODING SEQUENCE...")

    # 1. LOAD SIGNAL
    # If you have already selected a signal on the website,
    # the data will be loaded by calling decoder_api.load_signal_data()

    # The signal data is an array of values from 0-255.
    # It looks like: [5, 134, 253, 255, 0, 2, 214, 200, ...]
    signal_data = decoder_api.load_signal_data(signal_file)
    print(f"Signal Loaded. Total data points: {len(signal_data)}")

    # 2. PREPARE IMAGE
    # Here we are initializing an empty list to hold each row of the final image.
    decoded_image = []

    # 3. SCANNING LOOP
    # We are creating an image, a 2D array of pixel values out of a 1D array of signal data.
    # But since the data is a single line, we need to determine when to start a new row.
    # We know that each row of the signal starts with a specific pattern (the sync marker).
    # We are going to treat each value in the data as a pixel with brightness from 0-255, but
    # when we find the sync marker, we know a new row is starting.
    pointer = 0

    while pointer < len(signal_data):
        sync_position = decoder_api.look_for_sync_in_window(
            signal_data, # Data to search
            pointer, # The center point to search around
            SEARCH_WINDOW, # How many total samples to search (+/- from center)
            SYNC_A_PATTERN # The sync pattern to search for
        )

        if sync_position is not None:
            # We found a sync marker!
            # That means that the next ROW_WIDTH pixels are a new row of image data.
            # We will add that row to our image.
            end_of_row = sync_position + ROW_WIDTH
            pixel_row = signal_data[sync_position : end_of_row]
            decoded_image.append(pixel_row)
            
            pointer = end_of_row
            
        else:
            # No sync found. This can mean a few things:
            # 1. We are at the end of the data
            # 2. The signal is too weak to detect sync on this line
            # 3. Our prediction was off due to complicated science stuff (doppler shift, clock drift, etc)

            # We'll add the current segment as a row and try again with the next one
            
            print(f"Expected sync not found at pointer {pointer}.")

            end_of_row = pointer + ROW_WIDTH
            pixel_row = signal_data[pointer : end_of_row]
            decoded_image.append(pixel_row)
            pointer = end_of_row

    
    # 4. DISPLAY RESULTS
    print("DECODING COMPLETE.")
    print(f"Recovered {len(decoded_image)} lines of video data.")
    
    decoder_api.display_image(decoded_image)

# Entry point for script
# Students may ignore this section
if __name__ == "__main__":
    import sys
    
    # Allow optional command line argument for signal file
    signal_file = sys.argv[1] if len(sys.argv) > 1 else None
    run_decoding_sequence(signal_file)
