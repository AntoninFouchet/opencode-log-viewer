# OpenCode Log Viewer

Application web pour visualiser les logs et l'historique des sessions OpenCode.

## 🚀 Démarrage rapide

### Prérequis

1. **OpenCode** doit être démarré dans un conteneur Podman :
   ```bash
   cd ../opencode-dev
   podman-compose up -d
   ```

2. Le serveur OpenCode doit être accessible sur `http://localhost:3000`

### Lancer l'application

#### Option 1 : Serveur HTTP Python (recommandé)

```bash
cd opencode-log-viewer
python -m http.server 8080
```

Puis ouvrir : http://localhost:8080

#### Option 2 : Serveur HTTP Node.js

```bash
npx http-server -p 8080
```

#### Option 3 : Live Server (VS Code)

1. Installer l'extension "Live Server"
2. Clic droit sur `index.html` → "Open with Live Server"

## 📋 Fonctionnalités

### Vue d'ensemble

- **Liste des sessions** : Affiche toutes les sessions OpenCode avec leur statut
- **Timeline interactive** : Visualise l'historique complet d'une session
- **Mise à jour temps réel** : Les événements sont mis à jour automatiquement via SSE
- **Statistiques** : Tokens utilisés, nombre de messages, outils appelés
- **Filtres** : Recherche par titre/ID, filtre par statut

### Types de messages supportés

- 👤 **Messages utilisateur** : Questions et prompts
- 🤖 **Messages assistant** : Réponses du LLM
- 🔧 **Appels d'outils** : Outils MCP utilisés avec arguments et résultats
- 💭 **Raisonnement** : Processus de réflexion du LLM
- 📄 **Fichiers** : Fichiers lus ou modifiés
- 📸 **Snapshots** : États du système
- 🔄 **Patches** : Modifications appliquées

## 🏗️ Architecture

```
opencode-log-viewer/
├── index.html              # Page principale
├── css/
│   └── style.css          # Styles
├── js/
│   ├── main.js            # Point d'entrée
│   ├── api-client.js      # Client API OpenCode
│   └── timeline-renderer.js # Rendu de la timeline
└── README.md
```

## 🔧 Configuration

### Changer l'URL du serveur OpenCode

Modifier dans `js/main.js` :

```javascript
const API_URL = 'http://localhost:3000'; // Changer ici
```

### Changer l'intervalle de rafraîchissement

```javascript
const REFRESH_INTERVAL = 30000; // 30 secondes (en millisecondes)
```

## 📡 API OpenCode utilisée

L'application utilise les endpoints suivants :

- `GET /session` - Liste des sessions
- `GET /session/:id` - Détails d'une session
- `GET /session/:id/messages` - Messages d'une session
- `GET /session/:id/events` - Événements temps réel (SSE)

## 🐳 Configuration Podman

### docker-compose.yml pour OpenCode

```yaml
version: '3.8'

services:
  opencode:
    image: ghcr.io/anomalyco/opencode:latest
    container_name: opencode-server
    ports:
      - "3000:3000"
    volumes:
      - opencode-data:/data/opencode
      - ./workspace:/workspace:rw
    environment:
      - OLLAMA_BASE_URL=http://host.containers.internal:11434/v1
    extra_hosts:
      - "host.containers.internal:host-gateway"
    command: ["serve", "--host", "0.0.0.0", "--port", "3000"]
    restart: unless-stopped

volumes:
  opencode-data:
```

### Commandes Podman

```bash
# Démarrer
podman-compose up -d

# Voir les logs
podman logs -f opencode-server

# Arrêter
podman-compose down

# Redémarrer
podman-compose restart
```

## 🎨 Personnalisation

### Thème

Les couleurs sont définies dans `css/style.css`. Principales variables :

```css
/* Fond */
background: #1e1e1e;

/* Texte */
color: #d4d4d4;

/* Accent */
border-color: #007acc;

/* Statuts */
.status-idle { background: #4caf50; }
.status-running { background: #2196f3; }
.status-error { background: #f44336; }
```

## 🐛 Dépannage

### Le serveur OpenCode n'est pas accessible

1. Vérifier que le conteneur est démarré :
   ```bash
   podman ps
   ```

2. Vérifier les logs :
   ```bash
   podman logs opencode-server
   ```

3. Tester l'API manuellement :
   ```bash
   curl http://localhost:3000/session
   ```

### Erreur CORS

Si vous avez des erreurs CORS, assurez-vous que :
- Le serveur OpenCode accepte les requêtes depuis votre origine
- Vous utilisez un serveur HTTP (pas `file://`)

### Les événements temps réel ne fonctionnent pas

- Vérifiez que le navigateur supporte Server-Sent Events (SSE)
- Regardez la console du navigateur pour les erreurs
- Vérifiez que l'endpoint `/session/:id/events` est accessible

## 📝 TODO / Améliorations futures

- [ ] Export des sessions en JSON/Markdown
- [ ] Graphiques de statistiques (Chart.js)
- [ ] Comparaison de sessions
- [ ] Mode sombre/clair
- [ ] Notifications desktop
- [ ] Recherche avancée dans les messages
- [ ] Filtres par date
- [ ] Pagination pour les grandes sessions

## 📄 Licence

Ce projet est lié à OpenCode : https://github.com/anomalyco/opencode
