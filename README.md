# Déployer l’Atlas NJ sur le VPS Hostinger

Ce dépôt Git autonome contient le code de l’application, le Dockerfile, la configuration Docker Compose et la documentation. Aucun jeton HubSpot ni mot de passe réel n’est inclus. La branche principale est `main`. Le dépôt est initialisé localement ; aucun hébergement Git distant n’est encore configuré.

Le déploiement doit se faire sur le VPS. Les commandes Docker ci-dessous ne sont pas à lancer sur le Mac. Le site ChatGPT existant est indépendant de cette installation.

## 1. Vérifier le VPS et le proxy HTTPS

Cette configuration suppose Docker Compose et un **Traefik existant**, configuré avec un point d’entrée HTTPS et un résolveur Let’s Encrypt. Elle ne crée pas Traefik et ne remplace pas les services existants.

Dans Hostinger : VPS → Gérer → Docker Manager. Repérer le projet Traefik et sa configuration. Vérifier :

- le réseau Docker partagé (valeur proposée : `traefik-proxy`) ;
- le point d’entrée HTTPS (valeur proposée : `websecure`) ;
- le résolveur de certificats (valeur proposée : `letsencrypt`).

Si le VPS utilise Nginx Proxy Manager ou un autre proxy, faire adapter `compose.yaml` avant de déployer. Ne pas installer un deuxième proxy qui occuperait les mêmes ports 80/443.

## 2. Préparer le domaine

Choisir un sous-domaine, par exemple `atlas.noubliejamais.fr`. Créer dans ses DNS un enregistrement A qui pointe vers l’adresse IPv4 du VPS. Un éventuel enregistrement AAAA doit aussi pointer vers ce VPS, sinon le corriger.

Le proxy doit être joignable sur les ports 80/443 pour son fonctionnement et la délivrance des certificats. L’application n’expose pas directement son port 8787 sur Internet.

## 3. Publier le dépôt puis le cloner sur le VPS

Créer un dépôt **privé et vide** sur GitHub, GitLab ou votre forge habituelle, sans README ni initialisation supplémentaire. Copier son URL SSH. Depuis ce dossier sur le Mac :

```sh
git remote add origin URL_SSH_DU_DEPOT
git push -u origin main
```

Remplacer `URL_SSH_DU_DEPOT` par l’URL réelle. L’authentification à votre forge doit être configurée sur le Mac. Aucun jeton de forge n’est fourni dans ce dossier.

Se connecter au VPS avec les coordonnées SSH Hostinger :

```sh
ssh UTILISATEUR@IP_DU_VPS
```

Pour un dépôt privé, configurer sur le VPS une clé SSH de déploiement dédiée, autorisée en lecture seule sur ce dépôt. Ne pas copier votre clé privée personnelle sur le VPS. Puis :

```sh
sudo mkdir -p /opt/cartographie-ifsi
sudo chown "$(id -u):$(id -g)" /opt/cartographie-ifsi
git clone URL_SSH_DU_DEPOT /opt/cartographie-ifsi
cd /opt/cartographie-ifsi
```

Le dossier cible doit être vide avant le clone. Toutes les commandes suivantes se font dans `/opt/cartographie-ifsi`, sur le VPS. Si votre utilisateur n’a pas accès à Docker, employer `sudo docker` à la place de `docker`.

## 4. Créer la configuration privée

```sh
cp .env.example .env
chmod 600 .env
nano .env
```

Renseigner :

| Variable | Valeur attendue |
| --- | --- |
| `ATLAS_DOMAIN` | Domaine exact, sans protocole ni chemin |
| `HUBSPOT_ACCESS_TOKEN` | Jeton de l’application privée HubSpot |
| `HUBSPOT_PORTAL_ID` | Numéro du compte HubSpot ; vérifier la valeur 6008870 proposée |
| `APP_PASSWORD` | Mot de passe d’équipe long et unique, au moins 12 caractères |
| `TRAEFIK_NETWORK` | Nom du réseau Docker partagé du proxy |
| `TRAEFIK_ENTRYPOINT` | Nom du point d’entrée HTTPS |
| `TRAEFIK_CERTRESOLVER` | Nom du résolveur de certificats |

