'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Discipline, GenerationRequest, GenerationResponse } from '../types';

interface GenerationFormProps {
  discipline: Discipline;
  placeholder?: string;
}

export default function GenerationForm({ discipline, placeholder }: GenerationFormProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError('Please enter a description for your drawing');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const request: GenerationRequest = {
        discipline,
        prompt: prompt.trim()
      };

      const response = await fetch('/api/generate-autocad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data: GenerationResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate drawing');
      }

      setResult(data);
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const defaultPlaceholders = {
    mechanical: 'Describe your mechanical system: pumps, pipes, valves, heat exchangers...',
    electrical: 'Describe your electrical system: panels, circuits, cable trays, grounding...',
    civil: 'Describe your civil project: site layout, grading, utilities, foundations...'
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700">
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Generate Your Drawing
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Describe your {discipline} design
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder || defaultPlaceholders[discipline]}
            className="w-full h-32 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={isLoading}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Generate Drawing</span>
            </>
          )}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-red-600 dark:text-red-400 mt-1">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {result && result.status === 'ok' && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 mb-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Generation Successful!</span>
          </div>
          <p className="text-green-600 dark:text-green-400 mb-3">{result.message}</p>
          
          {result.data && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Estimated Time:</span> {result.data.estimatedTime}</p>
              <p><span className="font-medium">Output Formats:</span> {result.data.outputFormats?.join(', ')}</p>
              <div className="mt-3">
                <p className="font-medium mb-2">Features:</p>
                <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                  <li>• {result.data.features?.layers}</li>
                  <li>• {result.data.features?.blocks}</li>
                  <li>• {result.data.features?.annotations}</li>
                  <li>• {result.data.features?.dimensions}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
