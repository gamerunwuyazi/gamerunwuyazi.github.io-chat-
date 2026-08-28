// 广播消息生产者
// 用途：socket.on 回调中重建广播任务时，不直接 io.to(room).emit，而是极快地 XADD 入队到
// Redis Streams，由独立的消费者异步扇出到各房间客户端。生产者只做一次内存序列化 + 一次 XADD，
// 延迟 < 1ms，随后立即返回，绝不阻塞主事件循环。
import { BROADCAST_STREAM, STREAM_MAXLEN } from './constants.js';

export function createBroadcastProducer(redis) {
  return {
    get streamName() {
      return BROADCAST_STREAM;
    },

    /**
     * 将一条广播消息入队。
     * @param {string} room 目标房间，如 group_5 / authenticated_users
     * @param {string} event 事件名，如 message-received
     * @param {*} payload 负载
     * @param {string} [excludeSocketId] 需排除的 socket id（通常为发送者，避免其重复收到）
     * @returns {Promise<string|null>} 消息ID（失败返回 null，不抛异常）
     */
    async enqueue(room, event, payload, excludeSocketId) {
      if (!room) return null;
      const data = JSON.stringify({
        event,
        room,
        excludeSocketId: excludeSocketId || null,
        payload,
        timestamp: Date.now()
      });
      try {
        const id = await redis.xAdd(
          BROADCAST_STREAM,
          '*',
          { data },
          {
            TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: STREAM_MAXLEN }
          }
        );
        return id;
      } catch (err) {
        console.error('❌ 广播入队失败:', err.message);
        return null;
      }
    }
  };
}