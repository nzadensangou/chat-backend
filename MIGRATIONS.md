# 🗄️ Guide des Migrations Knex

## 📋 Vue d'ensemble

Les migrations Knex permettent de **versionner et tracker tous les changements de la base de données**.

```
Avant (Manuel) ❌
├── lib/db/schema.js           → SQL brut
├── knexfile.js                → VIDE
└── Impossible de tracker les changements

Après (Knex) ✅
├── knexfile.js                → Config migrations
├── lib/db/migrations/         → Fichiers versionés
│   ├── 001_create_initial_schema.js
│   ├── 002_add_phone_index.js
│   └── 003_create_messages.js
└── lib/db/seeds/              → Data fixtures
    └── 001_countries.js
```

---

## ⚙️ Installation

### 1️⃣ Installer Knex
```bash
cd backend/
npm install
```

### 2️⃣ Vérifier les migrations disponibles
```bash
npm run db:migrate:list

# Output:
# ✓ 001_create_initial_schema.js [2026-06-01 12:00:00]
```

---

## 🚀 Utilisation

### **Appliquer les migrations** (Créer la BD)
```bash
npm run db:migrate

# Résultat:
# ✅ Running migration: 001_create_initial_schema.js
# ✅ Created all tables successfully
# ✅ Batch 1 migration(s) completed (123ms)
```

### **Charger les données initiales**
```bash
npm run db:seed

# Résultat:
# ✅ Seeded countries table
```

### **Revenir en arrière** (Rollback)
```bash
npm run db:rollback

# Résultat:
# ✅ Dropped all tables successfully
# ✅ Rolled back 1 batch(es)
```

### **Réinitialiser complètement** (Danger ⚠️)
```bash
npm run db:reset

# Cela va:
# 1️⃣ Rollback TOUT
# 2️⃣ Réappliquer les migrations
# 3️⃣ Charger les seeds
```

---

npm run dev:full

## 📝 Créer une Nouvelle Migration

### **Cas d'usage**
Tu as modifié le schéma (ajouté une colonne, une table, etc.).

### **Créer la migration**
```bash
npm run db:migrate:make -- add_avatar_to_users
# Crée: lib/db/migrations/[timestamp]_add_avatar_to_users.js
```

### **Éditer le fichier**
```javascript
// lib/db/migrations/[timestamp]_add_avatar_to_users.js

export async function up(knex) {
  // Ce qui se passe quand on applique (UP)
  await knex.schema.table('users', (table) => {
    table.string('avatar', 255).after('pseudo');
  });
}

export async function down(knex) {
  // Ce qui se passe si on revient en arrière (DOWN)
  await knex.schema.table('users', (table) => {
    table.dropColumn('avatar');
  });
}
```

### **Tester la migration**
```bash
# Appliquer
npm run db:migrate

# Vérifier que OK dans MySQL
mysql -u root -p -e "DESCRIBE users" alanyabd2026

# Si problème, rollback
npm run db:rollback

# Corriger et réessayer
npm run db:migrate
```

### **Committer**
```bash
git add lib/db/migrations/
git commit -m "feat: add avatar column to users table"
```

---

## 🌱 Créer une Seed (Données de test)

### **Créer la seed**
```bash
npm run db:seed:make -- test_users
# Crée: lib/db/seeds/test_users.js
```

### **Éditer le fichier**
```javascript
// lib/db/seeds/test_users.js

export async function seed(knex) {
  // Vider la table
  await knex('users').del();

  // Insérer les données de test
  await knex('users').insert([
    {
      nom: 'Alice Dupont',
      pseudo: 'alice',
      alanyaPhone: '123456789',
      idPays: 1,
      password: 'hashed_password_here',
      type_compte: 1,
      is_online: 0,
    },
    {
      nom: 'Bob Martin',
      pseudo: 'bob',
      alanyaPhone: '987654321',
      idPays: 2,
      password: 'hashed_password_here',
      type_compte: 1,
      is_online: 1,
    },
  ]);
}
```

### **Charger les seeds**
```bash
npm run db:seed
```

---

## 📊 Commandes Courantes

| Commande | Effet |
|----------|-------|
| `npm run db:migrate` | Appliquer les migrations en attente |
| `npm run db:migrate:list` | Lister les migrations |
| `npm run db:migrate:make -- <name>` | Créer une nouvelle migration |
| `npm run db:rollback` | Revenir à la migration précédente |
| `npm run db:rollback:all` | Revenir complètement (DANGER) |
| `npm run db:seed` | Charger les seeds |
| `npm run db:seed:make -- <name>` | Créer une nouvelle seed |
| `npm run db:reset` | Reset complet: rollback + migrate + seed |

