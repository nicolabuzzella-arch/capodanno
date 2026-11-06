-- Capodanno - SPEGNE tutte le notifiche push per tutti, subito.
-- Gli iscritti vengono messi da parte (tabella push_subscriptions_pausa), non cancellati:
-- per riaccendere usa notifiche-accese.sql. Si può rieseguire senza problemi.
create table if not exists push_subscriptions_pausa (like push_subscriptions including all);
alter table push_subscriptions_pausa enable row level security;   -- nessuno la legge dall'app
insert into push_subscriptions_pausa select * from push_subscriptions on conflict do nothing;
delete from push_subscriptions;
-- Controllo: deve dare 0
select count(*) as iscritti_attivi from push_subscriptions;
