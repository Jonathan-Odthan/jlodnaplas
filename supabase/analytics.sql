-- JLODNA Plas — Analytics (à exécuter dans Supabase > SQL Editor). Rejouable.
create table if not exists public.analytics_events(
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  type text not null, sid text not null, path text not null,
  ref_host text, src text not null default 'direct', channel text not null default 'direct',
  utm_medium text, utm_campaign text, utm_content text, utm_term text,
  device text, os text, browser text, access text,
  product_id text, order_id text);
create index if not exists ae_ts on public.analytics_events(ts);
create index if not exists ae_sid on public.analytics_events(sid, ts);
create index if not exists ae_type on public.analytics_events(type, ts);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;

-- ADAPTER si besoin : qui est administrateur ? (table admin_roles : colonne user_id OU email)
create or replace function public.analytics_is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_roles r
    where to_jsonb(r)->>'user_id' = auth.uid()::text
       or lower(to_jsonb(r)->>'email') = lower(coalesce(auth.jwt()->>'email','')));
$$;
drop policy if exists ae_admin_read on public.analytics_events;
create policy ae_admin_read on public.analytics_events for select to authenticated using (public.analytics_is_admin());
grant select on public.analytics_events to authenticated;

-- Ingestion publique : validation + anti-abus (60 évènements/min/session). Aucun montant n'est accepté du navigateur.
create or replace function public.track_event(p_type text,p_sid text,p_path text,p_ref text default null,p_utm jsonb default '{}',
  p_device text default null,p_os text default null,p_browser text default null,p_access text default null,
  p_product text default null,p_order text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_src text; v_ch text; v_ref text:=lower(left(coalesce(p_ref,''),100)); v_path text; v_med text:=lower(left(coalesce(p_utm->>'medium',''),50));
begin
  if p_type not in ('page_view','session_start','product_view','search','add_to_cart','remove_from_cart','begin_checkout','purchase') then return; end if;
  if p_sid !~ '^[a-z0-9]{8,40}$' then return; end if;
  if (select count(*) from analytics_events where sid=p_sid and ts>now()-interval '1 minute')>=60 then return; end if;
  v_path:=left(split_part(split_part(coalesce(p_path,'/'),'?',1),'#',1),200); if v_path='' then v_path:='/'; end if;
  v_src:=lower(nullif(left(coalesce(p_utm->>'source',''),50),''));
  if v_src is null then
    v_src:=case when v_ref='' then 'direct'
      when v_ref ~ 'google\.' then 'google' when v_ref ~ 'bing\.' then 'bing' when v_ref ~ 'yahoo\.' then 'yahoo' when v_ref ~ 'duckduckgo\.' then 'duckduckgo'
      when v_ref ~ '(facebook|fb\.com|fb\.me)' then 'facebook' when v_ref ~ 'instagram' then 'instagram' when v_ref ~ 'tiktok' then 'tiktok'
      when v_ref ~ '(youtube|youtu\.be)' then 'youtube' when v_ref ~ 'pinterest|pin\.it' then 'pinterest' when v_ref ~ 'whatsapp|wa\.me' then 'whatsapp'
      else v_ref end;
  end if;
  v_ch:=case when v_med='email' then 'email' when v_med in ('cpc','ppc','paid','paidsocial') then 'ads'
    when v_src in ('google','bing','yahoo','duckduckgo') and v_med in ('','organic') then 'search'
    when v_src in ('facebook','instagram','tiktok','youtube','pinterest','whatsapp') or v_med in ('social','messaging') then 'social'
    when v_src='direct' then 'direct' when v_ref<>'' then 'referral' else 'direct' end;
  insert into analytics_events(type,sid,path,ref_host,src,channel,utm_medium,utm_campaign,utm_content,utm_term,device,os,browser,access,product_id,order_id)
  values(p_type,p_sid,v_path,nullif(v_ref,''),v_src,v_ch,nullif(v_med,''),left(p_utm->>'campaign',80),left(p_utm->>'content',80),left(p_utm->>'term',80),
    left(p_device,20),left(p_os,20),left(p_browser,20),left(p_access,20),left(p_product,64),left(p_order,64));
end $$;
grant execute on function public.track_event to anon, authenticated;

-- Rapport admin (revenus = commandes RÉELLES de la table orders, jamais le navigateur).
-- ADAPTER : noms de colonnes orders (total / statut) et statuts exclus ci-dessous.
create or replace function public.analytics_report(p_from timestamptz,p_to timestamptz,p_src text default null,p_dev text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
  if not analytics_is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  with e as (select * from analytics_events where ts>=p_from and ts<p_to and (p_src is null or src=p_src) and (p_dev is null or device=p_dev)),
  vo as (select distinct on (e.order_id) e.order_id,e.sid,
      coalesce((to_jsonb(o)->>'total'),(to_jsonb(o)->>'total_amount'),(to_jsonb(o)->>'grand_total'))::numeric as amount
    from e join public.orders o on o.id::text=e.order_id
    where e.type='purchase' and lower(coalesce(to_jsonb(o)->>'status','')) not in ('cancelled','canceled','annule','annulée','test','fraud')),
  s as (select sid,min(ts) t0,max(ts) t1,count(*) filter(where type='page_view') pv,count(*) n,
      bool_or(type='product_view') pvw,bool_or(type='add_to_cart') atc,bool_or(type='begin_checkout') bc,
      (array_agg(src order by ts))[1] src,(array_agg(channel order by ts))[1] ch,(array_agg(device order by ts))[1] dev,
      (array_agg(os order by ts))[1] os,(array_agg(browser order by ts))[1] br,(array_agg(path order by ts))[1] landing from e group by sid),
  so as (select s.*,exists(select 1 from vo where vo.sid=s.sid) ord,coalesce((select sum(amount) from vo where vo.sid=s.sid),0) rev from s)
  select jsonb_build_object(
   'kpi',(select jsonb_build_object('sessions',count(*),'page_views',coalesce(sum(pv),0),'avg_sec',coalesce(round(avg(extract(epoch from t1-t0))),0),
      'pages_per_session',coalesce(round(avg(pv),2),0),'bounce',coalesce(round(100.0*count(*) filter(where n=1)/nullif(count(*),0),1),0),
      'product_views',(select count(*) from e where type='product_view'),'add_to_cart',(select count(*) from e where type='add_to_cart'),
      'checkouts',(select count(*) from e where type='begin_checkout'),'orders',(select count(*) from vo),'revenue',coalesce((select sum(amount) from vo),0),
      'active_5min',(select count(distinct sid) from analytics_events where ts>now()-interval '5 minutes')) from so),
   'funnel',(select jsonb_build_array(count(*),count(*) filter(where pvw),count(*) filter(where atc),count(*) filter(where bc),count(*) filter(where ord)) from so),
   'sources',(select coalesce(jsonb_agg(x order by (x->>'sessions')::int desc),'[]') from (select jsonb_build_object('src',src,'channel',max(ch),'sessions',count(*),
      'atc',count(*) filter(where atc),'checkouts',count(*) filter(where bc),'orders',count(*) filter(where ord),'revenue',sum(rev)) x from so group by src) q),
   'devices',(select coalesce(jsonb_agg(x order by (x->>'sessions')::int desc),'[]') from (select jsonb_build_object('device',coalesce(dev,'inconnu'),'os',coalesce(os,'inconnu'),'browser',coalesce(br,'inconnu'),'sessions',count(*)) x from so group by dev,os,br) q),
   'campaigns',(select coalesce(jsonb_agg(x order by (x->>'sessions')::int desc),'[]') from (select jsonb_build_object('campaign',c.utm_campaign,'src',c.src,'medium',c.utm_medium,'sessions',count(distinct c.sid),
      'orders',count(distinct vo.order_id),'revenue',coalesce(sum(vo.amount),0)) x from (select distinct on (sid) * from e where utm_campaign is not null order by sid,ts) c left join vo on vo.sid=c.sid group by c.utm_campaign,c.src,c.utm_medium limit 100) q),
   'pages',(select coalesce(jsonb_agg(x order by (x->>'views')::int desc),'[]') from (select jsonb_build_object('path',path,'views',count(*),'sessions',count(distinct sid)) x from e where type='page_view' group by path order by count(*) desc limit 50) q),
   'products',(select coalesce(jsonb_agg(x order by (x->>'views')::int desc),'[]') from (select jsonb_build_object('product_id',e.product_id,'name',(select to_jsonb(p)->>'name' from public.products p where p.id::text=e.product_id limit 1),
      'views',count(*) filter(where type='product_view'),'adds',count(*) filter(where type='add_to_cart')) x from e where product_id is not null group by e.product_id order by count(*) desc limit 50) q),
   'recent',(select coalesce(jsonb_agg(jsonb_build_object('ts',ts,'type',type,'path',path,'src',src,'device',device)),'[]') from (select * from e order by ts desc limit 30) q)
  ) into r;
  return r;
end $$;
grant execute on function public.analytics_report to authenticated;

-- Rétention / suppression (admin) : select analytics_purge(180);
create or replace function public.analytics_purge(p_days int default 180) returns bigint
language plpgsql security definer set search_path=public as $$
declare n bigint; begin
  if not analytics_is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  delete from analytics_events where ts<now()-make_interval(days=>p_days); get diagnostics n=row_count; return n; end $$;
grant execute on function public.analytics_purge to authenticated;
