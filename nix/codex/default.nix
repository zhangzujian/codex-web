{
  flake-utils,
  nixpkgs,
  ...
}:
let
  systems = [
    "aarch64-darwin"
    "x86_64-darwin"
    "aarch64-linux"
    "x86_64-linux"
  ];
in
flake-utils.lib.eachSystem systems (
  system:
  let
    pkgs = import nixpkgs { inherit system; };
    version = "0.141.0";
    platform =
      {
        aarch64-darwin = {
          npm = "darwin-arm64";
          hash = "sha256-xigxLikfp+0VZeIb/IvM25358w1opPNUNSApm1EvZW8=";
        };
        x86_64-darwin = {
          npm = "darwin-x64";
          hash = "sha256-xngzOmnYUUy4BMfFXlBB3TGksSi9XEHgyX3hQ5C0/bY=";
        };
        aarch64-linux = {
          npm = "linux-arm64";
          hash = "sha256-mQ3uQCQrN7pTqc05txztNZucdWRiXYM+gLb56YLadrc=";
        };
        x86_64-linux = {
          npm = "linux-x64";
          hash = "sha256-sfN+kL0WaMVNZQbfUybrVErluy9Fv1vhMuT/7sK1uJ4=";
        };
      }
      .${system};
    src = pkgs.fetchurl {
      url = "https://registry.npmjs.org/@openai/codex/-/codex-${version}-${platform.npm}.tgz";
      hash = platform.hash;
    };
  in
  {
    packages.codex =
      pkgs.runCommand "codex-${version}"
        {
          pname = "codex";
          inherit src version;
        }
        ''
          tar -xzf "$src"
          install -Dm755 package/vendor/*/codex/codex "$out/bin/codex"
        '';
  }
)
