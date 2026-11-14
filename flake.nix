{
  description = "yo - GNOME Shell extension.";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      version = "0.1.1";
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.runCommand "yo-${version}" {
            inherit version;
          } ''
            mkdir -p "$out/share/gnome-shell/extensions/yo@quackhack-mcblindy.com"
            cp -r ${builtins.path {
              path = ./.;
              name = "yo-source";
            }}/yo@quackhack-mcblindy.com/. \
              "$out/share/gnome-shell/extensions/yo@quackhack-mcblindy.com/"
          '';
        });
        
    };}
