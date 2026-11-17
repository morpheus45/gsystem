-- Demande du 18/11/2026 : chaque société a son nom, son adresse et son logo, affichés
-- dans l'en-tête (« Back-office <société> »). Modifiables par l'admin de la société
-- (politique societes_modifier déjà en place) et par le super admin.
-- Le logo est une petite image (réduite par la page) gardée dans la ligne : PNG, JPEG ou
-- WebP seulement ; pas de SVG, qui peut contenir du code.
alter table public.societes
  add column adresse text not null default '',
  add column logo text check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(logo) <= 300000)),
  add constraint nom_non_vide check (btrim(nom) <> '');
