import { OpencodeClient } from "./api-client.js";
import { TimelineRenderer } from "./timeline-renderer.js";

// Configuration (avec localStorage)
const DEFAULT_API_URL = "http://localhost:3000";
const DEFAULT_REFRESH_INTERVAL = 30000; // 30 secondes

let API_URL = localStorage.getItem("opencode_url") || DEFAULT_API_URL;
let REFRESH_INTERVAL = parseInt(
  localStorage.getItem("refresh_interval") || DEFAULT_REFRESH_INTERVAL,
);

// Instances
let client = new OpencodeClient(API_URL);
const timeline = new TimelineRenderer(document.getElementById("timeline"));

// État
let currentSessionId = null;
let unsubscribe = null;
let refreshTimer = null;
let allSessions = [];
let allSessionStatuses = {};

// ========== Initialisation ==========

async function init() {
  console.log("🚀 Initialisation de OpenCode Log Viewer");

  // Vérifier la connexion
  updateConnectionStatus("connecting");
  const isConnected = await client.ping();

  if (isConnected) {
    updateConnectionStatus("connected");
    console.log("✅ Connecté au serveur OpenCode");
  } else {
    updateConnectionStatus("error");
    console.error("❌ Impossible de se connecter au serveur OpenCode");
    showError(
      "Impossible de se connecter au serveur OpenCode. Vérifiez que le serveur est démarré sur " +
        API_URL,
    );
    return;
  }

  // Charger les sessions
  await loadSessions();

  // Configurer les event listeners
  setupEventListeners();

  // Démarrer le rafraîchissement automatique
  startAutoRefresh();
}

// ========== Gestion des sessions ==========

async function loadSessions() {
  try {
    console.log("📥 Chargement des sessions...");
    const sessions = await client.getSessions();

    // On affiche toujours "idle" pour toutes les sessions
    allSessions = sessions.map((session) => ({
      ...session,
      status: "idle",
    }));

    console.log(`✅ ${sessions.length} session(s) chargée(s)`);
    renderSessionsList(allSessions);
  } catch (error) {
    console.error("❌ Erreur chargement sessions:", error);
    showError("Erreur lors du chargement des sessions");
  }
}

