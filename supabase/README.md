# EuroKink – Base de données Supabase

Ce dossier contient tout le schéma de la base de données d'EuroKink : les tables, les règles de sécurité, la logique côté serveur (recherche, validation de présence, badges) et les données de départ.

## Contenu

```
supabase/
  migrations/
    20261111000001_schema.sql   Tables, sécurité par ligne (RLS), fonctions, déclencheurs
    20261111000002_seed.sql     Réglages, 15 types de soirée, 6 badges
    20261111000003_storage.sql  Espace de stockage des visuels de soirée
  tests/
    supabase_stub.sql           Imitation de Supabase pour tester sur un PostgreSQL local
    tests.sql                   Scénarios de test (droits, publication, check-in, badges…)
```

## Installation sur Supabase

1. **Crée un projet** sur [supabase.com](https://supabase.com) avec le compte Google d'EuroKink. Choisis une **région en Europe** (Paris si elle est proposée) : c'est indispensable pour le RGPD.
2. Ouvre **SQL Editor** et exécute les trois fichiers de `supabase/migrations`, **dans l'ordre** (copier-coller puis *Run*).
   Avec la CLI Supabase, `supabase link` puis `supabase db push` fait la même chose.
3. Dans **Authentication > Providers**, active E-mail, puis Apple et Google quand tu auras les comptes développeur.
4. **Deviens administrateur** : crée ton compte (dans l'appli plus tard, ou via *Authentication > Add user* et une ligne dans `profiles`), puis exécute dans le SQL Editor :

   ```sql
   update public.profiles set role = 'admin' where pseudo = 'TonPseudo';
   ```

## Ce que fait le schéma

| Domaine | Tables | Règles principales |
| --- | --- | --- |
| Membres | `profiles`, `member_follows` | Pseudo unique (sans tenir compte des majuscules), case 18+ et consentement RGPD obligatoires, rôle admin non modifiable par un membre |
| Organisateurs | `organizers`, `organizer_members`, `venues` | Le créateur devient membre de l'organisateur ; seul l'admin peut « vérifier » un organisateur |
| Soirées | `events`, `event_event_types`, `event_types` | Statut fixé par le serveur : admin ou organisateur vérifié → publiée, sinon → à valider ; import automatique → toujours à valider |
| Actions | `favorites`, `reminders`, `ticket_alerts`, `attendances`, `organizer_follows` | Chacun ne voit et ne modifie que les siens ; rappel par défaut la veille à 18 h |
| Passeport | `checkins`, `badges`, `user_badges` | Présence validée uniquement par `check_in()`, badges attribués automatiquement |
| Modération | `reports`, `import_sources` | Signalements visibles par leur auteur et l'admin |
| Réglages | `app_settings` | Rayon de validation (300 m), marge avant le début (60 min), limite Pionnier (500) |

**Confidentialité des sorties** : « Je participe » et les badges d'un membre sont visibles selon son réglage : tout le monde, les membres qu'il suit, ou personne. Le nombre total de participants reste public, sans dire qui.

## Fonctions appelées par l'appli

| Fonction | Rôle |
| --- | --- |
| `search_events(...)` | Écran Explorer : position et rayon, dates, types, budget max (vide = tous budgets), sans réservation, vestiaire, texte libre. Accessible sans compte. |
| `check_in(event, lat, lon)` | « Je suis sur place » : vérifie le créneau et la distance, enregistre la présence **sans conserver la position**, attribue les badges. Réponses : `validated`, `too_far`, `outside_time_window`, `already_validated`. |
| `passport()` | Progression de chaque badge pour l'écran Profil. |
| `moderate_event(event, publier, motif)` | File « à valider » de l'admin : publier ou refuser. |

Depuis l'appli : `supabase.rpc('check_in', { p_event, p_lat, p_lon })`.

## Tests

Les scénarios de `supabase/tests/tests.sql` ont été joués sur PostgreSQL 16 : ils vérifient les droits (un membre ne peut pas se promouvoir admin, publier une soirée ou insérer une présence lui-même), la publication et la validation, la recherche, les rappels, la confidentialité des participations, le check-in (trop loin, hors créneau, validé, déjà validé) et les badges.

Pour les rejouer sur un PostgreSQL local :

```bash
createdb ek
psql -d ek -f supabase/tests/supabase_stub.sql
psql -d ek -f supabase/migrations/20261111000001_schema.sql
psql -d ek -f supabase/migrations/20261111000002_seed.sql
psql -d ek -f supabase/tests/tests.sql
```

## Prochaines étapes

- Projet Expo (React Native) de l'appli, branché sur cette base.
- Fonctions serveur (Edge Functions) pour envoyer les rappels et les alertes billetterie.
- Robot d'import des sites d'organisateurs, qui dépose les soirées en « à valider ».
