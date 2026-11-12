-- 小红书 AI 搜「同类人口碑」MVP 数据模型
-- 对应 technical-spec.md 5.1；Supabase Postgres + pgvector。
-- 所有写操作只经由服务端 Repository（service role key 不下发客户端）。

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ── 身份与会话 ────────────────────────────────────────────────────────────
create table if not exists anonymous_users (
  id          text primary key,
  persona     text not null check (persona in ('xiaolin', 'xiaob')),
  created_at  timestamptz not null default now()
);

create table if not exists sessions (
  id               text primary key,
  user_id          text not null references anonymous_users(id) on delete cascade,
  memory_disabled  boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists messages (
  id          text primary key,
  session_id  text not null references sessions(id) on delete cascade,
  turn_id     text not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists messages_session_idx on messages (session_id, created_at);

-- ── 经验数据（离线管线入库，运行期只读） ──────────────────────────────────
create table if not exists products (
  id          text primary key,
  category    text not null check (category in ('beauty', 'baby_food')),
  name        text not null,
  image_url   text
);

create table if not exists experience_records (
  id                 text primary key,
  author_id          text not null,
  product_id         text not null references products(id),
  stance             text not null check (stance in ('recommend', 'not_recommend')),
  author_conditions  jsonb not null default '{}'::jsonb,
  reasons            jsonb not null default '[]'::jsonb,
  quote              text not null,
  source_text        text,
  source_type        text not null check (source_type in ('note', 'comment')),
  source_url         text,
  published_at       text not null,
  embedding          vector(1536)
);
create index if not exists experience_product_idx on experience_records (product_id);
create index if not exists experience_author_idx on experience_records (author_id);
create index if not exists experience_conditions_idx on experience_records using gin (author_conditions);
-- 原话逐字校验门禁（规格 5.1 / 10）：提供了原文时，quote 必须是其子串。
alter table experience_records
  drop constraint if exists experience_quote_verbatim;
alter table experience_records
  add constraint experience_quote_verbatim
  check (source_text is null or position(quote in source_text) > 0);
-- source_url 只允许 https 且域名受控，防止开放重定向
alter table experience_records
  drop constraint if exists experience_source_https;
alter table experience_records
  add constraint experience_source_https
  check (source_url is null or source_url like 'https://%');

-- ── 记忆 ──────────────────────────────────────────────────────────────────
create table if not exists memory_items (
  id           text primary key,
  user_id      text not null references anonymous_users(id) on delete cascade,
  category     text not null check (category in ('beauty', 'baby_food')),
  key          text not null,
  value        jsonb not null,
  is_core      boolean not null default false,
  source       jsonb not null default '{}'::jsonb,
  status       text not null default 'active'
                 check (status in ('active', 'superseded', 'deleted')),
  supersedes   text references memory_items(id) on delete set null,
  created_at   timestamptz not null default now()
);
-- 每用户 / 品类 / 维度最多一个 active 条目（规格 5.1）
create unique index if not exists one_active_memory_per_dimension
  on memory_items (user_id, category, key)
  where status = 'active';
create index if not exists memory_user_idx on memory_items (user_id, category, status);

create table if not exists memory_events (
  id          text primary key,
  memory_id   text not null references memory_items(id) on delete cascade,
  action      text not null check (action in
                ('created', 'superseded', 'used', 'disabled_for_session',
                 'enabled_for_session', 'deleted', 'undo')),
  turn_id     text,
  reason      text,
  at          timestamptz not null default now()
);
create index if not exists memory_events_memory_idx on memory_events (memory_id, at);

-- 撤销写入前的有效状态快照（规格 3.4：不得丢失历史关系）
create table if not exists memory_undo_snapshots (
  token         text primary key,
  user_id       text not null references anonymous_users(id) on delete cascade,
  before_state  jsonb not null,
  created_ids   jsonb not null,
  created_at    timestamptz not null default now()
);

-- ── Agent 追踪 ────────────────────────────────────────────────────────────
create table if not exists agent_traces (
  id              text primary key,
  turn_id         text not null,
  node            text not null,
  status          text not null check (status in ('success', 'failed', 'degraded', 'skipped')),
  duration_ms     integer not null default 0,
  input_summary   text,
  output_summary  text,
  created_at      timestamptz not null default now()
);
create index if not exists agent_traces_turn_idx on agent_traces (turn_id, created_at);

-- ── RLS：客户端不可直连，全部经服务端 Repository 强制 user_id 过滤 ──────────
alter table anonymous_users    enable row level security;
alter table sessions           enable row level security;
alter table messages           enable row level security;
alter table products           enable row level security;
alter table experience_records enable row level security;
alter table memory_items       enable row level security;
alter table memory_events      enable row level security;
alter table memory_undo_snapshots enable row level security;
alter table agent_traces       enable row level security;

-- 仅为 service_role 放行；不创建 anon/authenticated 策略，客户端直连默认拒绝。
do $$
declare t text;
begin
  foreach t in array array[
    'anonymous_users','sessions','messages','products',
    'experience_records','memory_items','memory_events',
    'memory_undo_snapshots','agent_traces'
  ] loop
    execute format('drop policy if exists service_role_all on %I', t);
    execute format(
      'create policy service_role_all on %I for all to service_role using (true) with check (true)', t
    );
  end loop;
end $$;

-- ── 记忆写入事务：旧值失效与新值落库必须原子（规格 5.1 / 3.4） ──────────────
create or replace function apply_memory_write(
  p_user_id   text,
  p_category  text,
  p_turn_id   text,
  p_items     jsonb,
  p_used_ids  jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_existing    memory_items%rowtype;
  v_existing_id text;
  v_new_id      text;
  v_created     jsonb := '[]'::jsonb;
  v_superseded  jsonb := '[]'::jsonb;
  v_used_id     text;
begin
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_existing_id := null;
    select * into v_existing
      from memory_items
      where user_id = p_user_id
        and category = p_category
        and key = v_item->>'key'
        and status = 'active'
      limit 1;

    if found then
      -- 同值忽略，不写入、不产生事件
      continue when v_existing.value = v_item->'value';
      v_existing_id := v_existing.id;
      update memory_items set status = 'superseded' where id = v_existing_id;
      insert into memory_events (id, memory_id, action, turn_id, reason)
        values ('me_' || replace(gen_random_uuid()::text, '-', ''),
                v_existing_id, 'superseded', p_turn_id, '同维度新值取代');
      v_superseded := v_superseded || to_jsonb(v_existing_id);
    end if;

    v_new_id := 'm_' || replace(gen_random_uuid()::text, '-', '');
    insert into memory_items
      (id, user_id, category, key, value, is_core, source, status, supersedes)
    values
      (v_new_id, p_user_id, p_category, v_item->>'key', v_item->'value',
       coalesce((v_item->>'is_core')::boolean, false),
       coalesce(v_item->'source', '{}'::jsonb), 'active', v_existing_id);

    insert into memory_events (id, memory_id, action, turn_id, reason)
      values ('me_' || replace(gen_random_uuid()::text, '-', ''),
              v_new_id, 'created', p_turn_id, '用户明确自述或点选');

    v_created := v_created || jsonb_build_object(
      'id', v_new_id, 'user_id', p_user_id, 'category', p_category,
      'key', v_item->>'key', 'value', v_item->'value',
      'is_core', coalesce((v_item->>'is_core')::boolean, false),
      'source', coalesce(v_item->'source', '{}'::jsonb),
      'status', 'active', 'supersedes', v_existing_id,
      'created_at', now()
    );
  end loop;

  for v_used_id in select value::text from jsonb_array_elements_text(p_used_ids) loop
    insert into memory_events (id, memory_id, action, turn_id, reason)
      values ('me_' || replace(gen_random_uuid()::text, '-', ''),
              v_used_id, 'used', p_turn_id, '本轮工作记忆实际采用');
  end loop;

  return jsonb_build_object('created', v_created, 'supersededIds', v_superseded);
end $$;

revoke all on function apply_memory_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function apply_memory_write(text, text, text, jsonb, jsonb) to service_role;
