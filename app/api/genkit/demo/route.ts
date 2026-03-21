import { demoFlow } from '@/lib/ai/demoFlow';
import { appRoute } from '@genkit-ai/next';

// Expose the Genkit flow as a standard Next.js App Router POST endpoint
export const POST = appRoute(demoFlow);
