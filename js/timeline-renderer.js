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
                <div class="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
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
        
        // Calculate total duration for assistant messages
        const created = info?.time?.created || msg.time?.created;
        const completed = info?.time?.completed || msg.time?.completed;
        let durationHtml = '';
        let statsHtml = '';
        
        if (role === 'assistant' && created && completed) {
            const duration = completed - created;
            durationHtml = `<span class="message-duration" title="Temps total de traitement">${this.formatDuration(duration)}</span>`;
        }
        
        // Add tokens and cost info
        const tokens = info?.tokens || msg.tokens;
        const cost = info?.cost || msg.cost;
        if (tokens) {
            const total = tokens.total || (tokens.input + tokens.output + (tokens.reasoning || 0));
            statsHtml = `<span class="message-stats" title="Tokens: ${tokens.input} in / ${tokens.output} out${tokens.reasoning ? ' / ' + tokens.reasoning + ' reasoning' : ''}">${total} tok</span>`;
        }
        
        // Add model info for assistant messages
        const modelId = info?.modelID || msg.modelID;
        const modelHtml = (role === 'assistant' && modelId) 
            ? `<span class="message-model" title="Model">${this.escapeHtml(modelId)}</span>` 
            : '';
        
        // Add mode info
        const mode = info?.mode || msg.mode;
        const modeHtml = (role === 'assistant' && mode) 
            ? `<span class="message-mode" title="Mode">${this.escapeHtml(mode)}</span>` 
            : '';

        div.innerHTML = `
            <div class="message-header">
                <span class="role">${this.getRoleIcon(role)} ${this.getRoleName(role)}</span>
                <span class="time">${this.formatTime(created)}</span>
                ${modeHtml}
                ${modelHtml}
                ${durationHtml}
                ${statsHtml}
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

            case 'step-start':
                return this.renderStepStartPart(part);

            case 'step-finish':
                return this.renderStepFinishPart(part);

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
                <span class="diff-toggle-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </span>
            </button>
        ` : '';

        return `
            <div class="part part-tool" data-msg-index="${messageIndex}" data-part-index="${partIndex}">
                ${this.renderTimestamp(part.time)}
                <div class="tool-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                    <strong>${this.escapeHtml(String(name))}</strong>
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
                <div class="reasoning-header">Raisonnement</div>
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
                <div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <strong>${this.escapeHtml(path)}</strong>
                </div>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <strong>Snapshot:</strong> ${this.escapeHtml(part.snapshot || '')}
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
                <div><strong>Patch applique</strong></div>
                <div>Hash: <code>${this.escapeHtml(part.hash || '')}</code></div>
                ${files.length > 0 ? `
                    <div class="patch-files">
                        <strong>Fichiers modifies:</strong>
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
                <strong>Agent:</strong> ${this.escapeHtml(part.name || 'unknown')}
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <strong>Debut d'etape:</strong> ${this.escapeHtml(part.name || '')}
            </div>
        `;
    }

    /**
     * Rend une part de fin d'étape
     */
    renderStepFinishPart(part) {
        const status = part.status || 'unknown';
        const icon = status === 'success' 
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : status === 'error'
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

        return `
            <div class="part part-step">
                ${this.renderTimestamp(part.time)}
                ${icon} <strong>Fin d'etape</strong>
                ${part.reason ? `<span class="step-reason">(${this.escapeHtml(part.reason)})</span>` : ''}
                ${part.error ? `<div class="step-error">Erreur: ${this.escapeHtml(part.error)}</div>` : ''}
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
            user: '',
            assistant: '',
            system: '',
        };
        return icons[role] || '?';
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

        let html = `<span class="part-timestamp"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${this.formatTime(start.getTime())}`;

        if (end && start) {
            const duration = end.getTime() - start.getTime();
            html += ` <span class="duration-badge">${this.formatDuration(duration)}</span>`;
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
