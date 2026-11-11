// EuroKink — données de démonstration (étape 1, avant Supabase).
// Les soirées, lieux et organisateurs ci-dessous sont fictifs.
// Les dates sont calculées par rapport à aujourd'hui pour rester à jour.

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

const ORGANIZERS = {
  rubberOuest: { name: 'Rubber Ouest', kind: 'Association', verified: true },
  leatherAnjou: { name: 'Leather Club Anjou', kind: 'Association', verified: true },
  sportsRennes: { name: 'Gear & Sneakers Rennes', kind: 'Groupe', verified: false },
  brunchs: { name: 'Les Brunchs Kinky', kind: 'Groupe', verified: false },
  pups: { name: 'Pups de l’Ouest', kind: 'Association', verified: true },
  uniformTours: { name: 'Uniform Club Tours', kind: 'Club', verified: true },
  workwear: { name: 'Workwear Mauges', kind: 'Groupe', verified: false },
  skinNantes: { name: 'Skin Nantes', kind: 'Groupe', verified: false },
  cordes: { name: 'Atelier Cordes Nantes', kind: 'Association', verified: true },
  sneakerBdx: { name: 'Sneaker Crew Bordeaux', kind: 'Groupe', verified: false },
  pufferParis: { name: 'Puffer Paris', kind: 'Groupe', verified: false },
  bearsParis: { name: 'Bears in Leather Paris', kind: 'Association', verified: true },
  bikers: { name: 'Bikers Sarthe', kind: 'Association', verified: false },
  abdlLyon: { name: 'Little Space Lyon', kind: 'Association', verified: false },
  leatherBxl: { name: 'Brussels Leather Night', kind: 'Club', verified: true }
};

// Prochain jour de la semaine (0 = dimanche … 6 = samedi), décalé de n semaines
function nextDay(dow, weeks, time, hours) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const diff = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff + weeks * 7);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  const end = new Date(d.getTime() + hours * 3600 * 1000);
  return { startsAt: d.toISOString(), endsAt: end.toISOString() };
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

const SAT = 6, FRI = 5, SUN = 0, THU = 4;

