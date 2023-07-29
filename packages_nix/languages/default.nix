{ pkgs, lib, flakeLib }:
let
  filterNixFiles = k: v: v == "regular" && k != "default.nix" && lib.hasSuffix ".nix" k;
in (lib.mapAttrs'
  (name: value:
    let 
      name' = lib.removeSuffix ".nix" name;
    in 
      lib.nameValuePair 
        (name')
        (pkgs.callPackage ./${name} { inherit flakeLib; }))
  (lib.filterAttrs filterNixFiles (builtins.readDir ./.)))
