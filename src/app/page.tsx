'use client';

import {useState} from 'react';
import {streamFlow} from '@genkit-ai/next/client';
import {grafanaFlow} from "@/genkit/grafanaFlow";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);
    const [streamedText, setStreamedText] = useState<string>('');

    async function streamAnswer(formData: FormData) {
        const question = formData.get('question')?.toString() ?? '';
        setIsLoading(true);
        setStreamedText('');

        try {
            // Streaming approach
            const result = streamFlow<typeof grafanaFlow>({
                url: '/api/grafana',
                input: {question},
            });

            // Process the stream chunks as they arrive
            for await (const chunk of result.stream) {
                setStreamedText((prev) => prev + chunk);
            }
        } catch (error) {
            console.error('Error streaming answer:', error);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <main
            className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-indigo-950 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">
                        Grafana AI Assistant
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">
                        Ask questions about your Grafana dashboards and get intelligent answers
                    </p>
                </header>

                {/* Question Form */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
                    <form action={streamAnswer} className="space-y-4">
                        <div className="space-y-2">
                            <label
                                htmlFor="question"
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                Ask your question about Grafana:
                            </label>
                            <input
                                type="text"
                                name="question"
                                id="question"
                                placeholder="E.g., How many users are there in the last week?"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                          focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4
                          rounded-lg transition-colors duration-200 ease-in-out disabled:opacity-50
                          disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                                    strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor"
                                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Streaming...
                                    </>
                                ) : "Stream Answer"}
                            </button>
                        </div>
                    </form>
                </div>

                {(streamedText) && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                        {streamedText && (
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-500"
                                         fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                    </svg>
                                    Answer:
                                </h3>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-60">
                                    <pre
                                        className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{streamedText}</pre>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
