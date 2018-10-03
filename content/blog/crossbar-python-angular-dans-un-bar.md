+++
title = "C'est crossbar, python et angular qui rentrent dans un bar..."
date = 2015-08-09
path = "crossbar-python-angular-dans-un-bar.html"
description = "Ou comment résoudre un problème de concurrence avec une application web basée sur crossbar, python et angular."
[taxonomies]
category = ["Développement"]
+++

Depuis que la société où je travaille a déménagé, il y a quelques
semaines de ça, mes collègues et moi sommes confrontés à un problème
majeur: les toilettes sont sur le palier. Le problème avec cette
topologie, c\'est qu\'il est impossible de savoir à l\'avance si les
chiottes sont libres ou pas. On se retrouve donc souvent devant une
porte fermée, dans l\'impossibilité d\'assouvir nos besoins les plus
naturels.

C\'est dans ces moments-là que les plus bas instincts se réveillent et
nous poussent à commettre les pires attrocités. Il est bien connu que
l\'Homme est un loup pour l\'Homme. Ainsi, dans le but de maintenir une
atmosphère conviviale et détendue, il est nécessaire de trouver une
solution.

<!-- more -->

![My turn.](https://media.giphy.com/media/1WQLKmc1Gfhny/giphy.gif)

En attendant un système de supervision des chiottes en temps réel (on y
travaille, à base d\'[Arduino](https://www.arduino.cc/)), un système de
*verrou* fera l\'affaire.

L\'idée est la suivante: un serveur central gère l\'état de la
ressource, les participants peuvent la verrouiller ou la libérer. Oui
c\'est une mutex IRL. Ou un bâton de parole. Mais pour les chiottes.

Une petite application comme celle-ci me semble un bon prétexte pour
jouer un peu avec [crossbar](http://crossbar.io/) et
[angular](https://angular.io/).

[Angular](https://angular.io/), c\'est un framework MVC javascript
développé par Google. [Crossbar](http://crossbar.io/), c\'est un routeur
[WAMP](http://wamp.ws/) (Web Application Messaging Protocol). En gros ça
permet de faire causer plein de composants hétérogènes ensemble. C\'est
assez puissant, ça permet de faire du Pub/Sub et du RPC super
facilement. Pour plus de détails, je vous invite à lire l\'[explication
de
Sam](http://sametmax.com/crossbar-le-futur-des-applications-web-python/).

## Le plan

J\'imagine bien une petite application web avec un gros bouton \"Je vais
aux chiottes\" qui se transforme en \"J\'ai fini!\" au clic. Bien sûr
l\'idée c\'est de partager avec tout le monde (anonymement) l\'état de
la ressource histoire de ne pas se retrouver devant une [race
condition](https://fr.wikipedia.org/wiki/Situation_de_compétition).

Pour éviter les abus, seul le participant ayant verrouillé la ressource
peut la déverrouiller. On identifiera les participants par un uuid
généré par le backend.

Sur le plan technique, on va s\'appuyer sur les technologies suivantes:

-   [crossbar](http://crossbar.io/) comme routeur
    [WAMP](http://wamp.ws/)
-   [python](https://www.python.org/) dans sa version 3 comme langage
    serveur
-   [angular](https://angular.io/) premier du nom pour la partie
    frontend

## Backend

### Crossbar

[Autobahn](http://autobahn.ws/) (la lib pour causer
[WAMP](http://wamp.ws/)) est compatible python3, mais
[crossbar](http://crossbar.io/), le routeur ne l\'est pas encore. Du
coup on va se créer deux environnements virtuels pour bosser: un pour
crossbar et un pour notre backend.

```bash
virtualenv backend_env
virtualenv crossbar_env -p python2
```

Avec *crossbar\_env*, on bootstrap crossbar:

```bash
crossbar init
```

Par la suite, dès qu\'on touchera à crossbar, on le fera avec
*crossbar\_env*.

On va tout de suite configurer crossbar, ça sera fait. Tout se passe
dans le fichier *.crossbar/config.json* qui a normalement du être créé
lors de notre crossbar init:

```json
{
   "controller": {
   },
   "workers": [
      {
         "type": "router",
         "realms": [
            {
               "name": "lockr",
               "roles": [
                  {
                     "name": "anonymous",
                     "permissions": [
                        {
                           "uri": "*",
                           "publish": true,
                           "subscribe": true,
                           "call": true,
                           "register": true
                        }
                     ]
                  }
               ]
            }
         ],
         "transports": [
            {
               "type": "web",
               "endpoint": {
                  "type": "tcp",
                  "port": 8080
               },
               "paths": {
                  "/": {
                     "type": "static",
                     "directory": "../web"
                  },
                  "ws": {
                     "type": "websocket"
                  }
               }
            }
         ]
      }
   ]
}
```

Le *realm* défini ligne 9 représente le contexte de notre application.
Il est tout à fait possible d\'avoir plusieurs *realms* sur un même
serveur, tout en garantissant un cloisonnement entre les contextes
puisque crossbar ne routera les messages qu\'au sein du même *realm*.

On définit un transport web sur le port 8080 et on demande à crossbar de
servir le contenu du répertoire *web* (ligne 34). C\'est là qu\'on
mettra notre app [angular](https://angular.io/).

On informe crossbar qu\'on veut faire du websocket sur /ws (ligne 38).
C\'est par là que nos composants vont communiquer.

### Serveur

J\'emploie le terme *serveur* depuis le début mais ce n\'est pas
complètement approprié. [Crossbar](http://crossbar.io/) ne fait pas de
distinction entre serveur et client, pour lui il n\'y a que des
composants qui causent entre eux. Du coup à partir de maintenant on
appellera le composant gardien de la ressource *SeatComponent*.

Avec *backend\_env*, on install la lib autobahn. On précise qu\'on veut
bosser avec asyncio mais il est également possible de jouer avec twisted
(cf [la
doc](http://autobahn.ws/python/installation.html#installing-autobahn)):

```bash
pip install "autobahn[asyncio]"
```

Il ne nous reste plus qu\'à écrire notre composant *SeatComponent*. Rien
de bien compliqué, on va conserver l\'état de la ressource sous forme de
booléen: vrai si c\'est libre, faux sinon. Il nous faut également
conserver l\'identifiant du composant ayant verrouillé la ressource,
pour que lui seul puisse la libérer.

On va exposer des méthodes en RPC:

-   lock(id\_du\_client): pour demander à verrouiller la ressource
-   unlock(id\_du\_client): pour faire le contraire
-   get\_id(): pour demander un identifiant
-   refresh(): pour réémettre l\'état de la ressource. On en aura besoin
    quand un nouveau front web se connectera ou que l\'état de la
    ressource changera.

Émettre l\'état de la ressource ça veut dire publier des messages. On
aura deux messages: **locked** et **unlocked**.

En s\'appuyant sur la [doc
autobahn](http://autobahn.ws/python/wamp/programming.html#registering-procedures),
notre composant ressemble à ça:

```python
#!/usr/bin/env python
from asyncio import coroutine
from autobahn.asyncio.wamp import ApplicationSession, ApplicationRunner
import uuid


class SeatComponent(ApplicationSession):
    _free = True
    _locker_id = ""

    def get_id(self):
        """Get unique identifier"""
        return str(uuid.uuid4())

    def refresh(self):
        """Send lock/unlock events according to current seat state"""
        if self._free:
            self.publish('lockr.seat.unlocked', self._locker_id)
        else:
            self.publish('lockr.seat.locked', self._locker_id)

    def lock(self, client):
        """Lock the resource

        Returns True if successfully locked, False otherwise
        """
        if not self._free:
            return False
        else:
            self._locker_id = client
            self._free = False
            self.refresh()
            return True

    def unlock(self, client):
        """Release the resource

        Returns True if successfully released, False otherwise
        """
        if not self._free and client == self._locker_id:
            self._free = True
            self.refresh()
            return True
        else:
            return False

    @coroutine
    def onJoin(self, details):
        try:
            yield from self.register(self.get_id, 'lockr.seat.get_id')
            yield from self.register(self.lock, 'lockr.seat.lock')
            yield from self.register(self.unlock, 'lockr.seat.unlock')
            yield from self.subscribe(self.refresh, 'lockr.seat.refresh')
        except Exception as e:
            print("Register error: {}".format(e))

if __name__ == '__main__':
    runner = ApplicationRunner(url='ws://localhost:8080/ws', realm='lockr')
    runner.run(SeatComponent)
```

Qu\'est-ce qu\'on a fait ici? On a défini notre composant
*SeatComponent*, muni de méthodes pour agir sur la ressource. Ces
méthodes sont exposées en RPC dans la méthode appelée lors de la
connexion à crossbar (le *onJoin*): via la méthode **register**.

La souscription à un événement est similaire, on fait appel à
**subscribe** en précisant l\'événement et le handler. Ici c\'est la
méthode *refresh* qui sera appelée à la réception d\'un événement
\'*lockr.seat.refresh*\'.

Le *runner* défini à l\'avant-dernière ligne est configuré avec les
éléments renseignés plus tôt dans la configuration de crossbar.

On a maintenant notre composant, on peut le tester en vitesse pour
vérifier qu\'on ne s\'est pas planté.

Hop, hop, un petit composant de test:

```python
#!/usr/bin/env python
from autobahn.asyncio.wamp import ApplicationSession, ApplicationRunner
from asyncio import coroutine


class TestComponent(ApplicationSession):
    @coroutine
    def onJoin(self, details):
        print("session ready")

        try:
            res = yield from self.call('lockr.seat.get_id')
            print("call result: {}".format(res))
        except Exception as e:
            print("call error: {0}".format(e))


if __name__ == '__main__':
    runner = ApplicationRunner(url='ws://localhost:8080/ws', realm='lockr')
    runner.run(TestComponent)
```

Normalement en lançant le serveur et le test, on devrait obtenir un truc
comme ça:

```
session ready
call result: b654c12f-e036-418e-ae81-70be2b10258a
```

Comme sur des roulettes, on peut passer à la partie front pour afficher
un joli bouton.

## Frontend

Vous vous souvenez du répertoire **web** dont on avait parlé dans la
conf crossbar? Ben c\'est là-dedans qu\'on va se mettre.

Comme on est pas des gros sales, on va gérer nos dépendances avec
[bower](http://bower.io/):

```
bower init
bower install angular angular-wamp bootstrap --save
```

On installe donc [angular](https://angular.io/), angular-wamp et
bootstrap. On pourrait utiliser directement autobahnjs, mais puisque
[angular-wamp](https://github.com/voryx/angular-wamp) nous offre un
service pour faire du WAMP, pourquoi se priver?

Bootstrap c\'est pour faire un front hyper original. Pour afficher un
bouton c\'est bien nécessaire. Enfin il faut avouer que je suis une
quiche en design\...

On se créer un *index.html* de base:

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Lockr</title>
        <link href="bower_components/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="bower_components/bootstrap/dist/css/bootstrap-theme.min.css" rel="stylesheet">
        <link href="style.css" rel="stylesheet">
    </head>
    <body>
        <script src="bower_components/jquery/dist/jquery.min.js"></script>
        <script src="bower_components/bootstrap/dist/js/bootstrap.min.js"></script>
        <script src="bower_components/angular/angular.min.js"></script>
        <script src="bower_components/autobahn/autobahn.min.js"></script>
        <script src="bower_components/angular-wamp/release/angular-wamp.min.js"></script>
        <script src="app.js"></script>
    </body>
</html>
```

Outre les dépendances, on appelle *style.css* pour mettre le bouton en
taille maxi et *app.js* qui contiendra notre appli angular.

Déclarons notre application:

```js
var app = angular.module('LockrWebApp', ['vxWamp']);
```

Une unique dépendance: angular-wamp, qu\'on s\'empresse de configurer:

```js
app.config(['$wampProvider', function($wampProvider) {
  $wampProvider.init({
    url: 'ws://localhost:8080/ws',
    realm: 'lockr'
  });
}]);
```

On précise le realm et l\'url qu\'on avait configuré dans
.crossbar/config.json.

Reste plus qu\'à écrire notre contrôleur:

```js
app.controller('MainCtrl', ['$scope', '$wamp', function($scope, $wamp) {

  // C'est l'identifiant du client
  var uuid;

  // Le bouton est initialisé désactivé
  $scope.seat_state = false;
  $scope.btn_msg = "Wait for it...";
  $scope.btn_disabled = true;

  // En cas d'erreur on désactive le bouton
  // et on affiche un message fort à propos
  function handleError(err) {
    $scope.error = err;
    $scope.btn_disabled = true;
    $scope.seat_state = false;
    $scope.btn_msg = "Shit happened :/";
  }

  // On souscrit à l'événement 'lockr.seat.unlocked'
  // pour activer le bouton et ajuster le message.
  $wamp.subscribe('lockr.seat.unlocked', function(locker_id) {
    $scope.btn_msg = "Lock the seat";
    $scope.seat_state = true;
    $scope.btn_disabled = false;
  });

  // Idem pour l'événement 'lockr.seat.locked'
  // mais si c'est nous qui avons verrouillé les chiottes,
  // on fait en sorte de pouvoir les déverrouiller.
  $wamp.subscribe('lockr.seat.locked', function(locker_id) {
    $scope.seat_state = false;
    if (locker_id == uuid) {
      $scope.btn_msg = "Release the seat";
    } else {
      $scope.btn_msg = "The seat is locked by someone else";
      $scope.btn_disabled = true;
    }
  });

  // On récupère un ID unique.
  // Notez qu'on se fout de savoir qui fournit la méthode 'get_id'.
  // Ici c'est SeatComponent, mais ça pourrait être un autre composant.
  $wamp.call('lockr.seat.get_id').then(
    function(res) {
      uuid = res;
    }, handleError
  );

  // On balance un refresh pour mettre à jour le front en fonction
  // de l'état actuel de la ressource.
  $wamp.publish('lockr.seat.refresh');

  // C'est la méthode appellée au clic du bouton, on agit en fonction
  // de l'état de la ressource: on verrouille ou on déverrouille.
  $scope.toggleLock = function() {
    if ($scope.seat_state) {
      $wamp.call('lockr.seat.lock', [uuid]).then(
        function(res) {
          if (res) {
            $scope.seat_state = false;
          }
        }, handleError);
    } else {
      $wamp.call('lockr.seat.unlock', [uuid]).then(
        function(res) {
          if (res) {
            $scope.seat_state = true;
          }
        }, handleError);
    }
  };
}]);
```

Il ne nous reste plus qu\'à ajouter quelques éléments dans notre
*index.html*:

```html
<body ng-app="LockrWebApp" ng-controller="MainCtrl">

    <!-- Un bloc pour afficher les erreurs -->
    <div class="container">
        <div ng-if="error" class="alert alert-danger">
            <p>There has been an error. Make sure the server and the router are running and reload the page.</p>
            <p>{{error}}</p>
        </div>
    </div>

    <!-- Notre maxi bouton -->
    <div class="container text-center maxi-btn">
        <button ng-class="{'btn-primary': seat_state, 'btn-danger': !seat_state && btn_disabled, 'btn-warning': !seat_state && !btn_disabled}"
            class="btn btn-block" ng-disabled="error || btn_disabled" ng-click="toggleLock()">{{btn_msg}}</button>
    </div>

    <!-- Les scripts qui vont bien -->
    [...]
</body>
```

Et si on teste maintenant, qu\'est-ce qui se passe? Rien.

![Ça marche
pas\...](https://media.giphy.com/media/3uyIgVxP1qAjS/giphy.gif)

Il nous manque une étape: la connexion à crossbar. Ça se passe dans
*app.js*, où on ajoute:

```js
app.run(['$wamp', function($wamp) {
  $wamp.open();
}
```

La doc d\'[angular-wamp](https://github.com/voryx/angular-wamp) préciser
qu\'on pourrait ouvrir la connexion de n\'importe où. N\'importe où y
compris au démarrage de l\'application.

## Bilan

Aller, on a tout ce qu\'il nous faut:

-   on démarre crossbar (crossbar start, depuis *crossbar\_env*)
-   on lance le serveur (SeatComponent, depuis *backend\_env*)
-   on ouvre un navigateur sur <http://localhost:8080>

Et là, on voit un joli bouton \"Lock the seat\". Maintenant on ouvre
deux ou trois autres onglets, et on sourit en pensant au temps qu\'on ne
perdra pas en se levant pour rien.

Pour les ceusses qui se demanderait, le code est [en
ligne](https://github.com/greizgh/lockr).

Avant de mettre en prod (rien que ça), il nous restera à remplacer tous
les *localhost* par le hostname de la machine qui servira
l\'application.

Même si notre application répond au problème de départ, il existe
quelques limites:

-   Identifier les utilisateurs par un UUID est contraignant: si
    l\'utilisateur ferme un onglet ou recharge la page alors qu\'il a
    verrouillé la ressource, personne ne pourra la déverrouiller.
-   L\'identifiant de l\'utilisateur verrouillant la ressource est
    envoyé avec le message \'*lockr.seat.locked*\'. Il est très simple
    de *tricher* et de lancer un message \'*lockr.seat.unlock*\' avec
    l\'uuid récupéré.

Il est évident que l\'intérêt de notre application est très limité,
c\'était plus pour avoir une raison de jouer avec
[crossbar](http://crossbar.io/), [python](https://www.python.org/) et
[angular](https://angular.io/). On pourrait aller plus loin en imaginant
un système de file d\'attente, identifier les utilisateurs par leur IP
ou faire en sorte que l\'identifiant de l\'entité posant le verrou ne
soit pas divulgué. De la même manière, on ne gère qu\'une unique
ressource, mais on pourrait étendre le système pour gérer les toilettes
pour dames, une bouilloire ou la machine à café.

Ça a été l\'occasion de voir:

-   comment définir une méthode appelable en RPC
-   comment effectuer un appel RPC (dans *TestComponent*)
-   comment souscrire à un événement
-   comment publier un message (dans la méthode *refresh* de
    *SeatComponent*)

[Crossbar](http://crossbar.io/) c\'est bon, mangez-en. On a travaillé
ici avec angular et python, mais on aurait tout aussi bien pu bosser en
C++ avec des composants sur Android. Les différents bindings existants
sont listés sur la page d\'[autobahn](http://autobahn.ws/).
