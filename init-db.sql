-- 初始化：仅“任务 + 图片”，不含用户表
-- 适配你的现状：图片文件放对象存储（Blob/S3/OSS/R2），数据库只存 URL + 元数据

-- 扩展（Neon 支持）
create extension if not exists pgcrypto;  -- gen_random_uuid()

/* ===================== tasks：一次生成一个任务 ===================== */
create table if not exists tasks (
  id          text primary key,   -- 你的后端生成的 taskId（如 tsk_xxx）
  model       text not null,      -- 'jimeng-t2i' | 'jimeng-i2i' | 'gpt-image-1' ...
  prompt      text,
  params      jsonb,              -- size/guidance_scale/watermark/输入图数量等
  status      text not null check (status in ('queued','running','succeeded','failed')),
  seed        int,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tasks_created on tasks(created_at desc);
create index if not exists idx_tasks_status  on tasks(status);

/* ===================== images：一任务可多图 ===================== */
create table if not exists images (
  id           uuid primary key default gen_random_uuid(),
  task_id      text not null references tasks(id) on delete cascade,
  -- 你自己对象存储里的长期可访问地址（或私有桶的签名基准）
  url          text not null,
  storage_key  text,              -- 私有桶时保存对象 key（公共读可留空）
  format       text not null,     -- webp/png/jpg…
  width        int,
  height       int,
  bytes        int,
  sha256       text,              -- 去重/审计
  provider     text,              -- doubao/openai/…
  provider_url text,              -- 供应商临时链接（可空，会过期）
  response_id  text,              -- 供应商任务ID/trace
  expires_at   timestamptz,       -- TTL 到期清理（可选）
  pinned       boolean not null default false,
  status       text not null default 'active',  -- active/deleted
  created_at   timestamptz not null default now()
);
create index if not exists idx_images_task    on images(task_id);
create index if not exists idx_images_created on images(created_at desc);
create unique index if not exists idx_images_dedupe on images(sha256, bytes);

/* ================ 更新触发器：自动维护 updated_at ================= */
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated on tasks;
create trigger trg_tasks_updated
before update on tasks
for each row execute function set_updated_at();
