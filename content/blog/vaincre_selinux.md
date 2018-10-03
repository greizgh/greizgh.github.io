+++
title = "Vaincre SELinux"
date = 2015-05-24
path = "vaincre-selinux.html"
description = "En voulant mettre en place un serveur de messagerie sur une plate-forme fedora, je me suis trouvé confronté à SElinux. Peu de ressources mentionnent SElinux dans le cadre de mise en place de services tiers et je pense qu'un grand nombre d'opérateurs se débarrassent de SElinux pour être tranquille. Essayons de faire mieux"
[taxonomies]
category = ["linux"]
+++

En voulant mettre en place un serveur de messagerie sur une plate-forme fedora, je me suis trouvé confronté à SElinux.
Sur le wiki fedora, l'article concernant la mise en place de postfix+dovecot mentionne qu'il ne tient pas compte de SElinux.
C'est dommage parce que, même si ce n'est pas ultra complexe, cela peut faire perdre beaucoup de temps quand on a pas le réflexe SElinux.
C'est d'autant plus dommage que peu de ressources mentionnent SElinux dans le cadre de mise en place de services tiers.
Je pense qu'un grand nombre d'opérateurs préfèrent se débarrasser de SElinux pour être tranquille. C'est loin d'être une solution et cela nous prive des avantages de SElinux, essayons de faire mieux.

<!-- more -->

