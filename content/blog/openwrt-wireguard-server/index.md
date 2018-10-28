+++
title = "Serveur WireGuard sur OpenWRT"
date = 2018-10-28
description = "Mise en place d'un serveur WireGuard sur OpenWRT pour sécuriser les communications"
+++

En début d'année, j'ai investi dans un routeur compatible avec [OpenWRT](https://openwrt.org/), un [Linksys WRT1200AC](https://openwrt.org/toh/hwdata/linksys/linksys_wrt1200ac).
Il fait très bien son boulot, mais il faut reconnaitre que je ne l'exploite pas encore complètement.

Par ailleurs, ma solution de VPN précédente était à base d'OpenVPN,
qui est lourd à mettre en œuvre et à maintenir.
La goutte d'eau a été quand fail2ban m'envoyait 15 mails par heure
pour me prévenir du bannissement d'un malandrin qui tapait sur mon VPN.
J'ai désactivé le service OpenVPN (désolé les copains qui étaient dessus, j'ai pas prévenu).

Tout ça pour dire que: routeur + VPN = OpenWRT + WireGuard.
C'est ce que nous allons mettre en place dans la suite de l'article.

La documentation sur le wiki d'OpenWRT détaille la configuration d'une
interface pour faire transiter tout le trafic du routeur par un tunnel WireGuard.
À l'inverse ici, nous allons configurer le routeur en mode "serveur"
acceptant la connexion de plusieurs pairs *nomades* (téléphone, laptop)
pour accéder aux ressources locales.

<!-- more -->

## Pourquoi WireGuard

