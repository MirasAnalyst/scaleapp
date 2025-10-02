'use client';

import { useState } from 'react';
import { 
  Download, 
  Edit3, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Settings,
  Wand2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Discipline } from '../types';

interface DiagramPreviewProps {
  discipline: Discipline;
  initialPrompt?: string;
  generatedDiagram?: any;
}

// Sample SVG diagrams for each discipline
const sampleDiagrams = {
  mechanical: (
    <svg viewBox="0 0 800 400" className="w-full h-full">
      {/* Background */}
      <rect width="800" height="400" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2"/>
      
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" className="text-lg font-bold fill-gray-800">
        Pump-to-Heat-Exchanger Loop
      </text>
      
      {/* Pump P-101 */}
      <g transform="translate(100, 200)">
        <circle cx="0" cy="0" r="25" fill="#3b82f6" stroke="#1e40af" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs font-semibold fill-white">P-101</text>
        <text x="0" y="50" textAnchor="middle" className="text-xs fill-gray-600">Centrifugal Pump</text>
      </g>
      
      {/* Heat Exchanger E-201 */}
      <g transform="translate(500, 200)">
        <rect x="-40" y="-20" width="80" height="40" fill="#10b981" stroke="#059669" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs font-semibold fill-white">E-201</text>
        <text x="0" y="50" textAnchor="middle" className="text-xs fill-gray-600">Shell & Tube HX</text>
      </g>
      
      {/* Piping */}
      <path d="M 125 200 L 460 200" stroke="#6b7280" strokeWidth="4" fill="none" markerEnd="url(#arrowhead)"/>
      <path d="M 540 200 L 700 200" stroke="#6b7280" strokeWidth="4" fill="none" markerEnd="url(#arrowhead)"/>
      
      {/* Valves */}
      <g transform="translate(200, 200)">
        <rect x="-8" y="-15" width="16" height="30" fill="#ef4444" stroke="#dc2626" strokeWidth="2"/>
        <text x="0" y="40" textAnchor="middle" className="text-xs fill-gray-600">Gate Valve</text>
      </g>
      
      <g transform="translate(350, 200)">
        <rect x="-8" y="-15" width="16" height="30" fill="#ef4444" stroke="#dc2626" strokeWidth="2"/>
        <text x="0" y="40" textAnchor="middle" className="text-xs fill-gray-600">Gate Valve</text>
      </g>
      
      <g transform="translate(600, 200)">
        <polygon points="0,-15 15,0 0,15 -15,0" fill="#f59e0b" stroke="#d97706" strokeWidth="2"/>
        <text x="0" y="40" textAnchor="middle" className="text-xs fill-gray-600">Check Valve</text>
      </g>
      
      {/* Flow arrows */}
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280"/>
        </marker>
      </defs>
      
      {/* Dimensions */}
      <text x="300" y="180" textAnchor="middle" className="text-xs fill-gray-500">4" Carbon Steel Pipe</text>
    </svg>
  ),
  
  electrical: (
    <svg viewBox="0 0 800 400" className="w-full h-full">
      {/* Background */}
      <rect width="800" height="400" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2"/>
      
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" className="text-lg font-bold fill-gray-800">
        Single-Line Diagram - 480V System
      </text>
      
      {/* Utility Feed */}
      <g transform="translate(100, 200)">
        <rect x="-30" y="-20" width="60" height="40" fill="#f59e0b" stroke="#d97706" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs font-semibold fill-white">UTILITY</text>
        <text x="0" y="50" textAnchor="middle" className="text-xs fill-gray-600">480V 3-Phase</text>
      </g>
      
      {/* Main Switchboard */}
      <g transform="translate(300, 200)">
        <rect x="-40" y="-30" width="80" height="60" fill="#3b82f6" stroke="#1e40af" strokeWidth="2"/>
        <text x="0" y="-5" textAnchor="middle" className="text-xs font-semibold fill-white">MSB-1</text>
        <text x="0" y="10" textAnchor="middle" className="text-xs font-semibold fill-white">480V</text>
        <text x="0" y="50" textAnchor="middle" className="text-xs fill-gray-600">Main Switchboard</text>
      </g>
      
      {/* MCCs */}
      <g transform="translate(500, 150)">
        <rect x="-30" y="-20" width="60" height="40" fill="#10b981" stroke="#059669" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs font-semibold fill-white">MCC-1</text>
        <text x="0" y="50" textAnchor="middle" className="text-xs fill-gray-600">Motor Control</text>
      </g>
      
      <g transform="translate(500, 250)">
        <rect x="-30" y="-20" width="60" height="40" fill="#10b981" stroke="#059669" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs font-semibold fill-white">MCC-2</text>
        <text x="0" y="50" textAnchor="middle" className="text-xs fill-gray-600">Motor Control</text>
      </g>
      
      {/* Power Lines */}
      <path d="M 130 200 L 260 200" stroke="#f59e0b" strokeWidth="6" fill="none"/>
      <path d="M 340 200 L 470 150" stroke="#3b82f6" strokeWidth="4" fill="none"/>
      <path d="M 340 200 L 470 250" stroke="#3b82f6" strokeWidth="4" fill="none"/>
      
      {/* Protective Devices */}
      <g transform="translate(200, 200)">
        <circle cx="0" cy="0" r="8" fill="#ef4444" stroke="#dc2626" strokeWidth="2"/>
        <text x="0" y="30" textAnchor="middle" className="text-xs fill-gray-600">CB-1</text>
      </g>
      
      {/* Metering */}
      <g transform="translate(250, 200)">
        <rect x="-15" y="-10" width="30" height="20" fill="#8b5cf6" stroke="#7c3aed" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs font-semibold fill-white">MTR</text>
        <text x="0" y="30" textAnchor="middle" className="text-xs fill-gray-600">Metering</text>
      </g>
    </svg>
  ),
  
  civil: (
    <svg viewBox="0 0 800 400" className="w-full h-full">
      {/* Background */}
      <rect width="800" height="400" fill="#f0fdf4" stroke="#e2e8f0" strokeWidth="2"/>
      
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" className="text-lg font-bold fill-gray-800">
        Site Plan - Building Layout
      </text>
      
      {/* Building Footprint */}
      <g transform="translate(400, 200)">
        <rect x="-80" y="-60" width="160" height="120" fill="#3b82f6" stroke="#1e40af" strokeWidth="2"/>
        <text x="0" y="5" textAnchor="middle" className="text-sm font-semibold fill-white">Main Building</text>
        <text x="0" y="20" textAnchor="middle" className="text-xs fill-white">50m × 30m</text>
      </g>
      
      {/* Parking Areas */}
      <g transform="translate(200, 300)">
        <rect x="-60" y="-20" width="120" height="40" fill="#6b7280" stroke="#4b5563" strokeWidth="1"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs fill-white">Parking A</text>
      </g>
      
      <g transform="translate(600, 300)">
        <rect x="-60" y="-20" width="120" height="40" fill="#6b7280" stroke="#4b5563" strokeWidth="1"/>
        <text x="0" y="5" textAnchor="middle" className="text-xs fill-white">Parking B</text>
      </g>
      
      {/* Sidewalks */}
      <path d="M 320 200 L 200 200 L 200 280" stroke="#f59e0b" strokeWidth="8" fill="none"/>
      <path d="M 480 200 L 600 200 L 600 280" stroke="#f59e0b" strokeWidth="8" fill="none"/>
      <path d="M 400 140 L 400 80" stroke="#f59e0b" strokeWidth="8" fill="none"/>
      
      {/* Utility Connections */}
      <g transform="translate(400, 80)">
        <circle cx="0" cy="0" r="8" fill="#10b981" stroke="#059669" strokeWidth="2"/>
        <text x="0" y="25" textAnchor="middle" className="text-xs fill-gray-600">Water</text>
      </g>
      
      <g transform="translate(350, 80)">
        <circle cx="0" cy="0" r="8" fill="#ef4444" stroke="#dc2626" strokeWidth="2"/>
        <text x="0" y="25" textAnchor="middle" className="text-xs fill-gray-600">Sewer</text>
      </g>
      
      <g transform="translate(450, 80)">
        <circle cx="0" cy="0" r="8" fill="#f59e0b" stroke="#d97706" strokeWidth="2"/>
        <text x="0" y="25" textAnchor="middle" className="text-xs fill-gray-600">Electrical</text>
      </g>
      
      {/* Utility Lines */}
      <path d="M 400 88 L 400 140" stroke="#10b981" strokeWidth="3" fill="none" strokeDasharray="5,5"/>
      <path d="M 350 88 L 350 140" stroke="#ef4444" strokeWidth="3" fill="none" strokeDasharray="5,5"/>
      <path d="M 450 88 L 450 140" stroke="#f59e0b" strokeWidth="3" fill="none" strokeDasharray="5,5"/>
      
      {/* Contour Lines */}
      <path d="M 100 100 Q 200 80 300 100 Q 400 120 500 100 Q 600 80 700 100" 
            stroke="#8b5cf6" strokeWidth="2" fill="none" strokeDasharray="3,3"/>
      <text x="400" y="95" textAnchor="middle" className="text-xs fill-purple-600">Elevation 100m</text>
      
      {/* Scale */}
      <g transform="translate(50, 350)">
        <line x1="0" y1="0" x2="100" y2="0" stroke="#000" strokeWidth="2"/>
        <text x="50" y="-5" textAnchor="middle" className="text-xs fill-gray-600">100m</text>
      </g>
    </svg>
  )
};

