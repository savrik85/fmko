-- Otevření okresů s kompletními místními daty (obce, příjmení, sponzoři, migrace 0227–0229).
-- Okres nemá zakladatele: první hráč, který se do něj zaregistruje, se jím stane.
INSERT INTO district_registrations (district, status, ready_at)
VALUES ('Strakonice', 'ready', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
       ('Písek', 'ready', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
       ('Český Krumlov', 'ready', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(district) DO UPDATE SET status = 'ready', ready_at = COALESCE(district_registrations.ready_at, excluded.ready_at);
