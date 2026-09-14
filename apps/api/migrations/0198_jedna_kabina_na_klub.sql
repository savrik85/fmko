-- Jedna Kabina na klub, ne sto sedmdesát
--
-- `initTeamConversations` se volá z několika míst (převzetí klubu, založení,
-- auto-init při prázdném seznamu) a žádné z nich nekontrolovalo, jestli
-- Kabina už existuje. Na produkci jich měl jeden klub 170, třináct klubů
-- mělo duplicity. Všechny jsou připnuté, takže v telefonu zaplácly celý
-- seznam a skutečné zprávy se propadly pod ně. Hráč pak nevidí, že mu
-- někdo psal.
--
-- Kód je opravený, tohle uklidí, co už vzniklo.
--
-- Postup: nechá se nejstarší Kabina (má nejdelší historii a na její id
-- ukazují nejstarší zprávy), zprávy z ostatních se na ni přepojí a prázdné
-- duplikáty se smažou. Nic se neztrácí.

-- 1. Zprávy z duplikátů přepojit na nejstarší Kabinu daného klubu.
UPDATE messages
   SET conversation_id = (
     SELECT MIN(k.id) FROM conversations k
      WHERE k.team_id = (SELECT c.team_id FROM conversations c WHERE c.id = messages.conversation_id)
        AND k.type = 'squad_group' AND k.title = 'Kabina'
   )
 WHERE conversation_id IN (
   SELECT c.id FROM conversations c
    WHERE c.type = 'squad_group' AND c.title = 'Kabina'
      AND c.id <> (SELECT MIN(k2.id) FROM conversations k2
                    WHERE k2.team_id = c.team_id AND k2.type = 'squad_group' AND k2.title = 'Kabina')
 );

-- 2. Duplicitní Kabiny smazat.
DELETE FROM conversations
 WHERE type = 'squad_group' AND title = 'Kabina'
   AND id <> (SELECT MIN(k.id) FROM conversations k
               WHERE k.team_id = conversations.team_id
                 AND k.type = 'squad_group' AND k.title = 'Kabina');

-- 3. Poslední zprávu u zbylé Kabiny srovnat podle toho, co v ní teď je.
UPDATE conversations
   SET last_message_at = COALESCE(
         (SELECT MAX(m.sent_at) FROM messages m WHERE m.conversation_id = conversations.id),
         last_message_at
       )
 WHERE type = 'squad_group' AND title = 'Kabina';
