import { ai } from './genkit';
import { tracer } from '@/lib/otel';

// Define the available canonical models for the Hub
export const AVAILABLE_MODELS = {
    // Ultra fast, cost-effective multimodal inference
    FLASH_2_5: 'googleai/gemini-2.5-flash',
    
    // High-complexity reasoning and coding tasks
    PRO_2_5: 'googleai/gemini-2.5-pro',
    
    // Legacy support where necessary
    FLASH_8B: 'googleai/gemini-1.5-flash-8b',

    // Future-proofing for upcoming 3+ models
    // EXPERIMENTAL_3_0: 'gemini-3.0-pro-experimental'
};

export type HubModelName = keyof typeof AVAILABLE_MODELS;

export interface InferenceRequest {
    model: HubModelName;
    prompt: string | any[];
    systemInstruction?: string;
    temperature?: number;
}

export async function routeInference(request: InferenceRequest) {
    return tracer.startActiveSpan('Genkit:routeInference', async (span) => {
        try {
            const modelIdentifier = AVAILABLE_MODELS[request.model];
            span.setAttribute('ai.model', modelIdentifier);

            const response = await ai.generate({
                model: modelIdentifier,
                prompt: typeof request.prompt === 'string' ? request.prompt : JSON.stringify(request.prompt),
                config: {
                    temperature: request.temperature ?? 0.4,
                },
                system: request.systemInstruction
            });
            
            span.setAttribute('ai.usage.prompt_tokens', response.usage?.inputTokens || 0);
            span.setAttribute('ai.usage.completion_tokens', response.usage?.outputTokens || 0);

            return response;
        } catch (err) {
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    });
}
