+++
title = "Smart speakers project II"
date = 2020-08-20
description = "Actually making independent speakers"
+++

In the [previous article](@/blog/smart-speakers-plan/index.md) I ended up with a nice _master_ system streaming audio with snapcast.
It's now time to assemble what will be the speakers.

<!-- more -->

## Broadcaster improvement

While I was still waiting for the miniamps to arrive, I've spent some time improving the broadcast system.

I updated snapcast and [librespot](https://github.com/NixOS/nixpkgs/pull/94159) to play along nicely,
since there was an issue with the packaged librespot. I really like how easy it is to use a custom package in nixos, and how easy it is to contribute back to nixpkgs with an update PR.

Then exposed snapcast server on avahi, which is as easy as:
```nix
  services.avahi = {
    enable = true;
    publish.enable = true;
    publish.userServices = true;
  };
```

Not directly related to the broadcaster, I also set up a NTP server on my local network.
This is an attempt to reduce timedrifting between all speakers.
It might not be necessary, but won't add any cost or maintenance burden.

## Change of plan

It wouldn't have been fun if everything went according to initial plan.

One thing that I changed was the way to build the system for each speaker.
I initially planned to build a NixOS image like for the broadcaster.
However, since pi0s are ARMv6 targets, it means I cannot leverage a binary cache.
In other terms, that means I would have to rebuild every single package from scratch.
In a qemu VM...

I gave it a go: set up my host to emulate armv6, create a bare configuration and use nixos-generators.
That was not a success: it was painfully slow and got stuck at some point.

As much as I love nix for system management, it's clearly not the right tool for now for embedded targets.
(It still has a huge potential in this domain though)

I didn't want to download a raspbian image and manually configure the system.
That would have been the easy way, but I wanted a more _scalable_ process.

## Embedded system builders

There are two major contenders when it comes to building tailor made linux systems: [yocto](https://www.yoctoproject.org/) and [buildroot](https://buildroot.org/).
These tools will still require to compile everything, but at least they offer cache and cross-compilation, so that should speed things up.

Yocto was more appealing because of its clean separation of layers.
However I faced a segmentation fault of the cross-compiled `m4` utility.
After some digging in forums, it seems [I'm not the only one facing issues](https://discourse.nixos.org/t/build-a-yocto-rootfs-inside-nix/2643).
At that point I had received the miniamps, so everything was ready to play music except for the software part.
That was a strong motivation to stick to the objective: generating a linux system and not fixing obscure compilation errors.

Time to try buildroot.
Setup is pretty easy: clone, configure and build.
Buildroot assumes few installed dependencies but nothing too fancy, a short [`shell.nix`](./shell.nix) file with a FHSUserEnv will do the trick.

Although one can keep a device definition properly separated from buildroot sources, I more than once had to clean everything because of missing packages.
There is no proper way to extend the `post-image.sh` script, so I spent a fair amount of time to understand it was the cause of missing configuration in `config.txt`.

Once the specifics from buildroot understood, it's basically a matter of configuring and building individual software:
- wpa_supplicant to automatically connect to wireless network;
- ntpd to keep time under control;
- config.txt to [add hifyberry to the device tree overlay](https://www.hifiberry.com/docs/software/configuring-linux-3-18-x/);
- avahi daemon to help find the broadcaster;
- snapclient to stream music;

The build process will output a flashable `sdcard.img` 🎉

The full config can be found [in this repository](https://gitlab.com/greizgh/rspeaker-system).

## Pimp my speakers

I previously mentioned reflective vinyl and green fabric, it turns out we wanted more _glitter_!
Our local DIY store had some fancy adhesive coating, spot on!

{{ illustration(src="./sanded.jpg", legend="unmounted speakers, ready to be painted", alt="sanded speakers") }}

{{ illustration(src="./glitter.jpg", alt="glitter coated speakers") }}

{{ illustration(src="./final.jpg", legend="Final result", alt="final result") }}

## Custom parts

This project involved some 3D printed parts such as the "plugs" to fill the holes previously used to fix the frame holding the fabric.

But the main design work was to create a proper enclosure for the raspberry + miniamp.

{{ illustration(src="./enclosure_cad.jpg", legend="Enclosure model", alt="freecad view of the enclosure") }}

The model is [available on thingiverse](https://www.thingiverse.com/thing:4559293)

{{ illustration(src="./enclosure.jpg", legend="Mounted enclosure", alt="mounted enclosure behind a speaker") }}

## Conclusion

So far we've been pretty happy with these two speakers.

The goal has been reached:
- we have easily relocatable speakers;
- streaming from mpd or spotify is a breeze;
- speaker system is easily reproduced with buildroot;

So what's next?
- maybe experiment with bluetooth streaming as a source
- ditch the venerable hifi system and convert its speakers to wireless ones
