{
  description = "NOAA Satellite Signal Decoder - Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        
        # Python environment with all required packages
        pythonEnv = pkgs.python3.withPackages (ps: with ps; [
          numpy
          scipy
          pillow
          # Additional useful development tools
          ipython
          pytest
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Python with required packages
            pythonEnv
            
            # Development tools
            git
            
            # Optional: Node.js for additional web tooling if needed
            nodejs
            nodePackages.http-server
          ];

          shellHook = ''
            echo "🛰️  NOAA Satellite Signal Decoder - Development Environment"
            echo "=============================================="
            echo ""
            echo "Python version: $(python --version)"
            echo "Python packages available:"
            echo "  - numpy ($(python -c 'import numpy; print(numpy.__version__)')"
            echo "  - scipy ($(python -c 'import scipy; print(scipy.__version__)')"
            echo "  - pillow ($(python -c 'import PIL; print(PIL.__version__)')"
            echo ""
            echo "Web Server Commands:"
            echo "  python -m http.server 8000       # Start Python HTTP server on port 8000"
            echo "  http-server -p 8000 -c-1         # Start Node.js HTTP server (no cache)"
            echo ""
            echo "Quick Start:"
            echo "  1. Run: python -m http.server 8000"
            echo "  2. Open: http://localhost:8000"
            echo ""
            echo "Python Scripts:"
            echo "  - signal_preprocessor.py  # WAV to signal data"
            echo "  - image_decoder.py        # Signal to image"
            echo "  - worker.py               # Pyodide worker integration"
            echo ""
          '';

          # Environment variables
          PYTHONPATH = ".";
        };
      }
    );
}
