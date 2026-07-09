-- Rozšíření okresového komentáře: víc pražských + nově prachatické řádky.

INSERT INTO commentary_templates (event_type, template, tags, district) VALUES
  ('goal', 'GÓÓÓL! {player} to poslal do sítě rychlejš než áčko metra na Můstku! {crowd_reaction}', '[]', 'Praha'),
  ('goal', '{player} skóruje! Na Žižkově cinkají sklenice od Vietnamce až po hospodu na rohu.', '[]', 'Praha'),
  ('goal', '{player} otevírá skóre na {score} — radost jak když v Karlíně otevřou další kavárnu.', '[]', 'Praha'),
  ('chance', '{player} pálí vysoko nad — balon skončil někde na náplavce mezi koly a stánkem s vínem.', '[]', 'Praha'),
  ('chance', '{player} sám před gólmanem a netrefí! Tohle by neprošlo ani na pohovoru do korpa.', '[]', 'Praha'),
  ('foul', '{player} skosil soupeře jak koloběžka turistu na Smíchově. Rozhodčí píská faul.', '[]', 'Praha'),
  ('card', 'Žlutá pro {player}a — zapsaná rychleji než lajk pod story z nedělního brunche.', '[]', 'Praha'),
  ('card', 'ČERVENÁ pro {player}a! Kráčí do kabin smutnější než pondělní ranní tramvaj. {crowd_reaction}', '[]', 'Praha'),
  ('special', '{player} si drží míč u lajny, klídek jak barista při ranní špičce na Andělu.', '["possession"]', 'Praha'),
  ('special', '{team} rozehrávají trpělivě, tempo jak fronta na flat white v Karlíně.', '["possession"]', 'Praha'),
  ('goal', 'GÓÓÓL! {player} napálil balon, až se to rozlehlo od Boubína po Volary! {crowd_reaction}', '[]', 'Prachatice'),
  ('goal', '{player} skóruje! Dechovka spustila fanfáru a hospodský narazil soudek na počest.', '[]', 'Prachatice'),
  ('goal', '{player} zvyšuje na {score} — radost jak plný košík hřibů na Zlaté stezce.', '[]', 'Prachatice'),
  ('goal', '{player} to tam dotlačil jak traktor kládu z lesa. Krása to nebyla, ale gól platí.', '[]', 'Prachatice'),
  ('chance', '{player} pálí vedle — balon letí až k Vimperku, snad ho najdou houbaři.', '[]', 'Prachatice'),
  ('chance', '{player} sám před gólmanem a mine! Na zabijačce by neuťal ani jitrnici.', '[]', 'Prachatice'),
  ('foul', '{player} sekl soupeře jak myslivec, co si spletl srnce s divočákem. Rozhodčí píská.', '[]', 'Prachatice'),
  ('card', 'Žlutá pro {player}a — přísnější než pořadatel na pouti v Netolicích.', '[]', 'Prachatice'),
  ('special', '{player} si vodí míč po křídle, klid jak kráva na louce nad Husincem.', '["possession"]', 'Prachatice'),
  ('special', 'Od plotu hlásí důchodci: ''Za nás se hrálo líp, a to jsme chodili přes Boubín pěšky!''', '[]', 'Prachatice');

INSERT INTO crowd_reactions (text, district) VALUES
  ('Barista z kavárny naproti vyběhl s hrnkem v ruce a zapomněl dopěnit mléko.', 'Praha'),
  ('Partička z korpa na teambuildingu skanduje s craft pivem v ruce.', 'Praha'),
  ('Z náplavky doléhá potlesk i cinkání skleniček od stánku s vínem.', 'Praha'),
  ('Kluk na koloběžce zabrzdil tak prudce, že mu spadl telefon do trávy.', 'Praha'),
  ('Ze Žižkova se ozvalo takové haló, že se rozštěkali psi až na Vinohradech.', 'Praha'),
  ('U výčepu vyskočili od stolu a rozlili dvě čerstvě natočené desítky.', 'Praha'),
  ('Z hospody u hřiště zaburácela dechovka, až se roztřásla okna.', 'Prachatice'),
  ('Myslivec u plotu radostí vystřelil do vzduchu. Prý omylem.', 'Prachatice'),
  ('Důchodci na lavičce odložili termosku s čajem a spustili potlesk.', 'Prachatice'),
  ('Traktorista zastavil na polní cestě za brankou a zatroubil klaksonem.', 'Prachatice'),
  ('Hospodský vynesl tác piv a rozdával je zdarma na počest gólu.', 'Prachatice'),
  ('Kráva na sousední pastvině zabučela, jako by taky fandila.', 'Prachatice');
