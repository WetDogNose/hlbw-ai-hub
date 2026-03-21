import { z } from 'genkit';
import { ai } from './genkit';

export const demoFlow = ai.defineFlow({
  name: 'demoFlow',
  inputSchema: z.object({
    theme: z.string(),
  }),
  outputSchema: z.object({
    idea: z.string(),
  }),
  streamSchema: z.string(),
}, async ({ theme }, { sendChunk }) => {
  const { stream, response } = ai.generateStream({
    model: 'gemini-2.5-flash',
    prompt: `Invent a short, one sentence AI agent product idea for a ${theme} themed company.`,
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      sendChunk(chunk.text);
    }
  }
  
  const { text } = await response;
  return { idea: text };
});
