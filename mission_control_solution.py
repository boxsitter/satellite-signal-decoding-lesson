import decoder_api

# ==============================================================================
# MISSION CONTROL: SOLUTION KEY
# ==============================================================================

# --- CONFIGURATION ------------------------------------------------------------
# NOAA APT Specification:
# Channel A (1040) + Channel B (1040) = 2080 pixels per line.
ROW_WIDTH = 2080


def run_decoding_sequence():
    print("---------------------------------------")
    print(" INITIALIZING DECODING SEQUENCE (SOLUTION)...")
    print("---------------------------------------")

    # 1. LOAD SIGNAL
    sensor_data = decoder_api.load_signal_data()
    print(f" > Signal Loaded. Total data points: {len(sensor_data)}")

    # 2. PREPARE IMAGE
    decoded_image = []

    # 3. SCANNING LOOP
    pointer = 0
    print(" > Scanning stream for synchronization markers...")

    # Keep scanning until we reach the end of the data stream
    while pointer < len(sensor_data) - ROW_WIDTH:

        # Use the API to check for Sync A pattern
        found_sync = decoder_api.check_for_sync(sensor_data, pointer)

        if found_sync:
            # --- SYNC DETECTED! -----------------------------------------------
            # We found the start of a line. Snip out exactly one ROW_WIDTH.
            
            end_of_row = pointer + ROW_WIDTH 
            
            # Slice the data
            pixel_row = sensor_data[pointer : end_of_row]
            
            # Add to image
            decoded_image.append(pixel_row)
            
            # Jump past this row to search for the next one.
            # We subtract a small buffer (e.g., 20 pixels) to ensure we don't 
            # overshoot the next sync marker if the signal period is slightly
            # shorter than ROW_WIDTH (due to clock drift or Doppler).
            pointer += (ROW_WIDTH - 20)

        else:
            # --- NO SYNC FOUND ------------------------------------------------
            # If we don't find a sync marker, we must step forward gently 
            # (by 1 or a few pixels) to keep searching. 
            # Skipping by ROW_WIDTH would jump over the data we are looking for.
            
            pointer += 1  # Increment by 1 to scan thoroughly

    
    # 4. DISPLAY RESULTS
    print("---------------------------------------")
    print(f" DECODING COMPLETE.")
    print(f" Recovered {len(decoded_image)} lines of video data.")
    print("---------------------------------------")
    
    decoder_api.display_image(decoded_image)


if __name__ == "__main__":
    run_decoding_sequence()
