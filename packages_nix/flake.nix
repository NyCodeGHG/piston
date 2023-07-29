{
  description = "Description for the project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = inputs@{ flake-parts, self, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [];
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      perSystem = { config, self', inputs', pkgs, system, ... }: 
      let
        lib = self.lib { inherit pkgs; };
        languages = import ./languages { inherit pkgs; lib = pkgs.lib; flakeLib = lib; };
      in
      {
        packages = languages // {
          all = lib.mkAll (pkgs.lib.attrValues languages);
        };
      };
      flake = {
        lib = import ./lib.nix;
      };
    };
}
