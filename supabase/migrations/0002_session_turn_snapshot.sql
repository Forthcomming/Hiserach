-- 会话最近一轮 Continuity 快照（对话顺畅最小实现）
alter table sessions
  add column if not exists turn_snapshot jsonb;

comment on column sessions.turn_snapshot is
  '最近一轮可恢复摘要：category / productIds / conditions / query / intent';
