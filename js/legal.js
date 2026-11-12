// EuroKink — textes d'information (versions provisoires, à faire relire avant le lancement public)

export const CONTACT_EMAIL = 'contact@eurokink.eu';
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
      <h2>Tes données</h2>
      <p>Utiliser EuroKink peut révéler l’orientation sexuelle de ses membres, une donnée sensible au sens de l’article 9 du RGPD. C’est pourquoi :</p>
      <ul>
        <li>ton <strong>consentement explicite</strong> est demandé à l’inscription ;</li>
        <li>les données sont hébergées par Supabase à <strong>Paris</strong> (Union européenne) ;</li>
        <li>seules sont collectées ton adresse e-mail (jamais affichée), ton pseudo, ta ville, tes réglages, tes favoris, rappels, alertes, sorties et présences validées ; aucun nom réel n’est demandé ;</li>
        <li>tes données ne sont jamais vendues ni partagées à des fins publicitaires ;</li>
        <li>tu choisis qui voit tes sorties : tout le monde, les membres que tu suis, ou personne ;</li>
        <li>aucun outil de statistiques, de publicité ou de suivi ;</li>
        <li>quelques services techniques sont utilisés, uniquement pour faire fonctionner l’appli : Brevo pour les e-mails de compte, la Géoplateforme de l’IGN pour la recherche d’adresse (seul le texte tapé lui est envoyé), et le service de notification de ton téléphone (Apple, Google ou Mozilla), qui ne reçoit que des messages chiffrés ; les images de soirées ajoutées par lien sont affichées depuis le site d’origine ;</li>
        <li>tu peux exporter tes données et <strong>supprimer définitivement ton compte</strong> à tout moment depuis Paramètres.</li>
      </ul>
      <h2>Responsable du traitement</h2>
      <p>Le responsable du traitement est l’éditeur d’EuroKink (particulier, à titre non professionnel), joignable à ${contactLine()}. Tu peux aussi introduire une réclamation auprès de la CNIL (cnil.fr).</p>
      <h2>Localisation</h2>
      <p>La position GPS sert uniquement à vérifier ta présence à une soirée (« Je suis sur place »). Elle est utilisée pour ce calcul puis oubliée : elle n’est <strong>jamais enregistrée</strong>.</p>
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
    html: () => `
      <h2>Éditeur</h2>
      <p>EuroKink est édité par un particulier, à titre non professionnel et sans but lucratif. Conformément à l’article 1-1, II de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique (LCEN), l’éditeur a choisi de préserver son anonymat : ses éléments d’identification ont été communiqués à l’hébergeur, tenu au secret professionnel.</p>
      <p>Contact de l’éditeur et de la publication : ${contactLine()}.</p>
      <h2>Hébergeurs</h2>
      <p><strong>Application</strong> : GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>
      <p><strong>Comptes et données des membres</strong> : Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513. Les données sont stockées dans un centre de données situé à <strong>Paris</strong> (Union européenne).</p>
      <h2>Prestataires</h2>
      <p>E-mails de compte (confirmation, mot de passe) : Brevo (Sendinblue SAS, France). Recherche d’adresse : Géoplateforme de l’IGN (France). Notifications : services de notification d’Apple, Google ou Mozilla selon ton téléphone.</p>
      <h2>Propriété intellectuelle</h2>
      <p>© 2026 EuroKink™ · Tous droits réservés. Le nom, le logo et l’interface d’EuroKink ne peuvent être reproduits sans autorisation.</p>
      <h2>Contact</h2>
      <p>${contactLine()}.</p>`
  }
};
