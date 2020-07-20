+++
title = "Smart speakers project"
date = 2020-07-20
description = "Where we design a home-made multiroom sound solution"
+++

I've been wanting to upgrade my sound listening experience since I moved in.
My current stereo system is a millennium era thing boasting a dual tape player and a 3 CDs tray:

<!-- more -->

{{ illustration(src="./stereo.jpg", alt="stereo system", legend="The beast") }}

As much as I like its 2000s look and feel, it does not meet my current expectations:

- CD tray is broken and will eat anything we feed it (when it opens)
- we recovered a tape in it containing some old radio recording (real throwback, big fun)
- listening to spotify is done through the auxiliary input from an old android tablet
- the tuner crackles unless you open a window

I'm sure we can do better in 2020, let's start with some tests and a prototype.

## Ideal setup

I used to play music on my computer using [MPD](https://www.musicpd.org/).
This is a really nice piece of software, but I don't expect my SO to launch a terminal to skip a track.
(There are really polished MPD clients but you get the idea)

Although having multiple application for different sources is acceptable (mpd/spotify), the system should stay reasonably easy to use by a non tech-savvy.

Being able to listen to spotify in a room while a webradio is playing in the kitchen is a must-have.
Speakers should be independent and receive stream over wifi, although I don't mind having to plug them to AC.

From those few requirements, I imagined the following hardware:
- a pair of speakers equipped with some control board and a DAC+amp each;
- a master computer with attached hard-drive streaming to each speaker;

That's fairly easy to source, and cost effective (considering the cost of *Smart speakers* off the shelf).

A friend of mine had two old speakers waiting for a second life.
These are Sony speakers, they need a design refresh to better match our interior but work perfectly fine.

{{ illustration(src="./speakers.jpg", alt="picture of Sony speakers", legend="They had a previous life") }}

I'm sure they will look *glorious* with some reflective vinyl and a flashy green fabric...

As a bonus, this setup would perfectly handle more than 2 speakers.

## Hardware

I already had a raspberry pi 3 lying around and a spare HDD, that will make a perfect control station.

As for the speaker board + amp, I chose a [raspberry pi 0W](https://www.raspberrypi.org/products/raspberry-pi-zero-w/) and a [miniamp](https://www.hifiberry.com/shop/boards/miniamp/).

The raspi is cheap enough to be a no-brainer: it can run linux and connects over wifi.
It should have more computing power than needed to simply decode an audio stream, but this may come handy if I need more flexibility later.

The miniamp is pretty cheap, has the same formfactor than the pi0 and does not require external power (it feeds on the pi's 5V).
It's only 3W so it may not be loud enough for some situations but it's enough for a first prototype.
I've run some tests with the speakers: volume is almost at its maximum to listen *actively*, and half for background music.

Anyway, if at some point I need more power, I'll switch to the more beefy [Amp2](https://www.hifiberry.com/shop/boards/hifiberry-amp2/).
This will come with a larger formfactor and requires an external power supply, I'll keep it simple for the prototype.

## Streaming software

I've been monitoring what's going on in the audio streaming world for a while, here are some existing solutions:
- [pulseaudio](https://www.freedesktop.org/wiki/Software/PulseAudio/Documentation/User/Network/) has network streaming capabilities
- [icecast](https://icecast.org/) can broadcast audio stream
- [ROC](https://roc-streaming.org/) is a promising streaming solution
- [snapcast](https://github.com/badaix/snapcast) allows to switch between clients and sources

Out of those I only tested pulseaudio (already available on my computers, easy to setup) and snapcast.
While ROC and icecast seems to do a good job, they don't help with multiple sources. While the source selection might be doable on pulseaudio level, snapcast is providing it out of the box and I'm lazy.

### Crash test

The first test I ran was with pulseaudio, once you publish your receiver and enable network discovery, streaming is fairly straightforward (refer to the [documentation](https://www.freedesktop.org/wiki/Software/PulseAudio/Documentation/User/Network/#index2h3)):
```
pactl load-module module-null-sink sink_name=rtp
pactl load-module module-rtp-send source=rtp.monitor
```
Select the "rtp" output and the player should start... after a while... and play something...

I remember testing pulseaudio streaming capability few years back and it was somewhat unusable due to the latency.
It turns out that things have not changed much (although I'm on a much more reliable wifi now).

This prompted me to test snapcast, which goes beyond streaming and also manage multiple sources and clients.

According to its readme, snapcast is perfect for my use case:

> Snapcast is a multiroom client-server audio player, where all clients are time synchronized with the server to play perfectly synced audio.

And indeed, I configured [MPD as a source](https://github.com/badaix/snapcast/blob/master/doc/player_setup.md#mpd), started to play a webradio and... was disappointed.

Well, it couldn't work on the first attempt, right?
It turns out when setting up MPD to output to a pipe, I chose a location snapcast didn't have access to.

Once MPD playing, snapcast server up and running, I started a client:
```
snapclient -h 192.168.X.X
```

And was delighted to ear some music.

Now, I can stream to one client, but are all the clients in sync?
The [snapdroid](https://github.com/badaix/snapdroid) Android client to manage the server embeds a convenient test client.
And indeed, clients are playing in sync (as far as I can ear).

## Control system

Now imagine: you are still waiting to receive the hardware, you've ran enough test to know which software solution you'll setup. What do you do?

Build a tailor made sd-image for the control raspi!

I'm in love with [nix](https://nixos.org/) and it turns out you can create an installer image quite easily.
Note that this is an **installer** image (used to install in-place), there is no convenient way to build a **system** image (the one you'll run).

This has been covered [in other blogs before](https://rbf.dev/blog/2020/05/custom-nixos-build-for-raspberry-pis/) but the proposed docker solution seems less than ideal.

I very much prefer the qemu and binfmt approach where the host system delegates aarch64 binary handling to a qemu VM.
Theoretically, configuring your nixos matching with the following is enough to be able to build the rpi3 image:
```nix
boot.binfmt.emulatedSystems = [ "aarch64-linux" ];
```
However, I faced some `Cannot allocate memory` errors.
This was not a lack of memory though, but rather a bug with qemu 4.2.0.

Fortunately, nixos unstable packages qemu5 which does not have this issue.
An overlay later, and the build started correctly.

Now that the host machine can build for aarch64, let's go and initialize a git repository for the image description.

First things first, define a nix-shell:
```nix
{ pkgs ? import <nixpkgs> { } }:
with pkgs;
mkShell { buildInputs = [ nixos-generators ]; }
```

We'll use [nixos-generators](https://github.com/nix-community/nixos-generators) to build the image.
For some reason I did not bother investigate, the [recommended `nix-build` way](https://nixos.wiki/wiki/NixOS_on_ARM#Build_your_own_image) was giving me an unallowed system error.

The installer description looks like this:
```nix
{ pkgs, lib, ... }: {
  sdImage.compressImage = false;
  imports = [ ./secrets/root.nix ./secrets/wifi.nix ];

  networking.hostName = "setup";
  networking.wireless.enable = true;

  # Enable SSH in the boot process.
  systemd.services.sshd.wantedBy = lib.mkForce [ "multi-user.target" ];
  systemd.services.wpa_supplicant.wantedBy =
    lib.mkOverride 10 [ "default.target" ];
}
```

Once booted, the resulting image will automatically connect to the wifi network and allow me to ssh as root with my usual key.

Now to build the image, let's invoke:
```
nixos-generate -f sd-aarch64-installer --system aarch64-linux -c sd-installer.nix
```

Burn the resulting image on some SD card, a `dd` later and I'm waiting for the pi to boot.

This is **extremely** convenient, because once the pi is booted and accessible over SSH I can simply deploy its configuration with [nixops](https://github.com/NixOS/nixops) (another fantastic project).

And in now time there is a running snapserver:
```nix
{ config, pkgs, ... }: {
  services.mpd = {
    enable = true;
    # /mnt/data is a HDD
    musicDirectory = "/mnt/data/music";
    dataDir = "/mnt/data/mpd";
    network.listenAddress = "192.168.X.X";
    extraConfig = ''
      audio_output {
          type            "fifo"
          name            "snapcast"
          path            "/run/snapserver/mpd"
          format          "48000:16:2"
          mixer_type      "software"
      }
    '';
  };
  # Open mpd service
  networking.firewall.allowedTCPPorts = [ 6600 ];

  services.snapserver = {
    enable = true;
    streams = {
      mpd = {
        type = "pipe";
        location = "/run/snapserver/mpd";
        sampleFormat = "48000:16:2";
        codec = "pcm";
      };
    };
  };
}
```

## What's next?

The shipment with the pi0s is still in transit, so for now I can only prepare for final assembly:
- rpi0s will be handled the same way than the control one: nixos-generators for the base image then nixops deployment;
- rpi0s + amp will be mounted behind each speaker. While 4 screws should do, I'm considering a 3D printed enclosure;