function renderSessionsList(sessions) {
  const list = document.getElementById("sessions-list");

  if (!sessions || sessions.length === 0) {
    list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Aucune session trouvée</p>
            </div>
        `;
    return;
  }

  // Trier par date (plus récent en premier)
  const sorted = [...sessions].sort((a, b) => {
    const timeA = a.time?.created || 0;
    const timeB = b.time?.created || 0;
    return timeB - timeA;
  });

  list.innerHTML = sorted
    .map((session) => {
      const isActive = session.id === currentSessionId;
      return `
            <div class="session-item ${isActive ? "active" : ""}" data-id="${session.id}">
                <div class="session-title">${escapeHtml(session.title || "Sans titre")}</div>
                <div class="session-meta">
                    <span class="status status-${session.status || "unknown"}">${session.status || "unknown"}</span>
                    <span class="date">${formatDate(session.time?.created)}</span>
                </div>
            </div>
        `;
    })
    .join("");

  // Event listeners
  list.querySelectorAll(".session-item").forEach((item) => {
    item.addEventListener("click", () => {
      const sessionId = item.dataset.id;
      loadSession(sessionId);
    });
  });
}

async function loadSession(sessionId) {
  if (currentSessionId === sessionId) {
    return; // Déjà chargée
  }

  currentSessionId = sessionId;

  // Désabonner de l'ancienne session
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  try {
    console.log(`📖 Chargement de la session ${sessionId}...`);

    // Récupérer les données de la session depuis la liste déjà chargée
    const session = allSessions.find((s) => s.id === sessionId);
    console.log("Session trouvée:", session);

    if (!session) {
      throw new Error("Session non trouvée dans la liste");
    }

    // Charger les messages
    console.log("Appel API pour les messages...");
    const messages = await client.getSessionMessages(sessionId);
    console.log("Messages reçus:", messages);

    console.log(`✅ Session chargée: ${messages.length} message(s)`);

    // Afficher dans l'interface
    displaySession(session, messages);

    // S'abonner aux événements temps réel
    unsubscribe = client.subscribeToSession(sessionId, (event) => {
      handleSessionEvent(event);
    });

    // Mettre à jour la liste (pour l'état actif)
    renderSessionsList(allSessions);
  } catch (error) {
    console.error("❌ Erreur chargement session:", error);
    showError("Erreur lors du chargement de la session: " + error.message);
  }
}

function displaySession(session, messages) {
  // Header
  document.getElementById("session-title").textContent =
    session.title || "Sans titre";
  document.getElementById("session-status").textContent = "idle";
  document.getElementById("session-status").className = "status status-idle";
  document.getElementById("session-date").textContent = formatDateTime(
    session.time?.created,
  );

  // Timeline
  timeline.render(messages);

  // Stats
  renderStats(session, messages);

  // Métadonnées
  renderMetadata(session);

  // Outils
  renderTools(messages);
}

// ========== Gestion des événements ==========

function handleSessionEvent(event) {
  console.log("📡 Event reçu:", event.type);

  switch (event.type) {
    case "message.updated":
    case "message.part.updated":
    case "message.part.removed":
      // Recharger les messages
      if (currentSessionId) {
        reloadCurrentSession();
      }
      break;

    case "session.status":
      // On ignore les événements de statut, on affiche toujours "idle"
      break;

    case "session.updated":
      // Recharger la session
      if (currentSessionId) {
        reloadCurrentSession();
      }
      break;
  }
}

async function reloadCurrentSession() {
  if (!currentSessionId) return;

  try {
    const messages = await client.getSessionMessages(currentSessionId);
    timeline.render(messages);
  } catch (error) {
    console.error("Erreur rechargement messages:", error);
  }
}

// ========== Rendu des panels ==========

function renderStats(session, messages) {
  const statsContent = document.getElementById("stats-content");

  console.log("renderStats called with:", { sessionId: session?.id, messageCount: messages?.length });

  const totalMessages = messages.length;
  const userMessages = messages.filter((m) => m.info?.role === "user").length;
  const assistantMessages = messages.filter(
    (m) => m.info?.role === "assistant",
  ).length;

  // Compter les parts par type
  const partTypes = {};
  messages.forEach((msg) => {
    (msg.info?.parts || msg.parts || []).forEach((part) => {
      partTypes[part.type] = (partTypes[part.type] || 0) + 1;
    });
  });

  // Compter les tokens (depuis info.tokens ou tokens)
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  messages.forEach((msg) => {
    const tokens = msg.info?.tokens || msg.tokens;
    if (tokens) {
      totalTokens += tokens.total || 0;
      inputTokens += tokens.input || 0;
      outputTokens += tokens.output || 0;
    }
  });

  statsContent.innerHTML = `
        <div class="stat">
            <label>Messages totaux:</label>
            <value>${totalMessages}</value>
        </div>
        <div class="stat">
            <label>Messages utilisateur:</label>
            <value>${userMessages}</value>
        </div>
        <div class="stat">
            <label>Messages assistant:</label>
            <value>${assistantMessages}</value>
        </div>
        <div class="stat">
            <label>Tokens totaux:</label>
            <value>${totalTokens.toLocaleString()}</value>
        </div>
        <div class="stat">
            <label>Tokens input:</label>
            <value>${inputTokens.toLocaleString()}</value>
        </div>
        <div class="stat">
            <label>Tokens output:</label>
            <value>${outputTokens.toLocaleString()}</value>
        </div>
        ${Object.entries(partTypes)
          .map(
            ([type, count]) => `
            <div class="stat">
                <label>Parts "${type}":</label>
                <value>${count}</value>
            </div>
        `,
          )
          .join("")}
    `;
}

function renderMetadata(session) {
  const metadataContent = document.getElementById("metadata-content");

  metadataContent.innerHTML = `
        <div class="metadata-item">
            <strong>ID:</strong>
            <span>${escapeHtml(session.id)}</span>
        </div>
        <div class="metadata-item">
            <strong>Slug:</strong>
            <span>${escapeHtml(session.slug || "N/A")}</span>
        </div>
        <div class="metadata-item">
            <strong>Projet:</strong>
            <span>${escapeHtml(session.projectID || "N/A")}</span>
        </div>
        <div class="metadata-item">
            <strong>Répertoire:</strong>
            <span>${escapeHtml(session.directory || "N/A")}</span>
        </div>
        <div class="metadata-item">
            <strong>Version:</strong>
            <span>${escapeHtml(session.version || "N/A")}</span>
        </div>
        <div class="metadata-item">
            <strong>Créé le:</strong>
            <span>${formatDateTime(session.time?.created)}</span>
        </div>
        <div class="metadata-item">
            <strong>Mis à jour le:</strong>
            <span>${formatDateTime(session.time?.updated)}</span>
        </div>
        ${
          session.parentID
            ? `
            <div class="metadata-item">
                <strong>Session parente:</strong>
                <span>${escapeHtml(session.parentID)}</span>
            </div>
        `
            : ""
        }
    `;
}

function renderTools(messages) {
  const toolsContent = document.getElementById("tools-content");

  // Compter les outils utilisés
  const tools = {};
  messages.forEach((msg) => {
    (msg.info?.parts || msg.parts || []).forEach((part) => {
      if (part.type === "tool") {
        // Le nom peut être une string directe ou dans un objet
        let name = part.tool;
        if (typeof name !== 'string') {
          name = part.tool?.name || part.call?.name || 'unknown';
        }
        if (name) {
          tools[name] = (tools[name] || 0) + 1;
        }
      }
    });
  });

  const toolEntries = Object.entries(tools);

  if (toolEntries.length === 0) {
    toolsContent.innerHTML =
      '<div class="empty-stats">Aucun outil utilisé</div>';
    return;
  }

  // Trier par nombre d'utilisations
  toolEntries.sort((a, b) => b[1] - a[1]);

  toolsContent.innerHTML = toolEntries
    .map(
      ([name, count]) => `
        <div class="tool-item">
            <div class="tool-name">${escapeHtml(name)}</div>
            <div class="tool-count">${count} utilisation(s)</div>
        </div>
    `,
    )
    .join("");
}

// ========== Event Listeners ==========

function setupEventListeners() {
  // Bouton refresh
  document.getElementById("refresh-btn").addEventListener("click", () => {
    loadSessions();
  });

  // Bouton settings
  document.getElementById("settings-btn").addEventListener("click", () => {
    openSettingsModal();
  });

  // Modal settings
  document.getElementById("close-modal").addEventListener("click", () => {
    closeSettingsModal();
  });

  document.getElementById("cancel-settings").addEventListener("click", () => {
    closeSettingsModal();
  });

  document.getElementById("save-settings").addEventListener("click", () => {
    saveSettings();
  });

  // Fermer modal en cliquant à l'extérieur
  document.getElementById("settings-modal").addEventListener("click", (e) => {
    if (e.target.id === "settings-modal") {
      closeSettingsModal();
    }
  });

  // Recherche
  const searchInput = document.getElementById("search");
  searchInput.addEventListener("input", (e) => {
    filterSessions(e.target.value);
  });

  // Tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function filterSessions(searchTerm = "") {
  let filtered = [...allSessions];

  // Filtre par recherche
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter((session) => {
      const title = (session.title || "").toLowerCase();
      const id = (session.id || "").toLowerCase();
      return title.includes(term) || id.includes(term);
    });
  }

  renderSessionsList(filtered);
}

function switchTab(tabName) {
  // Désactiver tous les tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active");
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  // Activer le tab sélectionné
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`${tabName}-tab`).classList.add("active");
}

// ========== Settings Modal ==========

function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const urlInput = document.getElementById("server-url");
  const intervalInput = document.getElementById("refresh-interval");

  // Charger les valeurs actuelles
  urlInput.value = API_URL;
  intervalInput.value = REFRESH_INTERVAL / 1000; // Convertir en secondes

  modal.classList.add("active");
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  modal.classList.remove("active");
}

function saveSettings() {
  const urlInput = document.getElementById("server-url");
  const intervalInput = document.getElementById("refresh-interval");

  const newURL = urlInput.value.trim();
  const newInterval = parseInt(intervalInput.value) * 1000; // Convertir en millisecondes

  // Validation
  if (!newURL) {
    alert("⚠️ L'URL du serveur ne peut pas être vide");
    return;
  }

  if (newInterval < 5000 || newInterval > 300000) {
    alert("⚠️ L'intervalle doit être entre 5 et 300 secondes");
    return;
  }

  // Sauvegarder dans localStorage
  localStorage.setItem("opencode_url", newURL);
  localStorage.setItem("refresh_interval", newInterval.toString());

  // Mettre à jour les variables
  const urlChanged = API_URL !== newURL;
  API_URL = newURL;
  REFRESH_INTERVAL = newInterval;

  // Recréer le client si l'URL a changé
  if (urlChanged) {
    console.log(`🔄 Changement d'URL: ${API_URL}`);

    // Fermer l'ancienne connexion SSE
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    client.closeEventSource();

    // Créer un nouveau client
    client = new OpencodeClient(API_URL);

    // Recharger
    currentSessionId = null;
    init();
  }

  // Redémarrer l'auto-refresh avec le nouvel intervalle
  startAutoRefresh();

  closeSettingsModal();

  console.log(
    `✅ Paramètres sauvegardés: URL=${API_URL}, Intervalle=${REFRESH_INTERVAL}ms`,
  );
}

// ========== Auto-refresh ==========

function startAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    console.log("🔄 Rafraîchissement automatique...");
    loadSessions();
  }, REFRESH_INTERVAL);
}

// ========== Utilitaires ==========

function updateConnectionStatus(status) {
  const statusEl = document.getElementById("connection-status");
  const indicator = statusEl.querySelector(".status-indicator");
  const text = statusEl.querySelector(".status-text");

  indicator.className = "status-indicator";

  switch (status) {
    case "connected":
      indicator.classList.add("connected");
      text.textContent = `Connecté à ${API_URL}`;
      break;
    case "connecting":
      text.textContent = `Connexion à ${API_URL}...`;
      break;
    case "error":
      indicator.classList.add("error");
      text.textContent = `Déconnecté de ${API_URL}`;
      break;
  }
}

function showError(message) {
  console.error(message);
  // TODO: Afficher une notification d'erreur
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp);
  return date.toLocaleDateString("fr-FR");
}

function formatDateTime(timestamp) {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ========== Démarrage ==========

init();
