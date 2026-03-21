import { LlmAgent } from '@google/adk';

// Setup basic Google ADK agent framework
// This acts as the foundational class for advanced tool-using agents in the Hub

export const createAgent = (name: string, description: string) => {
    return new LlmAgent({
        name,
        description,
        model: 'gemini-2.5-pro',
    });
};
