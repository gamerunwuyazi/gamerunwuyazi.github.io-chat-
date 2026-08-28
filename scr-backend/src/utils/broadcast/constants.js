// 广播子系统共享常量

// Redis Streams：广播消息队列（扇出模式，所有进程都读取全量消息）
export const BROADCAST_STREAM = 'broadcast_stream';

// Stream 近似长度上限，防止 Redis 内存无限增长（MAXLEN ~ 10000，500 条/批可覆盖 ~20 批）
export const STREAM_MAXLEN = 10000;

// 每个节点消费进度持久化的 Redis Hash 前缀（key: scr:broadcast_progress:<node>，field: lastId）
export const PROGRESS_KEY_PREFIX = 'scr:broadcast_progress';