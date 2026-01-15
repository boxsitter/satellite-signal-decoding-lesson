"""Pre-bake normalized `.npy` files for all WAVs in `signals/`.

This runs the SciPy-based preprocessing step locally (outside the browser) and
writes the outputs to `signals/preprocessed/*.normalized.npy`.

Usage:
  python prebake_signals.py
"""

from __future__ import annotations

import pathlib

import signal_preprocessor


def main() -> None:
    repo_root = pathlib.Path(__file__).resolve().parent
    signals_dir = repo_root / "signals"
    out_dir = signals_dir / "preprocessed"
    out_dir.mkdir(parents=True, exist_ok=True)

    wavs = sorted(signals_dir.glob("*.wav"))
    if not wavs:
        raise SystemExit(f"No .wav files found in {signals_dir}")

    for wav_path in wavs:
        out_path = out_dir / f"{wav_path.stem}.normalized.npy"
        print(f"Prebaking {wav_path.name} -> {out_path.relative_to(repo_root)}")
        signal_preprocessor.preprocess_signal(str(wav_path), output_path=str(out_path))

    print(f"Done. Wrote {len(wavs)} file(s) into {out_dir.relative_to(repo_root)}")


if __name__ == "__main__":
    main()
