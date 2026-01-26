import decoder_api

# ==============================================================================
# MISSION CONTROL: SOLUTION KEY
# ==============================================================================

# --- CONFIGURATION ------------------------------------------------------------
# NOAA APT Specification:
# Channel A (1040) + Channel B (1040) = 2080 pixels per line.
ROW_WIDTH = 2080

# Each scan line is separated by approximately 2000 samples
# This is used as the search window to find the best sync position
MINIMUM_ROW_SEPARATION = 2000


def run_decoding_sequence(signal_file=None):
    print("---------------------------------------")
    print(" INITIALIZING DECODING SEQUENCE (SOLUTION)...")
    print("---------------------------------------")

    # 1. LOAD SIGNAL
    if signal_file:
        sensor_data = decoder_api.load_signal_data(signal_file)
    else:
        sensor_data = decoder_api.load_signal_data()
    print(f" > Signal Loaded. Total data points: {len(sensor_data)}")

    # 2. PREPARE IMAGE
    decoded_image = []

    # 3. SCANNING LOOP
    pointer = 0
    print(" > Scanning stream for synchronization markers...")

    # Keep scanning until we reach the end of the data stream
    while pointer < len(sensor_data) - ROW_WIDTH:

        # Find the BEST sync position within the next expected window
        # This is important because there might be multiple positions that 
        # look like a sync, but we want the one with the strongest match
        sync_position = decoder_api.find_best_sync_in_window(
            sensor_data, 
            pointer, 
            MINIMUM_ROW_SEPARATION
        )

        if sync_position is not None:
            # --- SYNC DETECTED! -----------------------------------------------
            # We found the best sync position. Extract exactly one row.
            
            end_of_row = sync_position + ROW_WIDTH 
            
            # Slice the data
            pixel_row = sensor_data[sync_position : end_of_row]
            
            # Add to image
            decoded_image.append(pixel_row)
            
            # Jump past this row to search for the next one.
            # Start searching from just after the minimum separation period
            pointer = sync_position + MINIMUM_ROW_SEPARATION

        else:
            # --- NO MORE SYNCS FOUND ------------------------------------------
            # If we can't find any more sync markers, we've decoded all rows
            break

    
    # 4. DISPLAY RESULTS
    print("---------------------------------------")
    print(f" DECODING COMPLETE.")
    print(f" Recovered {len(decoded_image)} lines of video data.")
    print("---------------------------------------")
    
    decoder_api.display_image(decoded_image)


if __name__ == "__main__":
    import sys
    
    # Allow optional command line argument for signal file
    signal_file = sys.argv[1] if len(sys.argv) > 1 else None
    run_decoding_sequence(signal_file)