WireGuard est encore en développement, et n'a pas été audité (pour le moment).
Cependant, WireGuard a déjà fait l'objet de [plusieurs](https://eprint.iacr.org/2018/080) [papiers](https://courses.csail.mit.edu/6.857/2018/project/He-Xu-Xu-WireGuard.pdf) qui ont montré que les bases sont solides.
En plus du [papier initial](https://www.ndss-symposium.org/ndss2017/ndss-2017-programme/wireguard-next-generation-kernel-network-tunnel/).

OpenVPN, bien que stable, ne fait pas forcément mieux, la version packagée dans Debian Stretch présente des vulnérabilités non patchée.
Vu sur le [debian security tracker](https://security-tracker.debian.org/tracker/source-package/openvpn) le 28/10/2018.

Mon besoin se limite à pouvoir utiliser mes appareils depuis des réseaux wifi non fiables (hôtel, aéroport, gare, etc).
Mes critères de sélection sont donc avant tout d'avoir un truc simple à utiliser et si possible avec une faible maintenance.

WireGuard est résolument simple à mettre en place (pas de PKI comme pour OpenVPN)
et est disponible sur [f-droid](https://f-droid.org/en/packages/com.wireguard.android/) et Linux.
Ça répond à mon besoin immédiat et concernant la maintenance il s'agira probablement
de mettre à jour la configuration à l'occasion d'une montée de version.

## Étape 0: Prérequis

Bien! Il est temps de se retrousser les manches et attaquer la mise en place sur le routeur.

Les prérequis, mais cela semble évident:
- un routeur tournant avec OpenWRT (en version 18.06)
- un cerveau
- de quoi lire et écrire dans un terminal

Comme la probabilité de foutre la merde sur le routeur est non nulle, on commence par faire une [backup de sa configuration](https://openwrt.org/docs/guide-user/installation/generic.backup#backup_openwrt_configuration).

Sauf mention contraire, toutes les commandes sont exécutées sur le routeur en tant que `root`.

## Étape 1: installer WireGuard

On commence en douceur:

```bash
opkg update
opkg install luci-proto-wireguard luci-app-wireguard wireguard kmod-wireguard wireguard-tools
```

Un `lsmod | grep wireguard` nous apprend que le module kernel est bien chargé,
pour autant, la création de l'interface par la suite remonte une erreur "INVALID_PROTO".
Bref, un reboot est nécessaire pour la prise en compte de ce nouveau type d'interface.

## Étape 2: Créer une interface WireGuard

WireGuard repose sur du chiffrement asymétrique, nous allons donc avoir besoin d'une clé privée et d'une clé publique.
L'utilitaire `wg` que l'on vient d'installer permet de faire ça très simplement:

```bash
PRIV_KEY=$(wg genkey)
```

Contrairement à ce que j'ai pu lire ailleurs, on ne va pas écrire la clé dans un fichier, on la conserve en mémoire.
Elle sera de toute façon écrite dans le fichier de configuration des interfaces, et cela évite de laisser trainer une clé privée sur le disque.

Nous avons tout ce qu'il faut pour créer l'interface:

```bash
uci set network.wg0="interface"
uci set network.wg0.proto="wireguard"
uci set network.wg0.private_key="$PRIV_KEY"
uci add_list network.wg0.addresses="10.1.0.1/24"
uci add_list network.wg0.addresses="fcff:1997:5555::/64"
uci set network.wg0.listen_port="56718"
uci commit network
/etc/init.d/network reload
```

Le nom *wg0* est complètement arbitraire, mais c'est utilisé par la doc de WireGuard alors autant rester cohérent.
L'IP donnée est également arbitraire, pourvu que vous fournissiez un sous-réseau privé ([RFC 1918](https://tools.ietf.org/html/rfc1918)).
Ici, toutes les machines connectée au VPN auront une adresse de la forme 10.1.0.X ou en IPv6 fcff:1997:5555:0:X:X:X:X.
Notez que le port d'écoute n'est pas obligatoire, mais sera choisi aléatoirement si il n'est pas spécifié (ce qui peut poser problème par la suite).

Vous devriez voir une nouvelle interface apparaitre sur le routeur.

Afin de rentre cette interface utilisable, il nous faut définir sa zone par rapport au pare-feu.
Je souhaite faire en sorte que mes appareils se comportent comme s'il étaient sur le réseau local,
donc je vais ajouter l'interface *wg0* à la zone *lan*.
Il est tout à fait possible de définir une nouvelle zone dédiée à WireGuard.

```bash
uci add_list firewall.@zone[0].network="wg0"
uci commit firewall
```

Chez moi la zone *lan* porte l'index 0, `uci show firewall` vous le confirmera.

## Étape 3: Connecter un appareil

C'est la tablette Android qui sera le mannequin du crash test.
Je teste sur LineageOS (v15.1) avec l'application WireGuard provenant de F-droid en version 0.0.20180826.

On créé un nouveau tunnel via le joli bouton bleu "+".
La configuration du tunnel en lui même réclame les informations suivantes:

- name: un nom, original
- private/public key: on appuie juste sur le petit bouton "generate"
- addresses: ce sont les adresses attribuées à l'appareil, ici 10.1.0.2/32 et fcff:1997:5555:0:2::/80
- listen port: laissons random, il s'agit du port côté client
- DNS server: l'IP du routeur: 10.1.0.1 , puisqu'il embarque un serveur DNS

Ajoutons maintenant un pair, le routeur, en appuyant sur "add peer":

- public key: on recopie laborieusement la clé publique affichée par `wg`
- allowed IPs: les IPs pour lesquelles le trafic doit être routé par le tunnel, pour tout router: 0.0.0.0/0, ::/0
- endpoint: l'IP publique du routeur et le port d'écoute précédemment renseigné

Il faut également autoriser cet appareil côté routeur:

```bash
uci add network wireguard_wg0
uci set network.@wireguard_wg0[-1].public_key="XXXXXXXX"
uci set network.@wireguard_wg0[-1].route_allowed_ips="1"
uci add_list network.@wireguard_wg0[-1].allowed_ips="10.1.0.2/32"
uci add_list network.@wireguard_wg0[-1].allowed_ips="fcff:1997:5555:0:2::/80"
uci set network.@wireguard_wg0[-1].description='Tablet'
uci commit network
/etc/init.d/network restart
```

Attention, il est important de bien nommer le réseau: `wireguard_<ifname>` (cf le [wiki OpenWRT](https://openwrt.org/docs/guide-user/network/tunneling_interface_protocols?s[]=wireguard#static_addressing_of_wireguard_tunnel)).
Il sera donc normal d'avoir plusieurs entrée avec le même nom "wireguard_wg0" si vous avez plusieurs pairs à connecter.

Autre point de confusion (je me suis fais avoir): la liste "allowed_ips" correspond aux IPs autorisées pour chaque host.
Cette liste servira aux routage des paquets, on ne peut donc pas mettre bêtement "0.0.0.0/0" partout.
La [documentation](https://www.wireguard.com/#cryptokey-routing) le résume très bien:

> In other words, when sending packets, the list of allowed IPs behaves as a sort of routing table,
> and when receiving packets, the list of allowed IPs behaves as a sort of access control list.

La clé publique est là encore à réécrire, j'ai triché en me l'envoyant par jabber de la tablette au laptop pour éviter une recopie hasardeuse.

## Conclusion

Une telle configuration est définitivement plus simple à mettre en place avec WireGuard qu'avec OpenVPN.
Pas d'autorité de certification à définir et maintenir.
Le coût en maintenance semble se limiter à adapter la configuration d'une version à l'autre.

Nous avons un tunnel chiffré entre des appareils nomades (leur IP est inconnue du serveur a priori)
et leur trafic transite par le routeur.
L'objectif est atteint.

Le projet WireGuard est sur de bon rails, il est même prévu d'intégrer le module dans le noyau Linux.
Dans l'ensemble les outils fonctionnent bien et sont faciles à prendre en main.
On sent que l'application Android n'est pas la priorité: elle est fonctionnelle, mais une vu des logs serait appréciable
(actuellement il est possible d'enregistrer le fichier de log sur la carte SD).

Le projet est encore jeune, mais prometteur et répond à vrai besoin.

## Références

- [https://casept.github.io/post/wireguard-server-on-openwrt-router/](https://casept.github.io/post/wireguard-server-on-openwrt-router/)
- [https://www.wireguard.com/](https://www.wireguard.com/)
