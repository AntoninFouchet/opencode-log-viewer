/**
 * Renderer pour afficher la timeline des messages
 *
 * @global marked - Bibliothèque Marked.js chargée via CDN
 * @global Prism - Bibliothèque Prism.js chargée via CDN
 */
export class TimelineRenderer {
    constructor(container) {
        this.container = container;
        this.renderedMessageIds = new Set();
    }

    /**
     * Affiche une liste de messages (affichage instantané)
     */
    render(messages) {
        if (!messages || !Array.isArray(messages)) {
            this.renderEmpty();
            return;
        }

        const validMessages = messages.filter(msg => {
            const info = msg.info || msg;
            const parts = info?.parts || msg.parts || [];
            return parts.length > 0;
        });
        
        if (validMessages.length === 0) {
            this.renderEmpty();
            return;
        }

        this.container.innerHTML = '';
        this.renderedMessageIds.clear();
        
        messages.forEach((msg, index) => {
            const id = msg.info?.id || msg.id || `msg-${index}`;
            this.renderedMessageIds.add(id);
            const messageEl = this.renderMessage(msg, false, index);
            this.container.appendChild(messageEl);
        });
        
        this.highlightCode();
        this.scrollToBottom();
    }

    /**
     * Mise à jour incrémentale - ajoute seulement les nouveaux messages
     */
    updateIncremental(messages) {
        if (!messages || !Array.isArray(messages) || messages.length === 0) return;
        
        let newMessageAdded = false;
        
        messages.forEach((msg, index) => {
            const info = msg.info || msg;
            const parts = info?.parts || msg.parts || [];
            if (parts.length === 0) return;
            
            const id = msg.info?.id || msg.id || `msg-${index}`;
            
            if (this.renderedMessageIds.has(id)) return;
            
            this.renderedMessageIds.add(id);
            const messageEl = this.renderMessage(msg, true, index);
            this.container.appendChild(messageEl);
            newMessageAdded = true;
        });
        
        if (newMessageAdded) {
            this.highlightCode();
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Affiche un état vide
     */
    renderEmpty() {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h3>Aucun message</h3>
                <p>Cette session ne contient pas encore de messages</p>
            </div>
        `;
    }

    /**
     * Rend un message
     */
    renderMessage(msg, isNew = false, messageIndex = 0) {
        const div = document.createElement('div');
        const info = msg.info || msg;
        const role = info?.role || msg.role || 'unknown';
        div.className = `message message-${role}`;
        if (isNew) {
            div.classList.add('message-new');
        }
        div.dataset.messageId = info?.id || msg.id || Date.now();

        const parts = info?.parts || msg.parts || [];

        div.innerHTML = `
            <div class="message-header">
                <span class="role">${this.getRoleIcon(role)} ${this.getRoleName(role)}</span>
                <span class="time">${this.formatTime(info?.time?.created || msg.time?.created)}</span>
            </div>
            <div class="message-parts">
                ${this.renderParts(parts, messageIndex)}
            </div>
        `;

        return div;
    }

    /**
     * Rend toutes les parts d'un message
     */
    renderParts(parts, messageIndex = 0) {
        if (!parts || parts.length === 0) {
            return '<div class="part part-text"><em>Aucun contenu</em></div>';
        }

        return parts.map((part, partIndex) => this.renderPart(part, messageIndex, partIndex)).join('');
    }

    /**
     * Rend une part selon son type
     */
    renderPart(part, messageIndex = 0, partIndex = 0) {
        switch (part.type) {
            case 'text':
                return this.renderTextPart(part);

            case 'tool':
                return this.renderToolPart(part, messageIndex, partIndex);

            case 'reasoning':
                return this.renderReasoningPart(part);

            case 'file':
                return this.renderFilePart(part);

            case 'snapshot':
                return this.renderSnapshotPart(part);

            case 'patch':
                return this.renderPatchPart(part, `${messageIndex}-${partIndex}`);

            default:
                return this.renderUnknownPart(part);
        }
    }

    /**
     * Rend une part de texte
     */
    renderTextPart(part) {
        const text = part.text || '';
        // @ts-ignore - marked est chargé via CDN
        const html = marked.parse(text);

        return `
            <div class="part part-text">
                ${this.renderTimestamp(part.time)}
                ${html}
            </div>
        `;
    }

    /**
     * Rend une part d'outil
     */
    renderToolPart(part, messageIndex = 0, partIndex = 0) {
        // Le nom peut être une string directe ou dans un objet
        let name = part.tool;
        if (typeof name !== 'string') {
            const tool = part.tool || part.call || part.function || {};
            name = tool.name || tool.function?.name || tool.id || part.name || 'unknown';
        }
        
        // Arguments depuis state.input ou tool.args
        let args = {};
        if (part.state?.input) {
            args = part.state.input;
        } else if (part.tool?.args) {
            args = part.tool.args;
        } else if (part.call?.args) {
            args = part.call.args;
        }
        
        // Résultat depuis state.output
        const result = part.state?.output;
        const state = part.state || {};

        // Check if this is an edit tool with oldString/newString
        const isEditTool = name === 'edit' || name === 'write';
        const hasDiff = isEditTool && (args.oldString !== undefined || args.newString !== undefined);
        const diffToggle = hasDiff ? `
            <button class="diff-toggle-btn" data-msg-index="${messageIndex}" data-part-index="${partIndex}" title="Afficher/Masquer les modifications">
                <span class="diff-toggle-icon">▶</span>
            </button>
        ` : '';

        return `
            <div class="part part-tool" data-msg-index="${messageIndex}" data-part-index="${partIndex}">
                ${this.renderTimestamp(part.time)}
                <div class="tool-header">
                    🔧 <strong>${this.escapeHtml(String(name))}</strong>
                    ${state.status ? `<span class="tool-status">(${state.status})</span>` : ''}
                    ${diffToggle}
                </div>
                ${Object.keys(args).length > 0 ? `
                <div class="tool-args">
                    <strong>Arguments:</strong>
                    <pre><code class="language-json">${this.escapeHtml(JSON.stringify(args, null, 2))}</code></pre>
                </div>
                ` : ''}
                ${result ? `
                    <div class="tool-result">
                        <strong>Résultat:</strong>
                        <pre><code>${this.escapeHtml(this.formatToolResult(result))}</code></pre>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Rend une part de raisonnement
     */
    renderReasoningPart(part) {
        const text = part.text || '';

        return `
            <div class="part part-reasoning">
                ${this.renderTimestamp(part.time)}
                <div class="reasoning-header">💭 Raisonnement</div>
                <div class="reasoning-content">${this.escapeHtml(text)}</div>
            </div>
        `;
    }

    /**
     * Rend une part de fichier
     */
    renderFilePart(part) {
        const source = part.source || {};
        const path = source.path || 'Fichier inconnu';
        const text = source.text?.value || '';

        return `
            <div class="part part-file">
                ${this.renderTimestamp(part.time)}
                <div>📄 <strong>${this.escapeHtml(path)}</strong></div>
                ${text ? `
                    <pre><code>${this.escapeHtml(text)}</code></pre>
                ` : ''}
            </div>
        `;
    }

    /**
     * Rend une part de snapshot
     */
    renderSnapshotPart(part) {
        return `
            <div class="part part-snapshot">
                ${this.renderTimestamp(part.time)}
                📸 <strong>Snapshot:</strong> ${this.escapeHtml(part.snapshot || '')}
            </div>
        `;
    }

    /**
     * Rend une part de patch
     */
    renderPatchPart(part, index) {
        const files = part.files || [];
        const patchId = `patch-${index}`;

        return `
            <div class="part part-patch" data-patch-id="${patchId}">
                ${this.renderTimestamp(part.time)}
                <div>🔄 <strong>Patch appliqué</strong></div>
                <div>Hash: <code>${this.escapeHtml(part.hash || '')}</code></div>
                ${files.length > 0 ? `
                    <div class="patch-files">
                        <strong>Fichiers modifiés:</strong>
                        ${files.map(f => `<code class="patch-file-link" data-patch-id="${patchId}" data-file="${this.escapeHtml(f)}">${this.escapeHtml(f)}</code>`).join(', ')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Rend une part d'agent
     */
    renderAgentPart(part) {
        return `
            <div class="part part-agent">
                ${this.renderTimestamp(part.time)}
                🤖 <strong>Agent:</strong> ${this.escapeHtml(part.name || 'unknown')}
            </div>
        `;
    }

    /**
     * Rend une part de début d'étape
     */
    renderStepStartPart(part) {
        return `
            <div class="part part-step">
                ${this.renderTimestamp(part.time)}
                ▶️ <strong>Début d'étape:</strong> ${this.escapeHtml(part.name || '')}
            </div>
        `;
    }

    /**
     * Rend une part de fin d'étape
     */
    renderStepFinishPart(part) {
        const status = part.status || 'unknown';
        const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏹️';

        return `
            <div class="part part-step">
                ${this.renderTimestamp(part.time)}
                ${icon} <strong>Fin d'étape</strong>
                ${part.error ? `<div>Erreur: ${this.escapeHtml(part.error)}</div>` : ''}
            </div>
        `;
    }

    /**
     * Rend une part inconnue
     */
    renderUnknownPart(part) {
        return `
            <div class="part part-unknown">
                ${this.renderTimestamp(part.time)}
                <em>Type inconnu: ${this.escapeHtml(part.type || 'unknown')}</em>
                <pre><code class="language-json">${this.escapeHtml(JSON.stringify(part, null, 2))}</code></pre>
            </div>
        `;
    }

    /**
     * Formate le résultat d'un outil
     */
    formatToolResult(result) {
        if (typeof result === 'string') {
            return result;
        }
        return JSON.stringify(result, null, 2);
    }

    /**
     * Obtient l'icône pour un rôle
     */
    getRoleIcon(role) {
        const icons = {
            user: '👤',
            assistant: '🤖',
            system: '⚙️',
        };
        return icons[role] || '❓';
    }

    /**
     * Obtient le nom d'un rôle
     */
    getRoleName(role) {
        const names = {
            user: 'Utilisateur',
            assistant: 'Assistant',
            system: 'Système',
        };
        return names[role] || role || 'Inconnu';
    }

    /**
     * Formate un timestamp
     */
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    /**
     * Rend un timestamp pour une part
     * Affiche start et end si disponibles, avec durée
     */
    renderTimestamp(time) {
        if (!time) return '';

        const start = time.start ? new Date(time.start) : null;
        const end = time.end ? new Date(time.end) : null;

        if (!start) return '';

        let html = `<span class="part-timestamp">🕐 ${this.formatTime(start.getTime())}`;

        if (end && start) {
            const duration = end.getTime() - start.getTime();
            html += ` → ${this.formatTime(end.getTime())} (${this.formatDuration(duration)})`;
        }

        html += '</span>';

        return html;
    }

    /**
     * Formate une durée en milliseconds
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Échappe le HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Applique la coloration syntaxique
     */
    highlightCode() {
        // @ts-ignore - Prism est chargé via CDN
        if (typeof Prism !== 'undefined') {
            // @ts-ignore
            Prism.highlightAllUnder(this.container);
        }
    }
}