La présentation [SElinux for mere mortals](https://www.youtube.com/watch?v=MxjenQ31b70) de _Thomas Cameron_ est excellente pour se mettre dans le bain.
Prévoyez tout de même 50 minutes pour démystifier SElinux.
Si l'outil ne semble pas extrêmement complexe dans sa mise en œuvre, il y a pourtant fort à parier qu'il se mettra dans vos pattes à la première occasion.

La suite de l'article est une synthèse de la méthode de diagnostic développée dans _SElinux for mere mortals_.

## Le choix des armes
On s'assure dans un premier temps d'avoir les outils nécessaires:

    yum install setools-console setroubleshoot-server setroubleshoot-plugins

Si le nom du paquet _setools-console_ est assez clair sur ce qu'il contient, _setroubleshoot-server_ mérite d'être explicité un chouia.

Sur les distributions "Desktop", setroubleshootd tourne en tant que démon et informe en live l'utilisateur des erreurs SElinux.
Le paquet _setroobleshoot-server_ est destiné aux machines où cela n'est pas nécessaire, les serveurs entre autre.
Rien à voir donc avec un démon qui tournerai en tâche de fond, en revanche ce paquet fournit l'utilitaire **sealert** qui nous servira par la suite.

## Mode permissive
À l'installation, SElinux est en mode "Enforce", cela signifie que les actions non autorisées seront purement et simplement bloquée.
Nous allons donc passer SElinux en mode "Permissive" afin d'autoriser les actions normalement bloquées tout en remplissant les logs d'informations utiles.
Pour cela: `setenforce 0`

**Ceci n'est que temporaire** sur la durée du diagnostic, l'objectif est bien entendu d'être en mode "Enforce" en production.

## Tour de chauffe
Mon problème était une erreur lors de la connexion d'un utilisateur à dovecot (permission denied).
Pour remettre dans le contexte: la distribution de mails repose sur des utilisateurs virtuels, il me faut donc un répertoire dans lequel stocker les mails des utilisateurs: _/var/vmail_ dans mon cas.

En parcourant les logs SElinux, j'ai fini par saisir que SElinux estime que dovecot n'a aucune raison d'écrire dans le répertoire _/var/vmail_.
Comprendre par là que ce comportement ne correspond à aucune règle SElinux.
SElinux empêche donc dovecot d'écrire dans ce répertoire, d'où le _permission denied_ et l'échec à la connexion.

En mode permissive, la connexion s'effectue correctement et dovecot me créer bien mon répertoire.
C'est donc bien SElinux qui fout le bordel et comme c'est pas trop mal fait, on a quelques lignes de logs dans /var/log/audit/audit.log.

On peut les lire ou on peut demander à l'utilitaire "sealert" de les analyser pour nous:
`sealert -a /var/log/audit/audit.log`
et là bim plein d'infos:

    SELinux is preventing imap from add_name access on the directory truc.com.
    
    ***  Plugin catchall_labels (83.8 confidence) suggests   *****************
    
    If you want to allow imap to have add_name access on the truc.com directory
    Then l'étiquette sur truc.com doit être modifiée.
    Do
    # semanage fcontext -a -t FILE_TYPE 'truc.com'
    où FILE_TYPE est l'une des valeurs suivantes : admin_home_t, cache_home_t, config_home_t, data_home_t, dovecot_spool_t, dovecot_tmp_t, dovecot_var_lib_t, dovecot_var_log_t, dovecot_var_run_t, gconf_home_t, gnome_home_t, httpd_user_content_t, httpd_user_script_exec_t, krb5_host_rcache_t, mail_home_rw_t, mail_spool_t, mozilla_plugin_rw_t, postfix_private_t, telepathy_cache_home_t, telepathy_data_home_t, tmp_t, user_fonts_t, user_home_dir_t, user_home_t, user_tmp_t, var_lib_t, var_log_t, var_run_t, virt_home_t. 
    Puis exécutez : 
    restorecon -v 'truc.com'

Magique, sealert nous donne même la solution à notre problème!

## Passage au stand
Sur les conseils de sealert, j'ai lancé:

    semanage fcontext -a -t mail_spool_t "/var/vmail(/.*)?"
    restorecon -v /var/vmail/

L'objectif de cette commande c'est de dire à SElinux, le répertoire /var/vmail et ses enfants sont de type **mail_spool_t**.
Dans le jargon SElinux, il s'agit de changer le contexte du répertoire /var/vmail.
Comme il y a une règle SElinux disant que l'utilisateur imap (dovecot) peut accéder sans souci aux fichiers de type mail_spool_t, on ne devrait plus avoir de problème!

Le "/var/vmail(/*)?" en lieu et place de 'truc.com' proposé par sealert c'est pour appliquer la règle sur le répertoire mais également sur ses enfants.
"truc.com" est en réalité un sous-répertoire de /var/vmail.

**restorecon**, c'est pour redonner aux fichiers /var/vmail le bon type SElinux.

On repasse en mode enforce:

    setenforce 1

Et tout roule! Ça va, on ne s'est pas trop fatigué.

## Les modules
Parfois, sealert nous propose de régler le problème avec un "policy package".
Il s'agit en gros d'un fichier de règles définissant un comportement autorisé (ou non).

Ce n'est pas plus compliqué que ce qu'on vient de faire, la démarche est strictement la même et souvent cela se résume à une commande du genre:

    grep <truc> /var/log/audit/audit.log | audit2allow -M mypol
    semodule -i mypol.pp

Le premier souci auquel j'ai du faire face avec SELinux, c'est que dovecot ne pouvait pas se connecter à postgresql.
En suivant la démarche ci-dessus, on génère un "policy module" (.pp) qui est le résultat de la compilation du fichier "type enforcement" (.te) avec ce contenu:

```bash
# SElinux rule to allow dovecot to connect to postgres
module dovecot_postgres 1.0;

require {
    type dovecot_auth_t;
    type postgresql_port_t;
    class tcp_socket name_connect;
}

#============= dovecot_auth_t ==============
allow dovecot_auth_t postgresql_port_t:tcp_socket name_connect;
```

Et une fois appliqué, dovecot cause bien avec postgres.

On peut également avoir envie de déployer un fichier de règle sur plusieurs machines.
Dans ce cas on ne va pas versionner _policy package_ puisqu'il est compilé, mais sa source: le fichier _type enforcement_ (.te).
Pour compiler le _.te_ en _.pp_, on peut faire ça:

     checkmodule -M -m -o dovecot_postgres.mod dovecot_postgres.te
     semodule_package -o dovecot_postgres.pp -m dovecot_postgres.mod

Et enfin on applique avec `semodule -i dovecot_postgres.pp`.

## Les Booléens
Pour les opérations courantes, on peut également passer par des booléens. En gros ça permet de dire "autoriser à faire un truc" → oui/non.
De manière générale les noms sont explicites avec des "httpd_can_connect_ldap" et correspondent à des raccourcis pour dire à SElinux comment se comporter.
La liste des booléens peut être obtenue par: `getsebool -a`.

## Conclusion
Si SElinux peut apparaitre contraignant, c'est qu'il est plus souvent écrit comment le désactiver que comment lever les blocages de sécurité.
C'est dommage parce que ça contribue à faire apparaitre SElinux comme une usine à gaz, alors qu'en fin de compte c'est relativement simple à mettre en place.

Voilà des resources intéressantes pour se plonger rapidement dans SElinux:

* [SElinux for mere mortals](https://www.youtube.com/watch?v=MxjenQ31b70), la présentation de _Thomas Cameron_;
* [Un article de Sam&Max](http://sametmax.com/sassurer-que-selinux-ne-bloque-pas-un-programme/) dans lequel ils parlent de setsebool (forcément un truc de boule);
* [La doc fedora](https://docs.fedoraproject.org/en-US/Fedora/22/html/SELinux_Users_and_Administrators_Guide/index.html) très complète;

Bref, SElinux demande un effort pour s'y mettre, mais ça vaut le coup. D'autant plus que ça fait perdre un temps fou quand on passe à côté.
