import React from 'react';
import { X, FileText, Target, ClipboardList, Zap, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

interface BriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  loading: boolean;
}

export const BriefingModal: React.FC<BriefingModalProps> = ({
  isOpen,
  onClose,
  summary,
  loading
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-[#111827] rounded-2xl border border-[#374151] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-[#374151] bg-[#0F172A]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Resident Briefing</h2>
                  <p className="text-[#9CA3AF]">Condensed strategic summary from the current interaction stream</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#1F2937] rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-[#9CA3AF]" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
              {loading ? (
                <div className="p-12 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
                  >
                    <Zap className="w-8 h-8 text-white" />
                  </motion.div>
                  <h3 className="text-xl font-semibold text-white mb-2">Synthesizing Briefing</h3>
                  <p className="text-[#9CA3AF]">Court systems are processing the interaction stream...</p>
                </div>
              ) : (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-[#0F172A] border border-[#374151] rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Target className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-semibold text-white">Core Goal</h3>
                      </div>
                      <p className="text-sm text-[#9CA3AF]">Primary objective and intent</p>
                    </div>
                    <div className="bg-[#0F172A] border border-[#374151] rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <ClipboardList className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-semibold text-white">Key Decisions</h3>
                      </div>
                      <p className="text-sm text-[#9CA3AF]">Important choices and outcomes</p>
                    </div>
                    <div className="bg-[#0F172A] border border-[#374151] rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <ArrowRight className="w-5 h-5 text-amber-400" />
                        <h3 className="font-semibold text-white">Next Actions</h3>
                      </div>
                      <p className="text-sm text-[#9CA3AF]">Pending tasks and recommendations</p>
                    </div>
                  </div>

                  <div className="bg-[#0F172A] border border-[#374151] rounded-xl p-6">
                    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-p:text-[#E5E7EB] prose-strong:text-white prose-li:text-[#E5E7EB] prose-code:text-indigo-300 prose-code:bg-[#1F2937] prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                      <ReactMarkdown>{summary}</ReactMarkdown>
                    </div>
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
