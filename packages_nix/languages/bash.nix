{ pkgs, bash, flakeLib }:
let
  runScript = pkgs.writeShellScript "run" ''
    ${bash}/bin/bash "$@"
  '';
in
  flakeLib.mkLanguage {
    name = "bash";
    package = bash;
    inherit runScript;
    aliases = ["sh"];
  }