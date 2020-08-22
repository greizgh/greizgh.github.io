{ pkgs ? import <nixpkgs> { } }:

let
  fhs = pkgs.buildFHSUserEnv {
    name = "buildroot-env";
    targetPkgs = pkgs:
      with pkgs; [
        bc
        ccache
        git
        perl
        gnumake
        diffutils
        diffstat
        chrpath
        gcc
        unzip
        utillinux
        python3
        patch
        wget
        expat
        file
        subversion
        which
        pkgconfig
        openssl
        systemd
        binutils
        ncurses
        zlib
        glibc
        glibcLocales
      ];
    multiPkgs = null;
    extraOutputsToInstall = [ "dev" ];
  };
in fhs.env
