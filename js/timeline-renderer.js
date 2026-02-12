/**
 * Renderer pour afficher la timeline des messages
 *
 * @global marked - Bibliothèque Marked.js chargée via CDN
 * @global Prism - Bibliothèque Prism.js chargée via CDN
 */
export class TimelineRenderer {
    constructor(container) {
        this.container = container;
    }

    /**
     * Affiche une liste de messages
     */
    render(messages) {
        if (!messages || messages.length === 0) {
            this.renderEmpty();
            return;
        }

        this.container.innerHTML = '';

        messages.forEach(msg => {
            const messageEl = this.renderMessage(msg);
            this.container.appendChild(messageEl);
        });

        // Appliquer la coloration syntaxique
        this.highlightCode();
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
    renderMessage(msg) {
        const div = document.createElement('div');
        div.className = `message message-${msg.role || 'unknown'}`;
        div.dataset.messageId = msg.id;

        div.innerHTML = `
            <div class="message-header">
                <span class="role">${this.getRoleIcon(msg.role)} ${this.getRoleName(msg.role)}</span>
                <span class="time">${this.formatTime(msg.time?.created)}</span>
            </div>
            <div class="message-parts">
                ${this.renderParts(msg.parts || [])}
            </div>
        `;

        return div;
    }

    /**
     * Rend toutes les parts d'un message
     */
    renderParts(parts) {
        if (!parts || parts.length === 0) {
            return '<div class="part part-text"><em>Aucun contenu</em></div>';
        }

        return parts.map(part => this.renderPart(part)).join('');
    }

    /**
     * Rend une part selon son type
     */
    renderPart(part) {
        switch (part.type) {
            case 'text':
                return this.renderTextPart(part);

            case 'tool':
                return this.renderToolPart(part);

            case 'reasoning':
                return this.renderReasoningPart(part);

            case 'file':
                return this.renderFilePart(part);

            case 'snapshot':
                return this.renderSnapshotPart(part);

            case 'patch':
                return this.renderPatchPart(part);

            case 'agent':
                return this.renderAgentPart(part);

            case 'step_start':
                return this.renderStepStartPart(part);

            case 'step_finish':
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
                ${html}
            </div>
        `;
    }

    /**
     * Rend une part d'outil
     */
    renderToolPart(part) {
        const tool = part.tool || {};
        const name = tool.name || 'unknown';
        const args = tool.args || {};
        const result = tool.result;

        return `
            <div class="part part-tool">
                <div class="tool-header">
                    🔧 <strong>${this.escapeHtml(name)}</strong>
                </div>
                <div class="tool-args">
                    <strong>Arguments:</strong>
                    <pre><code class="language-json">${this.escapeHtml(JSON.stringify(args, null, 2))}</code></pre>
                </div>
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
                📸 <strong>Snapshot:</strong> ${this.escapeHtml(part.snapshot || '')}
            </div>
        `;
    }

    /**
     * Rend une part de patch
     */
    renderPatchPart(part) {
        const files = part.files || [];

        return `
            <div class="part part-patch">
                <div>🔄 <strong>Patch appliqué</strong></div>
                <div>Hash: <code>${this.escapeHtml(part.hash || '')}</code></div>
                ${files.length > 0 ? `
                    <div>Fichiers modifiés: ${files.map(f => `<code>${this.escapeHtml(f)}</code>`).join(', ')}</div>
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
