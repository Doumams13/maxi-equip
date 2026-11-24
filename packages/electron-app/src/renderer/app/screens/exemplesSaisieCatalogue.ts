/**
 * Correction "les exemples des champs de saisie doivent s'adapter à la
 * catégorie et à la sous-catégorie choisies" (2026-11-23).
 *
 * Exemples (placeholders) du formulaire d'ajout de modèle/format, par nom
 * de sous-catégorie — couvre les sous-catégories prédéfinies du catalogue
 * quincaillerie (voir `CATEGORIES_QUINCAILLERIE_PREDEFINIES`, main/db/migrate.ts).
 * Purement indicatif : aucune valeur n'est jamais enregistrée à partir
 * d'ici. Une sous-catégorie créée par l'utilisateur (absente de la table)
 * retombe sur des exemples neutres, jamais sur des exemples carreau.
 */
export interface ExemplesSaisie {
  nom: string;
  type: string;
  marque: string;
  taille: string;
  reference: string;
}

/** [nom, type, marque, taille/libellé, référence] */
type Ligne = [string, string, string, string, string];

const PAR_SOUS_CATEGORIE: Record<string, Ligne> = {
  // Carrelage et revêtements (hors "Carreaux", voir EXEMPLES_CARREAU)
  "Revêtements muraux": ["Lambris PVC blanc", "PVC", "Grosfillex", "Lame 25 cm × 2,6 m", "LPV-2526"],
  "Colles et joints carrelage": ["Colle carrelage C2", "Colle", "Weber", "Sac 25 kg", "COL-C2-25"],
  "Plinthes et profilés": ["Plinthe grès 8 cm", "Plinthe", "Schlüter", "Barre 2,5 m", "PLI-08"],
  // Matériaux de construction
  Ciment: ["Ciment CPJ 45", "Portland", "Cimaf", "Sac 50 kg", "CIM-CPJ45"],
  "Sable et graviers": ["Sable de rivière", "Sable fin", "—", "Tonne", "SAB-FIN"],
  "Parpaings et briques": ["Parpaing creux", "Parpaing", "—", "15 × 20 × 40 cm", "PAR-15"],
  "Chaux et enduits": ["Chaux hydraulique", "Chaux", "Lafarge", "Sac 25 kg", "CHX-25"],
  "Fers à béton": ["Fer à béton HA", "Haute adhérence", "—", "Barre Ø10 × 12 m", "FER-HA10"],
  // Sanitaires et toilettes
  Toilettes: ["WC monobloc", "Sortie horizontale", "Jacob Delafon", "Pack complet", "WC-MB01"],
  Lavabos: ["Lavabo sur colonne", "Céramique", "Roca", "55 cm", "LAV-55"],
  Éviers: ["Évier inox 2 bacs", "Inox", "Franke", "120 × 50 cm", "EVI-2B120"],
  Douches: ["Receveur de douche", "Extra-plat", "Kinedo", "80 × 80 cm", "DOU-8080"],
  Accessoires: ["Porte-serviettes", "Inox", "Grohe", "60 cm", "ACC-PS60"],
  // Plomberie et évacuation
  Tuyaux: ["Tube PVC évacuation", "PVC", "Nicoll", "Ø110 × 4 m", "PVC-110"],
  Raccords: ["Coude PVC 45°", "PVC", "Nicoll", "Ø100", "COU-45-100"],
  "Colles et accessoires": ["Colle PVC", "Colle", "Tangit", "Pot 250 ml", "COL-PVC-250"],
  "Siphons et évacuations": ["Siphon de lavabo", "Siphon", "Wirquin", "Ø32", "SIP-32"],
  Robinetterie: ["Mitigeur lavabo", "Mitigeur", "Grohe", "Pièce", "MIT-LAV01"],
  "Réservoirs et citernes": ["Citerne polyéthylène", "Citerne", "Polytank", "1 000 L", "CIT-1000"],
  Pompes: ["Pompe de surface", "Électrique", "Pedrollo", "1 CV", "POM-1CV"],
  "Joints et étanchéité": ["Ruban téflon", "Téflon", "Geb", "Rouleau 12 m", "TEF-12"],
  // Électricité
  "Câbles et fils": ["Câble rigide H07V-U", "Rigide", "Nexans", "Rouleau 100 m", "H07-25"],
  "Prises et interrupteurs": ["Prise 2P+T", "Encastrée", "Legrand", "Pièce", "PRI-2PT"],
  "Disjoncteurs et tableaux": ["Disjoncteur 16 A", "Modulaire", "Schneider", "16 A", "DIS-16A"],
  "Goulottes et gaines": ["Gaine ICTA", "Gaine", "Courant", "Ø20 × 100 m", "ICTA-20"],
  Domotique: ["Interrupteur connecté", "Wi-Fi", "Legrand", "Pièce", "DOM-INT01"],
  // Éclairage
  "Ampoules et tubes": ["Ampoule LED", "E27", "Philips", "9 W", "LED-E27-9"],
  "Luminaires intérieurs": ["Plafonnier LED", "Plafonnier", "Philips", "24 W", "PLA-24"],
  "Projecteurs extérieurs": ["Projecteur LED", "IP65", "Ledvance", "50 W", "PRO-50"],
  "Rubans LED": ["Ruban LED blanc chaud", "12 V", "Ledvance", "Rouleau 5 m", "RUB-5M"],
  // Peinture et décoration
  Peintures: ["Peinture acrylique blanc mat", "Acrylique", "Seigneurie", "Seau 20 L", "PEI-ACR20"],
  "Enduits et sous-couches": ["Enduit de lissage", "Enduit", "Toupret", "Sac 15 kg", "END-15"],
  "Outils d'application": ["Rouleau anti-goutte", "Rouleau", "Nespoli", "180 mm", "ROU-180"],
  "Nuanciers et accessoires": ["Bâche de protection", "Polyéthylène", "—", "4 × 5 m", "BAC-45"],
  // Bois et menuiserie
  "Bois de charpente": ["Chevron sapin", "Sapin", "—", "63 × 75 mm × 4 m", "CHE-6375"],
  "Panneaux et contreplaqués": ["Contreplaqué okoumé", "Okoumé", "Rougier", "2,5 × 1,22 m × 15 mm", "CTP-15"],
  "Quincaillerie bois": ["Charnière acier", "Acier", "Hettich", "Lot de 2", "CHA-80"],
  "Moulures et baguettes": ["Baguette d'angle", "Pin", "—", "2,4 m", "BAG-24"],
  // Couverture et toiture
  Tuiles: ["Tuile romane", "Terre cuite", "Imerys", "Pièce", "TUI-ROM"],
  "Tôles et bacs acier": ["Tôle ondulée galvanisée", "Galvanisée", "—", "3 m × 0,35 mm", "TOL-3M"],
  "Gouttières et descentes": ["Gouttière PVC", "PVC", "Nicoll", "Ø25 × 4 m", "GOU-25"],
  "Accessoires de toiture": ["Faîtière", "Tôle", "—", "Pièce", "FAI-01"],
  // Visserie et fixation
  Vis: ["Vis à bois tête fraisée", "Acier zingué", "Spit", "Boîte de 200 (4 × 40)", "VIS-440"],
  "Boulons et écrous": ["Boulon tête hexagonale", "Acier", "—", "M10 × 50", "BOU-M10"],
  Chevilles: ["Cheville nylon", "Nylon", "Fischer", "Ø8 (boîte de 100)", "CHE-8"],
  Rivets: ["Rivet aveugle aluminium", "Aluminium", "Gesipa", "4 × 10 (boîte de 100)", "RIV-410"],
  "Colliers de serrage": ["Collier rilsan", "Nylon", "Legrand", "Sachet de 100", "COL-RIL"],
  // Outillage manuel
  "Outils de frappe": ["Marteau de coffreur", "Acier", "Stanley", "600 g", "MAR-600"],
  "Outils de serrage": ["Clé à molette", "Acier", "Facom", "250 mm", "CLE-250"],
  "Outils de coupe": ["Scie égoïne", "Acier", "Bahco", "550 mm", "SCI-550"],
  "Mesure et traçage": ["Mètre ruban", "Ruban", "Stanley", "5 m", "MET-5"],
  // Outillage électrique
  "Perceuses et visseuses": ["Perceuse à percussion", "Filaire", "Bosch", "750 W", "PER-750"],
  Meuleuses: ["Meuleuse d'angle", "Filaire", "Makita", "Ø125 mm", "MEU-125"],
  "Scies électriques": ["Scie circulaire", "Filaire", "DeWalt", "1 400 W", "SCI-1400"],
  "Accessoires et batteries": ["Batterie lithium", "18 V", "Makita", "5 Ah", "BAT-18-5"],
  // Accessoires de pose
  "Croisillons et cales": ["Croisillons", "Plastique", "Rubi", "3 mm (sachet de 200)", "CRO-3"],
  "Niveaux et équerres": ["Niveau à bulle", "Aluminium", "Stanley", "60 cm", "NIV-60"],
  "Spatules et taloches": ["Spatule crantée", "Inox", "Rubi", "Dents de 10 mm", "SPA-10"],
  "Mélangeurs et auges": ["Auge de maçon", "Plastique", "—", "40 L", "AUG-40"],
  // Étanchéité et isolation
  "Isolants thermiques": ["Laine de verre", "Rouleau", "Isover", "100 mm", "LDV-100"],
  "Membranes d'étanchéité": ["Membrane bitumineuse", "Bitume", "Siplast", "Rouleau 10 m²", "MEM-10"],
  "Mastics et silicones": ["Silicone sanitaire blanc", "Silicone", "Rubson", "Cartouche 280 ml", "SIL-280"],
  "Mousses expansives": ["Mousse expansive", "Polyuréthane", "Soudal", "Aérosol 750 ml", "MOU-750"],
  // Équipements de protection
  Casques: ["Casque de chantier", "ABS", "Delta Plus", "Taille unique", "CAS-01"],
  Gants: ["Gants de manutention", "Cuir", "Delta Plus", "Taille 9", "GAN-09"],
  "Chaussures de sécurité": ["Chaussures S3", "S3", "Parade", "Pointure 42", "CHA-S3-42"],
  "Lunettes et protections auditives": ["Lunettes de protection", "Polycarbonate", "3M", "Pièce", "LUN-01"],
  // Jardinage et espaces extérieurs
  Arrosage: ["Tuyau d'arrosage", "PVC", "Gardena", "Ø15 × 25 m", "TUY-25"],
  "Outillage de jardin": ["Pelle ronde", "Acier", "Fiskars", "Pièce", "PEL-01"],
  "Mobilier extérieur": ["Chaise de jardin", "Résine", "Allibert", "Pièce", "CHS-01"],
  "Brouettes et transport": ["Brouette de chantier", "Acier", "Haemmerlin", "100 L", "BRO-100"],
  // Portes et fenêtres
  "Portes intérieures": ["Porte isoplane", "Isoplane", "—", "83 × 204 cm", "POR-83"],
  "Portes extérieures": ["Porte d'entrée métallique", "Acier", "—", "90 × 215 cm", "PEX-90"],
  Fenêtres: ["Fenêtre aluminium coulissante", "Aluminium", "—", "120 × 100 cm", "FEN-120"],
  "Quincaillerie et poignées": ["Poignée de porte", "Inox", "Vachette", "Pièce", "POI-01"],
  // Chimie du bâtiment
  "Mortiers et colles": ["Mortier de réparation", "Mortier", "Sika", "Sac 25 kg", "MOR-25"],
  "Résines et silicones": ["Résine d'étanchéité", "Résine", "Sika", "Pot 5 kg", "RES-5"],
  "Produits de nettoyage": ["Nettoyant ciment", "Acide", "Rubson", "Bidon 1 L", "NET-1L"],
  "Adjuvants béton": ["Hydrofuge de masse", "Hydrofuge", "Sika", "Bidon 5 L", "ADJ-5L"],
  // Climatisation et ventilation
  Climatiseurs: ["Climatiseur split", "Inverter", "Samsung", "12 000 BTU", "CLI-12K"],
  Ventilateurs: ["Ventilateur sur pied", "Sur pied", "Binatone", "Ø40 cm", "VEN-40"],
  "Unités extérieures": ["Unité extérieure", "Inverter", "LG", "18 000 BTU", "UEX-18K"],
  "Accessoires d'installation": ["Support mural clim", "Acier", "—", "Paire", "SUP-01"],
  // Divers
  "Outillage divers": ["Cutter", "Lame sécable", "Stanley", "18 mm", "CUT-18"],
  "Bidons et contenants": ["Bidon plastique", "Plastique", "—", "20 L", "BID-20"],
  "Échelles et escabeaux": ["Escabeau aluminium", "Aluminium", "Hailo", "5 marches", "ESC-5"],
  "Accessoires divers": ["Cadenas", "Laiton", "Abus", "40 mm", "CAD-40"],
};

const EXEMPLES_CARREAU: ExemplesSaisie = {
  nom: "Ex. Marbre Blanc",
  type: "Ex. Grès cérame",
  marque: "Ex. Porcelanosa",
  taille: "",
  reference: "MB-6060",
};

const EXEMPLES_NEUTRES: ExemplesSaisie = {
  nom: "Ex. Nom du produit",
  type: "Ex. Gamme, matière…",
  marque: "Ex. Marque",
  taille: "Ex. Pièce, sac 25 kg, 2 m…",
  reference: "Ex. REF-001",
};

export function exemplesSaisie(sousCategorieNom: string | null | undefined, estCarreau: boolean): ExemplesSaisie {
  if (estCarreau) return EXEMPLES_CARREAU;
  const ligne = sousCategorieNom ? PAR_SOUS_CATEGORIE[sousCategorieNom] : undefined;
  if (!ligne) return EXEMPLES_NEUTRES;
  const [nom, type, marque, taille, reference] = ligne;
  return {
    nom: `Ex. ${nom}`,
    type: `Ex. ${type}`,
    marque: marque === "—" ? "Ex. Marque" : `Ex. ${marque}`,
    taille: `Ex. ${taille}`,
    reference: `Ex. ${reference}`,
  };
}
