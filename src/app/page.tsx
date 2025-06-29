'use client';

import {useState, useEffect} from 'react';
import {streamFlow} from '@genkit-ai/next/client';
import {grafanaFlow} from "@/genkit/grafanaFlow";
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);
    const [streamedText, setStreamedText] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    // Add mount animation effect
    useEffect(() => {
        setMounted(true);
    }, []);

    async function streamAnswer(formData: FormData) {
        const question = formData.get('question')?.toString() ?? '';
        setIsLoading(true);
        setStreamedText(null);

        try {
            // Streaming approach
            const result = streamFlow<typeof grafanaFlow>({
                url: '/api/grafana',
                input: {question},
            });

            // Process the stream chunks as they arrive
            for await (const chunk of result.stream) {
                setStreamedText((prev) => (prev === null ? chunk : prev + chunk));
            }
        } catch (error) {
            console.error('Error streaming answer:', error);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-900 dark:via-indigo-950 dark:to-purple-950 py-8 px-4 overflow-hidden">
            <div className="max-w-4xl mx-auto relative">
                {/* Decorative elements */}
                <motion.div 
                    className="absolute -top-20 -right-20 w-64 h-64 bg-gradient-to-br from-indigo-300 to-blue-400 dark:from-indigo-800 dark:to-blue-900 rounded-full opacity-20 blur-3xl animate-gradient"
                    initial={{ scale: 0 }}
                    animate={{ scale: mounted ? 1 : 0 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <motion.div 
                    className="absolute -bottom-32 -left-20 w-80 h-80 bg-gradient-to-tr from-purple-300 to-pink-400 dark:from-purple-800 dark:to-pink-900 rounded-full opacity-20 blur-3xl animate-gradient"
                    initial={{ scale: 0 }}
                    animate={{ scale: mounted ? 1 : 0 }}
                    transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
                />
                <motion.div 
                    className="absolute top-40 left-0 w-40 h-40 bg-gradient-to-r from-cyan-300 to-teal-400 dark:from-cyan-800 dark:to-teal-900 rounded-full opacity-10 blur-2xl animate-float"
                    initial={{ scale: 0 }}
                    animate={{ scale: mounted ? 1 : 0 }}
                    transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
                />

                {/* Header */}
                <motion.header 
                    className="mb-12 text-center relative z-10"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : -20 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                >
                    <motion.h1 
                        className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 dark:from-indigo-400 dark:via-purple-400 dark:to-indigo-400 mb-3 animate-gradient bg-[length:200%_auto]"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: mounted ? 1 : 0, scale: mounted ? 1 : 0.9 }}
                        transition={{ duration: 0.7, delay: 0.1 }}
                    >
                        Grafana AI Assistant
                    </motion.h1>
                    <motion.p 
                        className="text-gray-600 dark:text-gray-300 text-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: mounted ? 1 : 0 }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                    >
                        Ask questions about your Grafana dashboards and get intelligent answers
                    </motion.p>
                </motion.header>

                {/* Question Form */}
                <motion.div 
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-10 backdrop-blur-sm bg-opacity-90 dark:bg-opacity-80 border border-gray-100 dark:border-gray-700 relative z-10"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
                    transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                    whileHover={{ boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                >
                    <form action={streamAnswer} className="space-y-5">
                        <div className="space-y-3">
                            <motion.label
                                htmlFor="question"
                                className="block text-base font-medium text-gray-700 dark:text-gray-300"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: mounted ? 1 : 0, x: mounted ? 0 : -10 }}
                                transition={{ duration: 0.5, delay: 0.4 }}
                            >
                                Ask your question about Grafana:
                            </motion.label>
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: mounted ? 1 : 0, x: mounted ? 0 : -10 }}
                                transition={{ duration: 0.5, delay: 0.5 }}
                                className="relative"
                            >
                                <input
                                    type="text"
                                    name="question"
                                    id="question"
                                    placeholder="E.g., How many users are there in the last week?"
                                    className="w-full px-5 py-4 rounded-xl border border-gray-300 dark:border-gray-600
                                    focus:ring-3 focus:ring-indigo-500 focus:border-indigo-500 
                                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                    transition-all duration-300 ease-in-out text-base shadow-sm"
                                />
                                <div className="absolute inset-0 rounded-xl pointer-events-none border border-indigo-300 dark:border-indigo-600 opacity-0 focus-within:opacity-100 transition-opacity duration-300"></div>
                            </motion.div>
                        </div>

                        <motion.div 
                            className="flex flex-col sm:flex-row gap-3 pt-2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 10 }}
                            transition={{ duration: 0.5, delay: 0.6 }}
                        >
                            <motion.button
                                type="submit"
                                disabled={isLoading}
                                className={`flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-3 px-6
                                rounded-xl transition-all duration-300 ease-in-out disabled:opacity-50
                                disabled:cursor-not-allowed flex items-center justify-center shadow-md hover:shadow-lg
                                ${!isLoading ? 'animate-pulse-slow' : ''}`}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                                    strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor"
                                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="text-base">Processing your request...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                        </svg>
                                        <span className="text-base">Get Answer</span>
                                    </>
                                )}
                            </motion.button>
                        </motion.div>
                    </form>
                </motion.div>

                {/* Answer Section with AnimatePresence for smooth transitions */}
                <AnimatePresence>
                    {streamedText && (
                        <motion.div 
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 backdrop-blur-sm bg-opacity-90 dark:bg-opacity-80 border border-gray-100 dark:border-gray-700 relative z-10"
                            initial={{ opacity: 0, y: 20, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: 20, height: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        >
                            <div className="mb-6">
                                <motion.h3 
                                    className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ duration: 0.5, type: "spring" }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-indigo-500"
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                        </svg>
                                    </motion.div>
                                    Answer:
                                </motion.h3>
                                <motion.div 
                                    className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 overflow-auto max-h-[400px] shadow-inner border border-gray-100 dark:border-gray-700"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.5, delay: 0.2 }}
                                >
                                    <motion.div 
                                        className="text-base text-gray-700 dark:text-gray-300 prose dark:prose-invert max-w-none"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.5, delay: 0.3 }}
                                    >
                                        <ReactMarkdown>
                                            {streamedText || ''}
                                        </ReactMarkdown>
                                    </motion.div>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer */}
                <motion.footer
                    className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: mounted ? 1 : 0 }}
                    transition={{ duration: 0.7, delay: 0.7 }}
                >
                    <p>Powered by Grafana AI and Next.js</p>
                </motion.footer>
            </div>
        </main>
    );
}
