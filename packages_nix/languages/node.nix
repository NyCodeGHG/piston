{ pkgs, flakeLib, nodejs_18, nodejs_20 }:
let
  mkNodeLanguage = package: flakeLib.mkLanguage {
    name = "node";
    inherit package;
    runScript = pkgs.writeShellScript "run" ''
      ${package}/bin/node "$@"
    '';
    provides = [
      {
        language = "javascript";
        aliases = ["node-javascript" "node-js" "javascript" "js"];
      }
    ];
  };
  languages = map mkNodeLanguage [nodejs_18 nodejs_20];
in
  pkgs.symlinkJoin {
    name = "node";
    paths = languages;
  }