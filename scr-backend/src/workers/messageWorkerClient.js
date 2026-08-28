// SPDX-License-Identifier: MIT
// 消息拉取 Worker 客户端（主线程）
// 维护一个 Worker 池，向 messageWorker 分发消息拉取任务并收集结果，带超时兜底。
//
// 两种运行模式：
// 1) esbuild 打包（app.js）：workerStringPlugin 拦截下方对 workerSource.js 的导入，
//    返回内联的 messageWorker 源码字符串，运行时 new Worker(source, { eval: true })
//    直接创建（mysql2/redis 外联，从 node_modules require）。
// 2) 源码模式（node src/index.js）：导入 workerSource.js 得到 null，改为直接从
//    src/workers/messageWorker.js 文件创建 Worker。
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import { dbConfig, getRedisUrl, messageConfig } from '../config/index.js';
import bundledWorkerSource from './workerSource.js';

// eval worker 内的 require('mysql2'/'redis') 依赖 filename 来定位 node_modules，
// 这里指向 app.js 自身（与 node_modules 同目录），保证运行时能解析外部依赖。
const WORKER_FILENAME = fileURLToPath(import.meta.url);

// 源码模式下的 Worker 文件路径
function getWorkerPath() {
  return path.join(process.cwd(), 'src', 'workers', 'messageWorker.js');
}

const POOL_SIZE = 2;
const TASK_TIMEOUT_MS = 30000;

const workerData = {
  dbConfig: {
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
  },
  redisUrl: getRedisUrl(),
  offlineLimits: messageConfig.offlineLimits
};

let nextId = 1;
const pending = new Map();

function createWorker() {
  // 打包产物（app.js）：bundledWorkerSource 为内联的源码字符串，用 eval worker 创建，
  // 内部外联 mysql2/redis，运行时从 node_modules 解析；传入 filename 使 require 可解析。
  const worker = bundledWorkerSource
    ? new Worker(bundledWorkerSource, { eval: true, filename: WORKER_FILENAME, workerData })
    // 源码模式（node src/index.js）：直接从 messageWorker.js 文件创建
    : new Worker(getWorkerPath(), { workerData });
  worker.on('message', (msg) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) {
      p.resolve(msg.result);
    } else {
      p.reject(new Error(msg.error?.message || '消息拉取任务失败'));
    }
  });
  worker.on('error', (err) => {
    console.error('❌ 消息拉取 Worker 错误:', err.message);
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error('❌ 消息拉取 Worker 异常退出, code =', code);
    }
  });
  return worker;
}

// 固定大小 Worker 池，轮询分发（Worker 内部按消息队列串行处理）
const workers = Array.from({ length: POOL_SIZE }, () => createWorker());
let rr = 0;

export function runMessageTask(type, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const worker = workers[rr++ % workers.length];
    worker.postMessage({ id, type, ...params });
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('消息拉取任务执行超时'));
      }
    }, TASK_TIMEOUT_MS);
    if (timer.unref) timer.unref();
  });
}
