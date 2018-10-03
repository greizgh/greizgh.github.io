+++
title = "Mise en place de RAID sur un système existant"
date = 2016-07-28
path = "raid-systeme-existant.html"
description = "Mise en place d'un disque supplémentaire en RAID1, sans réinstallation du système au grand complet ni perte de données."
[taxonomies]
category = ["linux"]
+++

Depuis trois ans j\'ai un serveur qui tourne 24/24 dans le cadre
d\'autohébergement. Au bout de trois ans le disque dur du système (oui,
le seul disque, il n\'y a pas que l\'État qui fait des coupes
budgétaires) montre des signes de faiblesse: le démon smart me remonte
des erreurs à propos de secteurs défectueux. En l\'état rien de
catastrophique, le disque n\'est pas plein: il y a encore de la place
pour réallouer des secteurs. Néanmoins, le moment semble bien choisi
pour ajouter un second disque à la machine et mettre en place du
[RAID1](https://fr.wikipedia.org/wiki/RAID_(informatique)#RAID_1_:_Disques_en_miroir)
(miroir).

<!-- more -->

## État initial

La machine est une Debian
[Jessie](https://www.debian.org/releases/jessie/). Le disque fait 320Go
et a été partitionné comme un cochon; j\'ai trois partitions:

-   sda1, 250Mo monté sur /boot (j\'ai un *vieux* BIOS, pas d\'UEFI sur
    la machine)
-   sda2, 1Ko non utilisé. Je ne sais plus comment elle est arrivée là
    celle là
-   sda3, le reste du disque en LVM sur lequel il y a 4 partitions
    logiques: système, home, var et swap

## Objectif visé

L\'objectif est de redonder les données sur deux disques. sda2 ne sert à
rien, on va donc en profiter pour la faire sauter. Il n\'y a donc que
deux partitions réellement utiles: cela va se traduire par deux array
RAID:

-   md0 sur lequel on montera /boot
-   md1 sur lequel on montera le volume LVM avec le reste du système

Comme je suis flemmard, je veux limiter au maximum le downtime et éviter
de passer par une backup externe. Ça élimine déjà la solution bourrin:
*je réinstalle debian en choisissant l\'option RAID au setup*. On est
barbu ou on l\'est pas: on va mettre les mains dans le grub.

L\'opération va s\'effectuer selon le plan suivant:

-   sacrifice humain (pour mettre toutes les chances de notre côté)
-   partitionnement du nouveau disque (sdb)
-   montage du raid sur sdb
-   copie des données
-   reboot sur la nouvelle racine (sur sdb)
-   installation du grub sur sdb
-   bascule de l\'ancien disque (sda)
-   bière de célébration

## Réalisation

### Partitionnement

On y va joyeusement à grand coup de **fdisk** après avoir vérifié deux
fois qu\'on travaille bien sur sdb. On se ménage deux partitions:

-   sdb1 de 250M pour md0
-   sdb2 du reste pour md1

### Montage du raid

On initialise le RAID:

```
mdadm --create /dev/md0 --level=1 --raid-disks=2 missing /dev/sdb1
mdadm --create /dev/md1 --level=1 --raid-disks=2 missing /dev/sdb2
```

**mdadm** est la commande pour administrer le RAID sous Linux. Là on
vient gentiment de lui demander de créer un array md0 (\--create) en
[RAID1](https://fr.wikipedia.org/wiki/RAID_(informatique)#RAID_1_:_Disques_en_miroir)
(\--level=1) qui s\'étendra sur deux disques (\--raid-disks=2) mais dont
le premier n\'est pas encore en place (missing).

Certains conseillent d\'ajouter l\'option `--metadata=0.9`
pour utiliser les superblocks legacy. Ne faites pas ça. Si l\'argument
avancé concernant linux incapable de booter sur du raid *moderne* était
vrai, ce n\'est plus le cas. Non, plus depuis que le noyau est en
version 3. Donc on laisse les métadonnées en version 1.2 (par défaut).

On enregistre la configuration RAID: `mdadm --examine --scan >> /etc/mdadm/mdadm.conf`

On a maintenant deux array RAID prêts à être utilisés comme des
partitions standard (sdbX). On prépare le système de fichier pour md0
(qui portera /boot):

```
mkfs.ext4 /dev/md0
```

Pour md1 on met en place LVM:

```
pvcreate /dev/md1
vgcreate VolGroupRaid /dev/md1
lvcreate -L17G VolGroupRaid -n lvroot
lvcreate -L40G VolGroupRaid -n lvhome
lvcreate -L80G VolGroupRaid -n lvvar
lvcreate -C y -L2G VolGroupRaid -n lvswap
```

Il est temps de créer les systèmes de fichier, je reste classique sur de
l\'ext4:

```
mkswap /dev/VolGroupRaid/lvswap
mkfs -t ext4 /dev/VolGroupRaid/lvroot
mkfs -t ext4 /dev/VolGroupRaid/lvvar
mkfs -t ext4 /dev/VolGroupRaid/lvhome
```

### Synchro des données

Notre nouveau disque est maintenant prêt à recevoir les données
existantes. Pour éviter que le *bruit* ne complique la copie, j\'ai
préféré passer en runlevel singleuser. Avec systemd, ça se fait comme
ça: `sudo systemctl isolate rescue.target`.

Pour chaque partition et volume logique sauf le swap on applique le
processus suivant:

```
mkdit /mnt/raidhome
mount /dev/VolGroupRaid/lvhome /mnt/raidhome
cd /home
cp -dpRx . /mnt/raidhome
```

### Grub

On est prêt à redémarrer, notre nouveau disque contient le système et
nos données. L\'idée est de booter sur le nouveau disque pour intervenir
sur l\'ancien. Pour ça on va modifier la table de partition du nouveau
disque; elle devrait se trouver quelque part dans
`/mnt/raidroot/etc/fstab`. On remplace toutes les références
aux anciennes partitions (/dev/sdaN) par leur équivalent en volume
logique (/dev/VolGroupRaid/lv\<truc\>).

Au reboot on arrête grub pour éditer la ligne et modifier l\'option *set
root*: on remplace par `set root='md/0'`. Cela indique à
grub de booter sur le raid et non plus sur l\'ancien disque. De la même
manière, on indique au noyau que sa racine est maintenant sur le raid:
`root=/dev/mapper/VolGroupRaid-lvroot`

Une fois démarré on est uniquement sur le nouveau disque (le raid
incomplet), le disque original n\'est plus utilisé.

### Configuration de l\'ancien disque

On peut désormais intervenir sur l\'ancien disque pour l\'ajouter au
[RAID1](https://fr.wikipedia.org/wiki/RAID_(informatique)#RAID_1_:_Disques_en_miroir).

Attention, je me suis fait avoir: LVM monte les volumes présents sur
l\'ancien disque, nous empêchant de le repartitionner. On commence donc
par les démonter:

```
lvremove /dev/<ancienVG>/<ancienLV>
vgremove <ancienVG>
pvremove </dev/sdaX>
```

On duplique le schéma de partitionnement du nouveau disque vers
l\'ancien:

```
sfdisk -d /dev/sdb | sfdisk /dev/sda
```

On en profite pour réinstaller grub comme ça on pourra booter
indifférement sur un disque ou l\'autre: `dpkg-reconfigure grub-pc`.
On coche bien les deux disques (sda + sdb).

Il ne reste maintenant plus qu\'à compléter notre array RAID avec
l\'ancien disque:

```
mdadm /dev/md0 -a /dev/sda1
mdadm /dev/md1 -a /dev/sda2
```

La synchro prend du temps, pour 320Go j\'en ai eu pour 1h45. Il est
possible de surveiller la réplication avec:

```
watch -n 10 cat /proc/mdstat
```

## Takeaway

On a un
[RAID1](https://fr.wikipedia.org/wiki/RAID_(informatique)#RAID_1_:_Disques_en_miroir)
combiné à LVM: c\'est flexible et redondé. L\'opération totale a pris
facilement 4h mais a permis de faire le ménage. La partie la plus
complexe concerne grub. J\'ai tourné un peu avant de comprendre que les
pointeurs vers la partition de boot étaient enregistrés dans la MBR: il
faut donc réinstaller grub sur le disque pour prendre en compte les
changements de partition. Par ailleurs, LVM montera l\'ancien volume
tant qu\'il n\'aura pas été démonté: ne cherchez pas plus loin si sfdisk
refuse de repartitionner l\'ancien disque.
