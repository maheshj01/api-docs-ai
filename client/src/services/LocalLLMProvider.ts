import Constants from '../utils/Constants';
import { ResponseProvider } from './ResponseProvider';
import { supabase } from './SupabaseClient';

export class LocalLLMProvider implements ResponseProvider {
    private api = process.env.REACT_APP_BACKEND_URL
    private abortController: AbortController | null = null;

    async generateResponse(message: string, dataSource: string): Promise<string> {
        try {
            const url = `${this.api}${Constants.endPoints.query_chat}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: message, index_name: dataSource }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch response from backend.');
            }
            const data = await response.json();
            return data;
        } catch (error) {
            return 'Failed to fetch response from backend.';

        }
    }

    async streamResponse(message: string, agent: string, chatId: string, model_name: string, onData: (chunk: any) => void): Promise<void> {
        this.abortController = new AbortController();

        // Get the session
        let session: any = await supabase.auth.getSession();
        if (!session?.data?.session?.access_token) {
            throw new Error('Failed to authenticate user.');
        }

        let access_token = session.data.session.access_token;

        try {
            let response = await this.streamWithAuth(access_token, message, chatId, agent, model_name);
            if (response.status === 401) {
                const { data, error } = await supabase.auth.refreshSession();
                if (error || !data?.session) {
                    throw new Error('Session refresh failed, please log in again.');
                }

                access_token = data.session.access_token;

                response = await this.streamWithAuth(access_token, message, chatId, agent, model_name);

                if (response.status === 401) {
                    await supabase.auth.signOut();
                    throw new Error('Session expired. Please log in again.');
                }
            }

            if (!response.ok) {
                throw new Error('Failed to fetch streaming response from backend.');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            while (reader) {
                const { done, value } = await reader.read();
                if (done) break;
                const decodedChunk = decoder.decode(value, { stream: true });
                try {
                    const parsedChunk = JSON.parse(decodedChunk);
                    onData(parsedChunk);
                } catch (error) {
                    console.error('Failed to parse chunk:', decodedChunk, error);
                }
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('Streaming aborted.');
            } else {
                console.error(error);
                throw new Error('Failed to fetch streaming response from backend.');
            }
        } finally {
            this.abortController = null;
        }
    }

    private async streamWithAuth(access_token: string, message: string, chatId: string, agent: string, model_name: string = 'llama3.1') {
        const url = `${this.api}${Constants.endPoints.stream_chat}`;
        return await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'authorization': `Bearer ${access_token}`,
            },
            body: JSON.stringify({
                model_name: model_name || 'llama3.1',
                query: message,
                index_name: agent,
                chat_id: chatId
            }),
            signal: this.abortController?.signal,
        });
    }

    async getModels(): Promise<string[]> {
        const url = `${this.api}${Constants.endPoints.query_models}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch models from backend.');
        }
        const data = await response.json();
        return data.models;
    }

    stopStreaming() {
        if (this.abortController) {
            console.log('Aborted...');
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
