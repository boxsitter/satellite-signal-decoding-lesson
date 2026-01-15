"""Satellite picture decoder (BEGINNER version).

This version is for earlier learners.

You only need to understand:
- variables (numbers at the top)
- lists
- for-loops
- if-statements

The website will call `decode_to_base64(...)`.
Your job is to change a few numbers (and maybe a few lines of code) so the final
picture looks correct.
"""

import image_decoder


# -----------------------------
# 1) Easy knobs (start here)
# -----------------------------

# These two numbers choose which part of each scan line becomes the picture.
# If the image looks like the right thing but shifted/cropped, change these.
#
# NOTE: These are intentionally a little wrong for the activity.
CROP_LEFT = 80
CROP_RIGHT = 980

# Try turning this on after you fix the crop.
MAKE_MORE_CONTRAST = False


# -----------------------------
# 2) Simple helper functions
# -----------------------------

def clamp(value, low, high):
    if value < low:
        return low
    if value > high:
        return high
    return value


def find_min_and_max(pixels_2d):
    smallest = 255
    largest = 0
    for row in pixels_2d:
        for value in row:
            if value < smallest:
                smallest = value
            if value > largest:
                largest = value
    return smallest, largest


def increase_contrast(pixels_2d):
    """Stretch contrast so darkest becomes 0 and brightest becomes 255."""
    smallest, largest = find_min_and_max(pixels_2d)
    if largest <= smallest:
        return pixels_2d

    new_pixels = []
    for row in pixels_2d:
        new_row = []
        for value in row:
            # Map value from [smallest..largest] to [0..255]
            scaled = (value - smallest) / (largest - smallest)
            out_value = int(round(scaled * 255))
            new_row.append(clamp(out_value, 0, 255))
        new_pixels.append(new_row)

    return new_pixels


# -----------------------------
# 3) What the website runs
# -----------------------------

def decode_to_base64(normalized_samples: list[int]) -> str:
    """Convert the signal into an image (as text)."""

    # Step A: Turn the signal into a 2D list of grayscale pixels.
    # (The complicated parts happen inside image_decoder.py.)
    pixels_2d = image_decoder.decode_visible_grayscale_rows(
        normalized_samples,
        image_a_start=CROP_LEFT,
        image_a_end=CROP_RIGHT,
    )

    # Step B (optional): improve the contrast.
    if MAKE_MORE_CONTRAST:
        pixels_2d = increase_contrast(pixels_2d)

    # Step C: Convert pixels into a PNG for the website.
    return image_decoder.grayscale_rows_to_base64_png(pixels_2d)


if __name__ == "__main__":
    # Optional: run from terminal
    # python student_decoder_beginner.py ./signals/preprocessed/signal1.normalized.npy out.png
    import sys

    if len(sys.argv) < 2:
        print("Usage: python student_decoder_beginner.py <input_npy> [output_png]")
        raise SystemExit(1)

    npy_file = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "output.png"

    # Use the advanced decoder for file loading/saving.
    image_decoder.decode_image(
        npy_file,
        output_path=out,
        save_full_image=False,
        image_a_start=CROP_LEFT,
        image_a_end=CROP_RIGHT,
    )
    print(f"Wrote {out}")
