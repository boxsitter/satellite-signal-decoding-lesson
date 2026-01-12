{
  description = "NOAA Satellite Signal Decoder - Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils }:
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

          # Environment variables
          PYTHONPATH = ".";
        };
      }
    );
}
