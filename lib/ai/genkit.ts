import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/google-genai';

// Initialize Genkit for hlbw-ai-hub
export const ai = genkit({
    // Configure default plugins
    plugins: [
        vertexAI({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || 'hlbw-ai-hub',
            location: process.env.GOOGLE_CLOUD_REGION || 'asia-southeast1',
        })
    ]
});
