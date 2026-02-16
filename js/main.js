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

// ========== Initialisation ==========

async function init() {
  console.log("🚀 Initialisation de OpenCode Log Viewer");

  setupEventListeners();

  // Vérifier la connexion
  updateConnectionStatus("connecting");
  const isConnected = await client.ping();

  if (isConnected) {
    updateConnectionStatus("connected");
    console.log("✅ Connecté au serveur OpenCode");
    await loadSessions();
    startAutoRefresh();
  } else {
    updateConnectionStatus("error");
    console.error("❌ Impossible de se connecter au serveur OpenCode");
    showError(
      "Impossible de se connecter au serveur OpenCode. Vérifiez que le serveur est démarré sur " +
        API_URL,
    );
  }
}

// ========== Gestion des sessions ==========

async function loadSessions() {
  try {
    console.log("📥 Chargement des sessions...");
    const sessions = await client.getSessions();

    allSessions = sessions.map((session) => ({
      ...session,
      status: "idle",
    }));

    console.log(`✅ ${sessions.length} session(s) chargée(s)`);
    renderSessionsList(allSessions);
  } catch (error) {
    console.error("❌ Erreur chargement sessions:", error);
    allSessions = [];
    renderSessionsList([]);
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

    // Charger les détails complets de la session (contient les tokens)
    const session = await client.getSession(sessionId);
    console.log("Session trouvée:", session);

    if (!session) {
      throw new Error("Session non trouvée");
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

  // Modifications
  renderModifications(messages);
}

// ========== Gestion des événements ==========

let reloadTimeout = null;

function handleSessionEvent(event) {
  if (event.type === 'session.updated' && currentSessionId) {
    scheduleReload();
  }
}

function scheduleReload() {
  if (reloadTimeout) return;
  
  // Wait 2 seconds before reloading to batch multiple events
  reloadTimeout = setTimeout(() => {
    reloadTimeout = null;
    reloadCurrentSession();
  }, 2000);
}

async function reloadCurrentSession() {
  if (!currentSessionId) return;

  try {
    const session = await client.getSession(currentSessionId);
    const messages = await client.getSessionMessages(currentSessionId);
    timeline.updateIncremental(messages);
    if (session) {
      renderStats(session, messages);
    }
  } catch (error) {
    console.error("Erreur rechargement messages:", error);
  }
}

// ========== Rendu des panels ==========

function renderStats(session, messages) {
  const statsContent = document.getElementById("stats-content");

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

  // Compter les tokens (depuis la session ou le dernier message)
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  
  // D'abord essayer depuis la session
  if (session.tokens) {
    totalTokens = session.tokens.total || 0;
    inputTokens = session.tokens.input || 0;
    outputTokens = session.tokens.output || 0;
  } else {
    // Sinon utiliser le dernier message (total cumulé)
    const lastMessageWithTokens = [...messages].reverse().find((msg) => {
      const tokens = msg.info?.tokens || msg.tokens;
      return tokens && (tokens.total || tokens.input || tokens.output);
    });
    
    if (lastMessageWithTokens) {
      const tokens = lastMessageWithTokens.info?.tokens || lastMessageWithTokens.tokens;
      totalTokens = tokens.total || 0;
      inputTokens = tokens.input || 0;
      outputTokens = tokens.output || 0;
    }
  }

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
  // Bouton refresh - hard refresh comme Ctrl+Shift+R
  document.getElementById("refresh-btn").addEventListener("click", () => {
    window.location.reload();
  });

  // Event delegation for patch file links in timeline
  document.getElementById("timeline").addEventListener("click", (e) => {
    // Handle diff toggle button
    const toggleBtn = e.target.closest(".diff-toggle-btn");
    if (toggleBtn) {
      e.preventDefault();
      const msgIndex = parseInt(toggleBtn.dataset.msgIndex);
      const partIndex = parseInt(toggleBtn.dataset.partIndex);
      if (isNaN(msgIndex)) return;
      toggleDiffInTimeline(msgIndex, isNaN(partIndex) ? 0 : partIndex, toggleBtn);
      return;
    }

    if (e.target.classList.contains("file-link") || e.target.closest(".file-link")) {
      e.preventDefault();
      const link = e.target.classList.contains("file-link") ? e.target : e.target.closest(".file-link");
      const patchId = link.dataset.patchId;
      const file = link.dataset.file;
      
      // Find the patch by file path (simpler approach)
      const patchIndex = currentPatches.findIndex((p) => p.file === file);
      
      if (patchIndex >= 0) {
        // Expand the mod item in the mods tab
        const modsTab = document.getElementById('mods-tab');
        const modItem = modsTab.querySelector(`[data-patch-index="${patchIndex}"]`);
        if (modItem) {
          const diffEl = modItem.querySelector('.mod-diff');
          const expandIcon = modItem.querySelector('.mod-expand');
          diffEl.classList.remove('hidden');
          expandIcon.classList.add('expanded');
        }
      }
    }
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
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active");
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`${tabName}-tab`).classList.add("active");
}

// ========== Modifications & Diff ==========

let currentPatches = [];

function renderModifications(messages) {
  const modsContent = document.getElementById("mods-content");
  currentPatches = [];

  const allDiffs = extractDiffsFromMessages(messages);
  
  if (allDiffs && allDiffs.length > 0) {
    allDiffs.forEach((diff) => {
      currentPatches.push({
        msgIndex: diff.msgIndex,
        partId: diff.partId,
        msgTime: diff.msgTime,
        file: diff.file,
        toolName: 'edit',
        before: diff.before,
        after: diff.after,
        additions: diff.additions,
        deletions: diff.deletions,
      });
    });
  }
  
  renderModificationsList(modsContent);
}

function extractDiffsFromMessages(messages) {
  const diffs = [];
  
  if (!messages || !Array.isArray(messages)) {
    return diffs;
  }
  
  messages.forEach((msg, msgIndex) => {
    const parts = msg.parts || msg.info?.parts || [];
    const msgId = msg.info?.id || msg.id || '';
    const msgTime = msg.info?.time?.created || msg.time?.created || null;
    
    parts.forEach((part, partIndex) => {
      const partId = part.id || `part-${msgIndex}-${partIndex}`;
      
      if (part.type === 'tool') {
        const state = part.state || {};
        const input = state.input || {};
        
        // Check for filediff in tool result
        const metadata = state.metadata || {};
        const filediff = metadata.filediff;
        
        if (filediff) {
          diffs.push({
            msgIndex: msgIndex,
            partId: partId,
            msgTime: msgTime,
            file: filediff.file || state?.input?.filePath || 'unknown',
            before: filediff.before || '',
            after: filediff.after || '',
            additions: filediff.additions || 0,
            deletions: filediff.deletions || 0,
          });
        }
        
        // Also check for oldString/newString in input (for edit tools)
        if (input.oldString !== undefined || input.newString !== undefined) {
          const oldStr = input.oldString || '';
          const newStr = input.newString || '';
          
          if (oldStr || newStr) {
            const filePath = input.filePath || 'unknown';
            const exists = diffs.some(d => d.file === filePath);
            
            if (!exists) {
              const additions = newStr.split('\n').length - oldStr.split('\n').length;
              const deletions = additions < 0 ? -additions : 0;
              const posAdditions = additions > 0 ? additions : 0;
              
              diffs.push({
                msgIndex: msgIndex,
                partId: partId,
                msgTime: msgTime,
                file: filePath,
                before: oldStr,
                after: newStr,
                additions: posAdditions,
                deletions: deletions,
              });
            }
          }
        }
      }
    });
  });
  
  return diffs;
}

function renderModificationsList(modsContent) {
  if (currentPatches.length === 0) {
    modsContent.innerHTML = '<div class="empty-stats">Aucune modification détectée</div>';
    return;
  }

  modsContent.innerHTML = currentPatches
    .map(
      (patch, index) => {
        const fileName = patch.file.split('/').pop();
        const timeStr = patch.msgTime ? formatDateTime(patch.msgTime) : '';
        
        return `
        <div class="mod-item" data-patch-index="${index}">
          <div class="mod-main">
            <div class="mod-file">${escapeHtml(fileName)}</div>
            <div class="mod-time">${timeStr}</div>
          </div>
          <div class="mod-path">${escapeHtml(patch.file)}</div>
        </div>
      `}
    )
    .join("");

  modsContent.querySelectorAll(".mod-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const index = parseInt(item.dataset.patchIndex);
      const patch = currentPatches[index];
      
      // Scroll to the message in timeline and show diff there
      if (patch && patch.msgIndex !== undefined) {
        scrollToMessage(patch.msgIndex, patch);
      }
    });
  });
}

