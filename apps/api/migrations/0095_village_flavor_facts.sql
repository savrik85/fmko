-- Reálné zajímavosti o obcích pro AI zpravodaje (z Wikipedie/oficiálních zdrojů).
-- AI reporter může v článcích přirozeně zmínit místní kolorit.

ALTER TABLE villages ADD COLUMN flavor_facts TEXT;
