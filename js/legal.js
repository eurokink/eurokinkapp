// EuroKink — textes d'information (FR = version de référence ; EN et DE = traductions)
import { LANG } from './i18n.js';

export const CONTACT_EMAIL = 'contact@eurokink.eu';
const UPDATED = { fr: 'Dernière mise à jour : 12 novembre 2026', en: 'Last updated: 12 November 2026', de: 'Zuletzt aktualisiert: 12. November 2026' };
export const LEGAL_UPDATED = UPDATED[LANG] || UPDATED.fr;

const draft = '<p class="draft">Version provisoire, à faire relire avant le lancement public.</p>';
const contactLine = () => (CONTACT_EMAIL
  ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`
  : 'l’adresse de contact d’EuroKink (bientôt disponible dans Paramètres)');

const FR = {
  cgu: {
    title: 'Conditions générales d’utilisation',
    html: () => `${draft}
      <h2>1. Objet</h2>
      <p>EuroKink est une application qui recense des soirées et événements fetish partout en Europe, et aide ses utilisateurs à organiser leurs sorties. EuroKink n’organise aucune soirée.</p>
      <h2>2. Accès réservé aux adultes</h2>
      <p>L’application est réservée aux personnes âgées de 18 ans ou plus. En l’utilisant, tu confirmes avoir l’âge requis.</p>
      <h2>3. Informations sur les soirées</h2>
      <p>Les informations (dates, prix, dress code, conditions d’accès) sont fournies par les organisateurs ou collectées sur leurs sites publics, puis vérifiées par EuroKink. Elles peuvent évoluer : seules les informations de l’organisateur font foi. EuroKink ne vend pas de billets ; les liens de billetterie et d’hébergement mènent vers des services tiers soumis à leurs propres conditions.</p>
      <h2>4. Règles de la communauté</h2>
      <p>L’utilisation d’EuroKink implique le respect de la charte de la communauté. Tout manquement peut entraîner un avertissement, la suspension ou la suppression du compte.</p>
      <h2>5. Comptes</h2>
      <p>Chaque membre est responsable de la confidentialité de ses identifiants et des informations qu’il publie. Le compte peut être supprimé à tout moment depuis les paramètres.</p>
      <h2>6. Traduction automatique</h2>
      <p>L’application est proposée en plusieurs langues. Les textes publiés par les membres et les organisateurs (descriptions de soirées, précisions de dress code, présentations) peuvent être traduits automatiquement dans la langue de chaque lecteur, par un service de traduction tiers. En publiant un texte, tu acceptes qu’il soit ainsi traduit et affiché. Une traduction automatique peut contenir des erreurs : seul le texte d’origine fait foi, et il reste consultable à tout moment en touchant le texte traduit (repère ⇄). Les titres de soirées et les noms des organisateurs ne sont pas traduits.</p>
      <h2>7. Propriété intellectuelle</h2>
      <p>La marque, le logo et l’interface d’EuroKink sont protégés. Les visuels des soirées restent la propriété de leurs organisateurs.</p>
      <h2>8. Évolution des conditions</h2>
      <p>Ces conditions peuvent être modifiées ; la date de mise à jour figure en bas de page. Elles sont soumises au droit français.</p>
      <h2>9. Contact</h2>
      <p>Pour toute question : ${contactLine()}.</p>`
  },
  confidentialite: {
    title: 'Confidentialité',
    html: () => `${draft}
      <h2>Tes données</h2>
      <p>Utiliser EuroKink peut révéler l’orientation sexuelle de ses membres, une donnée sensible au sens de l’article 9 du RGPD. C’est pourquoi :</p>
      <ul>
        <li>ton <strong>consentement explicite</strong> est demandé à l’inscription ;</li>
        <li>les données sont hébergées par Supabase à <strong>Paris</strong> (Union européenne), ce qui vaut aussi pour les membres des autres pays d’Europe : le Royaume-Uni et la Suisse, notamment, reconnaissent le niveau de protection de l’Union européenne ;</li>
        <li>seules sont collectées ton adresse e-mail (jamais affichée), ton pseudo, ta photo de profil si tu en ajoutes une, ta ville (commune et code postal, avec les coordonnées du centre de la commune), tes réglages, tes favoris, rappels, alertes, sorties et présences validées ; aucun nom réel n’est demandé ;</li>
        <li>ton pseudo, ta photo et ta ville sont visibles des membres connectés, notamment sur la carte de la communauté ; l’option « Profil invisible » des paramètres te retire de la carte à tout moment ;</li>
        <li>tes données ne sont jamais vendues ni partagées à des fins publicitaires ;</li>
        <li>tu choisis qui voit tes sorties : tout le monde, les membres que tu suis, ou personne ;</li>
        <li>tes messages privés sont conservés pour que tu retrouves tes conversations ; seuls toi et ton interlocuteur y avez accès, l’équipe EuroKink ne les consulte qu’en cas de signalement, et ils sont effacés avec ton compte ;</li>
        <li>aucun outil externe de statistiques, de publicité ou de suivi : l’équipe ne consulte que des chiffres globaux (nombre d’inscrits, de soirées, de messages…), calculés dans la base d’EuroKink ;</li>
        <li>quelques services techniques sont utilisés, uniquement pour faire fonctionner l’appli : Brevo pour les e-mails de compte, la Géoplateforme de l’IGN (France), swisstopo (Suisse) et Photon de Komoot, basé sur OpenStreetMap (autres pays d’Europe), pour la recherche d’adresse et de ville (seul le texte tapé leur est envoyé), MyMemory (Translated srl, Italie) pour traduire automatiquement les descriptions et présentations publiques (seul le texte publié lui est envoyé, sans ton identité), Have I Been Pwned pour vérifier qu’un nouveau mot de passe n’a pas fuité (seul un fragment de son empreinte chiffrée est envoyé, jamais le mot de passe), et le service de notification de ton téléphone (Apple, Google ou Mozilla), qui ne reçoit que des messages chiffrés ; les images de soirées ajoutées par lien sont affichées depuis le site d’origine ;</li>
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
        <li><strong>Messagerie</strong> : un refus ou une absence de réponse se respecte ; pas de relance insistante, pas de messages en masse ni de publicité. Tu peux bloquer ou signaler un membre à tout moment.</li>
        <li><strong>18 ans minimum.</strong></li>
      </ul>
      <h2>Les soirées acceptées</h2>
      <p>Cuir, rubber, sportswear, skin/lads, uniforme, military, workwear, sneaker, puffer/down, puppy, bondage, ABDL, motard, bears et multi-fetish. Les soirées dont le but affiché est uniquement sexuel ne sont pas référencées.</p>
      <h2>Signalement</h2>
      <p>Chaque soirée et chaque profil peuvent être signalés. Les signalements sont traités sous 24 h, avec des sanctions graduées : avertissement, suspension, exclusion.</p>`
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
      <p>E-mails de compte (confirmation, mot de passe) : Brevo (Sendinblue SAS, France). Recherche d’adresse : Géoplateforme de l’IGN (France) swisstopo, Office fédéral de topographie (Suisse) et Photon, Komoot GmbH, données OpenStreetMap (autres pays d’Europe). Contours de la carte : d’après thematicmapping.org, licence CC BY-SA 3.0. Traduction automatique des textes publiés : MyMemory, Translated srl (Italie). Vérification des mots de passe : Have I Been Pwned (k-anonymat, aucun mot de passe transmis). Notifications : services de notification d’Apple, Google ou Mozilla selon ton téléphone.</p>
      <h2>Propriété intellectuelle</h2>
      <p>© 2026 EuroKink™ · Tous droits réservés. Le nom, le logo et l’interface d’EuroKink ne peuvent être reproduits sans autorisation.</p>
      <h2>Contact</h2>
      <p>${contactLine()}.</p>`
  }
};

