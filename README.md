## Version 2.6 : accès Discord, réseau et publication

L’accès au dashboard est réservé au compte Discord propriétaire `904012939206471710`. Dans l’application Discord Developer `1536996866993037364`, enregistrer la redirection `http://127.0.0.1:4317/auth/discord/callback`. Au premier lancement sur chaque PC, saisir le Client Secret dans l’écran local de configuration (jamais dans Git ou les notes de release). Le navigateur par défaut assure la connexion OAuth ; les jetons et le secret sont chiffrés avec Windows DPAPI dans le profil utilisateur. La session est vérifiée au redémarrage et renouvelée avec Discord. Une indisponibilité réseau ou une révocation peut imposer une nouvelle connexion. Ce contrôle ne prétend pas résister à un administrateur local qui modifierait le code de cette application open source.

Dans Mes projets, **Push GitHub** envoie le commit existant d’un dépôt propre. **Publier une release** prépare les fichiers de `release/` correspondant à la version du `package.json`, affiche leur liste, crée/reprend un brouillon, affiche les octets et pourcentages transmis, vérifie les empreintes SHA-256 distantes puis publie. Configurer Git Credential Manager pour GitHub, créer un commit et utiliser Push GitHub avant la release. Les releases déjà publiques et les tags désignant un autre commit ne sont pas écrasés.

Le bouton **Scanner mon réseau** recherche à la demande les appareils répondant au protocole RDP sur 3389 : sous-réseaux IPv4 privés directement connectés, limités à la tranche /24 locale pour un grand réseau et à quatre interfaces. Les résultats proposent un bouton de connexion et un champ de compte distant. Le scan n’active pas RDP sur les appareils ; un port RDP ouvert ne signifie pas que le compte est autorisé. Les VPS, les réseaux IPv6 et les ports personnalisés restent configurables manuellement.

L’installateur affiche les étapes de détection et d’installation, le nom du logiciel, les sorties WinGet et la durée de chaque installation. Les installateurs tiers ne fournissant pas tous un pourcentage, aucun pourcentage d’installation fictif n’est affiché.

## Télécharger

