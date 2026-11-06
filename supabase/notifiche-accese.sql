-- Capodanno - RIACCENDE le notifiche push spente con notifiche-spente.sql.
insert into push_subscriptions select * from push_subscriptions_pausa on conflict do nothing;
delete from push_subscriptions_pausa;
select count(*) as iscritti_attivi from push_subscriptions;
