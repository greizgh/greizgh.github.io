+++
title = "NixOS chez kimsufi"
date = 2019-06-15
description = "Installation de NixOS sur un serveur kimsufi"
+++

Notes rapides concernant l'installation de NixOS sur un serveur [kimsufi](https://www.kimsufi.com/fr/).
Kimsufi permet de jouer avec des machines dédiées pour moins de 5€ par mois.
C'est l'occasion de tester [NixOS](https://nixos.org/), une distribution dont la promesse me fait de l'œil.

<!-- more -->

## Objectif

La machine, une fois configurée doit remplir les critères suivants:

- le disque doit être chiffré (à l'exception de la partition `/boot`);
- au boot, la machine doit attendre la saisie de la passphrase en SSH;

**Note**: Lors de mes différents tests, la machine s'est retrouvée plusieurs fois "hors ligne" (ne répondant plus au ping). Il s'avère que cela déclenche une alerte chez kimsufi.
Pour éviter de voir votre machine réinitialisée (et pour la tranquillité des techniciens d'astreinte), il peut être bon de désactiver le monitoring le temps de l'installation.

## Installation

Kimsufi ne propose pas d'installation intégrée de NixOS et on ne peut pas booter une ISO arbitraire.
On va s'en sortir avec l'[installation depuis une autre distribution](https://nixos.org/nixos/manual/index.html#sec-installing-from-other-distro).

Il existe d'autres alternatives: il est possible de booter une iso via qemu.
J'ai tenté mais même après plusieurs heures je n'ai jamais atteint un shell interactif.

### Mode rescue

La première étape consiste à avoir un système minimal depuis lequel dérouler l'installation.
Le plus simple est de passer en mode "rescue" pour avoir une debian.
Cela correspond à l'option "rescue64-pro" du dashboard kimsufi.

### Partitionnement

Une fois connecté en root sur le rescue, on va monter le disque du serveur sur `/mnt` et le partitionner comme on le sent.

On va avoir trois partitions:

- /boot en ext4 non chiffrée;
- / en ext4 sur du LUKS;
- une partition swap;

Il est conseillé de monter la swap (`swapon /dev/sda3`) dès que possible vu la mémoire limitée de la machine.

### Installation de nix

Avant de se lancer dans l'installation de nix (le gestionnaire de paquets de NixOS), il nous faut un utilisateur non root.
En effet, nix refusera de s'installer en tant que root, mais nécessite l'utilisation de sudo.

Donc:

```
apt install sudo
useradd -m -G wheel setupuser
su setupuser
```

Et c'est parti pour l'installation de nix:

```
curl https://nixos.org/nix/install | sh
. $HOME/.nix-profile/etc/profile.d/nix.sh
```

On bascule tout de suite sur le channel stable:

```
nix-channel --add https://nixos.org/channels/nixos-19.03 nixpkgs
```

Et on installe les outils d'installation:

```
nix-env -iE "_: with import <nixpkgs/nixos> { configuration = {}; }; with config.system.build; [ nixos-generate-config nixos-install nixos-enter ]"
```

Je n'installe pas le manuel, c'est délibéré puisqu'on est en remote; le manuel je peux le lire depuis la machine de travail et le rescue est uniquement en RAM.
Donc évitons de surcharger inutilement la mémoire.

On peut générer la config:

```
sudo `which nixos-generate-config` --root /mnt
```

Avant de lancer l'installation, il va falloir faire quelques adaptation à la configuration.

### SSH dans l'initramfs

Il est impératif d'ajouter le pilote de la carte réseau à l'initramfs, au risque d'être bloqué au boot (puisqu'on attend la passphrase en ssh).
Devinez comment je m'en suis rendu compte...

Dans hardware-configuration.conf, on ajoute le driver `e1000e`:
```
boot.initrd.availableKernelModules = [ "uhci_hcd" "ahci" "e1000e" ];
```

On peut maintenant configurer l'init dans configuration.conf:
```
  boot.initrd.network.enable = true;
  boot.initrd.network.ssh.enable = true;
  boot.initrd.network.ssh.hostRSAKey = /boot/dropbear_rsa_host_key;
  boot.initrd.network.ssh.authorizedKeys = ["ssh-rsa XXXXX user@machine"];
```

La clé RSA doit être disponible à la création de l'initramfs, mais peut se trouver complètement ailleurs que sur /boot.

### Installation

On est presque prêt à lancer l'installation.
Presque, parce que sur debian le $PATH user ne contient pas l'utilitaire chroot.

On va donc l'exposer:
```
export PATH=/usr/sbin:/sbin:$PATH
```

Et normalement l'installation devrait bien se passer:

```
sudo PATH="$PATH" NIX_PATH="$NIX_PATH" `which nixos-install` --root /mnt
```

Au boot, la machine va attendre la passphrase avant de charger le système.

## Autres ressources

- [une autre méthode d'installation, qui gère l'IPv6](https://www.codejam.info/2015/12/installing-nixos-on-a-kimsufi.html)
- [booter une iso via QEMU](https://it-offshore.co.uk/linux/alpine-linux/64-alpine-linux-kvm-vps-without-a-custom-iso)
