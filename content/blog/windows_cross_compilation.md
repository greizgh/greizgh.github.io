+++
title = "Cross-Compilation pour windows"
date = 2014-04-01
path = "cross-compile-windows.html"
description = "Compiler un programme depuis Linux pour Windows ou comment jouer avec cmake et les autotools"
[taxonomies]
category = ["Développement"]
+++

## Contexte

Je souhaite compiler un programme pour windows mais je n'ai pas windows. Hors de question de virtualiser et puis j'aime mon confortable make. Ce sera donc de la cross-compilation.

Pour ajouter au délire, j'ai besoin des dépendances suivantes: SFML, Box2D, Boost et zlib.

La méthode décrite par la suite n'engage que moi, j'ai été surpris de voir que ça fonctionnait.

<!-- more -->

Vu qu'on va compiler des librairies et pour éviter d'en foutre partout, on va se créer un dossier genre "*crossenv*".

## Les bons outils

La cross-compilation suppose d'utiliser un compilateur adapté à la cible. Dans le cas présent il s'agit de mingw, on s'empresse donc d'installer gcc-mingw et ses éventuelles dépendances.

Deux systèmes de construction sont utilisés: CMake et autotools. Dans un cas comme dans un autre, il est possible de spécifier la chaine de compilation que l'on souhaite utiliser (compilateur, linker, etc).

### CMake

CMake permet de définir une toolchain, on ne va pas se priver et on met ça dans *toolchain-mingw32.cmake*:

```cmake
# the name of the target operating system
SET(CMAKE_SYSTEM_NAME Windows)

# which compilers to use for C and C++
SET(CMAKE_C_COMPILER i686-w64-mingw32-gcc)
SET(CMAKE_CXX_COMPILER i686-w64-mingw32-g++)
SET(CMAKE_RC_COMPILER i686-w64-mingw32-windres)

# here is the target environment located
SET(CMAKE_FIND_ROOT_PATH  /usr/i686-w64-mingw32 [crossenv] )

# adjust the default behaviour of the FIND_XXX() commands:
# search headers and libraries in the target environment, search
# programs in the host environment
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
```

Je n'ai rien inventé, ça vient du [wiki cmake](http://www.cmake.org/Wiki/CmakeMingw), il faut juste adapter les noms d'éxécutables.

C'est ensuite presque un plaisir de lancer la compilation de SFML avec ça:

    cmake -DCMAKE_TOOLCHAIN_FILE=[crossenv]/Toolchain-mingw32.cmake -DCMAKE_INSTALL_PREFIX=[crossenv] ..

Il est important d'installer les librairies dans le dossier "*crossenv*" puisqu'on précise dans la toolchain que c'est là qu'il faut chercher. Et en plus c'est plus hygiénique.

Même procédure pour Box2D, j'ai juste eu à changer un header (freeglut_internal je crois) car il ne me trouvait pas <*Windows.h*>: la casse lui posait problème avec <*windows.h*> ça passe.
Une fois compilé, on installe les libs Box2D et les includes à la main dans notre crossenv. C'est moche mais ça fonctionne. En même temps on cherche à compiler un truc pour windows, à ce point là on peu bien copier/coller en mode bourrin.

### Autotools

Il nous faut également zlib, qui utilise autotools. Pas de problème, autotools supporte également la cross-compilation.

    CC=i686-w64-mingw32-gcc AR="i686-w64-mingw32-ar s" RANLIB=i686-w64-mingw32-ranlib ./configure --prefix=[crossenv]
    make
    make install

C'est tout. Il faut juste faire gaffe au "i686-w64-mingw32-ar s", le make pleure sans l'option s.

## Boost

Boost est un cas à part puisqu'utilisant un système de compilation maison: bjam. On commence par éditer tools/build/v2/user-config.jam pour y mettre ça:

    using gcc : 4.8 : i686-w64-mingw32-g++ ;

On se fend ensuite de la procédure normale:

    bootstrap.sh --with-libraries=filesystem,system --without-icu
    bjam toolset=gcc target-os=windows --prefix=[crossenv] threading=multi threadapi=win32 link=static -j 2 --layout=tagged install

Toutes nos dépendances sont compilées, on est content.

## Compilation finale

Ça aurait pu être le titre d'un film mais si ça avait été le cas ça n'aurait probablement pas été intéressant. Parce qu'en fait ça se résume à ça:

    cmake -DCMAKE_TOOLCHAIN_FILE=[crossenv]/toolchain-mingw32.cmake -DCMAKE_INSTALL_PREFIX=[chez toi ou chez moi] ..

Il reste encore un détail à régler, j'aimerais linker statiquement mon exécutable (bah oui, c'est pour windows toussa...). J'ai été bourrin jusqu'au bout en forçant le linkage statique de la SFML et en fillant les arguments suivants à la compilation de mon soft:

    -DBUILD_SHARED_LIBS=false -DCMAKE_EXE_LINKER_FLAGS=-static

## Conclusion

La cross-compilation pour windows c'est pas si terrible que ça. Je m'attendais à pire. C'est pas encore tip-top (header à bouger à la main, linkage hasardeux) mais on arrive quand même au résultat attendu.
Ayant tenté de compiler sous windows, c'est quand même plus simple de cross compiler. M'enfin, les goûts, les couleurs...
