-- ============================================================
-- Anima — schema Supabase
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query
-- ============================================================

-- Table des profils (une ligne par utilisateur, liée à auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  age int,
  bio text,
  tags text[] default '{}',
  emoji text default '✨',
  is_premium boolean default false,
  verified boolean default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "profils visibles par les utilisateurs connectés"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "un utilisateur peut créer son propre profil"
  on profiles for insert
  with check (auth.uid() = id);

create policy "un utilisateur peut modifier son propre profil"
  on profiles for update
  using (auth.uid() = id);

-- Table des likes/passes ("swipes")
create table if not exists swipes (
  id bigint generated always as identity primary key,
  swiper_id uuid references auth.users on delete cascade not null,
  target_id uuid references auth.users on delete cascade not null,
  liked boolean not null,
  created_at timestamptz default now(),
  unique (swiper_id, target_id)
);

alter table swipes enable row level security;

create policy "voir les swipes qui nous concernent"
  on swipes for select
  using (auth.uid() = swiper_id or auth.uid() = target_id);

create policy "créer ses propres swipes"
  on swipes for insert
  with check (auth.uid() = swiper_id);

-- Table des messages
create table if not exists messages (
  id bigint generated always as identity primary key,
  sender_id uuid references auth.users on delete cascade not null,
  receiver_id uuid references auth.users on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

alter table messages enable row level security;

create policy "voir ses propres conversations"
  on messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "envoyer un message"
  on messages for insert
  with check (auth.uid() = sender_id);

-- Active le temps réel sur les messages (pour le chat live)
alter publication supabase_realtime add table messages;
