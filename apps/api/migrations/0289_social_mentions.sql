-- Socky: označení klubu v příspěvku a komentáři (@FK Engel Vimperk).
-- JSON pole [{"teamId": "...", "name": "..."}]; jméno je to, jak stálo v textu
-- v době psaní, aby se zvýraznění nerozbilo po přejmenování klubu.
ALTER TABLE social_posts ADD COLUMN mentions TEXT;
ALTER TABLE social_comments ADD COLUMN mentions TEXT;
