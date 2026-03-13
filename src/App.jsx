import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadCloud, File, Trash2, Unlock, Download, Lock, Eye, EyeOff, FolderOpen, Sun } from 'lucide-react';
import qpdfFactory from 'qpdf-wasm';

export default function App() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // QPDF Instance
  const [qpdf, setQpdf] = useState(null);

  useEffect(() => {
    const initQpdf = async () => {
      try {
        const instance = await qpdfFactory({
          locateFile: (path) => {
            if (path.endsWith('.wasm')) return '/pdf_unlocker/qpdf.wasm';
            if (path.endsWith('.js') || path.endsWith('.worker.js')) return '/pdf_unlocker/qpdf.js';
            return path;
          },
          print: (text) => console.log('QPDF Output:', text),
          printErr: (text) => console.error('QPDF Error:', text)
        });
        setQpdf(instance);
      } catch (error) {
        console.error("載入 qpdf-wasm 失敗:", error);
      }
    };
    initQpdf();
  }, []);

  // --- 拖曳上傳相關 ---
  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf'));
  }, []);

  const handleFileInput = (e) => {
    addFiles(Array.from(e.target.files).filter(file => file.type === 'application/pdf'));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = async (newFiles) => {
    const newFileObjects = newFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      password: '',
      showPassword: false,
      status: 'pending',
      message: '等待解鎖',
      progress: 0,
      downloadUrl: null
    }));
    // 變更：每次上傳新檔案時，直接覆蓋原本的清單，不保留舊檔案
    setFiles(newFileObjects);
  };

  // --- UI 互動 ---
  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));
  const updatePassword = (id, password) => setFiles(prev => prev.map(f => f.id === id ? { ...f, password } : f));
  const togglePasswordVisibility = (id) => setFiles(prev => prev.map(f => f.id === id ? { ...f, showPassword: !f.showPassword } : f));

  // --- 核心：WASM 解密處理邏輯 ---
  const processFiles = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    for (let i = 0; i < files.length; i++) {
      const currentFile = files[i];
      if (currentFile.status === 'success') continue;

      setFiles(prev => prev.map(f => f.id === currentFile.id ? { ...f, status: 'processing', progress: 30, message: '啟動解密引擎...' } : f));

      try {
        const arrayBuffer = await currentFile.file.arrayBuffer();
        const fileUint8 = new Uint8Array(arrayBuffer);

        setFiles(prev => prev.map(f => f.id === currentFile.id ? { ...f, progress: 60, message: '移除密碼保全中...' } : f));

        let outBuffer;

        // ====================================================================
        // 🚀 真實 WebAssembly (qpdf-wasm) 處理邏輯
        // ====================================================================

        // 1. 載入 WebAssembly 模組並解決 Worker/WASM undefined 找不到路徑的問題
        // 修正：使用 Vite 的 ?url 導入，確保在 GitHub Pages (production) 環境中取得正確的絕對路徑
        const qpdf = await qpdfFactory({
          locateFile: (path) => {
            if (path.endsWith('.worker.js') || path.endsWith('.js')) return '/pdf_unlocker/qpdf.js';
            if (path.endsWith('.wasm')) return '/pdf_unlocker/qpdf.wasm';
            return path;
          },
          print: (text) => console.log('qpdf stdout:', text),
          printErr: (text) => console.error('qpdf stderr:', text)
        });

        // 2. 將使用者的 PDF 寫入 WebAssembly 虛擬檔案系統
        qpdf.FS.writeFile('/input.pdf', fileUint8);

        // 3. 準備指令參數
        const args = currentFile.password
          ? ['--password=' + currentFile.password, '--decrypt', '/input.pdf', '/output.pdf']
          : ['--decrypt', '/input.pdf', '/output.pdf'];

        // 4. 執行解密
        const exitCode = qpdf.callMain(args);

        if (exitCode !== 0) {
          throw new Error("ACCESS_DENIED");
        }

        // 5. 讀取解密後的檔案
        outBuffer = qpdf.FS.readFile('/output.pdf');

        // ====================================================================

        setFiles(prev => prev.map(f => f.id === currentFile.id ? { ...f, progress: 90, message: '儲存檔案...' } : f));

        const blob = new Blob([outBuffer], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(blob);

        setFiles(prev => prev.map(f => f.id === currentFile.id ? {
          ...f, status: 'success', progress: 100, message: '✅ 解保全成功', downloadUrl
        } : f));

      } catch (err) {
        console.error("解鎖過程發生未知例外:", err);
        const errMsg = err.message || String(err);

        setFiles(prev => prev.map(f => f.id === currentFile.id ? {
          ...f, status: 'error', message: errMsg.includes('ACCESS_DENIED') ? '❌ 密碼錯誤' : `❌ 錯誤: ${errMsg.substring(0, 15)}...`
        } : f));
      }
    }
    setIsProcessing(false);
  };

  const handleDownload = (file) => {
    if (!file.downloadUrl) return;
    const newFileName = `${file.name.replace(/\.pdf$/i, '')}_已解保全.pdf`;
    const a = document.createElement('a');
    a.href = file.downloadUrl;
    a.download = newFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = () => {
    const successFiles = files.filter(f => f.status === 'success' && f.downloadUrl);
    successFiles.forEach((file, index) => setTimeout(() => handleDownload(file), index * 300));
  };

  return (
    <div className="min-h-screen bg-sunny-gradient bg-grid relative text-slate-800 p-2 md:p-4 overflow-hidden" style={{ fontFamily: '"Microsoft JhengHei", "Inter", sans-serif' }}>

      {/* 頂部暖色光暈 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-32 bg-white/30 blur-[80px] rounded-full pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10 pt-4">

        {/* 清新標題區 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center gap-2 mb-2 bg-amber-50/70 backdrop-blur-md px-3 py-1 rounded-full border border-yellow-300 shadow-sm">
            <Sun className="text-orange-500 w-4 h-4 animate-[spin_10s_linear_infinite]" />
            <span className="text-[16px] font-bold tracking-widest text-orange-600 uppercase">
              本機安全解鎖器
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold mb-2 tracking-tight text-slate-800 drop-shadow-sm">
            Studio0808 _PDF文件輕鬆解保全
          </h1>
          <p className="text-[16px] text-slate-600 max-w-lg mx-auto leading-relaxed font-medium">
            檔案百分之百留在您的瀏覽器內處理。<span className="text-orange-600 font-bold">絕不上傳至任何伺服器，</span><br />給您最高等級的隱私保障。
          </p>
        </div>

        {/* 陽光風拖曳上傳區 */}
        <div
          className={`relative sunny-card rounded-2xl p-6 text-center transition-all duration-300 cursor-pointer overflow-hidden group ${isDragging ? 'border-orange-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] bg-amber-100/90' : 'hover:border-orange-300 hover:shadow-soft-warm border-yellow-300 bg-amber-50/80'
            }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {/* 四角溫暖裝飾 */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-yellow-400 rounded-tl-xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-yellow-400 rounded-tr-xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-yellow-400 rounded-bl-xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-yellow-400 rounded-br-xl opacity-50 group-hover:opacity-100 transition-opacity"></div>

          <input type="file" ref={fileInputRef} onChange={handleFileInput} className="hidden" multiple accept="application/pdf" />
          <div className="flex flex-col items-center justify-center pointer-events-none space-y-3">
            <div className={`p-4 rounded-full transition-transform duration-500 ${isDragging ? 'bg-orange-200 scale-110 shadow-sm' : 'bg-amber-100 border-2 border-amber-200 shadow-sm'}`}>
              <UploadCloud size={40} className={`${isDragging ? 'text-orange-600' : 'text-yellow-600'}`} />
            </div>
            <p className="font-extrabold text-slate-700 tracking-wide text-[16px]">
              將 PDF 檔案拖曳至此 <span className="text-orange-600 text-[16px] font-medium ml-1">(或點擊選擇檔案)</span>
            </p>
          </div>
        </div>

        {/* 檔案處理列表區 */}
        {files.length > 0 && (
          <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="sunny-card shadow-lg rounded-xl overflow-hidden divide-y divide-amber-200/60 border border-yellow-300 bg-amber-50/90">
              <ul className="max-h-[65vh] overflow-y-auto custom-scrollbar">
                {files.map((file) => (
                  <li key={file.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-amber-100/50 transition-colors relative group border-l-4 border-transparent hover:border-orange-400">

                    {/* 檔案資訊 */}
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="p-2 sm:p-2.5 bg-yellow-100 rounded-lg shadow-sm border border-yellow-200 mr-3">
                        <File size={22} className="text-orange-500" />
                      </div>
                      <div className="truncate pr-3">
                        <p className="font-mono text-slate-800 truncate text-[16px] font-bold">{file.name}</p>
                        <p className="font-mono text-[16px] text-slate-500">{file.size}</p>
                      </div>
                    </div>

                    {/* 狀態與互動區 */}
                    <div className="flex items-center gap-3 w-full sm:w-auto sm:min-w-[420px] justify-end">

                      <span className={`w-36 text-right font-bold text-[16px] tracking-wider ${file.status === 'success' ? 'text-green-600' :
                        file.status === 'error' ? 'text-red-500' : 'text-orange-600'
                        }`}>
                        {file.message}
                      </span>

                      {/* 密碼輸入區 */}
                      {(file.status === 'pending' || file.status === 'error') && (
                        <div className="relative flex-1 sm:w-52 flex items-center gap-2">
                          <div className="relative flex-1 flex group/input">
                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-orange-500 transition-colors" />
                            <input
                              type={file.showPassword ? "text" : "password"}
                              placeholder="輸入金鑰..."
                              value={file.password}
                              onChange={(e) => updatePassword(file.id, e.target.value)}
                              className="w-full pl-8 pr-8 py-1.5 sm:py-2 bg-white/80 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 text-[16px] text-slate-700 transition-all font-sans placeholder:text-slate-400 shadow-sm"
                            />
                            <button
                              onClick={() => togglePasswordVisibility(file.id)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {file.showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                          <button onClick={() => removeFile(file.id)} disabled={isProcessing} title="移除檔案" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors bg-white/80 border border-slate-300 hover:border-red-300 shadow-sm">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}

                      {/* 進度條 */}
                      {file.status === 'processing' && (
                        <div className="w-52 flex flex-col justify-center gap-1.5 px-2">
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative border border-slate-300 shadow-inner">
                            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full transition-all duration-300" style={{ width: `${file.progress}%` }}></div>
                          </div>
                          <div className="text-[16px] font-mono text-orange-600 text-right font-bold tracking-wider">{file.progress}%</div>
                        </div>
                      )}

                      {/* 下載按鈕 */}
                      {file.status === 'success' && (
                        <div className="w-52 flex justify-end px-1">
                          <button onClick={() => handleDownload(file)} className="flex items-center justify-center w-full text-[16px] font-extrabold text-white bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 border border-green-600">
                            <Download size={16} className="mr-1.5" /> 下載檔案
                          </button>
                        </div>
                      )}

                    </div>
                  </li>
                ))}
              </ul>

              {/* 底部整體操作 */}
              <div className="bg-amber-100/80 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-amber-200">
                <span className="text-[16px] text-slate-700 flex items-center gap-2 font-semibold tracking-wide"><Unlock size={16} className="text-orange-600" /> 無密碼會直接解保全</span>
                <div className="flex gap-3 w-full sm:w-auto">
                  {files.some(f => f.status === 'success') && (
                    <button onClick={handleDownloadAll} className="flex-1 sm:flex-none flex items-center justify-center px-5 py-2 sm:py-2.5 rounded-lg text-[16px] font-extrabold text-white border border-green-700 bg-green-500 hover:bg-green-600 transition-all tracking-wider shadow-sm">
                      <FolderOpen size={16} className="mr-1.5" /> 全部下載
                    </button>
                  )}
                  <button onClick={processFiles} disabled={isProcessing || files.every(f => f.status === 'success')}
                    className={`flex-1 sm:flex-none flex items-center justify-center px-6 py-2 sm:py-2.5 rounded-lg text-[16px] font-extrabold transition-all tracking-widest shadow-sm ${isProcessing || files.every(f => f.status === 'success')
                      ? 'bg-amber-200/50 text-amber-600/50 cursor-not-allowed border border-amber-300/50'
                      : 'bg-orange-500 text-white hover:bg-orange-600 border border-orange-600 hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                  >
                    {isProcessing ? (
                      <><div className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin mr-2"></div>處理中...</>
                    ) : (
                      <><Unlock size={16} className="mr-2" /> 一鍵解除保全</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 最高隱私驗證說明 (Q&A) */}
        <div className="mt-8 mb-2 sunny-card shadow-sm rounded-xl p-5 sm:p-6 border border-amber-200/60 bg-white/70 animate-in fade-in duration-700">
          <div className="flex items-center gap-2 mb-3">
            <Lock size={18} className="text-orange-600" />
            <h3 className="font-extrabold text-[16px] text-slate-800 tracking-wide">如何驗證最高隱私？</h3>
          </div>
          <p className="text-[15px] sm:text-[16px] text-slate-600 leading-relaxed font-medium">
            本工具採用先進的 WebAssembly 邊緣運算技術。您可以<strong className="text-orange-600 font-bold mx-0.5">「在載入網頁後，直接關閉您的 Wi-Fi 或網路連線」</strong>再進行解鎖。您會發現即使在無網路的離線狀態下，解碼速度與結果皆完全不受影響。這正是您的文件從頭到尾都不曾離開過您電腦的最佳鐵證。
          </p>
        </div>

        {/* 頁尾版權宣告 */}
        <div className="mt-6 text-center pb-4 animate-in fade-in duration-700">
          <p className="text-[16px] text-slate-500 font-medium tracking-wide">
            © 2026 Studio0808 智造實驗室. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}