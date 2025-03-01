import { LLM_Model } from "../utils/Constants";

export enum LLM_Provider {
    local_llm,
    openai,
    gemini
}

export interface ResponseProvider {
    generateResponse(message: string, dataSource: string): Promise<any>;
    streamResponse(message: string, agent: string, chatId: string, model_name: string, onData: (chunk: any) => void,):
        Promise<void>;
    getModels(): Promise<LLM_Model[]>;
}