+++
title = "Rust embarqué: jouons avec une stm32"
date = 2019-01-10
description = "Mise en place d'un environnement de développement pour Rust sur cible embarquée. Faire clignoter une LED pas-à-pas sur une carte stm32"
+++

Cela fait quelques semaines qu'une petite carte embarquant un stm32 traînait sur mon étagère.

Ayant récemment eu l'occasion d'assister à une [super présentation sur rust dans l'embarqué](https://mickcherry.io/talks/embedded_rust/embedded_rust.html),
je n'avais plus d'excuse pour laisser cette carte prendre la poussière.

C'est parti, nous allons faire clignoter une LED pas-à-pas.
Au programme: mise en place de l'environnement de développement et découverte des outils Rust pour l'embarqué.

<!-- more -->

## L'engin

La carte en question est une [STM32F103C8T6](https://www.amazon.fr/gp/product/B01C2I7CSU/ref=oh_aui_detailpage_o02_s00?ie=UTF8&psc=1) à 5€.

{{ illustration(src="./board.jpg", alt="L'engin") }}

À ce prix là, on a:

- un CPU 32 bits à 72MHz (Cortex-M3);
- 64K de flash (ou 128K, la spec n'est pas claire sur le sujet);
- 20K de [SRAM](https://fr.wikipedia.org/wiki/Static_Random_Access_Memory);
- 7 timers;
- jusqu'à 80 GPIO;
- un truc qui cause I2C, SPI, USART, USB;
- une LED connectée sur la broche PC13;

Bref, un bon rapport fonctionnalités/prix pour qui veut un peu jouer.

Attention, pour flasher la bête, on va utiliser un programmeur:
un [st-link v2](https://www.amazon.fr/gp/product/B01F37YMJ4/ref=oh_aui_detailpage_o01_s00?ie=UTF8&psc=1) (5€ lui-aussi).

## Préparation de l'environnement de développement

On a le matériel, c'est un premier pas, il faut maintenant préparer notre environnement de développement.
[rust](https://www.rust-lang.org/tools/install) est bien entendu un prérequis, ainsi que rustup (la solution préférée pour installer rust).

Nous allons par ailleurs ajouter une cible au compilateur rustc: thumbv7m-none-eabi.
C'est le jeu d'instructions du Cortex-M3.
Avec rustup, rien de plus simple:

```
rustup target add thumbv7m-none-eabi
```

Il nous faudra également [stlink](https://github.com/texane/stlink) et gdb pour respectivement flasher et débugger la carte.

```
sudo pacman -Sy stlink arm-none-eabi-gdb
```

Le [rust embedded devices working group](https://github.com/rust-embedded/wg) maintient un template d'application
pour les cibles Cortex-M. C'est ce que nous allons utiliser, mais il nous faut pour cela la sous-commande `cargo-generate`.
Installation express:

```
cargo install generate
```

## Bootstrap du projet

Équippés de nos nouveaux outils, initialisons le projet:

```
cargo generate --git https://github.com/rust-embedded/cortex-m-quickstart
```

Après quelques questions, on obtient un nouveau répertoire contenant le projet, à la manière d'un `cargo new`.
La plupart des fichiers sont ceux d'un projet rust classique, mais certains d'entre eux sont issus du template *cortex-m-quickstart*:

- **openocd.{cfg,dbg}**: ce sont les fichiers de configuration d'[openocd](http://openocd.org/), il ne nous intéressent pas puisque nous allons utiliser stlink;
- **.cargo/config**: il s'agit de la configuration de cargo, c'est là que nous spécifions la cible par défaut du projet *thumbv7m-none-eabi*;
- **memory.x**: structure de la mémoire de la plateforme cible, voir ci-dessous;

Il est nécessaire de porter la configuration de la mémoire dans ce fichier *memory.x*,
en reprenant les valeurs de la [datasheet](en.CD00161566.pdf).
Il nous faut en particulier:

- les offsets de départ de la mémoire flash et RAM;
- les tailles de ces mémoires;

La spec nous donne 64K de flash (au minimum, ça peut être 128K) et 20K de RAM.

{{ illustration(src="./memory.jpg", legend="Le mapping tiré de la datasheet nous donne la localisation des mémoires") }}

- mémoire flash: 0x8000000;
- RAM: 0x20000000;

Configurons le fichier **memory.x** en conséquence:

```
MEMORY
{
  FLASH : ORIGIN = 0x08000000, LENGTH = 64K
  RAM : ORIGIN = 0x20000000, LENGTH = 20K
}
```

## Blinking a LED

Il existe plusieurs niveaux d'abstraction permettant de manipuler un microcontroleur et ses périphériques.

**Disclaimer**: les trois niveaux proposés par la suite sont juste un raccourci pour comprendre l'état actuel des bibliothèques, le [Embedded Rust Book](https://docs.rust-embedded.org/book/start/registers.html) offre plus de détails.

Le niveau 0 serait de manipuler directement la mémoire mais le compilateur ne pouvant déterminer le propriétaire de la mémoire se mettrait en travers de notre chemin.
On pourrait avancer à grand coups de *unsafe*: ce ne serait ni ergonomique, ni confortable: à nous d'informer le compilateur qu'on sait ce qu'on fait. Vous-vous en doutez, si c'est le niveau 0 c'est justement parce qu'il est très bas niveau et qu'il existe des couches supérieures bien plus sympa.

Le niveau 1 est constitué des [device crates](https://github.com/rust-embedded/awesome-embedded-rust#device-crates), ce sont des *crates* exposant une API safe pour manipuler les périphériques.
Ce sont ces crates qui vont gérer l'aspect unsafe des différents registres, qui vont certainement le faire mieux que nous, et qui sont parfaitement synchro avec la définition des devices puisque générées depuis les fichiers [SVD - System View Description](http://www.keil.com/pack/doc/cmsis/svd/html/svd_Format_pg.html) des constructeurs.
C'est déjà plus plaisant à manipuler, mais nous allons aller encore plus loin dans l'abstraction.

Au niveau 3 on utilise une définition abstraite du matériel: "initialise-moi un périphérique UART sur tels pins, avec telle configuration".
On parle de HAL: Hardware Abstraction Layer.
Nous allons pouvoir écrire du code presque générique pour peu que les différentes cibles aient les périphériques qui nous intéressent.
Pour reprendre l'exemple de la communication UART, il est possible de balancer des messages sans se préoccuper de savoir si c'est la broche 12 en TX ou la 15.
En deux coups de cuillère à pot on peut cibler une carte STM32F1 ou une STM32F3: leurs propriétés sont différentes mais toutes les deux offres au moins un périphérique série.

Concrètement, nous allons nous appuyer sur la *crate* [embedded-hal](https://github.com/rust-embedded/embedded-hal), qui définit les *traits* intéressants.
En l'état cette crate ne porte pas d'implémentation, puisque les implémentations dépendent du matériel, on va donc ajouter une dépendance à [stm32f103xx-hal](https://github.com/japaric/stm32f103xx-hal).

Dans *Cargo.toml*:
```toml
[dependencies.stm32f103xx-hal]
git = "https://github.com/japaric/stm32f103xx-hal.git"
features = ["rt"]
version = "0.1.0"
```

Cette *crate* n'est pas encore publiée sur crates.io puisqu'il [manque des dépendances](https://github.com/japaric/stm32f103xx-hal/issues/52).
Pour le moment, il est donc nécessaire de préciser le dépôt.

La chaine de production est quasiment mise en place, il est temps d'ouvrir vim.
Rappel de l'objectif: faire clignoter une LED.
Ça tombe bien, la *crate* stm32f103xx-hal propose [un exemple](https://github.com/japaric/stm32f103xx-hal/blob/master/examples/blinky.rs).
Reprenons le code en essayant de comprendre son déroulement.

```rust
// On commence par informer le compilateur qu'on ne veut pas de la lib standard
#![no_std]
// et qu'on a pas de fonction main (celle qui est appelée normalement par la libc)
#![no_main]

// Voir note 1
use panic_halt;

// On alias la crate stm32f103xx_hal derrière le nom "hal"
use stm32f103xx_hal as hal;
// Ce qui nous permet d'avoir uniquement l'alias à remplacer pour cibler une autre carte
use crate::hal::{
    prelude::*,
    device,
    timer::Timer,
};

// Voir note 2
use nb::block;
// On a précisé par l'attribut "no_main" qu'on ne définissait pas de fonction main
// mais il nous faut tout de même indiquer le point d'entrée de notre programme
use cortex_m_rt::entry;

#[entry]
fn main() -> ! {
    // On récupère les périphériques du microcontrôleur
    let cp = cortex_m::Peripherals::take().unwrap();
    // Et ceux de la carte
    let dp = device::Peripherals::take().unwrap();

    // Voir notes 3 et 4
    let mut flash = dp.FLASH.constrain();
    let mut rcc = dp.RCC.constrain(); // RCC: Reset and Clock Control

    // On configure et on verrouille les horloges
    let clocks = rcc.cfgr.freeze(&mut flash.acr);

    // On récupère les GPIO - c'est le port C qui nous intéresse (PC13)
    let mut gpioc = dp.GPIOC.split(&mut rcc.apb2); // APB: Advanced Peripheral Bus
    // Et une référence sur le pin 13
    let mut led = gpioc.pc13.into_push_pull_output(&mut gpioc.crh);

    // On définit un timer se déclenchant toutes les secondes
    // et se basant sur l'horloge système (systick)
    let mut timer = Timer::syst(cp.SYST, 1.hz(), clocks);
    // On notera l'absence de conversion en "tick" d'horloge
    // la fréquence du processeur est complètement masquée

    loop {
        block!(timer.wait()).unwrap();
        led.set_high();
        block!(timer.wait()).unwrap();
        led.set_low();
    }
}
```

Quelques précisions:

1. Contrairement à un binaire exécuté par le système d'exploitation,
il est nécessaire de spécifier la stratégie à adopter en cas de *panic*.
Le [Rust Embedded Book](https://docs.rust-embedded.org/book/start/panicking.html)
mentionne plusieurs comportement.
2. La *crate* embedded-hal a pour objectif de permettre d'écrire du code asynchrone
[selon plusieurs modèles](https://docs.rs/embedded-hal/0.2.2/embedded_hal/#design-goals)
(futures, async/await, etc).
Pour simplifier l'exemple, on utilise la *crate* [nb](https://crates.io/crates/nb), permettant de bloquer sur les actions asynchrones.
3. Que fait la méthode *constrain*?
La documentation nous éclaire un peu: "Constrains the FLASH peripheral to play nicely with the other abstractions".
En gros on obtient un handler sur le périphérique qu'on va pouvoir utiliser avec les traits de embedded-hal.
4. Pourquoi a-t-on besoin de la flash?
C'est une dépendance, remontons la chaine:
- Pour obtenir un [Timer](https://japaric.github.io/stm32f103xx-hal/stm32f103xx_hal/timer/struct.Timer.html),
on doit passer une référence à la configuration des horloges ([doc](https://japaric.github.io/stm32f103xx-hal/stm32f103xx_hal/timer/struct.Timer.html#method.syst));
- La configuration des horloges est obtenue via la méthode *freeze*
([doc](https://japaric.github.io/stm32f103xx-hal/stm32f103xx_hal/rcc/struct.CFGR.html#method.freeze))
qui requiert l'*Access Control Register* (ACR) en argument;
- l'ACR est une propriété de la flash, d'où la nécessité d'en obtenir une référence;

Une propriété intéressante: *freeze* est le point d'entrée pour récupérer la configuration des horloges
et consomme la configuration, garantissant ainsi que la configuration des horloges sera invariante lors de l'exécution.
De la même manière, on ne peut pas obtenir deux références concurrentes à la flash:
les bibliothèques sont construites pour exploiter le langage et tirer parti du [borrow checker](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html).

La boucle principale se passe de commentaires: on compte une seconde, on bascule l'état de la sortie et on recommence.
En revanche on notera l'API ergonomique pour manipuler la sortie: `set_high`, `set_low`,
à comparer à ce qui peut se faire avec une *crate* de plus bas niveau.

Pour compiler, on fait comme d'habitude:

```
cargo build
```

Pas besoin de préciser la cible, nous avons indiqué lors du [bootstrap du projet](#bootstrap-du-projet) que nous ciblons par défaut une architecture thumbv7m-none-eabi.

## Flashage

Le binaire produit par cargo n'est pas flashable tel quel sur la carte, c'est un binaire [ELF](https://fr.wikipedia.org/wiki/Executable_and_Linkable_Format).
Un format de binaire tel qu'ELF n'est utile que lorsqu'un système d'exploitation est responsable de l'exécution des binaires.
Dans notre situation, le microcontrôleur n'a pas besoin de ces informations: au démarrage le pointeur d'exécution est placé au début de la mémoire flash.

Le petit utilitaire *objcopy* nous permet d'extraire la substantifique moelle du binaire:
```
arm-none-eabi-objcopy -O binary target/thumbv7m-none-eabi/debug/test-stm32f103 target/thumbv7m-none-eabi/debug/output.bin
```

Une fois le st-link branché à la carte, nous pouvons flasher le firmware sur la carte:

```
st-flash write target/thumbv7m-none-eabi/output.bin 0x8000000
```

On retrouve ici l'offset 0x8000000 qui correspond au début de la mémoire flash.

La led verte devrait clignoter avec une période de 2 secondes.

{{ video(webm="./blink.webm", loop=true, muted=true) }}

## Debug

Une fonctionnalité pratique du stlink: on peut débugger l'exécution sur la carte directement.

On utilise pour cela `st-util` qui fait le pont entre la carte et le débuggeur;
un serveur en écoute attend la connexion de gdb.

On peut alors lancer `arm-none-eabi-gdb target/thumbv7m-none-eabi/debug/test-stm32f103`.

Il faut se connecter au serveur de debug:
```
(gdb) target remote localhost:4242
```

Posons un premier breakpoint:
```
(gdb) b main.rs:50
(gdb) continue
```

L'exécution s'arrête à la ligne 50, on peut consulter l'état des registres:
```
(gdb) info registers
r0             0x1                 1
r1             0x44344444          1144276036
...
```

C'est exactement le même fonctionnement qu'avec un binaire exécuté sur la machine hôte:
on peut examiner la stack, exécuter pas à pas, etc.

## Bilan

En conclusion:

- le [Cortex-M Quickstart](https://github.com/rust-embedded/cortex-m-quickstart) permet de bootstrapper très rapidement un projet;
- les *device crates* exploitent Rust pour nous empêcher de faire des conneries (accès concurrents entre autre);
- [embedded-hal](https://docs.rs/embedded-hal/0.2.2/embedded_hal/) est encore frais mais permet déjà de manipuler les périphériques avec un haut niveau d'abstraction;

Deux points concernant *embedded-hal* méritent d'être soulignés:
- On va pouvoir faire de l'asynchrone (ou pas) très facilement;
- Les drivers génériques vont se multiplier ([quelques-uns](https://github.com/rust-embedded/awesome-embedded-rust#driver-crates) existent déjà);

Rust embarqué: c'est bon; mangez-en!
