-- Kabina po úklidu zmizela z telefonu
--
-- Migrace 0198 nechala u každého klubu NEJSTARŠÍ Kabinu, protože na její id
-- ukazují nejstarší zprávy. Jenže ta původní vzniká s prázdným
-- `last_message_text` a seznam konverzací takové řádky odfiltrovává
-- (`.filter(row => row.last_message_text && length > 0)`), aby se do telefonu
-- nedostaly rozdělané konverzace bez jediné zprávy.
--
-- Důsledek: Kabina má osmnáct zpráv, ale v telefonu není vidět vůbec.
-- Deset klubů na produkci.
--
-- Doplní se text i čas poslední skutečné zprávy v té konverzaci.

UPDATE conversations
   SET last_message_text = COALESCE(
         (SELECT m.body FROM messages m
           WHERE m.conversation_id = conversations.id
           ORDER BY m.sent_at DESC LIMIT 1),
         last_message_text
       ),
       last_message_at = COALESCE(
         (SELECT MAX(m.sent_at) FROM messages m WHERE m.conversation_id = conversations.id),
         last_message_at
       )
 WHERE title = 'Kabina'
   AND (last_message_text IS NULL OR last_message_text = '')
   AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id);
