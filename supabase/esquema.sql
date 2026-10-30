-- Solo guarda coordenadas de puntos (sin video ni imagen) y códigos de
-- señantes (S01, V01…), nunca nombres.

-- ---------- 1. Administradores ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;   -- sin políticas: no se lee por la API

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- 2. Tablas ----------
create table if not exists public.senantes (
  codigo          text primary key check (char_length(codigo) <= 40),
  origen          text not null default 'camara' check (origen in ('camara', 'video')),
  consentimiento  boolean not null default false,        -- marcar true cuando exista el consentimiento firmado
  nota            text,
  creado          timestamptz not null default now()
);

create table if not exists public.datasets (
  id           uuid primary key default gen_random_uuid(),
  archivo      text not null unique,                      -- ruta dentro del bucket «datasets»
  n_muestras   int  not null check (n_muestras > 0),
  creado       timestamptz not null default now(),
  subido_por   uuid references auth.users(id) on delete set null
);

create table if not exists public.dataset_fuentes (      -- qué señantes/videos aparecen en cada dataset
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  senante     text not null references public.senantes(codigo) on delete restrict,
  primary key (dataset_id, senante)
);

create table if not exists public.modelos (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique,
  n_senas       int  not null,
  acierto       numeric(5,4),                             -- acierto global en validación (0 a 1)
  etiquetas     text[] not null,
  activo        boolean not null default false,
  creado        timestamptz not null default now(),
  publicado_por uuid references auth.users(id) on delete set null
);
create unique index if not exists un_solo_modelo_activo on public.modelos (activo) where activo;

-- ---------- 3. Seguridad por filas (RLS): solo administradores ----------
alter table public.senantes        enable row level security;
alter table public.datasets        enable row level security;
alter table public.dataset_fuentes enable row level security;
alter table public.modelos         enable row level security;

create policy "admins senantes"        on public.senantes        for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admins datasets"        on public.datasets        for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admins dataset_fuentes" on public.dataset_fuentes for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admins modelos"         on public.modelos         for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- 4. Almacenamiento ----------
--  datasets → privado (solo administradores)
--  modelo   → público de lectura (el sitio de usuarios descarga el modelo sin iniciar sesión)
insert into storage.buckets (id, name, public) values ('datasets', 'datasets', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('modelo',   'modelo',   true)  on conflict (id) do nothing;

create policy "admins datasets (archivos)" on storage.objects for all to authenticated
  using (bucket_id = 'datasets' and public.es_admin()) with check (bucket_id = 'datasets' and public.es_admin());
create policy "admins modelo (archivos)" on storage.objects for all to authenticated
  using (bucket_id = 'modelo' and public.es_admin()) with check (bucket_id = 'modelo' and public.es_admin());

-- ---------- 5. Primer administrador ----------
-- 1) Crea el usuario en Authentication → Users → Add user (correo + contraseña).
-- 2) Reemplaza el correo y ejecuta:
--    insert into public.admins (user_id) select id from auth.users where email = 'tu-correo@ejemplo.com';