export const EVENTS = [
  {
    id: 'black-rubber-night', title: 'Black Rubber Night', org: 'rubberOuest',
    venue: { name: 'L’Entrepôt', city: 'Nantes', lat: 47.2131, lon: -1.5498 },
    ...nextDay(SAT, 0, '23:00', 6), types: ['rubber'],
    dressCode: 'required', dressCodeDetails: 'Rubber ou latex intégral, ou au minimum un haut rubber.',
    price: 15, presalePrice: 12, booking: 'recommended', ticketUrl: 'https://example.com/billetterie',
    hasCloakroom: true, cloakroomPaid: false, frequency: 'monthly', languages: ['Français', 'Anglais'],
    attendees: 38, featured: true,
    description: 'La soirée rubber mensuelle de l’Ouest : DJ, dark room et vestiaire gratuit pour se changer sur place. Dress code contrôlé à l’entrée.'
  },
  {
    id: 'leather-social-club', title: 'Leather Social Club', org: 'leatherAnjou',
    venue: { name: 'Le Comptoir', city: 'Angers', lat: 47.4740, lon: -0.5540 },
    ...nextDay(FRI, 0, '20:00', 4), types: ['leather'],
    dressCode: 'recommended', dressCodeDetails: 'Cuir conseillé, tenue de ville acceptée.',
    price: 0, booking: 'door_only', hasCloakroom: false, frequency: 'weekly', languages: ['Français'],
    attendees: 22,
    description: 'Apéro cuir convivial chaque vendredi, idéal pour rencontrer la communauté autour d’un verre.'
  },
  {
    id: 'sportswear-night', title: 'Sportswear Night', org: 'sportsRennes',
    venue: { name: 'Le Vestiaire', city: 'Rennes', lat: 48.1110, lon: -1.6800 },
    ...nextDay(SAT, 0, '23:30', 5), types: ['sportswear', 'sneaker'],
    dressCode: 'required', dressCodeDetails: 'Survêtement, short, maillot, baskets.',
    price: 10, booking: 'door_only', hasCloakroom: true, cloakroomPaid: true, frequency: 'monthly', languages: ['Français'],
    attendees: 41,
    description: 'Soirée sportswear et sneakers. Vestiaire à 2 € sur place.'
  },
  {
    id: 'fetish-brunch', title: 'Fetish Brunch', org: 'brunchs',
    venue: { name: 'La Cantine Noire', city: 'Nantes', lat: 47.2160, lon: -1.5590 },
    ...nextDay(SUN, 0, '12:00', 4), types: ['multi'],
    dressCode: 'recommended', dressCodeDetails: 'Tenue fetish de ton choix.',
    price: 18, booking: 'required', ticketUrl: 'https://example.com/brunch',
    hasCloakroom: false, frequency: 'monthly', languages: ['Français'],
    attendees: 30,
    description: 'Brunch salé et sucré dans une ambiance fetish détendue. Places limitées, réservation obligatoire.'
  },
  {
    id: 'pup-social', title: 'Pup Social', org: 'pups',
    venue: { name: 'Le Bar du Port', city: 'Angers', lat: 47.4800, lon: -0.5600 },
    ...nextDay(SAT, 1, '15:00', 4), types: ['puppy'],
    dressCode: 'recommended', dressCodeDetails: 'Hood et gear puppy bienvenus.',
    price: 5, booking: 'door_only', hasCloakroom: true, cloakroomPaid: false, frequency: 'monthly', languages: ['Français'],
    attendees: 17,
    description: 'Après-midi pup et handlers : jeux, discussions et goûter.'
  },
  {
    id: 'uniform-party', title: 'Uniform Party', org: 'uniformTours',
    venue: { name: 'Le Bunker', city: 'Tours', lat: 47.3920, lon: 0.6880 },
    ...nextDay(SAT, 1, '23:00', 6), types: ['uniform', 'military'],
    dressCode: 'required', dressCodeDetails: 'Uniformes, militaire, police, pompier.',
    price: 12, booking: 'door_only', hasCloakroom: true, cloakroomPaid: false, frequency: 'monthly', languages: ['Français'],
    attendees: 26,
    description: 'La soirée uniforme de Tours. Dress code strict.'
  },
  {
    id: 'workwear-bar', title: 'Workwear Bar', org: 'workwear',
    venue: { name: 'L’Atelier', city: 'Cholet', lat: 47.0590, lon: -0.8800 },
    ...nextDay(FRI, 1, '21:00', 4), types: ['workwear'],
    dressCode: 'recommended', dressCodeDetails: 'Bleu de travail, chaussures de sécu, gilet.',
    price: 0, booking: 'door_only', hasCloakroom: false, frequency: 'monthly', languages: ['Français'],
    attendees: 12,
    description: 'Petit apéro workwear entre passionnés.'
  },
  {
    id: 'skin-lads-night', title: 'Skin & Lads Night', org: 'skinNantes',
    venue: { name: 'Le Sous-Sol', city: 'Nantes', lat: 47.2100, lon: -1.5560 },
    ...nextDay(FRI, 2, '23:00', 5), types: ['skin-lads'],
    dressCode: 'required', dressCodeDetails: 'Bombers, jean, rangers, polo.',
    price: 8, booking: 'door_only', hasCloakroom: true, cloakroomPaid: true, frequency: 'monthly', languages: ['Français'],
    attendees: 19,
    description: 'Soirée skin et lads, ambiance bar.'
  },
  {
    id: 'ropes-bondage-workshop', title: 'Ropes & Bondage Workshop', org: 'cordes',
    venue: { name: 'Studio Nœud', city: 'Nantes', lat: 47.2230, lon: -1.5450 },
    ...nextDay(SAT, 2, '14:00', 4), types: ['bondage'],
    dressCode: 'free', dressCodeDetails: 'Tenue confortable.',
    price: 20, booking: 'required', ticketUrl: 'https://example.com/atelier',
    hasCloakroom: true, cloakroomPaid: false, frequency: 'monthly', languages: ['Français'],
    attendees: 10,
    description: 'Atelier d’initiation aux cordes et au bondage, en petit groupe et encadré.'
  },
  {
    id: 'sneaker-session', title: 'Sneaker Session', org: 'sneakerBdx',
    venue: { name: 'Le Hangar 14', city: 'Bordeaux', lat: 44.8500, lon: -0.5700 },
    ...nextDay(THU, 1, '21:00', 4), types: ['sneaker'],
    dressCode: 'recommended', dressCodeDetails: 'Viens avec tes plus belles paires.',
    price: 6, booking: 'door_only', hasCloakroom: false, frequency: 'monthly', languages: ['Français'],
    attendees: 24,
    description: 'Afterwork sneakers à Bordeaux.'
  },
  {
    id: 'puffer-down-night', title: 'Puffer & Down Night', org: 'pufferParis',
    venue: { name: 'Le Duvet', city: 'Paris', lat: 48.8640, lon: 2.3600 },
    ...nextDay(SAT, 2, '23:00', 6), types: ['puffer-down'],
    dressCode: 'required', dressCodeDetails: 'Doudounes, puffer, nylon.',
    price: 12, booking: 'recommended', ticketUrl: 'https://example.com/puffer',
    hasCloakroom: true, cloakroomPaid: true, frequency: 'yearly', languages: ['Français', 'Anglais'],
    attendees: 57,
    description: 'La soirée puffer de l’hiver à Paris.'
  },
  {
    id: 'bears-leather-tea-dance', title: 'Bears Leather Tea Dance', org: 'bearsParis',
    venue: { name: 'La Tanière', city: 'Paris', lat: 48.8590, lon: 2.3550 },
    ...nextDay(SUN, 1, '17:00', 5), types: ['bears', 'leather'],
    dressCode: 'recommended', dressCodeDetails: 'Cuir conseillé.',
    price: 10, booking: 'door_only', hasCloakroom: true, cloakroomPaid: false, frequency: 'monthly', languages: ['Français', 'Anglais'],
    attendees: 64,
    description: 'Tea dance du dimanche pour les bears et leurs amis.'
  },
  {
    id: 'black-leather-ball', title: 'Black Leather Ball', org: 'leatherAnjou',
    venue: { name: 'Le Grand Salon', city: 'Nantes', lat: 47.2150, lon: -1.5520 },
    ...nextDay(SAT, 3, '22:00', 7), types: ['leather'],
    dressCode: 'required', dressCodeDetails: 'Cuir intégral exigé.',
    price: 45, presalePrice: 38, booking: 'required', ticketUrl: 'https://example.com/ball',
    salesOpenAt: inDays(4), hasCloakroom: true, cloakroomPaid: false, frequency: 'yearly', languages: ['Français', 'Anglais'],
    attendees: 112,
    description: 'Le grand bal cuir annuel de l’Ouest. Billetterie ouverte dans quelques jours : active l’alerte pour ne pas la rater.'
  },
  {
    id: 'biker-night', title: 'Biker Night', org: 'bikers',
    venue: { name: 'Le Garage', city: 'Le Mans', lat: 48.0050, lon: 0.1980 },
    ...nextDay(SAT, 3, '22:00', 5), types: ['biker', 'leather'],
    dressCode: 'required', dressCodeDetails: 'Cuir moto, bottes, gants.',
    price: 8, booking: 'door_only', hasCloakroom: true, cloakroomPaid: false, frequency: 'monthly', languages: ['Français'],
    attendees: 21,
    description: 'Soirée motards et cuir moto.'
  },
  {
    id: 'abdl-social', title: 'ABDL Social', org: 'abdlLyon',
    venue: { name: 'Le Petit Salon', city: 'Lyon', lat: 45.7600, lon: 4.8400 },
    ...nextDay(SAT, 2, '15:00', 4), types: ['abdl'],
    dressCode: 'free', dressCodeDetails: 'Tenue libre.',
    price: 5, booking: 'required', ticketUrl: 'https://example.com/abdl',
    hasCloakroom: false, frequency: 'monthly', languages: ['Français'],
    attendees: 9,
    description: 'Rencontre ABDL bienveillante, en après-midi.'
  },
  {
    id: 'leather-night-bruxelles', title: 'Leather Night', org: 'leatherBxl',
    venue: { name: 'Le Cellier', city: 'Bruxelles', country: 'BE', lat: 50.8460, lon: 4.3520 },
    ...nextDay(SAT, 3, '23:00', 6), types: ['leather', 'rubber'],
    dressCode: 'required', dressCodeDetails: 'Cuir ou rubber.',
    price: 15, booking: 'recommended', ticketUrl: 'https://example.com/bxl',
    hasCloakroom: true, cloakroomPaid: true, frequency: 'monthly', languages: ['Français', 'Néerlandais', 'Anglais'],
    attendees: 73,
    description: 'La soirée cuir et rubber de Bruxelles.'
  },
  {
    id: 'rubber-weekend-ouest', title: 'Rubber Weekend Ouest (pass)', org: 'rubberOuest',
    venue: { name: 'Le Domaine', city: 'Angers', lat: 47.4700, lon: -0.5500 },
    ...nextDay(FRI, 4, '20:00', 52), types: ['rubber'],
    dressCode: 'required', dressCodeDetails: 'Rubber sur toutes les soirées.',
    price: 75, booking: 'required', ticketUrl: 'https://example.com/weekend',
    salesOpenAt: inDays(-10), hasCloakroom: true, cloakroomPaid: false, frequency: 'yearly', languages: ['Français', 'Anglais'],
    attendees: 88, soldOut: true,
    description: 'Trois jours rubber : soirées, brunch et sortie en groupe. Pass complet pour l’instant, active l’alerte pour être prévenu si des places se libèrent.'
  }
].map((e) => ({ ...e, organizer: ORGANIZERS[e.org], country: e.venue.country || 'FR' }));

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
