import React, { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2, Image as ImageIcon, FileType } from 'lucide-react';
import { motion } from 'motion/react';
import mammoth from 'mammoth';
import JSZip from 'jszip';

interface FileUploadProps {
  onUpload: (content: { mimeType: string; data: string }[] | string, fileName: string, isText?: boolean, questionCount?: number, quizType?: 'OBJECTIVE' | 'THEORY') => void;
  isGenerating: boolean;
  generatingConfig?: { count: number; type: 'OBJECTIVE' | 'THEORY' };
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, isGenerating, generatingConfig }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [questionCount, setQuestionCount] = useState(25);
  const [quizType, setQuizType] = useState<'OBJECTIVE' | 'THEORY'>('OBJECTIVE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayCount = generatingConfig?.count || questionCount;
  const displayType = generatingConfig?.type || quizType;

  const [progress, setProgress] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState(0);

  React.useEffect(() => {
    if (isGenerating) {
      // Estimate time: 5s base + 1.5s per objective or 3s per theory
      const baseTime = 5;
      const timePerQ = displayType === 'OBJECTIVE' ? 1.5 : 3;
      const totalSeconds = baseTime + (displayCount * timePerQ);
      
      setEstimatedTimeLeft(Math.ceil(totalSeconds));
      setProgress(0);

      const startTime = Date.now();
      const endTime = startTime + totalSeconds * 1000;

      const interval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, (endTime - now) / 1000);
        setEstimatedTimeLeft(Math.ceil(remaining));
        
        const elapsed = now - startTime;
        const currentProgress = Math.min(99, (elapsed / (totalSeconds * 1000)) * 100);
        setProgress(currentProgress);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [isGenerating, displayCount, displayType]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 25 * 1024 * 1024) {
        alert("File size exceeds 25MB limit. Please upload a smaller file.");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.size > 25 * 1024 * 1024) {
        alert("File size exceeds 25MB limit. Please upload a smaller file.");
        return;
      }
      setFile(droppedFile);
    }
  };

  const extractTextFromPPTX = async (file: File): Promise<string> => {
    const zip = await JSZip.loadAsync(file);
    let fullText = "";
    const slideFiles = Object.keys(zip.files).filter(name => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"));
    
    // Sort slides numerically
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)![0]);
      const numB = parseInt(b.match(/\d+/)![0]);
      return numA - numB;
    });

    for (const slideFile of slideFiles) {
      const content = await zip.file(slideFile)?.async("text");
      if (content) {
        // Simple regex to extract text from PPTX XML
        const matches = content.match(/<a:t>([^<]+)<\/a:t>/g);
        if (matches) {
          const slideText = matches.map(m => m.replace(/<a:t>|<\/a:t>/g, "")).join(" ");
          fullText += `Slide ${slideFile.match(/\d+/)![0]}: ${slideText}\n\n`;
        }
      }
    }
    return fullText;
  };

  const handleUpload = async () => {
    if (!file) return;

    const fileName = file.name;
    const extension = fileName.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        onUpload(result.value, fileName, true, questionCount, quizType);
      } else if (extension === 'pptx') {
        const text = await extractTextFromPPTX(file);
        onUpload(text, fileName, true, questionCount, quizType);
      } else if (extension === 'pdf') {
        // Gemini natively supports PDF, so we send it directly instead of slow local parsing
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onUpload([{ mimeType: 'application/pdf', data: base64 }], fileName, false, questionCount, quizType);
        };
        reader.readAsDataURL(file);
      } else if (['jpg', 'jpeg', 'png', 'webp'].includes(extension || '')) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onUpload([{ mimeType: file.type, data: base64 }], fileName, false, questionCount, quizType);
        };
        reader.readAsDataURL(file);
      } else if (['txt', 'csv', 'md', 'json'].includes(extension || '')) {
        const text = await file.text();
        onUpload(text, fileName, true, questionCount, quizType);
      } else {
        // Fallback for other files
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onUpload([{ mimeType: file.type || 'application/octet-stream', data: base64 }], fileName, false, questionCount, quizType);
        };
        reader.readAsDataURL(file);
      }
    } catch (error: any) {
      console.error("Error processing file:", error);
      let msg = "Failed to process file. Please try converting it to PDF.";
      if (error.message?.includes('password')) {
        msg = "This file is password protected. Please remove the password and try again.";
      } else if (error.message?.includes('corrupt')) {
        msg = "The file appears to be corrupted. Please check the file and try again.";
      }
      alert(msg);
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-10 h-10 text-white/20" />;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return <ImageIcon className="w-8 h-8 text-quizard-accent" />;
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-quizard-accent" />;
    if (ext === 'docx' || ext === 'pptx') return <FileType className="w-8 h-8 text-quizard-accent" />;
    return <FileText className="w-8 h-8 text-white/40" />;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        id="drop-zone"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-4 border-dashed rounded-[3rem] p-16 transition-all duration-500 flex flex-col items-center justify-center text-center overflow-hidden ${
          isDragging ? 'border-quizard-accent bg-quizard-accent/5 shadow-[0_0_50px_rgba(0,229,255,0.2)] scale-[1.02]' : 'border-white/5 bg-quizard-card hover:border-white/10 shadow-2xl'
        }`}
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-quizard-accent/10 to-transparent" />
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp"
          className="hidden"
        />

        {!file ? (
          <>
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-8 border border-white/5 shadow-inner"
            >
              <Upload className="w-12 h-12 text-quizard-accent" />
            </motion.div>
            <h3 className="text-3xl font-black text-white mb-4 tracking-tighter">Upload Clinical Material</h3>
            <p className="text-white/40 mb-10 max-w-sm text-sm leading-relaxed font-medium">
              Support for PDF, Slides (PPTX), Word (DOCX), and Scanned Images. (Max 25MB)
              <br/><span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mt-4 block">For Google Docs, please download as PDF first.</span>
            </p>
            <button
              id="select-file-btn"
              onClick={() => fileInputRef.current?.click()}
              className="px-10 py-4 bg-quizard-accent text-quizard-bg rounded-[1.5rem] font-black hover:scale-110 active:scale-95 transition-all shadow-[0_0_30px_rgba(0,229,255,0.3)] uppercase tracking-widest text-xs"
            >
              Select Dataset
            </button>
          </>
        ) : (
          <div className="w-full">
            <div className="flex items-center justify-between p-6 bg-white/5 rounded-[2rem] mb-10 border border-white/5 shadow-inner">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-quizard-accent/10 rounded-2xl flex items-center justify-center border border-quizard-accent/20">
                  {getFileIcon()}
                </div>
                <div className="text-left">
                  <p className="font-black text-white truncate max-w-[200px] tracking-tight text-lg">{file.name}</p>
                  <p className="text-[10px] font-black text-quizard-accent uppercase tracking-[0.2em] mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready for Analysis</p>
                </div>
              </div>
              <button
                id="remove-file-btn"
                onClick={() => setFile(null)}
                className="p-3 hover:bg-white/10 rounded-2xl transition-all hover:rotate-90"
              >
                <X className="w-6 h-6 text-white/20" />
              </button>
            </div>

            <div className="mb-10 text-left">
              <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-6">Analysis Configuration</label>
              
              <div className="flex p-2 bg-black/20 rounded-[2rem] mb-8 border border-white/5">
                <button
                  onClick={() => {
                    setQuizType('OBJECTIVE');
                    if (questionCount > 200) setQuestionCount(200);
                  }}
                  className={`flex-1 py-4 text-[10px] font-black rounded-[1.5rem] transition-all uppercase tracking-[0.2em] ${
                    quizType === 'OBJECTIVE' 
                      ? 'bg-quizard-accent text-quizard-bg shadow-[0_0_20px_rgba(0,229,255,0.3)]' 
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  Objective (MCQ)
                </button>
                <button
                  onClick={() => {
                    setQuizType('THEORY');
                    if (questionCount > 20) setQuestionCount(10);
                  }}
                  className={`flex-1 py-4 text-[10px] font-black rounded-[1.5rem] transition-all uppercase tracking-[0.2em] ${
                    quizType === 'THEORY' 
                      ? 'bg-quizard-accent text-quizard-bg shadow-[0_0_20px_rgba(0,229,255,0.3)]' 
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  Theory (Essay)
                </button>
              </div>

              <div className="relative group">
                <input 
                  type="number" 
                  min="1" 
                  max={quizType === 'OBJECTIVE' ? 200 : 20}
                  value={questionCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    const max = quizType === 'OBJECTIVE' ? 200 : 20;
                    if (!isNaN(val)) {
                      setQuestionCount(Math.min(max, Math.max(0, val)));
                    } else {
                      setQuestionCount(0);
                    }
                  }}
                  onBlur={() => {
                    const min = quizType === 'OBJECTIVE' ? 5 : 2;
                    const max = quizType === 'OBJECTIVE' ? 200 : 20;
                    if (questionCount < min) setQuestionCount(min);
                    if (questionCount > max) setQuestionCount(max);
                  }}
                  className="w-full px-8 py-6 bg-white/5 border border-white/10 rounded-[2rem] focus:ring-4 focus:ring-quizard-accent/20 focus:border-quizard-accent outline-none transition-all font-black text-white text-2xl tracking-tighter"
                />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.2em] text-quizard-accent bg-quizard-accent/10 px-4 py-2 rounded-xl border border-quizard-accent/20">
                  {quizType === 'OBJECTIVE' ? 'MCQs' : 'Questions'}
                </div>
              </div>
              <p className="text-[10px] text-white/20 mt-4 font-black uppercase tracking-[0.2em]">
                {quizType === 'OBJECTIVE' 
                  ? 'Generate up to 200 board-standard multiple choice questions.' 
                  : 'Generate up to 20 standard medical school theory questions.'}
              </p>
            </div>

            <button
              id="generate-quiz-btn"
              disabled={isGenerating}
              onClick={handleUpload}
              className="w-full py-6 bg-quizard-accent text-quizard-bg rounded-[2rem] font-black text-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-4 shadow-[0_0_40px_rgba(0,229,255,0.4)] uppercase tracking-widest"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Analyzing Clinical Data...
                </>
              ) : (
                'Initialize Assessment'
              )}
            </button>
          </div>
        )}
      </div>
      
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-16 text-center w-full max-w-xl mx-auto"
        >
          <p className="text-white/40 italic font-bold text-lg leading-relaxed mb-10">"Medicine is a science of uncertainty and an art of probability." <br/>— William Osler</p>
          
          <div className="bg-quizard-card border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-quizard-accent/20 to-transparent" />
            
            <div className="flex justify-between items-end mb-3">
              <div className="text-left">
                <h4 className="text-white font-black tracking-tight text-lg">Generating Assessment</h4>
                <p className="text-[10px] font-black text-quizard-accent uppercase tracking-[0.3em] mt-1">
                  {displayCount} {displayType === 'OBJECTIVE' ? 'MCQs' : 'Theory Questions'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-white tracking-tighter">{Math.round(progress)}%</span>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">
                  ~{estimatedTimeLeft}s remaining
                </p>
              </div>
            </div>

            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-quizard-accent shadow-[0_0_15px_rgba(0,229,255,0.5)] rounded-full"
                style={{ width: `${progress}%` }}
                layout
              />
            </div>
            
            <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
              <Loader2 className="w-3 h-3 animate-spin text-quizard-accent" />
              Performing Deep Semantic Scan...
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
