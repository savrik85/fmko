-- 0251_tournament_edition_1.sql: 1. ročník Turnaje P-Mobile (konec sezóny 2).
-- Uzávěrka po 12. 10. 2026 ve 20:00 pražského času (CEST = UTC+2), start st 14. 10.
-- Odměny: 5 000 Kč za bod v ligové fázi, prémie za umístění v play-off.
INSERT OR IGNORE INTO tournaments (
  id, edition, name, sponsor, city, venue_name, status,
  registration_deadline, starts_on,
  point_reward, prize_quarterfinal, prize_semifinal, prize_finalist, prize_winner
) VALUES (
  'p-mobile-1', 1, 'Turnaj P-Mobile', 'P-Mobile', 'Tábor', 'Areál P-Mobile', 'registration',
  '2026-10-12T18:00:00.000Z', '2026-10-14',
  5000, 20000, 40000, 75000, 150000
);
