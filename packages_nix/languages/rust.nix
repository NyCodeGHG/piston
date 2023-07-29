{ pkgs, rustc, flakeLib }:
let
  compileScript = pkgs.writeShellScript "compile" ''
    ${rustc} -o binary "$@"
    chmod +x binary
  '';
  runScript = pkgs.writeShellScript "run" ''
    shift
    ./binary "$@"
  '';
in
  flakeLib.mkLanguage {
    name = "rust";
    package = rustc;
    inherit compileScript runScript;
    aliases = [ "rs" ];
  }