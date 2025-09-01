import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    host: true,
    strictPort: true, // 强制使用指定端口，如果被占用则报错
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          // 移除频繁的请求/响应日志以减少控制台噪音
          // proxy.on('proxyReq', (proxyReq, req) => {
          //   console.log('Sending Request to the Target:', req.method, req.url);
          // });
          // proxy.on('proxyRes', (proxyRes, req) => {
          //   console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          // });
        },
      },
    },
  },
})