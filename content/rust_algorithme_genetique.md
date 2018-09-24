+++
title = "Rust & Algorithmes génétiques"
date = 2015-06-14
path = "rust-algorithmes-genetiques.html"
[taxonomies]
category = ["Développement"]
+++

Cela faisait un moment que je lorgnais sur les algorithmes génétiques.
N'ayant pas d'application sous la main, j'ai laissé traîné un moment, me limitant à la théorie sans jamais m'attaquer à une implémentation.
Parallèlement, je suis l'activité sur [rust](http://www.rust-lang.org) avec intérêt depuis quelques versions.
Avec la sortie de la première version stable en Mai, c'était le bon moment pour commencer à jouer avec.

<!-- more -->

Rust est un jeune langage créé par Mozilla.
Il se positionne sur le créneau des langages systèmes, là où le C et le C++ règnent en maîtres.
L'objectif est de proposer un langage sûr en apportant des garanties sur la manière dont la mémoire est gérée.
Le besoin à l'origine de Rust est né du développement de [Servo](https://github.com/servo/servo), le moteur de rendu HTML expérimental de Mozilla.

**Disclaimer**: Je parle ici de mon apprentissage de [rust](http://www.rust-lang.org), je ne suis pas une référence. Si quelque chose vous pique les yeux, *drop me a line*.

## Hello world

Traditionnellement, on démarre avec un petit *hello world*. En [rust](http://www.rust-lang.org) ça donne ça:

```rust
fn main() {
println!("Hello World");
}
```

Ce n'est pas très marrant.
Ce qui serait beaucoup plus intéressant serait d'avoir un programme qui évolue pour écrire de lui-même le fameux *hello world*.

## Algorithme génétique

Les algorithmes génétiques sont le plus souvent utilisés pour résoudre des problèmes d'optimisation.
Leur gros avantage est qu'ils n'ont pas besoin de parcourir l'intégralité de l'espace des solutions, contrairement aux méthodes analytiques plus classiques.
En contrepartie, ils ne permettent pas d'obtenir *la* solution, mais seulement une *bonne* solution.
Néanmoins, quand il n'existe pas de méthode de résolution analytique, une *bonne* solution est souvent suffisante.

Pour rappel, les algorithmes génétiques s'appuient sur le concept de sélection naturelle et la théorie de l'évolution.
On va se retrouver avec des gènes, des chromosomes, des individus, une population.
On va brasser tout ça pendant quelques générations, histoire que tout ce petit monde se reproduise et *paf!* on a notre mâle alpha: l'individu optimal (la solution à notre problème).

![Gif d'un mec qui se coince dans une motoneige](https://i.giphy.com/YmUDg8P7O4iR2.gif)

> Un bel exemple de sélection naturelle

Un algorithme génétique se décompose classiquement en 3 étapes:

1. initialisation
1. sélection
1. reproduction (parfois décomposé en crossover puis mutation)

On répète les étapes 2 & 3 tant qu'on est pas satisfait du résultat. On peut chercher à atteindre une génération en particulier ou minimiser une erreur.

Clairement, afficher *hello world* ne fait pas partie des problèmes pour lesquels les algorithmes génétiques sont pertinents.
Mais on s'en fout on est des rebelles.
Gardez cependant à l'esprit qu'on va ici un peu détourner l'algo génétique.
Vous vous doutez bien que ça permet de faire des trucs bien plus *badass* que d'afficher un message.

## Écris-moi *hello world*

Rappel de notre objectif: afficher *hello world*, mais de manière indirecte.
Appelons cette chaîne de caractères *target*, c'est l'idéal à atteindre.

### Modélisation du problème

On modélise le problème de la façon suivante:

- La solution est une chaîne de caractères de longueur identique à *target*. Dans notre univers, chaque chaîne de caractères correspond à un [chromosome](https://fr.wikipedia.org/wiki/Chromosome).
- Par extension, chaque caractère de la chaîne correspond à un [gène](https://fr.wikipedia.org/wiki/Gène).
- Un individu est porteur d'un chromosome.
- Une population est constituée de plusieurs individus.

Le fait qu'un individu ne soit porteur que d'un unique chromosome peut paraître inutile: en réalité on lui attribue également un score.
Rien à voir avec le parallèle biologique, c'est propre à l'implémentation.

### Sélection

Pourquoi donner un score à nos individus? Pour les classer et les sélectionner.

Nous allons partir avec une population initiale constituée d'individus générés aléatoirement: avec des chromosomes du style "H"#3NyWGvRmr".
L'idée c'est de faire se reproduire les individus pour combiner leurs chromosomes et, de génération en génération, améliorer le score des meilleurs individus.
Jusqu'à arriver au point où: *chromosome du meilleur individu* = *target*.

Pour déterminer le score de nos individus, on va calculer leur [distance de Levenshtein](https://fr.wikipedia.org/wiki/Distance_de_Levenshtein) par rapport à notre objectif (*target*).

Wikipedia nous dit:

> La distance de Levenshtein est égale au nombre minimal de caractères qu'il faut supprimer, insérer ou remplacer pour passer d’une chaîne à l’autre.

Par exemple, la distance entre "chat" et "chien" est 3. On transforme "chat" en "chien" en remplaçant "at" par "ie" et en ajoutant "n": 3 modifications.

En gros, on va quantifier le nombre de modifications nécessaires pour atteindre *target*.
Le meilleur élément sera celui pour lequel la distance de Levenshtein à *target* sera nulle.

D'un problème de chaînes de caractères, on se retrouve maintenant avec un problème de recherche d'extremum.
C'est là que les algorithmes génétiques sont vraiment utiles.

## Let's get our hands dirty

Il n'y a rien d'extravagant dans l'implémentation en [rust](http://www.rust-lang.org), cependant certains points de détails m'ont amenés à creuser la doc.
Le code dans son intégralité est disponible sur [github](https://github.com/greizgh/hello-rust).

### Individu

Un individu est constitué d'un chromosome et d'un score:

```rust
#[derive(Clone,Eq,PartialEq,PartialOrd)]
struct Individual {
chromosome: String,
fitness: i32,
}
```

[derive](http://rustbyexample.com/trait/derive.html) est un attribut sur la structure *Individual*, cela permet de demander à [rust](http://www.rust-lang.org) de fournir une implémentation basique de quelques *traits*.
Ici on veut pouvoir copier un *Individual* (**Clone**) et le trier (**Eq**, **PartialEq**, **PartialOrd**).
Les *traits* ainsi ajoutés sont très basiques et demandent de définir des implémentations à la main.

Pour pouvoir classer nos individus, on va implémenter la méthode **cmp** du *trait* `std::cmp::Ord <https://doc.rust-lang.org/std/cmp/trait.Ord.html>`_:

```rust
impl std::cmp::Ord for Individual {
fn cmp(&self, other: &Self) -> std::cmp::Ordering {
self.fitness.cmp(&other.fitness)
}
}
```

L'implémentation d'une méthode s'effectue à l'aide du mot-clé **impl** en précisant éventuellement le *trait* associé.
Il est également possible d'implémenter une méthode, sans faire référence à un *trait*.

C'est ce qui est fait pour la méthode *new* de *Individual* (en [rust](http://www.rust-lang.org) cette méthode est par convention utilisée comme un constructeur):

```rust
impl Individual {
fn new<S: Into<String>>(s: S) -> Individual {
Individual {chromosome: s.into(), fitness: 0}
}
}
```

Cette méthode est assez évidente, elle permet de créer un individu avec un chromosome donné.
Initialement, elle était implémentée comme `new(s: &str) -> Individual`.
Le problème avec ça c'est qu'il fallait transformer des *String* en *&str*, opération peu coûteuse, pour ensuite retransformer les *&str* en *String*, une opération plus coûteuse.

En même temps, [il est préférable de passer des &str plutôt que des String](http://smallcultfollowing.com/rust-int-variations/imem-umem/guide-strings.html),
ce qui serait top serait de pouvoir manger des deux!

C'est ce que permet de faire **Into**: c'est un trait qui expose une méthode de conversion.
Ça tombe bien puisque le trait *Into<String>* est implémenté pour le type *&str*.
L'appel à *into()* nous renvoit un *String*. On limite donc le coût de conversion uniquement aux cas où **s** est un *&str*.

### Population

La population ressemble à ça:

```rust
struct Population<'a> {
mutation_rate: f32,
crossover_rate: f32,
generation: i32,
individuals: Vec<Individual>,
fitness: &'a (Fn(&Individual) -> i32),
}
```

On retrouve quelques paramètres permettant de jouer sur la reproduction des individus:

- **mutation_rate**: le taux de mutation, correspondant à la probabilité pour un gène lors de la reproduction de muter
- **crossover_rate**: la probabilité pour un gène d'être à l'origine d'un enjambement_.

**generation** est un bête compteur, pour savoir à quelle génération en est la population.

Le plus intéressant est *fitness*, décomposons la ligne:

- **&** correspond à une référence
- **Fn(&Individual) -> i32** correspond au type d'une fonction prenant une référence vers un individu et retournant un entier

En gros, **fitness** est une référence vers notre fonction évaluant le score d'un individu.
L'avantage de passer une référence, c'est que la population n'est pas mariée à Levenshtein.
Si demain on veut évaluer nos individus différemment, pas besoin de toucher à la population.
L'autre truc cool, c'est que **fitness** peut être (et sera) une référence vers une [closure](https://doc.rust-lang.org/book/closures.html).

On a pas encore parlé du **'a**: il s'agit d'une durée de vie ([lifetime](https://doc.rust-lang.org/book/lifetimes.html)).
Comme évoqué plus haut, [rust](http://www.rust-lang.org) ambitionne d'être un langage *sûr*.
Ce que propose rust, c'est de vérifier statiquement qu'on ne va pas se tirer une balle dans le pied en tripotant des variables qui n'existent plus.

Ici notre population conserve une référence vers une [closure](https://doc.rust-lang.org/book/closures.html).
Dans ce cas, rust s'assure seul que la référence sera valide sur toute la vie de l'instance de *Population*.
Le problème, c'est dans le cas d'une référence vers une instance de *Population*:
comment s'assurer que la référence vers la closure ne soit pas désallouée avant la fin de vie de l'instance de *Population*?

C'est là que rust nous demande gentiment de lui filer un coup de main en précisant un [lifetime](https://doc.rust-lang.org/book/lifetimes.html).
Quand on écrit ``struct Population<'a>``, on indique à rust que Population a une durée de vie **a**.
Quand on écrit ``fitness: &'a ...``, on indique à rust que cette référence doit vivre au moins aussi longtemps que *Population*.

### Sélection - Reproduction - Mutation

Rien de trop particulier, par rapport à [rust](http://www.rust-lang.org).
Un algorithme génétique, ça ressemble quand même vachement à un autre algorithme génétique...
On a nos briques de base, il ne reste qu'à implémenter deux trois méthodes pour que ça roule.

- [Individual::new_random](https://github.com/greizgh/hello-rust/blob/master/src/main.rs#L36): pour générer un nouvel individu avec un chromosome aléatoire.
- [Individual::mutate](https://github.com/greizgh/hello-rust/blob/master/src/main.rs#L42): pour faire muter les gènes d'un individu.
- [Population::crossover](https://github.com/greizgh/hello-rust/blob/master/src/main.rs#L92): qui prend deux individus et brasse leurs chromosomes.
- [Population::breed](https://github.com/greizgh/hello-rust/blob/master/src/main.rs#L110): c'est le coeur de la sélection et de la reproduction:
  on garde les 80% meilleurs individus et on les reproduit deux à deux (crossover).
  Une passe est faite pour éventuellement faire muter les individus.
  On complète ensuite la population par des individus générés aléatoirement, c'est important pour garder une taille de population constante.

## Pour finir

Tout ça pour afficher un pauvre *hello world*!
Ça aura au moins servi à plonger dans [rust](http://www.rust-lang.org), et avoir le plaisir de faire évoluer quelques chromosomes. Comme les pokémons mais en plus vénère.

Pour chaque génération, on affiche la taille de la population, le meilleur élément et sa distance à l'objectif entre parenthèses::

    Generation 0, size: 200	Fittest: @ell#<r.78*S (9)
    Generation 1, size: 200	Fittest: p-ll#N>.rH*Q (9)
    Generation 2, size: 200	Fittest: JeTlWKror8bS (8)
    Generation 3, size: 200	Fittest: JellWK>o#%bS (8)
    Generation 4, size: 200	Fittest: QeTlWKror8bS (8)
    Generation 5, size: 200	Fittest: H-ll#N>orLl] (7)
    Generation 6, size: 200	Fittest: HeloooWarA@W (6)
    Generation 7, size: 200	Fittest: H-loooWorLl] (6)
    Generation 8, size: 200	Fittest: 'eTlx ho,ld! (5)
    Generation 9, size: 200	Fittest: 'ello >orllS (4)
    Generation 10, size: 200	Fittest: x-llo >orllS (5)
    Generation 11, size: 200	Fittest: xello WorllS (3)
    Generation 12, size: 200	Fittest: HellooWorl@> (3)
    Generation 13, size: 200	Fittest: HelgooWorl@> (4)
    Generation 14, size: 200	Fittest: xelgo Worll> (4)
    Generation 15, size: 200	Fittest: Helgo Worl@> (3)
    Generation 16, size: 200	Fittest: HellA Worl@> (3)
    Generation 17, size: 200	Fittest: Hello WorGdS (2)
    Generation 18, size: 200	Fittest: Hello WorldS (1)
    Generation 19, size: 200	Fittest: Hello World! (0)

Voilà voilà, [rust](http://www.rust-lang.org) c'est marrant à utiliser.
Ça impose la rigueur.

On sent que le langage est jeune: ça bouge encore pas mal, même si l'objectif est de ne pas casser la librairie standard.
Heureusement, [cargo](https://doc.crates.io/), l'outil de construction de projet et gestion de dépendances tient ses promesses.

Pour arriver à stabiliser la lib standard, le choix a été fait de limiter sa taille en externalisant ce qui pouvait l'être dans des packages distincts.
Dans le monde rust, ces packages sont des [crates](https://doc.rust-lang.org/book/crates-and-modules.html) et on les gère avec [cargo](https://doc.crates.io/).

On se retrouve avec un écosystème dynamique et déjà bien vivant.
Les outils sont jeunes mais tiennent la route: on peut déjà bien s'amuser.
