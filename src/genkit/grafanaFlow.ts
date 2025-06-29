import { googleAI } from '@genkit-ai/googleai';
import { genkit, z } from 'genkit';

const ai = genkit({
    plugins: [googleAI()],
});

export const grafanaFlow = ai.defineFlow(
    {
        name: 'grafanaFlow',
        inputSchema: z.object({ question: z.string() }),
        outputSchema: z.object({ answer: z.string() }),
        streamSchema: z.string(),
    },
    async ({ question }, { sendChunk }) => {
        const { stream, response } = ai.generateStream({
            model: googleAI.model('gemini-2.5-flash'),
            prompt: `${question}`,
        });

        for await (const chunk of stream) {
            sendChunk(chunk.text);
        }

        const { text } = await response;
        return { answer: text };
    }
);