const draftEn = '<p class="draft">Provisional version, to be reviewed before the public launch. This is a translation for information: in case of discrepancy, the French version prevails.</p>';
const EN = {
  cgu: {
    title: 'Terms of use',
    html: () => `${draftEn}
      <h2>1. Purpose</h2>
      <p>EuroKink is an app that lists fetish parties and events all over Europe and helps its users plan their nights out. EuroKink does not organise any party.</p>
      <h2>2. Adults only</h2>
      <p>The app is restricted to people aged 18 or over. By using it, you confirm that you are of the required age.</p>
      <h2>3. Event information</h2>
      <p>Information (dates, prices, dress code, entry conditions) is provided by organisers or collected from their public websites, then checked by EuroKink. It may change: only the organiser’s information is authoritative. EuroKink does not sell tickets; ticketing and accommodation links lead to third-party services subject to their own terms.</p>
      <h2>4. Community rules</h2>
      <p>Using EuroKink means following the community guidelines. Any breach may lead to a warning, suspension or deletion of the account.</p>
      <h2>5. Accounts</h2>
      <p>Each member is responsible for keeping their login details confidential and for the information they publish. The account can be deleted at any time from the settings.</p>
      <h2>6. Automatic translation</h2>
      <p>The app is available in several languages. Texts published by members and organisers (event descriptions, dress code details, profiles) may be automatically translated into each reader’s language by a third-party translation service. By publishing a text, you accept that it is translated and displayed this way. An automatic translation may contain errors: only the original text is authoritative, and it can be viewed at any time by tapping the translated text (⇄ mark). Event titles and organiser names are not translated.</p>
      <h2>7. Intellectual property</h2>
      <p>The EuroKink brand, logo and interface are protected. Event visuals remain the property of their organisers.</p>
      <h2>8. Changes to these terms</h2>
      <p>These terms may be amended; the date of the last update is shown at the bottom of the page. They are governed by French law.</p>
      <h2>9. Contact</h2>
      <p>For any question: ${contactLine()}.</p>`
  },
  confidentialite: {
    title: 'Privacy',
    html: () => `${draftEn}
      <h2>Your data</h2>
      <p>Using EuroKink may reveal the sexual orientation of its members, which is sensitive data under Article 9 of the GDPR. That is why:</p>
      <ul>
        <li>your <strong>explicit consent</strong> is requested when you sign up;</li>
        <li>data is hosted by Supabase in <strong>Paris</strong> (European Union), which also applies to members from other European countries: the United Kingdom and Switzerland, in particular, recognise the European Union’s level of protection;</li>
        <li>we only collect your email address (never displayed), your username, your profile photo if you add one, your city (town and postcode, with the coordinates of the town centre), your settings, favourites, reminders, alerts, outings and validated check-ins; no real name is asked for;</li>
        <li>your username, photo and city are visible to logged-in members, in particular on the community map; the “Invisible profile” option in the settings removes you from the map at any time;</li>
        <li>your data is never sold or shared for advertising purposes;</li>
        <li>you choose who sees your outings: everyone, the members you follow, or nobody;</li>
        <li>your private messages are kept so you can find your conversations; only you and the other person can access them, the EuroKink team only looks at them when they are reported, and they are erased with your account;</li>
        <li>no external analytics, advertising or tracking tool: the team only looks at overall figures (number of members, events, messages…) calculated in EuroKink’s own database;</li>
        <li>a few technical services are used, only to run the app: Brevo for account emails; the IGN Géoplateforme (France), swisstopo (Switzerland) and Komoot’s Photon, based on OpenStreetMap (other European countries), for address and city search (only the text you type is sent to them); MyMemory (Translated srl, Italy) to automatically translate public descriptions and profiles (only the published text is sent, without your identity); Have I Been Pwned to check that a new password has not leaked (only a fragment of its encrypted fingerprint is sent, never the password); and your phone’s notification service (Apple, Google or Mozilla), which only receives encrypted messages; event images added by link are displayed from their original website;</li>
        <li>you can export your data and <strong>permanently delete your account</strong> at any time from Settings.</li>
      </ul>
      <h2>Data controller</h2>
      <p>The data controller is the publisher of EuroKink (a private individual, on a non-professional basis), who can be reached at ${contactLine()}. You can also lodge a complaint with the CNIL (cnil.fr) or with the data protection authority of your country.</p>
      <h2>Location</h2>
      <p>GPS location is only used to check your presence at a party (“I’m here”). It is used for this calculation and then forgotten: it is <strong>never stored</strong>.</p>
      <h2>Your rights</h2>
      <p>You have the right to access, rectify, erase and port your data, and to withdraw your consent. To exercise these rights: ${contactLine()}. You can also lodge a complaint with the CNIL (cnil.fr) or with the data protection authority of your country.</p>`
  },
  charte: {
    title: 'Community guidelines',
    html: () => `<p class="lead">EuroKink is about fetish culture and nights out, with respect. It is not a hook-up app.</p>
      <h2>What we expect from everyone</h2>
      <ul>
        <li><strong>Respect and consent</strong>, online as well as at parties.</li>
        <li><strong>No nude photos</strong> or sexually explicit content: fetish gear, yes; sexual acts or nudity, no.</li>
        <li><strong>No sexual solicitation</strong> in profiles, descriptions and messages.</li>
        <li><strong>Zero tolerance</strong> for harassment, discrimination and outing: what happens on EuroKink stays on EuroKink.</li>
        <li><strong>Messages</strong>: a refusal or no reply must be respected; no insistent follow-ups, no mass messages or advertising. You can block or report a member at any time.</li>
        <li><strong>18 years minimum.</strong></li>
      </ul>
      <h2>Accepted events</h2>
      <p>Leather, rubber, sportswear, skin/lads, uniform, military, workwear, sneaker, puffer/down, puppy, bondage, ABDL, biker, bears and multi-fetish. Events whose stated purpose is purely sexual are not listed.</p>
      <h2>Reporting</h2>
      <p>Every event and every profile can be reported. Reports are handled within 24 hours, with graduated sanctions: warning, suspension, exclusion.</p>`
  },
  mentions: {
    title: 'Legal notice',
    html: () => `<p class="draft">Translation for information: in case of discrepancy, the French version prevails.</p>
      <h2>Publisher</h2>
      <p>EuroKink is published by a private individual, on a non-professional and non-profit basis. In accordance with Article 1-1, II of French Law No. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN), the publisher has chosen to remain anonymous: their identification details have been provided to the hosting provider, which is bound by professional secrecy.</p>
      <p>Contact for the publisher and the publication: ${contactLine()}.</p>
      <h2>Hosting providers</h2>
      <p><strong>Application</strong>: GitHub, Inc. (GitHub Pages service), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, United States.</p>
      <p><strong>Member accounts and data</strong>: Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513. Data is stored in a data centre located in <strong>Paris</strong> (European Union).</p>
      <h2>Service providers</h2>
      <p>Account emails (confirmation, password): Brevo (Sendinblue SAS, France). Address search: IGN Géoplateforme (France), swisstopo, Federal Office of Topography (Switzerland) and Photon, Komoot GmbH, OpenStreetMap data (other European countries). Map outlines: based on thematicmapping.org, CC BY-SA 3.0 licence. Automatic translation of published texts: MyMemory, Translated srl (Italy). Password checks: Have I Been Pwned (k-anonymity, no password transmitted). Notifications: Apple, Google or Mozilla notification services depending on your phone.</p>
      <h2>Intellectual property</h2>
      <p>© 2026 EuroKink™ · All rights reserved. The EuroKink name, logo and interface may not be reproduced without permission.</p>
      <h2>Contact</h2>
      <p>${contactLine()}.</p>`
  }
};

