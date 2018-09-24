+++
title = "Migration vers LVM"
date = 2014-03-21
path = "migration-lvm.html"
description = "Mise en place de LVM pour la partition système et chiffrement de la partition /home"
[taxonomies]
category = ["linux"]
+++

## Création de la partition LVM

```bash
pvcreate /dev/sda8
vgcreate vg0 /dev/sda8
```

## Déplacement du système

```bash
lvcreate -L 30G -n arch vg0
mkfs.ext4 -j /dev/vg0/arch
mount /dev/vg0/arch /mnt
cd /
find ./ -xdev -print0 | cpio -pm0Vd /mnt
mount /dev/mapper/vg0-arch /mnt
cd /mnt
mount /dev/sda3 /mnt/boot
mount -t proc proc proc/
mount --rbind /sys sys/
mount --rbind /dev dev/
chroot /mnt /bin/bash
```

On édite fstab pour monter /dev/mapper/vg0-arch en /
On régen la conf grub (désactiver les UUID dans /etc/default/grub)
On ajoute le hook lvm à mkinitcpio (/etc/mkinitcpio.conf)
et on regénère l'image:

```bash
mkinitcpio -p linux
```

Let's reboot now!

## Déplacement du home

```bash
lvcreate -L 30G -n home vg0
cryptsetup -v --cipher aes-xts-plain64 --key-size 512 --hash sha512 --iter-time 5000 --use-random luksFormat /dev/mapper/vg0-home
cryptsetup open /dev/mapper/vg0-home home
mkfs.ext4 /dev/mapper/home
```

On copie les données de l'ancien /home sur la nouvelle partition chiffrée:

```bash
mkdir /tmp/oldhome
mount /dev/sda7 /tmp/oldhome
mount /dev/mapper/home /home
cd /tmp/oldhome
find ./ -xdev -print0 | cpio -pm0Vd /home
```

C'est long quand même...

## Montage automatique

On retire l'ancienne ligne concernant le /home dans fstab.

On installe pam_mount, et on configure /etc/security/pam_mount.conf.xml:

```xml
<volume user="USERNAME" fstype="auto" path="/dev/sdaX" mountpoint="/home" options="fsck,noatime" />
<mkmountpoint enable="1" remove="true"/>
```

Ainsi que /etc/pam.d/system-auth (cf [archwiki](https://wiki.archlinux.org/index.php/Pam_mount)):

    auth      optional  pam_mount.so
    password  optional  pam_mount.so
    session   optional  pam_mount.so

### Ajout du 7/8/2014

Suite à une mise à jour (2.25), l'utilitaire _mount_ ne semble pas apprécier l'option "-p".
La solution est d'ajouter la ligne suivante au pam_mount.conf.xml:

```xml
<lclmount>mount -t%(FSTYPE) %(VOLUME) %(MNTPT) "%(if %(OPTIONS),-o%(OPTIONS))"</lclmount>
```
