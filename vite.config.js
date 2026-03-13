import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// 終極修復外掛：同時處理「跨來源隔離 (COOP/COEP)」與「Worker/WASM 檔案遺失」
const fixWasmAndWorkerPlugin = () => ({
  name: 'fix-wasm-and-worker',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // 1. 強制所有請求 (包含 index.html) 都加上安全標頭！
      // 這是解決 SharedArrayBuffer 卡死的唯一方法
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

      // 2. 攔截尋找 .wasm 或 .worker.js 的請求，正確返回實體檔案
      // 因為 App.jsx 中設定了 locateFile，現在請求的路徑會是 /qpdf.wasm 與 /qpdf.js (Worker 用)
      const urlPath = req.url.split('?')[0];
      if (urlPath === '/qpdf.wasm' || urlPath.includes('qpdf.js')) {
        let fileName = path.basename(urlPath);

        // Vite 常常會因為 ?v= 快取而搞混路徑，強制對應檔名
        if (fileName.includes('qpdf.js')) fileName = 'qpdf.js';
        if (fileName === 'qpdf.wasm') fileName = 'qpdf.wasm';

        // 偵測套件真實存放的路徑，確保載入 node_modules 裡面的檔案
        const possiblePaths = [
          path.resolve(process.cwd(), `node_modules/qpdf-wasm/dist/${fileName}`),
          path.resolve(process.cwd(), `node_modules/qpdf-wasm/${fileName}`)
        ];

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            const mimeType = p.endsWith('.wasm') ? 'application/wasm' : 'application/javascript';
            res.setHeader('Content-Type', mimeType);
            res.end(fs.readFileSync(p));
            return; // 成功回傳檔案，結束這次請求
          }
        }
      }
      next();
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  base: '/pdf_unlocker/',
  plugins: [react(), fixWasmAndWorkerPlugin()],
  optimizeDeps: {
    // 排除 qpdf-wasm，避免 Vite 錯誤地把它當成一般 JS 模組打包
    exclude: ['qpdf-wasm']
  }
})