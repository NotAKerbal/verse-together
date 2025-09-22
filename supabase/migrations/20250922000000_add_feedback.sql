-- Feedback table for collecting user suggestions and improvement ideas
-- Safe to run multiple times (IF NOT EXISTS guards are used where possible)

begin;

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  message text not null,
  contact text,
  path text,
  created_at timestamptz not null default now(),
  user_id uuid,

  constraint feedback_message_length check (char_length(message) between 5 and 2000),
  constraint feedback_contact_length check (contact is null or char_length(contact) <= 255),
  constraint feedback_path_length check (path is null or char_length(path) <= 2048)
);

-- Enable Row Level Security. With no policies, only the service role can access.
alter table public.feedback enable row level security;

-- Helpful index for reviewing newest feedback first
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx on public.feedback (user_id);

-- Documentation
comment on table public.feedback is 'User-submitted feedback and feature suggestions.';
comment on column public.feedback.message is 'Feedback body (5-2000 chars).';
comment on column public.feedback.contact is 'Optional contact info (email, social, etc.).';
comment on column public.feedback.path is 'Optional page path where the feedback was submitted.';
comment on column public.feedback.created_at is 'Timestamp when feedback was created.';
comment on column public.feedback.user_id is 'Auth user id of submitter (set by trigger).';

-- RLS policies
-- Allow authenticated users to insert feedback directly from the client if desired
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback'
      and policyname = 'Allow authenticated insert'
  ) then
    create policy "Allow authenticated insert"
      on public.feedback
      for insert
      to authenticated
      with check (auth.uid() is not null);
  end if;
end $$;

-- Ensure user_id is populated from auth.uid() when inserting from the client
create or replace function public.set_feedback_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_feedback_user_id on public.feedback;
create trigger set_feedback_user_id
before insert on public.feedback
for each row execute function public.set_feedback_user_id();

commit;


