-- Message de bienvenue : la messagerie sert à écrire à n'importe quel membre, pas seulement avant une soirée
do $$ declare d text; begin
  select pg_get_functiondef('public.welcome_text(text,text)'::regprocedure) into d;
  d := replace(d, 'messages to chat before the party.', 'messages to chat with any member, any time.');
  d := replace(d, 'la messagerie pour se parler avant la soirée.', 'la messagerie pour écrire à n’importe quel membre, quand tu veux.');
  d := replace(d, 'Nachrichten, um vor der Party zu schreiben.', 'Nachrichten, um jedem Mitglied zu schreiben, wann du willst.');
  execute d;
end $$;
