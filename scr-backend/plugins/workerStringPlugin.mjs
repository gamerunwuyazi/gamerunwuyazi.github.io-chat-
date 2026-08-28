// SPDX-License-Identifier: MIT
// esbuild 插件：把 messageWorker 源码（连同它直接引用的依赖）打成一个自包含的 CJS 字符串，
// 让 `import workerSource from 'worker-source:...'` 返回该字符串。
// 运行时用 new Worker(workerSource, { eval: true }) 直接以字符串创建 Worker，
// 无需再单独产出/部署 messageWorker.bundle.js 文件。
import * as esbuild from 'esbuild';
import path from 'path';

export default function workerStringPlugin() {
  return {
    name: 'worker-string',
    setup(build) {
      // 拦截对 workerSource.js 占位模块的导入：在 esbuild 打包时把它替换为
      // 内联的 messageWorker 源码字符串（导入路径改为真实源码文件，走 virtual namespace）。
      // 保证打包产物 app.js 不依赖任何 worker 文件；源码模式（node src/index.js）下
      // 该文件保持原样（普通 ESM 模块，导出 null），走文件 Worker。
      build.onResolve({ filter: /workerSource\.js$/ }, (args) => {
        return {
          path: path.resolve(args.resolveDir, 'messageWorker.js'),
          namespace: 'worker-source'
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'worker-source' }, async (args) => {
        // 内层把 Worker 源码打包成 CJS 字符串。mysql2/redis 不内联（external），
        // 而是让 eval worker 在运行时通过 require 从 node_modules 解析，减小 app.js 体积。
        // worker_threads 等 node 内建模块会被 esbuild 自动视为 external。
        // minify 跟随外层构建的开关（build.initialOptions.minify），保证 worker 的
        // 压缩状态永远与主包一致，避免进程环境变量 NODE_ENV 不精确导致"主包已压缩、
        // worker 未压缩"的不一致。外层生产构建时该值为 true。
        const result = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          write: false,
          format: 'cjs',
          platform: 'node',
          target: 'node21',
          external: ['mysql2', 'mysql2/promise', 'redis'],
          minify: build.initialOptions.minify === true
        });

        const source = result.outputFiles[0].text;
        return {
          contents: `export default ${JSON.stringify(source)};`,
          loader: 'js'
        };
      });
    }
  };
}