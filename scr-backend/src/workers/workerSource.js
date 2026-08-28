// SPDX-License-Identifier: MIT
// 占位模块，仅供"未打包"的源码模式（node src/index.js）使用：默认导出 null，
// 让 messageWorkerClient 回退为从源码文件加载消息拉取 Worker。
// 在 esbuild 打包时，workerStringPlugin 会拦截本文件的导入，替换为内联的
// messageWorker 源码字符串，因此该文件不会被打进 app.js。
export default null;