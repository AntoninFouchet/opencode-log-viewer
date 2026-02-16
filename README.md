# OpenCode Log Viewer

Interface web pour visualiser et analyser les sessions OpenCode.

## Fonctionnalités

### Liste des sessions
- Affichage de toutes les sessions OpenCode
- Recherche/filtrage par nom de session
- Actualisation automatique configurable
- Indicateur de statut de connexion

### Timeline
- Affichage chronologique de tous les messages
- Support de plusieurs types de contenus:
  - Messages texte (rendu Markdown)
  - Outils utilisés (edit, write, read, etc.)
  - Raisonnements (think)
  - Fichiers
  - Snapshots
  - Patches
- Coloration syntaxique du code (Prism.js)
- Animation d'apparition des nouveaux messages

### Détails (panneau droit)
- **Stats**: Statistiques de la session (messages, outils utilisés, durée)
- **Métadonnées**: Informations sur la session (ID, dates, statut)
- **Outils**: Liste des outils utilisés avec leur nombre d'appels
- **Modifs**: Liste des fichiers modifiés avec date, type et statistiques

### Modifications de code
- Affichage des diffs avec coloration:
  - Vert: lignes ajoutées
  - Rouge: lignes supprimées
- Bouton ▶ sur les outils edit/write pour afficher/masquer les diffs
- Clic sur un fichier dans "Modifs" → scroll jusqu'au message correspondant
- Les diffs s'affichent inline dans la timeline

### Paramètres
- URL de l'API OpenCode (par défaut: `http://localhost:3000`)
- Intervalle d'actualisation automatique
- Sauvegarde dans localStorage

## Installation

### Prérequis
- Navigateur moderne (Chrome, Firefox, Edge, Safari)
- Serveur OpenCode accessible

### Lancement

**Windows:**
```bash
start-viewer-and-open.bat
```

**Manuellement:**
1. Servir le répertoire `opencode-log-viewer` avec un serveur HTTP:
   ```bash
   # Python
   python -m http.server 8080

   # ou Node.js
   npx serve .
   ```
2. Ouvrir `http://localhost:8080` dans le navigateur

### Configuration
L'URL de l'API par défaut est `http://localhost:3000`. Modifier via les paramètres (bouton ⚙️).

## Architecture

```
opencode-log-viewer/
├── index.html              # Structure HTML
├── css/
│   └── style.css          # Styles (thème sombre)
├── js/
│   ├── api-client.js      # Client API REST
│   ├── main.js           # Logique principale
│   └── timeline-renderer.js  # Rendu des messages
└── start-viewer-and-open.bat  # Script de lancement Windows
```

### Technologies
- Vanilla JavaScript (ES6+)
- CSS Grid/Flexbox
- Marked.js (Markdown)
- Prism.js (coloration syntaxique)
- API REST OpenCode

## API

### Endpoints utilisés

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/session` | Liste des sessions |
| GET | `/session/{id}` | Détails d'une session |
| GET | `/session/{id}/message` | Messages d'une session |

## Licence

MIT
