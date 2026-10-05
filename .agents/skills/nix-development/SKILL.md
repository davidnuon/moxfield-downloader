---
name: nix-development
description: Use when packaging software with Nix, configuring Flakes (flake.nix), setting up reproducible devShells, updating flake.lock, or diagnosing Nix build and evaluation errors.
---

# Nix Development & Flakes Runbook

## Core Workflows

### 1. Multi-Platform `devShell` Pattern
Use this standard flake pattern for project developer environments:
```nix
{
  description = "Project Development Flake";

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
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            nodePackages.pnpm
            git
            jq
          ];

          shellHook = ''
            export NODE_ENV=development
          '';
        };
      }
    );
}
```

### 2. Packaging Node.js Applications (`buildNpmPackage`)
```nix
pkgs.buildNpmPackage {
  pname = "moxfield-downloader";
  version = "1.0.0";
  src = ./.;

  # Step 1: Set to pkgs.lib.fakeHash on first run, build, copy computed hash
  npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

  # Build adjustments
  dontNpmPrune = false;
}
```

### 3. Debugging Runbook
- **Trace Evaluation Errors**: `nix build --show-trace -L`
- **Inspect Flake Outputs**: `nix flake show`
- **Explore Attributes**: `nix repl -f '<nixpkgs>'` or `nix repl .#`
- **Fix Hash Mismatches**: Replace hash with `pkgs.lib.fakeHash`, run `nix build`, then copy the hash reported by Nix.
- **Update Specific Input**: `nix flake lock --update-input nixpkgs`
