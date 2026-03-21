import { VertexAI } from '@google-cloud/vertexai';
import { tracer } from '@/lib/otel';

// Initialize Vertex with the Hub's central project and region
const vertex_ai = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT || 'hlbw-ai-hub',
    location: process.env.GOOGLE_CLOUD_REGION || 'asia-southeast1'
});

// Define the available canonical models for the Hub
export const AVAILABLE_MODELS = {
    // Ultra fast, cost-effective multimodal inference
    FLASH_2_5: 'gemini-2.5-flash',
    
    // High-complexity reasoning and coding tasks
    PRO_2_5: 'gemini-2.5-pro',
    
    // Legacy support where necessary
    FLASH_8B: 'gemini-1.5-flash-8b',

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
    return tracer.startActiveSpan('VertexAI:routeInference', async (span) => {
        try {
            const modelIdentifier = AVAILABLE_MODELS[request.model];
            span.setAttribute('ai.model', modelIdentifier);

            const model = vertex_ai.preview.getGenerativeModel({
                model: modelIdentifier,
                generationConfig: {
                    temperature: request.temperature ?? 0.4,
                },
                systemInstruction: request.systemInstruction ? {
                    role: 'system',
                    parts: [{ text: request.systemInstruction }]
                } : undefined
            });

            // If prompt is string, wrap in parts, otherwise pass array directly
            const contents = [
                {
                    role: 'user',
                    parts: typeof request.prompt === 'string' 
                        ? [{ text: request.prompt }] 
                        : request.prompt
                }
            ];

            const responseStream = await model.generateContentStream({ contents });
            
            // For simple central routing, we'll await the full response, 
            // but the stream is available for more complex handlers
            const response = await responseStream.response;
            
            span.setAttribute('ai.usage.prompt_tokens', response.usageMetadata?.promptTokenCount || 0);
            span.setAttribute('ai.usage.completion_tokens', response.usageMetadata?.candidatesTokenCount || 0);

            return response;
        } catch (err) {
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    });
}