---

## ✅ Workflow Complet (Developer)

### **1️⃣ Au démarrage du projet**
```bash
cd backend/
npm install          # Installe Knex
npm run db:migrate   # Crée les tables
npm run db:seed      # Charge les données initiales
npm run dev          # Lance l'app
```

### **2️⃣ Pendant le développement**
```bash
# Ajouter une colonne
npm run db:migrate:make -- add_status_to_users

# Éditer lib/db/migrations/[timestamp]_add_status_to_users.js
# ... ajouter le code Knex

# Tester
npm run db:migrate
# Vérifier que OK
mysql -u root -p -e "DESCRIBE users" alanyabd2026

# Si OK, committer
git add lib/db/migrations/
git commit -m "feat: add status column"

# Si problème, revenir en arrière
npm run db:rollback
# Éditer la migration, réessayer
npm run db:migrate
```

### **3️⃣ Avant de push**
```bash
# Vérifier que toutes les migrations sont propres
npm run db:migrate:list

# Vérifier le code
git diff lib/db/migrations/

# Committer
git push
```

---

## 🔍 Debugging

### **Voir les migrations exécutées**
```bash
npm run db:migrate:list

# Output:
# ✓ 001_create_initial_schema.js [2026-06-01 12:00:00]
# ✓ 002_add_phone_index.js [2026-06-01 13:30:00]
#   003_new_table.js (pending)
```

### **Voir les requêtes SQL générées**
```bash
DEBUG_SQL=true npm run db:migrate
```

### **Vérifier l'état de la BD**
```bash
mysql -u root -p

# Vérifier les tables
SHOW TABLES;

# Voir la structure d'une table
DESCRIBE users;

# Voir les indexes
SHOW INDEX FROM messages;

# Exit
EXIT;
```

### **Problema: "Migration already run"**
```bash
# Si tu as rollback manuellement mais la migration existe en BD:
npm run db:migrate
# Knex voit qu'elle est déjà appliquée, skip

# Si tu dois la forcer:
npm run db:rollback
npm run db:migrate
```

---

## ⚠️ Bonnes Pratiques

### ✅ DO
- ✅ Une migration = **un changement logique** (ajouter table, ajouter colonne, etc.)
- ✅ Migrations **atomiques** (tout ou rien)
- ✅ Noms descriptifs: `add_phone_index_to_users`, `create_messages_table`
- ✅ Toujours inclure `down()` pour pouvoir revenir
- ✅ Tester les migrations avant de committer
- ✅ Committer les migrations avec le code correspondant

### ❌ DON'T
- ❌ Modifier une migration APRÈS l'avoir appliquée (créer une nouvelle)
- ❌ Migrations trop volumineuses (split en petites)
- ❌ Migrations sans `down()` (impossible de rollback)
- ❌ Modifier les seeds après usage en production
- ❌ Rollback juste avant push (les migrations doivent être finales)

---

## 🚨 Scenarios de Production

### **Scenario 1: Déployer une nouvelle migration en prod**

```bash
# 1. Développement local
npm run db:migrate:make -- add_new_column
# ... écrire la migration

npm run db:migrate        # Tester en local
npm run db:rollback       # Vérifier le rollback

# 2. Committer et pousser
git add lib/db/migrations/
git commit -m "feat: add new_column to users"
git push

# 3. En production (via CI/CD ou SSH)
cd backend/
npm install
npm run db:migrate        # Appliquer la migration
npm run start             # Relancer l'app
```

### **Scenario 2: Oups, la migration casse la prod!**

```bash
# 1. Rollback immédiat
npm run db:rollback

# 2. Notifier l'équipe (incident)

# 3. Fixer en local
npm run db:rollback       # Revenir
# ... corriger la migration
npm run db:migrate        # Tester

# 4. Committer et pousser fix
git commit -am "fix: correct migration"
git push

# 5. Redéployer
npm run db:rollback
npm run db:migrate
```

---

## 📚 Ressources

- [Knex.js Documentation](https://knexjs.org/)
- [Knex Migrations Docs](https://knexjs.org/guide/migrations.html)
- [MySQL + Knex Examples](https://knexjs.org/#Schema-Building)

---

**Dernière mise à jour**: 2026-06-01  
**Version**: 1.0
