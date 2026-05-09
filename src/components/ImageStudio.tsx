import React, { useState, useRef } from 'react';
import { X, Upload, Wand2, Download, RefreshCw, Send, Loader2, Sparkles, Image as ImageIcon, Check, Copy, Eye, Search, FileText, Zap } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';

interface ImageStudioProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToThread: (content: string) => void;
}

export const ImageStudio: React.FC<ImageStudioProps> = ({ isOpen, onClose, onSaveToThread }) => {
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'analyze'>('generate');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage(e.target?.result as string);
      setAnalysisResult('');
    };
    reader.readAsDataURL(file);
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not found');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/png' },
      });
      const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (base64ImageBytes) {
        setGeneratedImage(`data:image/png;base64,${base64ImageBytes}`);
      }
    } catch (error) {
      console.error('Image generation failed:', error);
      alert('Image generation failed. Please check your API key and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const analyzeImage = async () => {
    if (!uploadedImage) return;
    setIsAnalyzing(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not found');
      const ai = new GoogleGenAI({ apiKey });
      const base64Data = uploadedImage.split(',')[1];
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { text: 'Analyze this image in detail. Describe what you see, identify key elements, and provide insights about composition, style, and potential use cases.' },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ]
        }]
      });
      setAnalysisResult(response.text || 'No analysis generated.');
    } catch (error) {
      console.error('Image analysis failed:', error);
      alert('Image analysis failed. Please check your API key and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = 'anchorcourt-generated-image.png';
    link.click();
  };

  const saveAnalysisToThread = () => {
    if (analysisResult) {
      onSaveToThread(`## Image Analysis Report\n\n${analysisResult}`);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-[#111827] rounded-2xl border border-[#374151] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-[#374151] bg-[#0F172A]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Image Studio</h2>
                  <p className="text-[#9CA3AF]">Generate, analyze, and process visual content</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-[#1F2937] rounded-lg transition-colors">
                <X className="w-6 h-6 text-[#9CA3AF]" />
              </button>
            </div>

            <div className="flex border-b border-[#374151] bg-[#0B1220]">
              <button
                onClick={() => setActiveTab('generate')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'generate'
                    ? 'bg-[#111827] text-white border-b-2 border-purple-500'
                    : 'text-[#9CA3AF] hover:text-white hover:bg-[#111827]/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Generate Images
                </div>
              </button>
              <button
                onClick={() => setActiveTab('analyze')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'analyze'
                    ? 'bg-[#111827] text-white border-b-2 border-purple-500'
                    : 'text-[#9CA3AF] hover:text-white hover:bg-[#111827]/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Search className="w-4 h-4" />
                  Analyze Images
                </div>
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
              {activeTab === 'generate' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-3">Image Prompt</label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the image you want to generate..."
                        className="w-full h-40 px-4 py-3 bg-[#0F172A] border border-[#374151] rounded-xl text-white placeholder-[#6B7280] resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={generateImage}
                      disabled={isGenerating || !prompt.trim()}
                      className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-pink-700 transition-all"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5" />
                          Generate Image
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-[#0F172A] border border-[#374151] rounded-xl p-6 min-h-[400px] flex items-center justify-center">
                    {generatedImage ? (
                      <div className="w-full space-y-4">
                        <img src={generatedImage} alt="Generated" className="w-full rounded-lg shadow-lg" />
                        <div className="flex gap-3">
                          <button onClick={downloadImage} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                            <Download className="w-4 h-4" />
                            Download
                          </button>
                          <button onClick={() => setGeneratedImage(null)} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#374151] text-white rounded-lg hover:bg-[#4B5563] transition-colors">
                            <RefreshCw className="w-4 h-4" />
                            New Image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <ImageIcon className="w-16 h-16 text-[#4B5563] mx-auto mb-4" />
                        <p className="text-[#9CA3AF]">Generated image will appear here</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'analyze' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div
                      className="border-2 border-dashed border-[#374151] rounded-xl p-8 text-center hover:border-purple-500 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadedImage ? (
                        <img src={uploadedImage} alt="Uploaded" className="max-w-full max-h-64 mx-auto rounded-lg shadow-lg" />
                      ) : (
                        <>
                          <Upload className="w-16 h-16 text-[#4B5563] mx-auto mb-4" />
                          <p className="text-white font-medium mb-2">Upload an image to analyze</p>
                          <p className="text-[#9CA3AF] text-sm">Click here or drag and drop</p>
                        </>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    {uploadedImage && (
                      <button
                        onClick={analyzeImage}
                        disabled={isAnalyzing}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium disabled:opacity-50 hover:from-indigo-700 hover:to-purple-700 transition-all"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Eye className="w-5 h-5" />
                            Analyze Image
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="bg-[#0F172A] border border-[#374151] rounded-xl p-6 min-h-[400px]">
                    {analysisResult ? (
                      <div className="space-y-4">
                        <div className="prose prose-invert prose-sm max-w-none">
                          <pre className="whitespace-pre-wrap text-[#E5E7EB] font-sans leading-relaxed">{analysisResult}</pre>
                        </div>
                        <div className="flex gap-3 pt-4 border-t border-[#374151]">
                          <button onClick={() => copyToClipboard(analysisResult)} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#374151] text-white rounded-lg hover:bg-[#4B5563] transition-colors">
                            <Copy className="w-4 h-4" />
                            Copy
                          </button>
                          <button onClick={saveAnalysisToThread} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                            <Send className="w-4 h-4" />
                            Save to Thread
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center h-full flex items-center justify-center">
                        <div>
                          <FileText className="w-16 h-16 text-[#4B5563] mx-auto mb-4" />
                          <p className="text-[#9CA3AF]">Image analysis results will appear here</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