function scrollToMessage(msgIndex, patch) {
  const timeline = document.getElementById('timeline');
  const messages = timeline.querySelectorAll('.message');
  
  if (messages[msgIndex]) {
    // Scroll to the message
    messages[msgIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight the message temporarily
    messages[msgIndex].classList.add('highlighted');
    setTimeout(() => {
      messages[msgIndex].classList.remove('highlighted');
    }, 2000);
    
    // Check if this message has an edit tool part and add diff display
    addDiffToMessage(messages[msgIndex], patch);
  }
}

function toggleDiffInTimeline(msgIndex, partIndex, toggleBtn) {
  const timeline = document.getElementById('timeline');
  const messages = timeline.querySelectorAll('.message');
  const messageEl = messages[msgIndex];
  
  if (!messageEl) return;
  
  // Check if diff already displayed in this message
  const existingDiff = messageEl.querySelector('.timeline-diff-inline');
  if (existingDiff) {
    // Toggle visibility
    existingDiff.classList.toggle('hidden');
    toggleBtn.classList.toggle('expanded');
    return;
  }
  
  // Find the patch that corresponds to this message
  const patch = currentPatches.find(p => p.msgIndex === msgIndex);
  if (!patch) return;
  
  addDiffToMessage(messageEl, patch, partIndex, toggleBtn);
}

function addDiffToMessage(messageEl, patch, partIndex = -1, toggleBtn = null) {
  const diffHtml = renderInlineDiff(patch);
  const diffContainer = document.createElement('div');
  diffContainer.className = 'timeline-diff-inline';
  diffContainer.innerHTML = `
    <div class="timeline-diff-header">
      <span class="timeline-diff-file">${escapeHtml(patch.file)}</span>
      <span class="timeline-diff-stats">
        <span class="diff-add">+${patch.additions || 0}</span>
        <span class="diff-del">-${patch.deletions || 0}</span>
      </span>
    </div>
    ${diffHtml}
  `;
  
  // Find the tool part and append diff after it
  const toolParts = messageEl.querySelectorAll('.part-tool');
  const toolPart = partIndex >= 0 ? toolParts[partIndex] : toolParts[toolParts.length - 1];
  
  if (toolPart) {
    toolPart.after(diffContainer);
    if (toggleBtn) {
      toggleBtn.classList.add('expanded');
    }
  }
}

function renderInlineDiff(patch) {
  const before = patch.before || '';
  const after = patch.after || '';
  
  if (!before && !after) {
    return '<div class="empty-stats">Contenu non disponible</div>';
  }
  
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const diff = computeLineDiff(beforeLines, afterLines);
  
  let html = '<div class="inline-diff">';
  
  diff.forEach((item) => {
    if (item.type === 'equal') {
      html += `<div class="diff-line diff-equal"><span class="line-num">${item.oldLineNum || ''}</span><span class="line-content">${escapeHtml(item.line)}</span></div>`;
    } else if (item.type === 'deleted') {
      html += `<div class="diff-line diff-deleted"><span class="line-num">${item.oldLineNum || ''}</span><span class="line-content">- ${escapeHtml(item.line)}</span></div>`;
    } else if (item.type === 'added') {
      html += `<div class="diff-line diff-added"><span class="line-num">${item.newLineNum || ''}</span><span class="line-content">+ ${escapeHtml(item.line)}</span></div>`;
    }
  });
  
  html += '</div>';
  return html;
}

function computeLineDiff(beforeLines, afterLines) {
  const result = [];
  const m = beforeLines.length;
  const n = afterLines.length;
  
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = m, j = n;
  const lcs = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      lcs.push({ type: 'equal', line: beforeLines[i - 1], oldLineNum: i, newLineNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      lcs.push({ type: 'added', line: afterLines[j - 1], newLineNum: j });
      j--;
    } else if (i > 0) {
      lcs.push({ type: 'deleted', line: beforeLines[i - 1], oldLineNum: i });
      i--;
    }
  }
  
  return lcs.reverse();
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

  // Fermer l'ancienne connexion SSE
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  client.closeEventSource();

  // Créer un nouveau client
  client = new OpencodeClient(API_URL);

  // Recharger (toujours, pour tester la nouvelle connexion)
  currentSessionId = null;
  init();

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

  // Only refresh session list if no session is selected
  refreshTimer = setInterval(() => {
    if (!currentSessionId) {
      console.log("🔄 Rafraîchissement automatique...");
      loadSessions();
    }
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
