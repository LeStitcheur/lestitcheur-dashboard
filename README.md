<div align="center">

<img src="public/emblem.svg" width="90" alt="Emblème LeStitcheur Control" />

# LeStitcheur Control

**Tes serveurs, tes projets et tes communautés. Un seul endroit pour tout retrouver.**

![Version](https://img.shields.io/badge/version-2.9.1-ff405c?style=flat-square)
![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-171b24?style=flat-square&logo=windows)
![Electron](https://img.shields.io/badge/Electron-171b24?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-171b24?style=flat-square&logo=react)

[Fonctionnalités](#fonctionnalites) · [Installation](#installation) · [Configuration](#configuration) · [Développement](#developpement)

<img src="public/banner.png" width="100%" alt="Bannière LeStitcheurFou, univers rouge et noir" />

</div>

---

## ✨ Pourquoi ce dashboard ?

Lancer MySQL, retrouver un projet, ouvrir la console d’un serveur, vérifier un déploiement, changer de musique… Ces petites actions finissent vite par remplir le bureau de fenêtres.

LeStitcheur Control les rassemble dans une application Windows, en français, pensée pour les sessions de développement et la gestion de communautés. Tu ouvres le raccourci, tu retrouves ton espace et tu reprends là où tu en étais : tes paramètres et les connexions prises en charge restent dans ton profil Windows.

> **Un projet personnel, pour le moment.** Cette version réserve l’accès au compte Discord du propriétaire. Installer l’application sur un autre PC ne donne pas accès avec un autre compte Discord. Windows 10/11 **64 bits** est la seule plateforme prise en charge actuellement.

<a id="fonctionnalites"></a>

## 🚀 Ce que tu peux faire

### 🖥️ Retrouver ton espace de travail

La vue d’ensemble réunit l’état du PC, les serveurs et les raccourcis utiles. Tu peux organiser les widgets, garder tes projets favoris à portée de main et préparer des sessions qui ouvrent tes outils dans l’ordre voulu.

**Mon espace** regroupe les notifications, la surveillance CPU/RAM/disque, les alertes de service et le suivi des domaines. Le récap **Codex** affiche l’usage du compte et les projets récemment utilisés lorsque Codex est installé et connecté sur le PC. La surveillance fonctionne pendant que le dashboard tourne.

### 🎮 Piloter tes serveurs

- **Pterodactyl** : retrouver les serveurs du VPS, consulter leur état et leurs ressources, les démarrer, les arrêter ou les redémarrer. Chaque serveur dispose de sa console intégrée, avec les logs en direct et l’envoi de commandes.
- **MySQL + FiveM** : démarrer MySQL, attendre qu’il réponde, puis lancer le serveur FiveM local. Le mode Laragon reprend la configuration et les bases existantes.
- **Bases MySQL** : consulter les bases, leur taille et les connexions, exporter un fichier SQL ou importer une sauvegarde. Un import demande confirmation et crée une sauvegarde préalable ; sa taille est limitée à 20 Mo.

### 📂 Travailler sur tes projets et ton GitHub

Le dashboard liste les dossiers de ton répertoire de développement. Pour chaque projet, tu peux ouvrir VS Code ou un terminal à sa racine, le renommer, l’envoyer à la Corbeille, lancer ses scripts et consulter les journaux.

La section **GitHub** permet de parcourir les dépôts, issues, pull requests, workflows et releases. Pour les dépôts locaux, tu retrouves aussi les différences Git, les commits, les branches et le pull en avance rapide.

Deux boutons permettent de préparer une mise à jour : **Git add .** ajoute les modifications du projet à l’index, puis **Commit MAJ <version>** crée un commit avec ce message. La version est préremplie depuis `package.json` et reste modifiable. Le commit ne prend que les fichiers déjà ajoutés ; il ne déclenche aucun push.

Les boutons **Push GitHub** et **Publier une release** sont accessibles depuis les projets configurés. La publication d’une release passe par une vérification du dépôt, des tests, du build et des fichiers à transmettre. Les actions de publication restent explicites : construire l’application ne publie rien sur GitHub.

### ⌨️ Utiliser un vrai terminal

Le terminal standard est intégré à l’application : PowerShell 7 lorsqu’il est disponible, sinon Windows PowerShell. Historique, autocomplétion, programmes interactifs, copier/coller et `Ctrl+C` restent disponibles.

Tu peux garder jusqu’à six sessions et afficher deux terminaux côte à côte. Elles restent actives quand tu changes de page. Le terminal administrateur s’ouvre dans une fenêtre Windows séparée, avec la confirmation UAC habituelle.

### 🌐 Accéder à tes PC à distance

La section **Bureau distant** intègre le client RDP Windows. Lance un scan du réseau local pour retrouver les appareils qui répondent sur le port RDP standard, ou ajoute directement l’adresse d’un PC ou d’un VPS.

L’aperçu peut passer en plein écran, avec un bouton flottant pour en sortir. Les profils sont enregistrés ; les mots de passe RDP ne le sont pas. Le PC distant doit déjà autoriser RDP et être joignable : le scan n’active pas cette fonction à sa place.

### 💬 Garder le contact avec tes communautés

**Mes réseaux** permet d’ajouter tes comptes Instagram, TikTok, Facebook, YouTube et X. Chaque compte possède son espace et sa session. Tu peux consulter les interfaces officielles, retrouver les notifications et statistiques disponibles, puis ouvrir **Publier** pour choisir une image ou une vidéo dans le service concerné.

Les possibilités dépendent du réseau : TikTok Studio Web privilégie la vidéo, les publications photo peuvent nécessiter l’application mobile, et certaines statistiques demandent un compte créateur ou professionnel. Le dashboard ne regroupe pas les compteurs sociaux dans une statistique globale. Un bouton **Navigateur** prend le relais si un site refuse la connexion intégrée.

Dans **Discord**, le client officiel donne accès aux DM et aux serveurs de ton compte. Un espace séparé pour tes bots permet de consulter membres, bannissements et statistiques, puis d’effectuer les actions de modération autorisées : rôles, pseudos, exclusions, bannissements et contrôles vocaux. Les permissions Discord et la hiérarchie des rôles continuent de s’appliquer.

### 🎨 Créer et écouter

- **ChatGPT Images** : préparer un brouillon, le copier et créer dans l’espace officiel ChatGPT, avec les possibilités de ton compte.
- **Studio Suno** : préparer un style ou des paroles, puis créer la musique dans Suno.
- **Spotify** : retrouver le morceau en cours et piloter la lecture depuis l’application Spotify installée sur le PC, sans clé API dans ce mode.

Les créations sont validées dans ChatGPT ou Suno. Leurs limites et abonnements restent ceux de ces services ; un abonnement ChatGPT ne fournit pas de crédits API au dashboard.

### ☁️ Gérer tes domaines et déploiements

**Hostinger** rassemble les domaines, leurs échéances et les zones DNS. Avant une modification, le dashboard présente les changements et demande confirmation. Il conserve également un historique des sauvegardes DNS effectuées depuis l’application.

**Vercel** affiche les projets, déploiements et journaux de build. Tu peux ouvrir un site ou relancer un déploiement existant après confirmation. Ce redéploiement ne transmet pas les fichiers de ton dossier local.

---

<a id="installation"></a>

## 📦 Installer l’application

### 1. Récupérer l’installateur

Utilise le fichier **`LeStitcheur-Control-Setup-<version>.exe`** fourni avec la version souhaitée. Les versions publiées sont à retrouver dans les [Releases GitHub](https://github.com/LeStitcheur/lestitcheur-dashboard/releases).

Si aucune release n’est encore disponible, tu peux construire l’installateur depuis les sources en suivant la section [Développement](#developpement). Le build le dépose dans `release/`. Les fichiers `latest.yml` et `.blockmap` servent aux mises à jour ; tu n’en as pas besoin pour une installation manuelle.

### 2. Suivre l’assistant Windows

Lance le `.exe`, choisis le dossier d’installation et laisse l’assistant terminer. Il vérifie la présence de **Node.js/npm, Git, PowerShell 7, VS Code, Laragon et Spotify**, puis tente d’installer les outils manquants avec WinGet. Les outils déjà détectés sont conservés.

Prévois une connexion Internet et accepte les demandes Windows nécessaires à ces installations. **FiveM n’est pas installé automatiquement** : tu renseigneras ton installation existante dans les paramètres. Après une installation neuve de Laragon, démarre MySQL une première fois depuis Laragon pour initialiser sa base.

L’assistant affiche les étapes, les logiciels concernés et leur progression disponible. En cas d’échec, il propose de réessayer ; les journaux se trouvent dans `%LOCALAPPDATA%\LeStitcheur Control\installer`.

### 3. Ouvrir le dashboard et se connecter

Un raccourci **LeStitcheur Control** est créé sur le Bureau et dans le menu Démarrer. L’application contient son moteur : aucun terminal, navigateur ou Codex n’est nécessaire pour la lancer.

Au premier démarrage sur le PC :

1. Configure l’accès Discord avec le **Client Secret de l’application du propriétaire**, uniquement dans l’écran prévu à cet effet.
2. Clique sur **Se connecter avec Discord**. L’autorisation s’ouvre dans ton navigateur par défaut.
3. Connecte-toi avec le compte propriétaire, puis reviens au dashboard.
4. Choisis ton dossier de projets et configure les services que tu souhaites utiliser.

La session Discord est conservée entre les redémarrages et renouvelée quand c’est possible. Une révocation ou un problème de connexion peut demander une nouvelle authentification. **Se déconnecter** verrouille le dashboard et ferme ses vues sociales et RDP, sans arrêter les services locaux ni les commandes en cours.

<details>
<summary><strong>Configuration Discord pour le propriétaire du projet</strong></summary>

Dans le [Discord Developer Portal](https://discord.com/developers/applications), l’application actuellement utilisée est `1536996866993037364`. Ajoute cette redirection OAuth2 pour la version installée :

```text
http://127.0.0.1:4317/auth/discord/callback
```

Le compte autorisé est `904012939206471710`. Ces identifiants sont publics ; le **Client Secret**, lui, doit rester privé et être saisi uniquement dans l’application. Aucun secret n’est fourni dans l’installateur.

Pour adapter une copie du projet à un autre propriétaire, les identifiants sont définis dans `server/access.js`. Il faut utiliser sa propre application Discord, configurer sa redirection et reconstruire l’exécutable.

</details>

### 4. Mettre à jour sans tout reconfigurer

Installe la nouvelle version avec son assistant. Termine d’abord les opérations importantes et ferme proprement l’application. Tes réglages restent dans ton profil Windows, indépendamment du dossier d’installation.

La recherche de mises à jour peut aussi être configurée dans **Mon espace** avec une source HTTPS. Aucune source publique n’est préconfigurée.

<a id="configuration"></a>

## 🔌 Connecter tes services

Tu peux configurer les intégrations progressivement ; chacune possède son propre accès.

- **Pterodactyl** — Dans Paramètres, renseigne l’adresse **HTTP ou HTTPS** du panel et une clé **API Client**. Wings doit être joignable depuis le PC pour utiliser les consoles.
- **Laragon et FiveM** — Indique le dossier Laragon, puis l’exécutable, le dossier de travail et les arguments de ton serveur FiveM. Si plusieurs versions MySQL sont présentes, sélectionne celle à utiliser.
- **GitHub** — Configure l’authentification Git avec Git Credential Manager et le remote `origin` du dépôt. Pour pousser, prépare un commit et un dépôt propre ; le dashboard affiche la destination avant confirmation.
- **Réseaux sociaux** — Ouvre Mes réseaux → Ajouter un compte, choisis la plateforme et renseigne le pseudo. Connecte-toi ensuite au bon compte dans son espace officiel.
- **Bots Discord** — Ajoute le jeton du bot dans la section Discord. Pour lister les membres, active **Server Members Intent** dans son portail développeur. Le bot doit être présent sur le serveur et disposer des permissions nécessaires.
- **Hostinger et Vercel** — Ajoute respectivement une clé API Hostinger et un jeton Vercel dans leurs sections. Le Team ID Vercel est facultatif.
- **Spotify** — Ouvre l’application Spotify sur Windows et lance un morceau. Le mode de connexion par défaut utilise sa session média ; les commandes disponibles dépendent de ce qu’elle expose.

<details>
<summary><strong>Utiliser Spotify Connect à la place de l’application Windows</strong></summary>

Dans Paramètres → Spotify, sélectionne le mode API. Crée une application dans le [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), puis enregistre cette redirection exacte :

```text
http://127.0.0.1:4317/auth/spotify/callback
```

Renseigne le Client ID, enregistre les paramètres et connecte le compte. Aucun Client Secret Spotify n’est demandé. Ce mode nécessite un appareil Spotify actif et les droits requis par Spotify, notamment Premium pour les commandes de lecture.

</details>

## 💾 Tes données restent sur ton PC

Les paramètres sont enregistrés dans **`%APPDATA%\LeStitcheur Control`**, en dehors de l’installation. Les secrets pris en charge sont chiffrés par Windows pour le compte utilisateur courant. Copier ces fichiers vers un autre compte Windows ne rend pas les secrets utilisables.

Les espaces sociaux gardent leurs sessions séparément. Si tu passes par le navigateur habituel, tu utilises sa propre session : les cookies ne sont pas transférés depuis le dashboard.

**Mon espace** propose une sauvegarde chiffrée des paramètres. Elle n’inclut ni les dossiers de projets ni les cookies des services ; les secrets protégés par Windows restent liés au même compte Windows. Les exports SQL se trouvent dans `mysql-backups` et les sauvegardes DNS dans `dns-backups`, à l’intérieur du profil de l’application.

Fermer la fenêtre laisse le dashboard dans la zone de notification pour conserver la session en cours. Pour le quitter complètement, utilise son icône près de l’horloge → **Quitter**, ou `Ctrl+Q`. Les terminaux ne sont pas restaurés après un arrêt complet.

---

<a id="developpement"></a>

## 🛠️ Lancer le projet depuis les sources

Pour développer ou construire l’installateur, prévois **Windows x64**, **Git** et **Node.js 22.12 ou plus récent** avec npm. La compilation du composant RDP utilise le compilateur .NET Framework Windows.

```powershell
git clone https://github.com/LeStitcheur/lestitcheur-dashboard.git
cd lestitcheur-dashboard
npm ci
```

### Construire l’application Windows

```powershell
npm run desktop:build
```

L’installateur est créé dans `release/LeStitcheur-Control-Setup-<version>.exe`. Tu peux ensuite l’ouvrir, ou utiliser le script d’installation :

```powershell
npm run desktop:install
```

Ce script installe l’application, crée le raccourci et la relance. Il sauvegarde au préalable les paramètres existants. Le build ne publie aucun fichier sur GitHub.

### Prévisualiser et tester

Après un build, ouvre la fenêtre Electron depuis les sources avec :

```powershell
npm run desktop
```

Elle utilise le port **4318**, contre **4317** pour l’application installée. Par défaut, les deux utilisent le même profil Windows. Pour isoler une session de développement, définis `LESTITCHEUR_PROFILE_DIR` avant le lancement :

```powershell
$env:LESTITCHEUR_PROFILE_DIR = Join-Path $PWD '.local\desktop-dev'
npm run desktop
```

Pour cette session, ajoute aussi `http://127.0.0.1:4318/auth/discord/callback` aux redirections de l’application Discord.

Pour travailler sur l’interface dans un navigateur :

```powershell
npm run dev
```

Ce mode utilise `http://127.0.0.1:4317` et les paramètres de `.local/`. Libère ce port avant de le lancer. Le RDP, les terminaux natifs et les espaces sociaux intégrés nécessitent la fenêtre Electron.

Pour vérifier le projet :

```powershell
npm test
npm run build
```

### Se repérer dans les fichiers

```text
desktop/                Fenêtre Electron, terminaux, RDP et installateur
server/                 API locale, paramètres et intégrations
src/                    Interface React et styles
public/                 Bannière, emblème et ressources visuelles
scripts/                Compilation, installation et vérifications
tests/                  Tests automatisés
electron-builder.yml    Configuration du packaging Windows
```

## 🧭 Quelques repères utiles

- **Un compte Discord est refusé ?** L’accès est réservé au propriétaire défini dans cette version. Vérifie aussi le Client Secret et la redirection de l’application Discord.
- **Un réseau ou un studio ne charge pas ?** Utilise le bouton Navigateur. Certains services limitent les connexions depuis un navigateur intégré.
- **Un PC n’apparaît pas au scan ?** Le scan recherche le port 3389 sur les réseaux IPv4 privés locaux, avec un périmètre limité. Ajoute manuellement un VPS ou une cible utilisant un autre port.
- **Un build de projet échoue ?** Installe ses dépendances et vérifie ses scripts. L’analyse exécute les scripts disponibles ; le test de déploiement vérifie la construction locale, pas l’hébergement final.
- **Un import SQL échoue ?** La sauvegarde préalable est conservée. Un import peut avoir appliqué une partie du fichier avant l’erreur : vérifie la base avant de recommencer.

Le dashboard écoute uniquement sur `127.0.0.1` et n’est pas destiné à être exposé sur Internet. L’accès Discord protège son ouverture, mais ne constitue pas une protection contre un administrateur local capable de modifier les fichiers de l’application.

---

<div align="center">

**LeStitcheur Control — Ton univers. Tes règles.**

</div>
