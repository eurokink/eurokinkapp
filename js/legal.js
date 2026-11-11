// EuroKink — textes d'information (versions provisoires, à faire relire avant le lancement public)

export const CONTACT_EMAIL = '';   // à renseigner quand l'adresse EuroKink sera créée
export const LEGAL_UPDATED = '11 novembre 2026';

const draft = '<p class="draft">Version provisoire, à faire relire avant le lancement public.</p>';
const contactLine = () => (CONTACT_EMAIL
  ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`
  : 'l’adresse de contact d’EuroKink (bientôt disponible dans Paramètres)');

export const PAGES = {
  cgu: {
    title: 'Conditions générales d’utilisation',
    html: () => `${draft}
      <h2>1. Objet</h2>
      <p>EuroKink est une application qui recense des soirées et événements fetish en France et en Europe, et aide ses utilisateurs à organiser leurs sorties. EuroKink n’organise aucune soirée.</p>
      <h2>2. Accès réservé aux adultes</h2>
      <p>L’application est réservée aux personnes âgées de 18 ans ou plus. En l’utilisant, tu confirmes avoir l’âge requis.</p>
      <h2>3. Informations sur les soirées</h2>
      <p>Les informations (dates, prix, dress code, conditions d’accès) sont fournies par les organisateurs ou collectées sur leurs sites publics, puis vérifiées par EuroKink. Elles peuvent évoluer : seules les informations de l’organisateur font foi. EuroKink ne vend pas de billets ; les liens de billetterie et d’hébergement mènent vers des services tiers soumis à leurs propres conditions.</p>
      <h2>4. Règles de la communauté</h2>
      <p>L’utilisation d’EuroKink implique le respect de la charte de la communauté. Tout manquement peut entraîner un avertissement, la suspension ou la suppression du compte.</p>
      <h2>5. Comptes</h2>
      <p>Quand la création de compte sera disponible, chaque membre restera responsable de la confidentialité de ses identifiants et des informations qu’il publie. Le compte peut être supprimé à tout moment depuis les paramètres.</p>
      <h2>6. Propriété intellectuelle</h2>
      <p>La marque, le logo et l’interface d’EuroKink sont protégés. Les visuels des soirées restent la propriété de leurs organisateurs.</p>
      <h2>7. Évolution des conditions</h2>
      <p>Ces conditions peuvent être modifiées ; la date de mise à jour figure en bas de page. Elles sont soumises au droit français.</p>
      <h2>8. Contact</h2>
      <p>Pour toute question : ${contactLine()}.</p>`
  },
  confidentialite: {
    title: 'Confidentialité',
    html: () => `${draft}
      <h2>Aujourd’hui (version de démonstration)</h2>
      <ul>
        <li>Aucun compte, aucun serveur : ton pseudo, ta ville, tes favoris, rappels, alertes et présences sont enregistrés <strong>uniquement sur ce téléphone</strong>.</li>
        <li>Aucun outil de statistiques, de publicité ou de suivi, et aucune police ou ressource chargée depuis un service tiers.</li>
        <li>La localisation sert seulement à vérifier ta présence à une soirée : elle n’est <strong>ni enregistrée, ni envoyée</strong>.</li>
        <li>Tu peux exporter ou effacer ces données à tout moment dans Paramètres.</li>
      </ul>
      <h2>Avec les comptes (prochaine version)</h2>
      <p>Utiliser EuroKink peut révéler l’orientation sexuelle de ses membres, une donnée sensible au sens de l’article 9 du RGPD. EuroKink s’engage à :</p>
      <ul>
        <li>demander ton <strong>consentement explicite</strong> avant toute création de compte ;</li>
        <li>héberger les données dans l’<strong>Union européenne</strong> ;</li>
        <li>collecter le minimum : adresse e-mail, pseudo, ville, préférences, favoris et sorties ; aucun nom réel obligatoire ;</li>
        <li>ne jamais vendre ni partager tes données à des fins publicitaires ;</li>
        <li>te laisser choisir qui voit tes sorties (tout le monde, les membres que tu suis, ou personne) ;</li>
        <li>supprimer définitivement ton compte et tes données sur simple demande depuis l’application.</li>
      </ul>
      <h2>Tes droits</h2>
      <p>Tu disposes d’un droit d’accès, de rectification, d’effacement, de portabilité et de retrait de ton consentement. Pour les exercer : ${contactLine()}. Tu peux aussi adresser une réclamation à la CNIL (cnil.fr).</p>`
  },
  charte: {
    title: 'Charte de la communauté',
    html: () => `<p class="lead">EuroKink, c’est la culture fetish et les sorties, dans le respect. Ce n’est pas une appli de plans.</p>
      <h2>Ce qu’on attend de chacun</h2>
      <ul>
        <li><strong>Respect et consentement</strong>, en ligne comme en soirée.</li>
        <li><strong>Pas de photo de nudité</strong> ni de contenu sexuellement explicite : une tenue fetish, oui ; un acte ou une nudité, non.</li>
        <li><strong>Pas de sollicitation sexuelle</strong> dans les profils, descriptions et messages.</li>
        <li><strong>Zéro tolérance</strong> pour le harcèlement, les discriminations et l’outing : ce qui se passe sur EuroKink reste sur EuroKink.</li>
        <li><strong>18 ans minimum.</strong></li>
      </ul>
      <h2>Les soirées acceptées</h2>
      <p>Cuir, rubber, sportswear, skin/lads, uniforme, military, workwear, sneaker, puffer/down, puppy, bondage, ABDL, motard, bears et multi-fetish. Les soirées dont le but affiché est uniquement sexuel ne sont pas référencées.</p>
      <h2>Signalement</h2>
      <p>Chaque soirée (et bientôt chaque profil) peut être signalée. Les signalements sont traités sous 24 h, avec des sanctions graduées : avertissement, suspension, exclusion.</p>`
  },
  mentions: {
    title: 'Mentions légales',
    html: () => `${draft}
      <h2>Éditeur</h2>
      <p>[À COMPLÉTER : nom ou raison sociale, statut, numéro SIRET, adresse.]</p>
      <h2>Directeur de la publication</h2>
      <p>[À COMPLÉTER]</p>
      <h2>Hébergement</h2>
      <p>Application hébergée par GitHub Pages (GitHub, Inc., San Francisco, États-Unis). Lors de l’ouverture des comptes, les données des membres seront hébergées dans l’Union européenne.</p>
      <h2>Propriété intellectuelle</h2>
      <p>© 2026 EuroKink™ · Tous droits réservés. Le nom, le logo et l’interface d’EuroKink ne peuvent être reproduits sans autorisation.</p>
      <h2>Contact</h2>
      <p>${contactLine()}.</p>`
  }
};
