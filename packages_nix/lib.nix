{ pkgs }: {
  mkLanguage = {
    name, 
    package, 
    aliases ? [], 
    version ? package.version,
    compileScript ? null,
    runScript,
  }: 
  let
    metadata = {
      language = name;
      inherit version aliases;
    };
    metadataJson = pkgs.writeText "${name}-metadata" (builtins.toJSON metadata);
  in 
    pkgs.stdenvNoCC.mkDerivation {
      pname = "lang-${name}";
      inherit version;
      dontUnpack = true;

      installPhase =
      let
        path = "$out/${name}/${version}";
      in ''
        mkdir -p ${path}
        cp ${metadataJson} ${path}/metadata.json
        cp ${compileScript} ${path}/compile
        cp ${runScript} ${path}/run
      '';
    };
  mkAll = packages: pkgs.symlinkJoin {
    name = "all-languages";
    paths = packages;
  };
}