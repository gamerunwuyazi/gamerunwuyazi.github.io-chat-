import esbuild from 'esbuild';
import { context } from 'esbuild';
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
    'cors',
    'dotenv',
    'express',
    'multer',
    'mysql2',
    'node-schedule',
    'redis',
    'socket.io'
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

async function build() {
  try {
    if (isWatch) {
      const ctx = await context(buildOptions);
      
      ctx.watch();
      console.log('👀 Watching for changes...');
      
      let currentServer = null;
      let rebuildCount = 0;

      const startOrRestartServer = async () => {
        try {
          if (currentServer) {
            console.log('🔄 检测到文件变化，正在重启服务器...');
            
            await new Promise((resolve) => {
              currentServer.close(() => {
                console.log('✅ 旧服务器已关闭');
                resolve();
              });
            });
            
            currentServer = null;
          }

          console.log(`🚀 第 ${rebuildCount + 1} 次启动服务器...`);
          
          const modulePath = new URL('./app.js', import.meta.url).href;
          const { server: serverInstance } = await import(`${modulePath}?t=${Date.now()}`);
          
          currentServer = serverInstance;
          
          console.log(`✅ 第 ${++rebuildCount} 次重载完成`);
        } catch (err) {
          console.error('❌ 重启服务器失败:', err.message);
        }
      };

      ctx.on('end', (result) => {
        if (result.errors.length === 0) {
          startOrRestartServer().catch(console.error);
        }
      });

      await startOrRestartServer();
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
