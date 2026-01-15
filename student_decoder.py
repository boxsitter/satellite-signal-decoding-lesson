"""Satellite picture decoder (student version).

You will edit THIS file.

What you are trying to do:
- The satellite sent a picture using audio.
- Step 1 (already done for you): the audio was turned into a long list of numbers.
- Step 2 (this file): turn that long list of numbers into an image.

How to use this in the website:
- Click "Decode" and the website will run this file.
- If you fix the bugs (or tune the numbers), the picture will become clear.

Important note:
This file avoids advanced libraries on purpose. The "heavy" parts live in
`image_decoder.py`, and we call into it.
"""

import image_decoder


# -----------------------------
# Numbers you can change
# -----------------------------

# Each scan line is this many samples wide.
ROW_WIDTH = 2080

# When finding the next line, ignore matches that are too close to the last one.
MINIMUM_ROW_SEPARATION = 2000

# The picture you want is a slice of each scan line.
# If the picture looks correct but shifted/cropped, adjust these.
IMAGE_A_START = 86
IMAGE_A_END = 990

# This repeating black/white pattern marks the start of a scan line.
# It MUST be a list of numbers that are only 0 or 255.
SYNC_PATTERN_0_TO_255: list[int] = [
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 0, 0, 0,
    0, 0, 0,
]


# -----------------------------
# Optional "image cleanup" knobs
# -----------------------------

# If True, we will stretch the contrast so the darkest pixel becomes 0 and the
# brightest pixel becomes 255. This can make details easier to see.
#
# Default is False so the output matches the reference image exactly.
AUTO_CONTRAST = False

# If True, we will colorize the grayscale image using simple rules.
# Default is False so the output matches the reference image exactly.
USE_FALSE_COLOR = False

# These are simple color rules. Each rule is:
#   (max_value_inclusive, (R, G, B))
# The first rule that matches a pixel value is used.
FALSE_COLOR_RULES = [
    (40, (5, 10, 30)),      # very dark -> deep blue
    (90, (20, 60, 120)),    # darker -> blue
    (140, (30, 110, 60)),   # mid -> green
    (200, (180, 160, 70)),  # bright -> yellow-ish
    (255, (240, 240, 240)), # very bright -> near white
]


# -----------------------------
# Student-friendly helper funcs
# -----------------------------

def clamp(value, low, high):
    """Keep value within [low, high]."""
    if value < low:
        return low
    if value > high:
        return high
    return value


def find_min_and_max(pixels_2d):
    """Find the smallest and largest pixel values in a 2D list."""
    smallest = 255
    largest = 0
    for row in pixels_2d:
        for value in row:
            if value < smallest:
                smallest = value
            if value > largest:
                largest = value
    return smallest, largest


def stretch_contrast(pixels_2d):
    """Stretch contrast so min->0 and max->255.

    This is a classic beginner-friendly image processing step.
    """
    smallest, largest = find_min_and_max(pixels_2d)
    if largest <= smallest:
        return pixels_2d

    scaled = []
    for row in pixels_2d:
        new_row = []
        for value in row:
            # Scale value from [smallest..largest] into [0..255]
            normalized = (value - smallest) / (largest - smallest)
            new_value = int(round(normalized * 255))
            new_row.append(clamp(new_value, 0, 255))
        scaled.append(new_row)
    return scaled


def color_for_value(value):
    """Map one grayscale value (0..255) to an (R,G,B) color."""
    for max_value, rgb in FALSE_COLOR_RULES:
        if value <= max_value:
            return rgb
    return (255, 255, 255)


def apply_false_color(pixels_2d):
    """Turn a grayscale 2D image into a color (RGB) 3D image."""
    colored = []
    for row in pixels_2d:
        new_row = []
        for value in row:
            new_row.append(list(color_for_value(value)))
        colored.append(new_row)
    return colored


def decode_to_base64(normalized_samples: list[int]) -> str:
    """Turn the signal (a list of numbers) into a picture.

    You do NOT need to understand the return value.
    The website uses it to display the image.
    """
    # Step 1: decode the signal into a grayscale picture.
    pixels_2d = image_decoder.decode_visible_grayscale_rows(
        normalized_samples,
        sync_pattern_0_to_255=SYNC_PATTERN_0_TO_255,
        row_width=ROW_WIDTH,
        minimum_row_separation=MINIMUM_ROW_SEPARATION,
        image_a_start=IMAGE_A_START,
        image_a_end=IMAGE_A_END,
    )

    # Step 2 (optional): improve the picture.
    if AUTO_CONTRAST:
        pixels_2d = stretch_contrast(pixels_2d)

    # Step 3 (optional): colorize the picture.
    if USE_FALSE_COLOR:
        pixels_rgb = apply_false_color(pixels_2d)
        return image_decoder.rgb_rows_to_base64_png(pixels_rgb)

    # Default: show grayscale.
    return image_decoder.grayscale_rows_to_base64_png(pixels_2d)


if __name__ == "__main__":
    # Optional: run this file from the terminal.
    # Example:
    #   python student_decoder.py ./signals/preprocessed/signal1.normalized.npy output.png
    import sys

    if len(sys.argv) < 2:
        print("Usage: python student_decoder.py <input_npy> [output_png]")
        raise SystemExit(1)

    npy_file = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "output.png"

    # We use the advanced decoder to load/save files.
    image_decoder.decode_image(
        npy_file,
        output_path=out,
        save_full_image=False,
        sync_sequence=image_decoder.centered_sync_pattern_from_0_to_255(SYNC_PATTERN_0_TO_255),
        row_width=ROW_WIDTH,
        minimum_row_separation=MINIMUM_ROW_SEPARATION,
        image_a_start=IMAGE_A_START,
        image_a_end=IMAGE_A_END,
    )
    print(f"Wrote {out}")