Utiliser des guillemets simples pour une valeur contenant des espaces, `#` ou `$`, par exemple `APP_PASSWORD='votre-valeur'` (sans apostrophe dans la valeur de cet exemple).

Le jeton HubSpot doit avoir les permissions `crm.objects.companies.read` et `crm.objects.deals.read`. Aucun droit d’écriture CRM n’est nécessaire. Ne pas transmettre le fichier `.env`, ne pas le déposer dans Git ni dans une conversation.

`compose.yaml` définit automatiquement l’origine publique HTTPS à partir de `ATLAS_DOMAIN`. En production, la page de première configuration locale est désactivée ; il faut renseigner les variables avant de lancer.

## 5. Déployer

```sh
docker compose version
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=50 atlas
```

Ouvrir `https://VOTRE_SOUS_DOMAINE`, se connecter avec `APP_PASSWORD`, puis cliquer **Actualiser** pour lire HubSpot. Choisir la vue Commerciale pour afficher les statuts. Vérifier quelques fiches connues avant utilisation commerciale.

Après redémarrage, cliquer Actualiser : le cache CRM est conservé en mémoire uniquement. Les correspondances validées sont conservées dans le volume Docker `atlas-data`.

## 6. Résoudre les problèmes fréquents

- **Réseau introuvable** : vérifier `TRAEFIK_NETWORK` et que Traefik est lancé ; `docker network ls` liste les réseaux.
- **Erreur HTTPS / certificat** : vérifier les DNS, les ports 80/443 et les journaux Traefik.
- **404 / 502 du proxy** : vérifier réseau partagé, labels, point d’entrée et port interne 8787.
- **Hôte non autorisé** : visiter exactement le domaine défini dans `ATLAS_DOMAIN` ; le proxy doit conserver l’en-tête Host.
- **Refus HubSpot** : vérifier compte, jeton, permissions et accès sortant HTTPS à `api.hubapi.com`.
- **Mot de passe refusé après modification du .env** : recréer le conteneur avec la commande ci-dessous ; un simple redémarrage ne recharge pas les variables.

Ne pas publier la sortie de `docker compose config` : elle peut révéler les secrets. Pour vérifier le fichier sans afficher son contenu, utiliser `docker compose config --quiet`.

## 7. Maintenance

Pour récupérer une nouvelle version du code sur le VPS :

```sh
cd /opt/cartographie-ifsi
git pull --ff-only
docker compose up -d --build
```

Après modification des variables du `.env` :

```sh
docker compose up -d --build --force-recreate
```

Conserver le `.env` privé lors des mises à jour ; ne pas l’écraser avec le modèle vide.

Pour arrêter sans supprimer les correspondances :

```sh
docker compose down
```

Ne pas ajouter `-v` : cette option supprime les volumes. Prévoir une sauvegarde du volume de données et du `.env` via la politique de sauvegarde du VPS. Le mot de passe est partagé par l’équipe : cette version ne gère pas encore des comptes personnels.

## Contenu et vérifications

- `server.mjs`, `lib/`, `public/` : application et connecteur HubSpot.
- `Dockerfile` : image Node 24, processus non-root.
- `compose.yaml` : configuration pour Traefik existant, stockage persistant et redémarrage automatique.
- `.env.example` : modèle sans secrets (fichier masqué sur macOS, afficher avec Cmd+Maj+.).
- `README-APPLICATION.md` : règles commerciales, rapprochement et détails de l’application.
- `test/` : tests automatisés sur réponses simulées ; lancement avec Node 22+ : `npm test`.

Le déploiement sur votre VPS et la connexion réelle HubSpot restent à vérifier une fois votre infrastructure et votre jeton renseignés. Aucun déploiement externe n’a été effectué lors de la préparation de ce dossier.

## Documentation officielle

- https://www.hostinger.com/support/connecting-multiple-docker-compose-projects-using-traefik-in-hostinger-docker-manager/
- https://www.hostinger.com/support/how-to-change-the-domain-of-a-docker-project/
- https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview
