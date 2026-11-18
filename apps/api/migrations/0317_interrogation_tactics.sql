-- Taktiky výslechu (2026-11-18, incidents/interrogation-tactics.ts): které postupy trenér na hráče
-- u incidentu už zkusil (blaf s důkazem, slib mírnějšího trestu, policie, úplatek). JSON pole.
-- Každá taktika dá hráči, který zapírá nebo kryje, jednu novou šanci se přiznat nebo prozradit.
ALTER TABLE club_incident_knowledge ADD COLUMN tactics TEXT;
