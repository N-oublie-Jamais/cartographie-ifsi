# Atlas commercial N’oublie Jamais

Application autonome Node.js 22 ou supérieur, sans dépendances npm. Elle reprend les 337 IFSI de l’atlas Parcoursup 2026 et le design system NJ. Elle utilise directement l’API HubSpot, sans dépendre de la connexion ChatGPT.

## Démarrer sur ce Mac

Dans ce dossier :

```sh
npm start
```

Ouvrir **http://127.0.0.1:8787/**. Le fichier `Lancer-Atlas.command` permet aussi de lancer le serveur sur macOS avec Node installé. Fermer le terminal arrête le serveur.

Au premier démarrage, l’écran de configuration demande le numéro de compte HubSpot (6008870 prérempli, à vérifier), un jeton privé et un nouveau mot de passe pour l’atlas. Le jeton est validé contre le numéro de compte et les deux permissions requises avant enregistrement. Le serveur écoute uniquement sur le Mac, en boucle locale, par défaut.

## Créer le jeton HubSpot

Un super administrateur doit créer une application privée dans HubSpot. D’après la documentation consultée le 22 octobre 2026 : **Développement → Applications héritées → Créer une application privée**. Selon l’interface du compte, cette fonction peut aussi apparaître sous Paramètres → Intégrations → Applications privées.

Nom conseillé : **Atlas IFSI — N’oublie Jamais**. Ajouter uniquement :

- `crm.objects.companies.read`
- `crm.objects.deals.read`

Créer l’application puis copier son jeton depuis son onglet Auth dans le formulaire local de l’atlas. Ne pas envoyer le jeton dans une conversation. Aucune permission d’écriture CRM n’est nécessaire. Le serveur utilise des POST exclusivement pour les recherches, lectures par lots et lecture des informations du jeton ; il ne possède aucune route de création, modification ou suppression HubSpot.

Après configuration, se connecter avec le mot de passe choisi puis cliquer **Actualiser**. La synchronisation n’a lieu que sur demande ou après validation d’une correspondance. Pas de synchronisation planifiée.

Documentation officielle :

- https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview
- https://developers.hubspot.com/docs/api-reference/legacy/crm/search-the-crm
- https://developers.hubspot.com/docs/api-reference/legacy/crm/associations/associate-records/guide

## Lire la carte commerciale

Le sélecteur Vue passe de **Regroupements** à **Commerciale**. Des filtres permettent de cibler les clients, transactions ouvertes, prospects froids ou correspondances à vérifier.

| Indication | Règle |
| --- | --- |
| Vert / badge ✓ | Cycle de vie `customer` ou `evangelist`, ou transaction gagnée associée |
| Orange | Au moins une transaction dont `hs_is_closed` vaut false |
| Bleu | Contact enregistré (`notes_last_contacted` ou `num_contacted_notes`), sans client ni transaction ouverte |
| Gris | Aucun contact enregistré dans ces champs |
| ? | Correspondance absente ou à vérifier |

Un client avec une transaction ouverte apparaît orange avec le badge client. Les petits points sous les cercles numérotés signalent les catégories représentées dans le groupe. Les fiches donnent accès aux entreprises et aux transactions ouvertes dans HubSpot. L’export CSV inclut les indicateurs commerciaux de la sélection.

Une transaction dont l’état est inconnu n’est jamais présumée ouverte. Le cycle de vie `opportunity` seul ne suffit pas pour qualifier un prospect chaud. Les échanges non enregistrés dans HubSpot ne peuvent pas être déduits par l’atlas. Le classement concerne les entreprises associées directement aux transactions ; il ne propage pas le statut du siège d’un groupe à tous ses instituts.

## Correspondances

Rapprochement automatique seulement si code UAI unique, commune identique après normalisation et absence d’un intitulé désignant exclusivement une autre profession (maïeutique, ergothérapie, etc.). Cela reste une inférence modifiable. Plusieurs fiches pour le même UAI, une commune différente ou l’absence d’UAI nécessitent une validation.

Dans **HubSpot & correspondances**, choisir un institut, ouvrir les fiches candidates ou rechercher l’entreprise par nom. **Associer cette fiche** enregistre le choix dans l’atlas. Cette opération ne modifie pas HubSpot. Il est possible d’écarter une correspondance ou de revenir au rapprochement automatique.

Les choix sont conservés dans `runtime/matches.json` (ou dans DATA_DIR). Un choix ne résout pas automatiquement les autres instituts du même campus. Les cas où une fiche couvre plusieurs établissements demandent une vérification humaine.

## Stockage et accès

La configuration locale contient le jeton côté serveur dans `runtime/config.json` (permissions 600) ; le mot de passe y est haché par scrypt. Les correspondances sont stockées séparément. Le dossier runtime et `.env` sont exclus du dépôt et des images Docker. Le cache HubSpot reste en mémoire : après redémarrage, cliquer Actualiser.

L’accès commercial est protégé par un mot de passe d’équipe, une session HttpOnly et une protection contre les requêtes d’une autre origine. Il n’y a pas encore de comptes personnels ni de journal d’audit par utilisateur. La carte Parcoursup et les fichiers d’interface sont publics à l’origine choisie ; les routes CRM demandent une session.

Pour changer de jeton local, arrêter le serveur, mettre à jour `runtime/config.json` sur le serveur puis le redémarrer. Conserver une sauvegarde du dossier runtime avec les mêmes protections que les autres secrets de l’entreprise. Un mot de passe oublié peut être remplacé par APP_PASSWORD avec HUBSPOT_ACCESS_TOKEN et HUBSPOT_PORTAL_ID définis dans l’environnement, puis redémarrage.

## Hébergement sur un serveur

Le code est prêt pour un hébergement Node/Docker. **Aucun hébergement externe n’est configuré dans cette livraison.** Fournir les variables de `.env.example` depuis le gestionnaire de secrets de l’hébergeur. En production, le démarrage exige APP_ORIGIN en HTTPS ; la terminaison TLS est à fournir par le proxy ou l’hébergeur. Ne pas publier directement le port 8787 sur Internet sans ce proxy.

```sh
docker build -t nj-atlas .
docker volume create nj-atlas-data
docker run --env-file .env -p 127.0.0.1:8787:8787 -v nj-atlas-data:/data nj-atlas
```

Le volume `/data` conserve les correspondances. Les variables HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID et APP_PASSWORD doivent être toutes renseignées pour la configuration par environnement. La page de configuration du jeton est désactivée en production. APP_ORIGIN doit correspondre exactement à l’adresse visitée, sans sous-chemin.

Le site ChatGPT existant est conservé ; cette application constitue une version indépendante à une autre adresse.

## Validation

```sh
npm test
```

Tests du rapprochement, des statuts, de la pagination HubSpot, des erreurs partielles, de l’accès aux données CRM, de la protection de session et de la persistance des choix. Les tests utilisent des réponses simulées et ne prouvent pas une connexion réelle au compte HubSpot. La vérification réelle reste à effectuer après saisie du jeton.
