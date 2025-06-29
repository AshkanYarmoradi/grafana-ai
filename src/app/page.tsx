'use client';

import { useState } from 'react';
import { runFlow, streamFlow } from '@genkit-ai/next/client';
import {grafanaFlow} from "@/genkit/grafanaFlow";

export default function Home() {
  const [answer, setAnswer] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamedText, setStreamedText] = useState<string>('');

  async function getAnswer(formData: FormData) {
    const question = formData.get('question')?.toString() ?? '';
    setIsLoading(true);

    try {
      const result = await runFlow<typeof grafanaFlow>({
        url: '/api/grafana',
        input: { question },
      });

      setAnswer(result.answer);
    } catch (error) {
      console.error('Error generating answer:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function streamAnswer(formData: FormData) {
    const question = formData.get('question')?.toString() ?? '';
    setIsLoading(true);
    setStreamedText('');

    try {
      // Streaming approach
      const result = streamFlow<typeof grafanaFlow>({
        url: '/api/grafana',
        input: { question },
      });

      // Process the stream chunks as they arrive
      for await (const chunk of result.stream) {
        setStreamedText((prev) => prev + chunk);
      }

      // Get the final complete response
      const finalOutput = await result.output;
      setAnswer(finalOutput.answer);
    } catch (error) {
      console.error('Error streaming answer:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
      <main>
        <form action={getAnswer}>
          <label htmlFor="question">Ask your question From Grafana: </label>
          <input type="text" name="question" id="question" />
          <br />
          <br />
          <button type="submit" disabled={isLoading}>
            Generate
          </button>
          <button
              type="button"
              disabled={isLoading}
              onClick={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget.form!);
                await streamAnswer(formData);
              }}
          >
            Stream Generation
          </button>
        </form>
        <br />

        {streamedText && (
            <div>
              <h3>Streaming Output:</h3>
              <pre>{streamedText}</pre>
            </div>
        )}

        {answer && (
            <div>
              <h3>Final Output:</h3>
              <pre>{answer}</pre>
            </div>
        )}
      </main>
  );
}