const modificationSuggestions = {
  mechanical: [
    "Add pressure relief valve after pump",
    "Include flow control valve for temperature regulation",
    "Add strainer before heat exchanger",
    "Include bypass line for maintenance"
  ],
  electrical: [
    "Add emergency generator backup",
    "Include power factor correction",
    "Add surge protection devices",
    "Include load balancing between MCCs"
  ],
  civil: [
    "Add stormwater detention pond",
    "Include landscaping buffer zones",
    "Add fire access road",
    "Include utility easements"
  ]
};

export default function DiagramPreview({ discipline, initialPrompt, generatedDiagram }: DiagramPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [modificationPrompt, setModificationPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleModify = async () => {
    if (!modificationPrompt.trim()) return;
    
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/modify-diagram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discipline,
          originalPrompt: initialPrompt || '',
          modificationPrompt: modificationPrompt.trim()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to modify diagram');
      }

      // In a real implementation, you would update the diagram display here
      console.log('Diagram modified:', data);
      
      // Show success message
      alert('Diagram successfully modified! Check the console for details.');
      
    } catch (error) {
      console.error('Modification error:', error);
      alert('Failed to modify diagram. Please try again.');
    } finally {
      setIsGenerating(false);
      setIsEditing(false);
      setModificationPrompt('');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setModificationPrompt(suggestion);
    setIsEditing(true);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(3, prev + 0.2));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.3, prev - 0.2));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.3, Math.min(3, prev + delta)));
  };

  const handleExportDXF = async () => {
    if (!generatedDiagram) {
      alert('No diagram to export. Please generate a diagram first.');
      return;
    }

    setIsExporting(true);
    
    try {
      const response = await fetch('/api/export-dxf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ diagram: generatedDiagram }),
      });

      if (!response.ok) {
        throw new Error('Failed to export DXF file');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `${discipline}_diagram_${Date.now()}.dxf`;

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export DXF file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDWG = async () => {
    if (!generatedDiagram) {
      alert('No diagram to export. Please generate a diagram first.');
      return;
    }

    setIsExporting(true);
    
    try {
      const response = await fetch('/api/export-dwg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ diagram: generatedDiagram }),
      });

      if (!response.ok) {
        throw new Error('Failed to export DWG file');
      }

      const data = await response.json();

      if (data.status === 'success') {
        // Download the DXF file
        const dxfBuffer = Buffer.from(data.data.dxfFile.buffer, 'base64');
        const blob = new Blob([dxfBuffer], { type: data.data.dxfFile.mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.data.dxfFile.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Show conversion instructions
        const instructions = data.data.instructions;
        const conversionMethods = data.data.conversionMethods;
        
        // Create a modal or alert with instructions
        const instructionText = `
${instructions}

QUICK CONVERSION METHODS:
${conversionMethods.map((method: any, index: number) => 
  `${index + 1}. ${method.name}:\n   ${method.steps.map((step: string) => `   • ${step}`).join('\n')}`
).join('\n\n')}

${data.data.note}
        `.trim();

        alert(instructionText);
      }

    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export DWG file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold">AI-Generated Diagram</h3>
            <p className="text-blue-100 mt-1">Preview and modify your {discipline} design</p>
            <p className="text-blue-200 text-xs mt-1">Use mouse wheel to zoom, or click fullscreen for detailed view</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleZoomOut}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            
            {/* Zoom Slider */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-white/80">30%</span>
              <input
                type="range"
                min="0.3"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-20 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((zoom - 0.3) / (3 - 0.3)) * 100}%, rgba(255,255,255,0.2) ${((zoom - 0.3) / (3 - 0.3)) * 100}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
              <span className="text-xs text-white/80">300%</span>
            </div>
            
            <button
              onClick={handleZoomIn}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            
            <button
              onClick={handleZoomReset}
              className="px-3 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors text-sm font-medium"
              aria-label="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            
            <button
              onClick={handleFullscreen}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              aria-label="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Diagram Display */}
      <div className={`p-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-800' : ''}`}>
        <div className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-4 overflow-auto ${isFullscreen ? 'h-full' : ''}`}>
          <div 
            className="inline-block cursor-move"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            onWheel={handleWheelZoom}
          >
            {generatedDiagram ? (
              <div dangerouslySetInnerHTML={{ __html: generatedDiagram.svg }} />
            ) : (
              sampleDiagrams[discipline]
            )}
          </div>
        </div>
        
        {/* Fullscreen overlay controls */}
        {isFullscreen && (
          <div className="absolute top-4 right-4 flex items-center space-x-2">
            <button
              onClick={handleZoomOut}
              className="p-2 bg-black/20 rounded-lg hover:bg-black/30 transition-colors text-white"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomReset}
              className="px-3 py-2 bg-black/20 rounded-lg hover:bg-black/30 transition-colors text-white text-sm font-medium"
              aria-label="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-2 bg-black/20 rounded-lg hover:bg-black/30 transition-colors text-white"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleFullscreen}
              className="p-2 bg-black/20 rounded-lg hover:bg-black/30 transition-colors text-white"
              aria-label="Exit fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Action Buttons */}
        {!isFullscreen && (
          <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            <span>{isEditing ? 'Cancel Edit' : 'Modify Diagram'}</span>
          </button>
          
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            <span>AI Suggestions</span>
          </button>
          
          <button 
            onClick={handleExportDWG}
            disabled={isExporting || !generatedDiagram}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Export DWG</span>
              </>
            )}
          </button>
          
          <button 
            onClick={handleExportDXF}
            disabled={isExporting || !generatedDiagram}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export DXF</span>
          </button>
          
          <button className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>
        </div>
        )}

        {/* Modification Interface */}
        {isEditing && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
              Modify Your Diagram
            </h4>
            <textarea
              value={modificationPrompt}
              onChange={(e) => setModificationPrompt(e.target.value)}
              placeholder={`Describe how you want to modify your ${discipline} diagram...`}
              className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={handleModify}
                disabled={isGenerating || !modificationPrompt.trim()}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>Apply Changes</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* AI Suggestions */}
        {showSuggestions && (
          <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
              AI Improvement Suggestions
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modificationSuggestions[discipline].map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-left p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                >
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{suggestion}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status Messages */}
        {isGenerating && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">AI is analyzing your modifications and updating the diagram...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
