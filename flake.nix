{
  description = "Development environment for Node.js tooling and applications";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "moxfield-downloader";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = [ pkgs.makeWrapper ];

          dontBuild = true;

          installPhase = ''
            mkdir -p $out/bin $out/lib
            cp dist/moxfield-downloader.mjs $out/lib/
            makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/moxfield-downloader \
              --add-flags "$out/lib/moxfield-downloader.mjs" \
              --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.curl pkgs.nodejs_22 ]}
          '';
        };

        devShells.default = pkgs.mkShell {
          name = "nodejs-dev-shell";

          packages = with pkgs; [
            # Node.js Runtimes & Package Managers
            nodejs_22
            pnpm
            yarn
            bun

            # Language & Formatting Tooling
            typescript
            biome

            # Native Addon Compilation (node-gyp)
            python3
            pkg-config
            gnumake
            gcc

            # Utilities
            jq
            curl
            git
          ];

          shellHook = ''
            REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
            # Prepend local repo bin and node_modules binaries to PATH
            export PATH="$REPO_ROOT/bin:$REPO_ROOT/node_modules/.bin:$PATH"

            # Informational Banner
            echo "=================================================="
            echo "  ⚡ Node.js Development Environment (Nix Flake)"
            echo "=================================================="
            echo "  Node:       $(node --version 2>/dev/null || echo 'N/A')"
            echo "  pnpm:       $(pnpm --version 2>/dev/null || echo 'N/A')"
            echo "  Yarn:       $(yarn --version 2>/dev/null || echo 'N/A')"
            echo "  Bun:        $(bun --version 2>/dev/null || echo 'N/A')"
            echo "  TypeScript: $(tsc --version 2>/dev/null || echo 'N/A')"
            echo "  Biome:      $(biome --version 2>/dev/null || echo 'N/A')"
            echo "  CLI Tool:   $(command -v moxfield-downloader >/dev/null && echo 'Ready in PATH' || echo 'Run pnpm build')"
            echo "=================================================="
          '';
        };
      }
    );
}
