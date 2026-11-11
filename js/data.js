// EuroKink — référentiels de l'appli : types de soirée, villes de référence, badges.
// Les soirées elles-mêmes viennent de la base Supabase.

export const EVENT_TYPES = [
  { slug: 'leather', name: 'Cuir' },
  { slug: 'rubber', name: 'Rubber' },
  { slug: 'sportswear', name: 'Sportswear' },
  { slug: 'skin-lads', name: 'Skin/Lads' },
  { slug: 'uniform', name: 'Uniforme' },
  { slug: 'military', name: 'Military' },
  { slug: 'workwear', name: 'Workwear' },
  { slug: 'sneaker', name: 'Sneaker' },
  { slug: 'puffer-down', name: 'Puffer/Down' },
  { slug: 'puppy', name: 'Puppy' },
  { slug: 'bondage', name: 'Bondage' },
  { slug: 'abdl', name: 'ABDL' },
  { slug: 'biker', name: 'Motard' },
  { slug: 'bears', name: 'Bears' },
  { slug: 'multi', name: 'Multi-fetish' }
];

export const CITIES = [
  { name: 'Angers', lat: 47.4784, lon: -0.5632 },
  { name: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  { name: 'Brest', lat: 48.3904, lon: -4.4861 },
  { name: 'Bruxelles', lat: 50.8503, lon: 4.3517, country: 'BE' },
  { name: 'Cholet', lat: 47.0600, lon: -0.8789 },
  { name: 'Grenoble', lat: 45.1885, lon: 5.7245 },
  { name: 'La Roche-sur-Yon', lat: 46.6705, lon: -1.4260 },
  { name: 'Le Mans', lat: 48.0061, lon: 0.1996 },
  { name: 'Lille', lat: 50.6292, lon: 3.0573 },
  { name: 'Lyon', lat: 45.7640, lon: 4.8357 },
  { name: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { name: 'Montpellier', lat: 43.6108, lon: 3.8767 },
  { name: 'Nantes', lat: 47.2184, lon: -1.5536 },
  { name: 'Nice', lat: 43.7102, lon: 7.2620 },
  { name: 'Niort', lat: 46.3237, lon: -0.4588 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Poitiers', lat: 46.5802, lon: 0.3404 },
  { name: 'Rennes', lat: 48.1173, lon: -1.6778 },
  { name: 'Rouen', lat: 49.4432, lon: 1.0999 },
  { name: 'Strasbourg', lat: 48.5734, lon: 7.7521 },
  { name: 'Toulouse', lat: 43.6047, lon: 1.4442 },
  { name: 'Tours', lat: 47.3941, lon: 0.6848 }
];

export const BADGES = [
  { code: 'first_steps', name: 'Premiers pas', goal: 1, description: 'Ta première soirée validée avec EuroKink.',
    icon: 'M4 22V4M4 4h12l-2 4 2 4H4' },
  { code: 'tour_de_france', name: 'Tour de France', goal: 5, description: 'Des soirées dans 5 villes françaises différentes.',
    icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM15 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0' },
  { code: 'globetrotter', name: 'Globe-trotter', goal: 3, description: 'Des soirées dans 3 pays européens.',
    icon: 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20' },
  { code: 'loyal', name: 'Fidèle', goal: 5, description: '5 soirées chez le même organisateur.',
    icon: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z' },
  { code: 'explorer', name: 'Explorateur', goal: 5, description: '5 types de soirée différents.',
    icon: 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z' },
  { code: 'pioneer', name: 'Pionnier', goal: 1, description: 'Parmi les 500 premiers membres d’EuroKink.',
    icon: 'M12 2l3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.2-6.2 3.2 1.2-6.9-5-4.8 6.9-1z' }
];
