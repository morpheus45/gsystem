-- Demande du 18/11/2026 : préconisations d'entretien par véhicule (vidange, distribution,
-- pneus, freins…) suivies au fil des km. Identité du véhicule pour retrouver les
-- préconisations du constructeur, et source de chaque règle (rien d'inventé).
alter table public.vehicules
  add column marque text not null default '',
  add column modele text not null default '',
  add column motorisation text not null default '',
  add column mise_en_circulation date;
alter table public.entretien_regles
  add column source text not null default '';   -- d'où vient la préconisation (constructeur, carnet, garage…)
