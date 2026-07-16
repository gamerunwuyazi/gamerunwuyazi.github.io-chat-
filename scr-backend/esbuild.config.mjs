// SPDX-License-Identifier: MIT
// Copyright (c) 2026 xingk_gamerunwuyazi
import esbuild, { context } from 'esbuild';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import sqlTemplateStringPlugin from './plugins/sqlCompress.mjs';

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isDevBuild = args.includes('--dev');

// 根据构建模式设置 NODE_ENV（兼容 Windows/Linux/Mac）
if (isWatch || isDevBuild) {
  process.env.NODE_ENV = 'development';
} else {
  process.env.NODE_ENV = 'production';
}

console.log(`🔧 构建模式: ${process.env.NODE_ENV}`);

const buildOptions = {
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'app.js',
  platform: 'node',
  target: 'node21',
  format: 'esm',
  sourcemap: isWatch || isDevBuild,
  keepNames: true,
  plugins: [sqlTemplateStringPlugin],
  external: [
    'bcryptjs',
    'canvas',
    'cors',
    'dotenv',
    'express',
    'multer',
    'mysql2',
    'node-schedule',
    'redis',
    'scr-slider-captcha',
    'socket.io',
    'human-verify'
  ],
  loader: {
    '.js': 'js'
  },
  logLevel: 'info'
};

if (isDevBuild) {
  buildOptions.minify = false;
} else if (!isWatch) {
  buildOptions.minify = true;
  buildOptions.minifyIdentifiers = false;
  buildOptions.minifyWhitespace = true;
  buildOptions.minifySyntax = true;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsPath = path.join(__dirname, 'app.js');

async function build() {
  try {
    if (isWatch) {
      let childProcess = null;
      let isInitialBuild = true;
      let restartPending = false;

      const startServer = async () => {
        return new Promise((resolve, reject) => {
          const child = spawn('node', [appJsPath], {
            stdio: 'inherit',
            cwd: __dirname
          });

          child.on('error', (err) => {
            console.error('❌ 启动服务器失败:', err.message);
            reject(err);
          });

          // 给服务器一点时间启动，如果立即退出说明有错误
          const startupTimeout = setTimeout(() => {
            childProcess = child;
            console.log(`✅ 服务器已启动 (PID: ${child.pid})`);
            resolve();
          }, 100);

          child.on('exit', (code, signal) => {
            clearTimeout(startupTimeout);
            if (childProcess === child) {
              childProcess = null;
              console.log(`🔚 服务器进程已退出 (code: ${code}, signal: ${signal})`);
              // 如果有待重启且不是被 SIGINT 杀死的，立即重启
              if (restartPending && signal !== 'SIGINT') {
                restartPending = false;
                startServer().catch(console.error);
              }
            }
          });
        });
      };

      const stopServer = () => {
        if (childProcess) {
          childProcess.kill('SIGINT');
          childProcess = null;
        }
      };

      const ctx = await context({
        ...buildOptions,
        plugins: [
          ...buildOptions.plugins,
          {
            name: 'watch-server',
            setup(build) {
              build.onEnd(result => {
                // 跳过初始构建，由后面的 startServer 处理首次启动
                if (isInitialBuild) {
                  isInitialBuild = false;
                  return;
                }
                if (result.errors.length === 0) {
                  stopServer();
                  startServer().catch(console.error);
                }
              });
            }
          }
        ]
      });

      ctx.watch();
      
      // 确保父进程退出时杀掉子进程
      process.on('SIGINT', () => {
        console.log('\n👋 正在关闭开发服务器...');
        if (childProcess) {
          childProcess.kill('SIGINT');
        }
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        if (childProcess) {
          childProcess.kill('SIGTERM');
        }
        process.exit(0);
      });

      // 首次构建后启动服务器
      await startServer();
    } else {
      await esbuild.build(buildOptions);
      if (!isDevBuild) {
        console.log('✅ Production build completed successfully!');
      } else {
        console.log('✅ Development build completed successfully!');
      }
    }
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

build();
