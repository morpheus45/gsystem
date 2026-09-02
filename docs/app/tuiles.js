/*
 * G-Systems - Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 * Voir le fichier LICENSE a la racine du depot.
 */

// Les 14 tuiles de l'accueil, reprises une a une de ui/HomeScreen.kt : meme
// ordre, memes libelles, memes degrades. Le degrade de chaque tuile repart de
// la couleur de fin de la precedente (waterfall), comme sur Android.
export const GROUPES = [
  {
    "id": "SITE",
    "titre": "SUR SITE",
    "desc": "En arrivant chez le client",
    "barre": "#C026D3",
    "ic": "📍",
    "onglet": "Sur site"
  },
  {
    "id": "INTERV",
    "titre": "INTERVENTION",
    "desc": "Le cœur du chantier",
    "barre": "#7C3AED",
    "ic": "🔧",
    "onglet": "Intervention"
  },
  {
    "id": "FIN",
    "titre": "FIN DE CYCLE",
    "desc": "La paperasse mensuelle",
    "barre": "#22C55E",
    "ic": "📅",
    "onglet": "Fin de cycle"
  }
];

export const TUILES = [
  {
    "num": "01",
    "nom": "ARRIVÉE SUR SITE",
    "sous": "Note l'heure + appelle la techline",
    "ic": "📍",
    "debut": "#C026D3",
    "fin": "#3B0A3E",
    "groupe": "SITE",
    "ecran": "arrivee"
  },
  {
    "num": "02",
    "nom": "ATTENTE CLIENT",
    "sous": "Note l'arrivée · motif à la clôture",
    "ic": "⏱️",
    "debut": "#8A5CF6",
    "fin": "#6366F1",
    "groupe": "SITE",
    "ecran": "attente"
  },
  {
    "num": "03",
    "nom": "APPEL TECHLINE",
    "sous": "Appel direct de la techline",
    "ic": "📞",
    "debut": "#6366F1",
    "fin": "#7C3AED",
    "groupe": "SITE",
    "ecran": "techline"
  },
  {
    "num": "04",
    "nom": "PROBLÈME LOGISTIQUE",
    "sous": "Appel direct du service logistique",
    "ic": "🚚",
    "debut": "#7C3AED",
    "fin": "#5C5EF2",
    "groupe": "SITE",
    "ecran": "logistique"
  },
  {
    "num": "05",
    "nom": "COURRIER",
    "sous": "Viber « courrier ok »",
    "ic": "✉️",
    "debut": "#5C5EF2",
    "fin": "#3B82F6",
    "groupe": "SITE",
    "ecran": "courrier"
  },
  {
    "num": "06",
    "nom": "CLÔTURE",
    "sous": "Clôture d'intervention",
    "ic": "📋",
    "debut": "#7C3AED",
    "fin": "#1A0B36",
    "groupe": "INTERV",
    "ecran": "cloture"
  },
  {
    "num": "07",
    "nom": "PV CAMÉRAS",
    "sous": "Procès-verbal signé + envoi client",
    "ic": "📝",
    "debut": "#9168F0",
    "fin": "#8A5CF6",
    "groupe": "INTERV",
    "ecran": "pv"
  },
  {
    "num": "08",
    "nom": "BULLETIN INTER",
    "sous": "Intervention sur site · signé client",
    "ic": "🧾",
    "debut": "#8A5CF6",
    "fin": "#9168F0",
    "groupe": "INTERV",
    "ecran": "bulletin"
  },
  {
    "num": "09",
    "nom": "DEMANDE CAMÉRA",
    "sous": "Demande de rappel installation caméra(s)",
    "ic": "🎥",
    "debut": "#9168F0",
    "fin": "#8A5CF6",
    "groupe": "INTERV",
    "ecran": "demandecam"
  },
  {
    "num": "10",
    "nom": "DIAGNOSTIC SÉCURITÉ",
    "sous": "Fiche EPS · pro et particulier",
    "ic": "🛡️",
    "debut": "#8A5CF6",
    "fin": "#6366F1",
    "groupe": "INTERV",
    "ecran": "diagnostic"
  },
  {
    "num": "11",
    "nom": "RÉCAP",
    "sous": "Cumul du cycle · total euros",
    "ic": "📊",
    "debut": "#3B82F6",
    "fin": "#06B6D4",
    "groupe": "FIN",
    "ecran": "recap"
  },
  {
    "num": "12",
    "nom": "FRAIS",
    "sous": "Tickets du cycle",
    "ic": "🧾",
    "debut": "#06B6D4",
    "fin": "#14B8A6",
    "groupe": "FIN",
    "ecran": "frais"
  },
  {
    "num": "13",
    "nom": "ENVOI MENSUEL",
    "sous": "Excel + tickets + compteur",
    "ic": "📤",
    "debut": "#22C55E",
    "fin": "#15803D",
    "groupe": "FIN",
    "ecran": "envoi"
  },
  {
    "num": "14",
    "nom": "PRIME À VENIR",
    "sous": "Historique · versement à +2 mois",
    "ic": "💰",
    "debut": "#10B981",
    "fin": "#0A3025",
    "groupe": "FIN",
    "ecran": "prime"
  },
  {
    "num": "15",
    "nom": "DEMANDE DE CONGÉ",
    "sous": "Formulaire signé · envoi bureau",
    "ic": "🏖️",
    "debut": "#F59E0B",
    "fin": "#3A2606",
    "groupe": "FIN",
    "ecran": "conge"
  }
];
