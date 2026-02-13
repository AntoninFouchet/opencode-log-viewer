/**
 * Client API pour communiquer avec le serveur OpenCode
 */
export class OpencodeClient {
    constructor(baseURL = 'http://localhost:3000') {
        this.baseURL = baseURL;
        this.eventSource = null;
    }

    /**
     * Effectue une requête HTTP vers l'API
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error(`Erreur requête ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Teste la connexion au serveur
     */
    async ping() {
        try {
            await this.request('/session');
            return true;
        } catch (error) {
            return false;
        }
    }

    // ========== Sessions ==========

    /**
     * Récupère la liste de toutes les sessions
     */
    async getSessions() {
        return this.request('/session');
    }

    /**
     * Récupère les détails d'une session
     */
    async getSession(sessionId) {
        return this.request(`/session/${sessionId}`);
    }

    /**
     * Récupère les messages d'une session
     */
    async getSessionMessages(sessionId) {
        return this.request(`/session/${sessionId}/message`);
    }

    /**
     * Récupère le statut de toutes les sessions
     */
    async getSessionsStatus() {
        return this.request('/session/status');
    }

    // ========== Events (Server-Sent Events) ==========

    /**
     * S'abonne aux événements globaux
     */
    subscribeToEvents(callback) {
        const eventSource = new EventSource(`${this.baseURL}/event`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                callback(data);
            } catch (error) {
                console.error('Erreur parsing event:', error);
            }
        };

        eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            eventSource.close();
        };

        return () => eventSource.close();
    }

    /**
     * S'abonne aux événements d'une session spécifique
     */
    subscribeToSession(sessionId, callback) {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(`${this.baseURL}/event`);

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                callback(data);
            } catch (error) {
                console.error('Erreur parsing session event:', error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('Session SSE Error:', error);
        };

        return () => {
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
        };
    }

    /**
     * Ferme toutes les connexions SSE
     */
    closeEventSource() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}
