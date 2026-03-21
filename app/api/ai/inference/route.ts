import { NextResponse } from 'next/server';
import { routeInference, InferenceRequest } from '@/lib/ai/inference';
import { getIapUser } from '@/lib/iap-auth';

export async function POST(req: Request) {
    try {
        const user = await getIapUser();
        
        // Ensure only authenticated users on the Hub can hit the inference endpoint
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json() as InferenceRequest;
        
        if (!body.model || !body.prompt) {
            return NextResponse.json({ error: 'Missing model or prompt' }, { status: 400 });
        }

        const result = await routeInference(body);
        
        return NextResponse.json({
            success: true,
            text: result.candidates?.[0]?.content?.parts?.[0]?.text || '',
            usage: result.usageMetadata
        });
    } catch (err: any) {
        console.error("Inference Error:", err);
        return NextResponse.json({ error: err.message || 'Inference failed' }, { status: 500 });
    }
}
