import decoder_api

# ==============================================================================
# MISSION CONTROL: SATELLITE DATA DECODER
# OPERATOR MANUAL SECTION 1.2
# ==============================================================================
#
# INSTRUCTIONS:
# Your mission is to decode the data stream from the NOAA weather satellite.
# The signal has already been demodulated by the ground station antenna
# and saved as a sequence of sensor values (0-255).
#
# However, the decoding script below is corrupted.
# Use the "Satellite Transmission Manual" to fix the bugs and reveal the image.
# ==============================================================================


# --- CONFIGURATION ------------------------------------------------------------

# [MANUAL CHECK REQUIRED]
# According to the NOAA APT specification, how wide (in pixels) is one 
# single line of video data?
ROW_WIDTH = 900  # <--- HINT: This value looks suspicious...


def run_decoding_sequence():
    print("---------------------------------------")
    print(" INITIALIZING DECODING SEQUENCE...")
    print("---------------------------------------")

    # 1. LOAD SIGNAL
    # We fetch the clean stream of sensor numbers from the daily log file.
    sensor_data = decoder_api.load_signal_data()
    print(f" > Signal Loaded. Total data points: {len(sensor_data)}")

    # 2. PREPARE IMAGE
    # We create an empty list to hold our stacked lines of video.
    decoded_image = []

    # 3. SCANNING LOOP
    # We use a 'pointer' to track exactly which number we are looking at.
    pointer = 0
    
    print(" > Scanning stream for synchronization markers...")

    # Keep scanning until we reach the end of the data stream
    while pointer < len(sensor_data) - ROW_WIDTH:

        # Use the API to check if the current spot marks the start of a line.
        # It looks for a specific "beep-beep-beep" pattern (Sync A).
        found_sync = decoder_api.check_for_sync(sensor_data, pointer)

        if found_sync:
            # --- SYNC DETECTED! -----------------------------------------------
            # We found the start of a line. We need to "snip" out the image data.
            
            # [MANUAL CHECK REQUIRED]
            # We need to slice out exactly one full row of pixels.
            # Currently, this is only grabbing 50 pixels. 
            end_of_row = pointer + 50 
            
            # Slice the data from the list
            pixel_row = sensor_data[pointer : end_of_row]
            
            # Add this row to our final image
            decoded_image.append(pixel_row)
            
            # Move our pointer past the row we just processed so we don't read it again.
            pointer += ROW_WIDTH

        else:
            # --- NO SYNC FOUND ------------------------------------------------
            # The current spot is just random sensor data, not a start marker.
            
            # [MANUAL CHECK REQUIRED]
            # We need to move the pointer forward to check the next spot.
            
            # DIAGNOSTIC MODE: Capturing raw data to allow visual debugging.
            # This produces a noisy/garbled image if synchronization fails.
            raw_row = sensor_data[pointer : pointer + ROW_WIDTH]
            decoded_image.append(raw_row)
            
            pointer += ROW_WIDTH

    
    # 4. DISPLAY RESULTS
    print("---------------------------------------")
    print(f" DECODING COMPLETE.")
    print(f" Recovered {len(decoded_image)} lines of video data.")
    print("---------------------------------------")
    
    # Send the list of rows to the screen
    decoder_api.display_image(decoded_image)


# Run the mission
if __name__ == "__main__":
    run_decoding_sequence()