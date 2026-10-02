# Minesweeper Arcade Club

Retro Minesweeper na hrvatskom, Angular 21.2.24 (LTS), NestJS 11.2.7, Node 22.22.3 i PostgreSQL 17.6. Jedan javni HTTP ulaz: `web:80`. Nginx interno prosljeđuje `/api` na `api:3000`, ponovno razrješava Docker DNS i poslužuje sve fontove lokalno. Nema vanjskih API-ja, uploadova, workera ni rasporeda.

## Igra i bodovanje

- Početnik: 9 × 9 / 10 mina; znalac: 16 × 16 / 40 mina; ekspert: 30 × 16 / 99 mina.
- Prvi potez i njegovi susjedi su sigurni. Prazna polja se automatski otvaraju. Klik na otvoreni broj otvara susjede kad broj zastavica odgovara broju mina; pogrešne zastavice mogu uzrokovati poraz.
- Klasična ljestvica uspoređuje **najkraće vrijeme pobjede**, zasebno po težini. Vrijeme je pohranjeno u milisekundama; sučelje ljestvice prikazuje desetinke. Izjednačenja rješava ranije spremanje, zatim ID.
- Dodatni arcade bodovi: `max(1, početni_bodovi − 10 × floor(vrijeme_ms / 1000))`. Početni bodovi su 10.000 / 25.000 / 50.000. Ovo je bonus ove aplikacije, ne univerzalno pravilo klasičnog Minesweepera.
- Samo pobjede mogu se spremiti, s tri javna inicijala A–Z ili 0–9. Svaka partija ima najviše jedan rezultat. Klijent ne može zadavati bodove ni vrijeme.
- Mine, potezi i sat provjeravaju se na API-ju. Zaključavanje retka i revizije štite od istodobnih i ponovljenih poteza. Nema tvrdnje o zaštiti od automatiziranih rješavača.
- Igra se nastavlja iz iste kartice nakon osvježavanja. Sat ne pauzira, uključujući prekid veze i otvorene upute. Partije starije od 24 sata postupno se brišu u normalnom tijeku zahtjeva, po najviše 100 redaka; spremljeni rezultati ostaju.
- Kontrole: klik/dodir otvara, desni klik ili duži dodir postavlja zastavicu. Način „Označi” pomaže na mobitelu. Tipkovnica: strelice, Enter/razmak, F. Zvuk je opcionalan i zadano isključen. Kod većih ploča koristi se vodoravno pomicanje umjesto premalenih polja.

## VPS Admin deployment

1. Uvezi ovaj repozitorij i odaberi korijenski `vps-admin.yaml`.
2. Postavi **`POSTGRES_PASSWORD`** na jedinstvenu jaku lozinku kao runtime secret. To je jedini obavezni unos. Ne kodirati lozinku: API koristi zasebne PostgreSQL parametre, ne sastavlja URL. Ne koristiti testnu lozinku iz primjera provjere.
3. Ostavi PostgreSQL korisnika i bazu `app`; Compose zadane vrijednosti `POSTGRES_USER` i `POSTGRES_DB` moraju ostati `app` da odgovaraju manifestu.
4. Izgradi `web` i `api`, pokreni `database` i izvrši deklariranu migraciju `api: ["node", "migrate.cjs"]`. API pri pokretanju također izvršava isti idempotentni migrator, radi pouzdanog običnog Compose pokretanja.
5. Pokreni sve servise i pričekaj healthy stanje. Spoji instalacijsku poddomenu na `web:80`; TLS i javno usmjeravanje prepušteni su VPS Adminu. URL prefiksi nisu podržani.

`compose.yaml` nema host portove, mreže, labele ni host mountove. Podaci su u project-scoped volumeu `database-data`. VPS Admin backup/restore pokriva PostgreSQL. Ne koristiti `down -v` za instalaciju s korisničkim podacima. Lozinke se ne šalju u build args ni browser.

API radi kao korisnik `node`, s V8 heap limitom 384 MB i najviše 8 DB konekcija. PostgreSQL koristi 128 MB shared buffers i najviše 40 konekcija. Nginx ima 2 workera. Arhitektura je namijenjena ograničenju po servisu od 768 MB, 2 CPU i 256 PID; konačan kapacitet ovisi o prometu. API rate limit je lokalni procesu; iza jedne dodatne VPS proxy razine korisnici mogu dijeliti limit po proxy adresi (30 novih igara/min, 600 poteza/min, 30 spremanja/min). Ne vjeruje se proizvoljnom javnom X-Forwarded-For zaglavlju.

Readiness: web `GET /health`, API `GET /api/health` provjerava bazu i tablicu rezultata, database `pg_isready` + TCP SQL upit. Probes su `wget` u web slici, Node `fetch` u API slici i PostgreSQL alati u DB slici.

## Migracije

`api/migrations/001_initial.sql` stvara igre, rezultate i indekse. Verzije i SHA-256 kontrolne sume zapisuju se u `schema_migrations`. Migrator je transakcijski, koristi advisory lock, može se ponovno pokretati i odbija izmjenu već primijenjene migracije. Buduće promjene dodaj kao `002_*.sql`, `003_*.sql` itd.; ne mijenjaj postojeće migracije. Nema schema synca ni resetiranja baze.

## Lokalni razvoj

Node 22.22.3, npm 10.9.8 i Docker Compose su preduvjeti.

```sh
npm ci
npm test
npm run build
npm run check:contract
```

Kopiraj `.env.example` u lokalni `.env`, upiši lozinku, zatim `docker compose up -d --build --wait`. Compose namjerno ne objavljuje host portove. Na Linuxu adresu lokalnog web kontejnera možeš dohvatiti s `docker inspect` za njegov ID (`docker compose ps -q web`); VPS Admin u produkciji pruža javno usmjeravanje.

Za razvoj frontenda: `npm start` otvara Angular na portu 4200; `/api` ide na lokalni API na portu 3000. API možeš pokrenuti nakon `npm run build -w api` uz `DB_HOST`, opcionalni `DB_PORT` i `POSTGRES_PASSWORD` koji upućuju na tvoju razvojnu PostgreSQL bazu `app`/`app`. Izvrši `npm run migrate -w api`, zatim `npm run start:api`. Razvojne varijable nisu potrebne u VPS Adminu.

## Provjere

`npm test` provjerava pravila igre. `npm run check:contract` provjerava dozvoljene Compose ključeve i manifest prema isporučenom ugovoru; nije zamjena za validator stvarnog VPS Admina.

`scripts/verify-deployment.mjs` i Playwright testovi koriste isključivo projekt `arcade-check`, a izolacija dodatno projekt `arcade-isolated`. Namijenjeni su privremenim lokalnim bazama; ne izvršavati ih nad produkcijom. Točan izvještaj izvršenih provjera nalazi se u `VERIFICATION.md`.

Verzije ovisnosti i lockfile su zaključani. `piscina` override 5.3.2 uklanja sigurnosni problem starije tranzitivne verzije Angular build alata. Paleta: [Color Hunt](https://colorhunt.co/palette/934761ad5c7172baa9d5e7b5). Ikone su vlastiti SVG, zvukovi se sintetiziraju Web Audio API-jem. Fontovi DM Sans i Press Start 2P uključeni su preko Fontsource paketa pod OFL licencom.