L’installateur Windows est disponible dans les [releases GitHub](https://github.com/LeStitcheur/lestitcheur-dashboard/releases). Télécharger le fichier `LeStitcheur-Control-Setup-2.5.1.exe`, puis suivre l’assistant. Les fichiers `.blockmap` et `latest.yml` servent aux mises à jour et ne sont pas nécessaires à une installation manuelle.

## Installateur 2.5.1 : outils automatiques

Le Setup Windows vérifie Node.js/npm, Git, PowerShell 7, VS Code, Laragon et Spotify. Il installe les outils absents via WinGet, sans mettre à niveau ceux déjà détectés. FiveM est exclu. Si WinGet manque, le module officiel Microsoft.WinGet.Client tente de le préparer. Internet et les éventuelles autorisations UAC sont nécessaires. Les conditions de licence de chaque éditeur restent applicables. Laragon peut nécessiter une activation ; ses bases existantes ne sont pas modifiées par ce contrôle.

En cas d’échec, le Setup propose de réessayer, en conservant les installations réussies. Les journaux et le résultat détaillé sont dans `%LOCALAPPDATA%\LeStitcheur Control\installer`. Le mode silencieux renvoie un code non nul en cas d’échec. Le contrôle sans installation se lance avec `powershell.exe -NoProfile -File desktop/prerequisites.ps1 -CheckOnly` depuis les sources. Les comptes et les connexions restent à configurer dans le dashboard. Après une installation neuve de Laragon, démarrer MySQL une première fois depuis Laragon pour initialiser sa base.

# Version 2.5 — installation Windows et RDP intégré

Périmètre actuel : **Windows 10/11 64 bits uniquement**. Les builds macOS et Linux sont reportés.

## Installer sur un autre PC

Copier uniquement release/LeStitcheur-Control-Setup-2.5.1.exe sur le PC, le lancer, choisir le dossier et terminer l’assistant. L’exécutable contient Electron, le backend et le composant RDP ; Node.js et Codex ne sont pas nécessaires pour lancer le dashboard. Un raccourci bureau est créé.

Au premier lancement, choisir le dossier des projets. Aucun compte social, clé ni configuration de cette machine de développement n’est embarqué. Les données de chaque utilisateur restent dans son profil Windows et sont conservées lors des mises à jour. Le dossier initial de projets existe automatiquement.

Fonctions optionnelles : Node.js/npm pour les scripts de projets Node ; Git pour les dépôts ; VS Code pour le bouton éditeur ; Laragon/FiveM/Spotify pour leurs intégrations. Le terminal utilise PowerShell 7 lorsqu’il le trouve et sinon Windows PowerShell, fourni avec Windows. Le programme ne dépend pas du runtime Codex.

## Bureau distant

Dans **Bureau distant**, enregistrer un profil : nom, adresse IP/DNS, port (3389 par défaut), compte et domaine facultatif. Sélectionner le profil, saisir le mot de passe et ouvrir le bureau. Le rendu et les entrées sont gérés par le contrôle RDP natif Microsoft, hébergé comme fenêtre enfant du dashboard. Aucune passerelle Guacamole n’est requise.

Le mot de passe n’est jamais enregistré dans le profil, écrit sur disque ou placé dans une ligne de commande. Il transite par le canal stdin privé vers le composant natif. Les contrôles CredSSP et de certificat Windows sont conservés. Presse-papiers désactivé par défaut et activable par profil ; disques, imprimantes et ports ne sont pas redirigés.

La cible doit avoir RDP activé et être joignable (réseau local ou VPN). Quitter l’espace déconnecte le client sans arrêter les applications distantes. Le programme n’active pas RDP et ne modifie pas le pare-feu de la cible.

Le composant est compilé avant chaque build avec le compilateur .NET Framework Windows puis inclus dans resources/rdp-host.exe. Les tests couvrent les profils, l’absence de persistance du mot de passe et l’initialisation du contrôle intégré. Une authentification réelle sur ton PC/VPS reste à vérifier avec ses identifiants.

Références Microsoft : [contrôle RDP](https://learn.microsoft.com/en-us/windows/win32/termserv/msrdpclient9notsafeforscripting), [authentification du serveur](https://learn.microsoft.com/en-us/windows/win32/termserv/imsrdpclientadvancedsettings4-authenticationlevel).

# Version 2.4 — espace personnel

- **Mon espace** : sessions configurables (services, éditeur, musique, terminal), notifications persistantes avec lecture globale et mode silencieux, surveillance toutes les 60 secondes pendant que l’application fonctionne, calendrier éditorial et relevés manuels, organisation des widgets et favoris, commandes enregistrées, sauvegardes et mises à jour.
- **Terminaux** : jusqu’à six sessions pwsh indépendantes, noms éditables, deux panneaux côte à côte, commandes enregistrées insérées sans exécution. Les boutons dev/start des fiches projets exécutent le script npm choisi dans un terminal. Les processus et journaux de terminal ne sont pas restaurés après fermeture de l’application.
- **Projets** : état Git, dernier commit, fichiers modifiés (100 maximum), lien homepage du package.json, dev/start et journaux du projet.
- **DNS** : consultation des 30 sauvegardes précédentes par domaine. La restauration se prépare groupe par groupe et utilise l’aperçu et la confirmation existants ; elle ne remplace pas silencieusement toute la zone.
- **Discord** : les actions effectuées via les bots sont enregistrées avec leur motif dans le journal persistant (500 dernières notifications toutes sources confondues).
- **Sauvegarde** : AES-256-GCM avec dérivation scrypt et mot de passe de 12 caractères minimum. Contient les paramètres et les secrets déjà protégés par DPAPI, restaurables sous le même compte Windows. N’inclut pas les cookies ni les projets. Copie précédente dans settings.json.bak.
- **Mises à jour** : source HTTPS configurable dans Mon espace. Aucune source publique n’est préconfigurée. Publier release/latest.yml, l’installateur et le .blockmap ensemble. Recherche manuelle ou chaque heure, téléchargement et installation explicites, contrôle des tâches et sauvegarde préalable. Mécanisme electron-updater 6 / NSIS : https://www.electron.build/auto-update/ . Aucun fichier n’est publié par le build.
- **Limites des plateformes sociales** : pas de collecte de mots de passe ou de jetons personnels. Les notifications et statistiques personnelles restent dans les interfaces officielles intégrées. Les statistiques saisies dans le studio sont explicitement manuelles ; aucune publication automatique vers les réseaux.
- **Surveillance** : lectures des services locaux, de Pterodactyl, des derniers déploiements Vercel et sondes HEAD des sites configurés. Une transition d’état crée une notification ; un arrêt volontaire peut donc apparaître dans l’historique. Les sondes ne déclenchent aucun redémarrage ni déploiement.

# Terminal intégré et confort (2.3)

Le terminal standard est un vrai PowerShell 7, affiché via xterm.js et ConPTY. Profil, modules, historique PSReadLine, Tab, programmes interactifs et Ctrl+C sont disponibles. Copier/coller : Ctrl+Maj+C / Ctrl+Maj+V et boutons dédiés. La session reste active lors des changements de page. Fermer ou remplacer une session active demande confirmation ; le terminal administrateur reste une fenêtre Windows séparée. Les boutons Terminal des projets utilisent le terminal intégré dans l’application de bureau.

Le profil normal est toujours `%APPDATA%\LeStitcheur Control`, en développement comme après installation. Les réglages restent hors de l’exécutable, sont sauvegardés dans settings.json.bak, et une copie settings.json.pre-update est créée par le script d’installation. Une copie valide peut restaurer un fichier endommagé. Les tests utilisent exclusivement LESTITCHEUR_PROFILE_DIR pour isoler leur profil. Les profils de développement historiques restent sur disque ; ils n’écrasent pas les paramètres installés.

Le compte TikTok corrigé est @ledistributeurdesourire ; son identifiant interne est conservé pour garder sa session. Les panneaux sociaux s’empilent sur les écrans courants et disposent d’un zoom automatique ou manuel. L’emblème vectoriel LSF est dans public/emblem.svg ; scripts/create-icon.mjs produit les icônes Windows à chaque build.

# LeStitcheur Control

Application Windows personnelle, en français, inspirée de la bannière LeStitcheurFou. Electron contient l’interface React et le serveur local Express. Les données affichées viennent du PC et des comptes connectés : aucun serveur, projet ou titre Spotify fictif.

## Lancer

Double-cliquer sur le raccourci **LeStitcheur Control** sur le Bureau. L’application ouvre sa propre fenêtre, sans terminal ni navigateur à lancer. Son moteur est inclus dans l’installation. Les polices et la bannière sont incluses localement.

Fermer la fenêtre masque l’application près de l’horloge pour garder les services et opérations actifs. Son icône ou le raccourci rouvre la même session. Pour quitter complètement : clic droit sur l’icône → **Quitter**, ou **Ctrl+Q**. Si des opérations sont en cours ou que MySQL/FiveM sont gérés par l’application, les terminer ou arrêter ces services depuis Laragon/txAdmin avant de quitter.

Installation : `%LOCALAPPDATA%\Programs\LeStitcheur Control`. La compilation crée un installateur `release/LeStitcheur-Control-Setup-<version>.exe`, selon la version de `package.json`. Il installe pour le compte Windows courant et crée les raccourcis Bureau et menu Démarrer. Désinstallation depuis les applications Windows ; les réglages sont conservés.

Pour reconstruire et installer depuis les sources (Node.js 22.12+ requis pour cette étape) :

```powershell
npm ci
npm run desktop:build
npm run desktop:install
```

Le script d’installation importe `.local/settings.json` si aucun réglage n’existe encore dans le profil Windows. Les données privées ne sont jamais incluses dans l’installateur. L’application installée ne dépend plus du dossier des sources. Node.js/npm restent nécessaires pour analyser et construire les autres projets ; Git reste nécessaire pour les opérations Git.

## Version navigateur et développement

L’ancien **Lancer LeStitcheur.cmd** reste disponible pour ouvrir la version navigateur sur **http://127.0.0.1:4317**. Ne pas l’exécuter en même temps que l’application Windows : elles utilisent le même port, notamment pour le retour Spotify.

Le serveur tourne en arrière-plan ; fermer l’onglet ne l’arrête pas. **Arreter LeStitcheur.cmd** ferme uniquement le processus du panel, après vérification de son identité. Les services se gèrent séparément depuis txAdmin ou Windows. Son PID et ses journaux sont dans `.local/`. En développement :

```powershell
npm install
npm run dev
```

Le mode développement sert la même API locale sur le port 4317. Le rechargement automatique est désactivé : actualiser après une modification. Pour une version compilée : `npm run build`, puis `npm start`. Ne pas lancer les deux sur le même port.

Pour tester la fenêtre Windows depuis les sources : `npm run build`, puis `npm run desktop`. Cette prévisualisation utilise le port **4318** et un profil séparé dans `.local/desktop-dev`, afin de laisser l’application installée disponible. Les connexions et réglages de ce profil ne sont pas transférés automatiquement à l’application installée.

## Ce qui est disponible

- Vue d’ensemble : CPU, RAM, état local, serveurs Pterodactyl, projets et journal de session.
- **Pterodactyl** : liste des serveurs, état, CPU/RAM/disque, démarrage, arrêt, redémarrage et console intégrée par serveur (logs en direct, couleurs ANSI, commandes, historique ↑/↓, reconnexion et effacement de l’affichage). Configurer l’URL HTTP ou HTTPS (avec le port si nécessaire) et une **clé API Client** dans Paramètres. Les permissions de cette clé s’appliquent. Le bouton **Console** est accessible dans Mes serveurs et dans l’onglet VPS de la vue d’ensemble. La connexion à Wings est ouverte uniquement pendant l’affichage de la console, avec renouvellement du jeton et reconnexion automatique. Wings doit être joignable depuis ce PC ; le compte doit disposer de `websocket.connect` et de `control.console` pour envoyer des commandes. Les clés et jetons restent côté serveur local. Les logs restent en mémoire (5 000 lignes max.) ; effacer l’affichage ne supprime pas les logs du serveur. Une commande n’est jamais réenvoyée automatiquement après une coupure.
- **MySQL → FiveM** : lancement MySQL puis attente d’un handshake MySQL avant FiveM. Le mode **Laragon** détecte `mysqld.exe` dans `C:\laragon\bin\mysql`, lit le `my.ini` de la version installée et reprend son port et son dossier de données. Sur ce PC : MySQL 8.4.3, base `C:\laragon\data\mysql-8.4`, port 3306. Aucune initialisation, copie ou suppression des bases. Une instance accessible est réutilisée. Si plusieurs versions sont installées, préciser le nom du dossier de la version dans les paramètres. Les modes exécutable manuel et service Windows (UAC) restent disponibles. Le profil txAdmin dans `C:\Users\lelex\Desktop\test serv` est préconfiguré.
- **Terminaux** : PowerShell normal ou administrateur (UAC), à la racine de dev ; terminal par projet. VS Code doit être installé dans son emplacement Windows standard.
- **Projets** : sous-dossiers directs de `C:\Users\lelex\Desktop\dev`, recherche, filtre Git/Node, ouverture VS Code, terminal, renommage et suppression vers la Corbeille après saisie du nom. Les jonctions sont exclues, le dossier de l’application en cours est protégé.
- **Analyse** : exécution des scripts `lint` et `test` disponibles dans les projets Node. Les dépendances doivent déjà être installées. Les projets sans scripts compatibles produisent un diagnostic, pas une réussite simulée.
- **Test de déploiement** : exécution locale de `npm run build`. Cela vérifie la construction, pas le fonctionnement d’un hébergement ou sa configuration. Les scripts du projet (y compris pre/post) s’exécutent réellement : les vérifier avant de lancer un projet tiers.
- **Publication GitHub** : envoi du commit existant sur la branche courante via l’unique remote `origin` GitHub. Nécessite un dépôt propre, un commit et une authentification Git déjà configurée. Le dépôt, la branche et le commit sont affichés avant confirmation, puis revérifiés. Aucun `git add`, commit automatique ou force push. Les workflows GitHub du dépôt peuvent démarrer après le push. Les hooks locaux pre-push sont désactivés pour cette action.
- **Spotify Windows** : mode par défaut, sans clé API. Lecture du morceau, de l’artiste, de la progression et des commandes disponibles auprès de la session Spotify Windows. Lecture/pause, précédent/suivant, aléatoire et répétition selon les capacités annoncées par Spotify. Le volume se règle dans Spotify. Le bouton Ouvrir retrouve l’exécutable ou le protocole `spotify:`.
- **Mes réseaux** : espaces séparés pour TikTok `@lestitcheurfou`, `@lesdistributeurdesourires`, Instagram `@lestitcheur` et `@laholyfolle`. Accès au profil, fil, messages, activité et statistiques dans les interfaces officielles, avec une session persistante par compte. Connexion manuelle la première fois ; les notifications et compteurs restent dans ces interfaces, sans agrégation automatique ni statistiques simulées. Sur TikTok, les notifications s’ouvrent avec la cloche du fil. Les statistiques Instagram dépendent du type de compte. Si le réseau refuse la fenêtre Electron, son menu Navigation permet de l’ouvrir dans le navigateur habituel (session du navigateur). La version navigateur du dashboard propose les liens publics ; les espaces isolés nécessitent l’application Windows.
- **Hostinger / DNS** : liste des domaines et échéances, ouverture d’une zone par son nom, recherche et édition des groupes DNS A, AAAA, CNAME, TXT, MX, SRV, CAA et NS. L’aperçu avant/après et la saisie du domaine précèdent l’envoi. Une nouvelle vérification refuse une zone modifiée entre-temps ; une sauvegarde est écrite dans `%APPDATA%\LeStitcheur Control\dns-backups`. Les autres groupes sont conservés. Les groupes comportant des valeurs désactivées doivent être modifiés dans hPanel. Les modifications se propagent selon les délais DNS.
- **Vercel** : projets, 40 derniers déploiements du compte ou de l’équipe sélectionnée, état, branche, message de commit, journaux du build et ouverture du site. Le redéploiement reprend le déploiement sélectionné et sa cible, avec confirmation du nom du projet. Une cible production est signalée explicitement. Il ne pousse pas les fichiers locaux.

## Connecter les services

### Vue directe des réseaux (sources 2.1)

La page **Mes réseaux** propose un sélecteur de compte et les vues **Notifications**, **Statistiques** ou **Les deux**. Les pages officielles s’affichent directement dans la fenêtre principale grâce à deux panneaux natifs isolés, sans accès Node ni au pont local du dashboard. Les sessions réutilisent celles des espaces v2, séparées par compte. Le changement de compte ferme les pages précédentes ; les panneaux sont masqués lors d’un dialogue local et fermés en quittant la section.

Se connecter au bon compte lors de la première utilisation. TikTok nécessite d’ouvrir sa cloche dans le panneau d’activité ; les statistiques sont dans TikTok Studio. Les statistiques détaillées Instagram dépendent du type de compte. Il n’y a pas de compteur agrégé ni de lecture des cookies ou jetons de session par le dashboard. La version navigateur ne peut pas intégrer ces pages : ouvrir l’application Windows. Si le site refuse de charger, utiliser son espace séparé ou le navigateur.

### Discord (sources 2.1)

- **DM & mes serveurs** affiche le client Discord officiel dans un panneau natif, avec une session personnelle persistante. Les derniers DM et la liste des serveurs sont ceux du client. Pour quitter un serveur : clic droit sur son icône → Quitter le serveur, puis confirmation dans Discord. Le dashboard n’utilise aucun jeton de compte personnel et n’extrait pas les messages privés.
- **Serveurs de mes bots** accepte jusqu’à 10 jetons de bots. La connexion est vérifiée avec l’API Discord et refuse un compte qui n’est pas un bot. Les jetons sont chiffrés avec Windows DPAPI, jamais renvoyés à l’interface, et conservés avec les réglages existants. Déconnecter un bot supprime seulement sa connexion locale ; cela ne le fait pas quitter ses serveurs.
- Pour chaque bot : liste paginée des serveurs où il est présent, liste des membres et des bannis par pages de 200, recherche parmi les lignes chargées, export JSON des lignes chargées. L’export indique s’il est complet ; charger toutes les pages avant d’exporter une liste complète.
- Statistiques : estimations Discord du nombre de membres et des présences, salons retournés par l’API, nombre de rôles, boosts et niveau de boost, avec date du relevé. Pas d’historique inventé de messages, d’activité ou de croissance.
- Actions individuelles : expulsion, bannissement sans suppression de messages, débannissement, exclusion temporaire jusqu’à 28 jours, retrait de cette exclusion, pseudo, ajout/retrait d’un rôle, micro/écoute en vocal et déconnexion du vocal. Le formulaire exige une raison d’audit, puis une confirmation par l’identifiant du membre. Une autorisation temporaire à usage unique est créée ; permissions, hiérarchie des rôles et cible sont revérifiées avant l’action. Aucun envoi automatique après une réponse réseau incertaine.

Pour lister les membres, activer **Server Members Intent** dans le portail développeur du bot. Le bot doit être invité sur les serveurs concernés, posséder les permissions des actions choisies, et son rôle doit être au-dessus de ceux de la cible. Propriétaire du serveur et bot utilisé ne peuvent pas être ciblés depuis le dashboard. Les administrateurs ne peuvent pas recevoir d’exclusion temporaire. Les contrôles vocaux nécessitent un membre présent en vocal. Discord reste l’autorité finale pour les permissions et peut refuser une opération.

Références : [API des serveurs Discord](https://docs.discord.com/developers/resources/guild), [liste des serveurs et compte courant](https://docs.discord.com/developers/resources/user), [portail des applications Discord](https://discord.com/developers/applications).

### Spotify, Hostinger et Vercel

**Spotify Windows** : ouvrir Spotify, lancer un morceau puis revenir au dashboard. Aucun Client ID n’est nécessaire. Les commandes agissent uniquement sur la session identifiée comme Spotify. L’accès a été vérifié avec l’application installée sur ce PC.

**Hostinger** : dans Domaines & DNS, saisir une clé créée dans [hPanel → API](https://hpanel.hostinger.com/profile/api), puis enregistrer. **Vercel** : dans sa page, saisir un [jeton Vercel](https://vercel.com/account/settings/tokens), et éventuellement le Team ID. Utiliser une clé ayant accès aux ressources voulues. Les clés sont chiffrées par Windows ; elles ne sont pas affichées après enregistrement. Ces intégrations nécessitent les identifiants du compte pour leur validation réelle.

**Spotify Connect** reste disponible en option dans Paramètres → Spotify → Mode de connexion. Ce mode API nécessite un appareil Spotify actif, l’accès du compte à l’application API et Spotify Premium pour les commandes de lecture. Pour le configurer :

1. Créer une application dans le [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Ajouter exactement `http://127.0.0.1:4317/auth/spotify/callback` dans les Redirect URIs. Ne pas utiliser `localhost`.
3. Ajouter ton compte aux utilisateurs autorisés de l’application si nécessaire.
4. Copier son **Client ID** dans Paramètres → Spotify, enregistrer puis cliquer sur **Connecter mon compte**. Aucun Client Secret n’est demandé.

## Données et accès

Les réglages de l’application Windows sont stockés dans `%APPDATA%\LeStitcheur Control\settings.json`, à l’extérieur de l’installation : une reconstruction ou mise à jour les conserve. La version navigateur garde ses réglages séparément dans `.local/settings.json`, exclu de Git avec les journaux et caches. Les clés Pterodactyl, Hostinger, Vercel et jetons Spotify sont chiffrés par Windows DPAPI pour le compte Windows courant. Ils ne sont pas renvoyés au navigateur. Les chemins et le Client ID ne sont pas des secrets et restent lisibles dans les réglages. Une copie vers un autre compte Windows ne rend pas les secrets utilisables.

La fenêtre Electron est isolée : sandbox, contextIsolation et aucun accès Node depuis l’interface. Les liens externes HTTP/HTTPS, dont Spotify et txAdmin, s’ouvrent dans le navigateur habituel. Le retour OAuth Spotify ramène la fenêtre de l’application au premier plan.

Le serveur écoute uniquement `127.0.0.1`. Il contrôle l’en-tête Host, l’origine et un jeton de session pour les API. Pas de CORS ouvert ni d’interface d’exécution de commandes arbitraires sur le PC. Ne pas exposer le port via un proxy public. Les administrateurs et logiciels exécutés sur le même compte Windows ont les droits de ce compte : le panel n’est pas une frontière de sécurité vis-à-vis d’eux.

Les jobs et le journal d’activité sont conservés en mémoire pour la session. Les sorties des scripts peuvent contenir les données que ces scripts affichent. Au redémarrage du panel, les processus lancés auparavant ne sont plus considérés comme contrôlés par la session ; utiliser txAdmin pour les arrêter. Le bouton d’arrêt local du panel termine le processus FiveM et ses enfants ; préférer txAdmin pour un arrêt applicatif avec sauvegardes.

## Structure et vérification

`desktop/` : fenêtre Electron, icône, navigation et espaces sociaux ; `electron-builder.yml` : installateur ; `src/App.jsx` : interface générale ; `src/design.css` : thème v2 ; `src/CloudPages.jsx`, `src/SocialPage.jsx`, `src/MusicPlayer.jsx` : nouveaux espaces ; `server/` : API, coffre Windows, intégrations, projets et services. Les intégrations sont séparées pour ajouter de futurs modules.

```powershell
npm test
npm run build
```

Les tests créent leurs propres dossiers temporaires. Ils ne lancent pas FiveM/MySQL, ne suppriment pas de projets personnels et n’envoient rien vers GitHub. Hostinger et Vercel sont testés avec des réponses simulées : validation, confirmation, refus des modifications concurrentes, sauvegardes et absence de double envoi. Aucun DNS ou déploiement réel n’est modifié par les tests.

Références officielles : [API Client Pterodactyl](https://github.com/pterodactyl/panel/blob/1.0-develop/routes/api-client.php), [Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [Spotify Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri), [configuration FXServer / txAdmin](https://docs.fivem.net/docs/resources/txAdmin/).

Application Windows : [sécurité Electron](https://www.electronjs.org/docs/latest/tutorial/security), [installateurs NSIS](https://www.electron.build/nsis/), [structure Laragon](https://laragon.org/docs/directory-structure), [validation MySQL](https://dev.mysql.com/doc/refman/8.4/en/server-configuration-validation.html).

Intégrations v2 : [session média Windows](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession), [API Hostinger](https://docs.hostinger.com/api-reference/overview), [schémas DNS officiels](https://github.com/hostinger/api-python-sdk/blob/main/docs/DNSZoneApi.md), [API déploiements Vercel](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment).
# Récap Codex (2.2)

La vue d’ensemble présente les quotas Codex utilisés et restants, leurs dates de réinitialisation et cinq projets locaux récemment utilisés, juste sous la bannière. Le relevé se renouvelle chaque minute lorsque la page est visible. Les quotas concernent tout le compte, pas uniquement ce dashboard.

Codex doit être installé et connecté sur ce PC. L’intégration utilise son exécutable local et les lectures `account/rateLimits/read` et `thread/list` de l’[App Server officiel](https://learn.chatgpt.com/docs/app-server). Elle ne démarre aucune tâche et ne lit pas le fichier d’authentification. La liste regroupe les dossiers des 200 dernières tâches non archivées par date de mise à jour ; les métadonnées locales de l’application fournissent les noms des projets et excluent les conversations sans projet lorsqu’elles sont disponibles. Les erreurs et valeurs inconnues sont affichées explicitement. Aucun relevé n’est exporté vers un service tiers par le dashboard.