const draftDe = '<p class="draft">Vorläufige Fassung, vor dem öffentlichen Start zu prüfen. Dies ist eine Übersetzung zur Information: Bei Abweichungen gilt die französische Fassung.</p>';
const DE = {
  cgu: {
    title: 'Nutzungsbedingungen',
    html: () => `${draftDe}
      <h2>1. Gegenstand</h2>
      <p>EuroKink ist eine App, die Fetisch-Partys und -Events in ganz Europa auflistet und ihren Nutzern hilft, ihre Abende zu planen. EuroKink veranstaltet selbst keine Partys.</p>
      <h2>2. Nur für Erwachsene</h2>
      <p>Die App ist Personen ab 18 Jahren vorbehalten. Mit der Nutzung bestätigst du, das erforderliche Alter zu haben.</p>
      <h2>3. Informationen zu den Events</h2>
      <p>Die Informationen (Daten, Preise, Dresscode, Einlassbedingungen) stammen von den Veranstaltern oder von deren öffentlichen Websites und werden von EuroKink geprüft. Sie können sich ändern: Maßgeblich sind allein die Angaben des Veranstalters. EuroKink verkauft keine Tickets; Links zu Ticket- und Unterkunftsangeboten führen zu Diensten Dritter mit eigenen Bedingungen.</p>
      <h2>4. Community-Regeln</h2>
      <p>Wer EuroKink nutzt, hält sich an die Community-Richtlinien. Verstöße können zu einer Verwarnung, Sperrung oder Löschung des Kontos führen.</p>
      <h2>5. Konten</h2>
      <p>Jedes Mitglied ist für die Vertraulichkeit seiner Zugangsdaten und für die von ihm veröffentlichten Inhalte verantwortlich. Das Konto kann jederzeit in den Einstellungen gelöscht werden.</p>
      <h2>6. Automatische Übersetzung</h2>
      <p>Die App ist in mehreren Sprachen verfügbar. Von Mitgliedern und Veranstaltern veröffentlichte Texte (Eventbeschreibungen, Angaben zum Dresscode, Profiltexte) können durch einen externen Übersetzungsdienst automatisch in die Sprache jedes Lesers übersetzt werden. Mit der Veröffentlichung eines Textes stimmst du dieser Übersetzung und Anzeige zu. Eine automatische Übersetzung kann Fehler enthalten: Maßgeblich ist allein der Originaltext, der jederzeit durch Antippen des übersetzten Textes (Zeichen ⇄) angezeigt werden kann. Eventtitel und Veranstalternamen werden nicht übersetzt.</p>
      <h2>7. Geistiges Eigentum</h2>
      <p>Marke, Logo und Oberfläche von EuroKink sind geschützt. Die Bilder der Events bleiben Eigentum ihrer Veranstalter.</p>
      <h2>8. Änderungen der Bedingungen</h2>
      <p>Diese Bedingungen können geändert werden; das Datum der letzten Aktualisierung steht unten auf der Seite. Es gilt französisches Recht.</p>
      <h2>9. Kontakt</h2>
      <p>Bei Fragen: ${contactLine()}.</p>`
  },
  confidentialite: {
    title: 'Datenschutz',
    html: () => `${draftDe}
      <h2>Deine Daten</h2>
      <p>Die Nutzung von EuroKink kann die sexuelle Orientierung der Mitglieder offenbaren, ein besonders schützenswertes Datum im Sinne von Artikel 9 DSGVO. Deshalb:</p>
      <ul>
        <li>wird bei der Registrierung deine <strong>ausdrückliche Einwilligung</strong> eingeholt;</li>
        <li>werden die Daten von Supabase in <strong>Paris</strong> (Europäische Union) gespeichert, auch für Mitglieder aus anderen europäischen Ländern: Insbesondere das Vereinigte Königreich und die Schweiz erkennen das Schutzniveau der Europäischen Union an;</li>
        <li>erheben wir nur deine E-Mail-Adresse (nie angezeigt), deinen Nutzernamen, dein Profilfoto, falls du eines hinzufügst, deine Stadt (Gemeinde und Postleitzahl, mit den Koordinaten des Ortszentrums), deine Einstellungen, Favoriten, Erinnerungen, Hinweise, Ausgehpläne und bestätigten Check-ins; ein echter Name wird nicht verlangt;</li>
        <li>sind dein Nutzername, dein Foto und deine Stadt für angemeldete Mitglieder sichtbar, insbesondere auf der Community-Karte; mit der Option „Unsichtbares Profil“ in den Einstellungen verschwindest du jederzeit von der Karte;</li>
        <li>werden deine Daten nie verkauft oder zu Werbezwecken weitergegeben;</li>
        <li>entscheidest du, wer deine Ausgehpläne sieht: alle, die Mitglieder, denen du folgst, oder niemand;</li>
        <li>werden deine privaten Nachrichten gespeichert, damit du deine Unterhaltungen wiederfindest; nur du und dein Gegenüber haben Zugriff darauf, das EuroKink-Team sieht sie nur bei einer Meldung ein, und sie werden mit deinem Konto gelöscht;</li>
        <li>gibt es keine externen Analyse-, Werbe- oder Tracking-Tools: Das Team sieht nur Gesamtzahlen (Anzahl der Mitglieder, Events, Nachrichten …), die in der eigenen Datenbank von EuroKink berechnet werden;</li>
        <li>werden einige technische Dienste ausschließlich für den Betrieb der App genutzt: Brevo für Konto-E-Mails; die Géoplateforme des IGN (Frankreich), swisstopo (Schweiz) und Photon von Komoot auf Basis von OpenStreetMap (übrige europäische Länder) für die Adress- und Ortssuche (es wird nur der eingegebene Text übermittelt); MyMemory (Translated srl, Italien) für die automatische Übersetzung öffentlicher Beschreibungen und Profiltexte (es wird nur der veröffentlichte Text übermittelt, ohne deine Identität); Have I Been Pwned, um zu prüfen, ob ein neues Passwort bereits geleakt wurde (es wird nur ein Teil seines verschlüsselten Fingerabdrucks übermittelt, nie das Passwort); sowie der Benachrichtigungsdienst deines Telefons (Apple, Google oder Mozilla), der nur verschlüsselte Nachrichten erhält; per Link hinzugefügte Eventbilder werden von der Ursprungswebsite angezeigt;</li>
        <li>kannst du deine Daten jederzeit in den Einstellungen exportieren und <strong>dein Konto endgültig löschen</strong>.</li>
      </ul>
      <h2>Verantwortlicher</h2>
      <p>Verantwortlich für die Verarbeitung ist der Herausgeber von EuroKink (eine Privatperson, nicht gewerblich), erreichbar unter ${contactLine()}. Du kannst dich auch bei der CNIL (cnil.fr) oder bei der Datenschutzbehörde deines Landes beschweren.</p>
      <h2>Standort</h2>
      <p>Der GPS-Standort dient nur dazu, deine Anwesenheit bei einer Party zu bestätigen („Ich bin vor Ort“). Er wird für diese Berechnung verwendet und danach verworfen: Er wird <strong>nie gespeichert</strong>.</p>
      <h2>Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit sowie auf Widerruf deiner Einwilligung. Zur Ausübung: ${contactLine()}. Du kannst dich auch bei der CNIL (cnil.fr) oder bei der Datenschutzbehörde deines Landes beschweren.</p>`
  },
  charte: {
    title: 'Community-Richtlinien',
    html: () => `<p class="lead">Bei EuroKink geht es um Fetischkultur und Ausgehen, mit Respekt. Es ist keine Dating- oder Sex-App.</p>
      <h2>Was wir von allen erwarten</h2>
      <ul>
        <li><strong>Respekt und Einvernehmen</strong>, online wie auf Partys.</li>
        <li><strong>Keine Nacktfotos</strong> und keine sexuell expliziten Inhalte: Fetisch-Outfit ja, sexuelle Handlungen oder Nacktheit nein.</li>
        <li><strong>Keine sexuellen Anfragen</strong> in Profilen, Beschreibungen und Nachrichten.</li>
        <li><strong>Null Toleranz</strong> für Belästigung, Diskriminierung und Outing: Was auf EuroKink passiert, bleibt auf EuroKink.</li>
        <li><strong>Nachrichten</strong>: Eine Absage oder ausbleibende Antwort wird respektiert; kein hartnäckiges Nachhaken, keine Massennachrichten und keine Werbung. Du kannst ein Mitglied jederzeit blockieren oder melden.</li>
        <li><strong>Mindestens 18 Jahre.</strong></li>
      </ul>
      <h2>Zugelassene Events</h2>
      <p>Leder, Rubber, Sportswear, Skin/Lads, Uniform, Military, Workwear, Sneaker, Puffer/Down, Puppy, Bondage, ABDL, Biker, Bears und Multi-Fetisch. Events, deren erklärter Zweck ausschließlich sexuell ist, werden nicht aufgenommen.</p>
      <h2>Meldungen</h2>
      <p>Jedes Event und jedes Profil kann gemeldet werden. Meldungen werden innerhalb von 24 Stunden bearbeitet, mit abgestuften Maßnahmen: Verwarnung, Sperrung, Ausschluss.</p>`
  },
  mentions: {
    title: 'Impressum',
    html: () => `<p class="draft">Übersetzung zur Information: Bei Abweichungen gilt die französische Fassung.</p>
      <h2>Herausgeber</h2>
      <p>EuroKink wird von einer Privatperson nicht gewerblich und ohne Gewinnerzielungsabsicht herausgegeben. Gemäß Artikel 1-1, II des französischen Gesetzes Nr. 2004-575 vom 21. Juni 2004 über das Vertrauen in die digitale Wirtschaft (LCEN) hat der Herausgeber entschieden, anonym zu bleiben: Seine Identifikationsdaten wurden dem Hosting-Anbieter mitgeteilt, der zur beruflichen Verschwiegenheit verpflichtet ist.</p>
      <p>Kontakt zum Herausgeber und zur Veröffentlichung: ${contactLine()}.</p>
      <h2>Hosting-Anbieter</h2>
      <p><strong>Anwendung</strong>: GitHub, Inc. (Dienst GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA.</p>
      <p><strong>Mitgliederkonten und -daten</strong>: Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapur 049513. Die Daten werden in einem Rechenzentrum in <strong>Paris</strong> (Europäische Union) gespeichert.</p>
      <h2>Dienstleister</h2>
      <p>Konto-E-Mails (Bestätigung, Passwort): Brevo (Sendinblue SAS, Frankreich). Adresssuche: Géoplateforme des IGN (Frankreich), swisstopo, Bundesamt für Landestopografie (Schweiz) und Photon, Komoot GmbH, OpenStreetMap-Daten (übrige europäische Länder). Kartenumrisse: nach thematicmapping.org, Lizenz CC BY-SA 3.0. Automatische Übersetzung veröffentlichter Texte: MyMemory, Translated srl (Italien). Passwortprüfung: Have I Been Pwned (k-Anonymität, kein Passwort übermittelt). Benachrichtigungen: Benachrichtigungsdienste von Apple, Google oder Mozilla je nach Telefon.</p>
      <h2>Geistiges Eigentum</h2>
      <p>© 2026 EuroKink™ · Alle Rechte vorbehalten. Name, Logo und Oberfläche von EuroKink dürfen nicht ohne Genehmigung vervielfältigt werden.</p>
      <h2>Kontakt</h2>
      <p>${contactLine()}.</p>`
  }
};

export const PAGES = { fr: FR, en: EN, de: DE }[LANG] || FR;
