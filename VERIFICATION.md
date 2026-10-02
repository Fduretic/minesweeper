# Izvještaj provjera — 2. listopada 2026.

Provjere su izvršene lokalno u ovom radnom direktoriju. Nije korišten drugi projekt, VPS Admin repozitorij ili stvarna VPS instalacija. Nije izvršen push ni javni deployment.

## Uspješno izvršeno

| Provjera | Rezultat |
| --- | --- |
| Produkcijska kompilacija Angulara i NestJS-a | Prolazi; početni frontend JS + CSS oko 215 kB, procjena prijenosa 60 kB bez fontova |
| Produkcijske Docker slike `web` i `api` | Izgrađene i pokrenute; database koristi zaključanu PostgreSQL sliku |
| `docker compose config --quiet` | Prolazi |
| Lokalna strukturna provjera Composea i manifesta | Prolazi prema ključevima i pravilima dostavljenog ugovora |
| Healthcheckovi unutar završnih slika | Web `/health`, API `/api/health`, PostgreSQL TCP SQL upit prolaze |
| Stvarni web i Nginx `/api` proxy | Prolaze; relativni browser URL-ovi |
| Prva migracija na praznoj bazi | Stvorena shema i evidentirana migracija `001_initial.sql` |
| Migracije na postojećoj shemi | Dva ponovljena izvršavanja bez resetiranja ili gubitka podataka |
| 6 testova pravila igre | Prolaze: sve težine, siguran prvi potez, flood fill, zastavice, pobjeda, poraz, chord, rubovi ploče, bodovanje |
| HTTP + stvarna PostgreSQL baza | Odigrane pobjede na sve tri težine; provjereni rezultat i vrijeme iz baze |
| Validacija rezultata | Neispravni inicijali i spremanje poraza odbijeni; podmetnuti bodovi i vrijeme ignorirani; ponovljeno spremanje ne duplicira rezultat |
| Istodobni potezi | Ista revizija: jedan zahtjev uspije, drugi dobije HTTP 409 |
| Ponovno stvaranje svih servisa | Rezultati i stanje igre očuvani kroz imenovani volume |
| Ponovno stvaranje samo API-ja | Postojeći Nginx nastavlja ispravno prosljeđivati zahtjeve |
| Izolacija dva Compose projekta | `arcade-check` i `arcade-isolated` imaju odvojene baze i partije |
| Ograničenja resursa | Sva tri servisa ponovno pokrenuta i zdrava uz 768 MB RAM-a, 2 CPU-a i 256 PID-ova |
| 5 Chromium / Playwright testova | Desktop i mobitel, tipkovnica, zvuk, siguran početak, poraz, pobjeda, inicijali, osvježavanje, prekidi veze, dijalozi, promjena težine |
| Automatizirana pristupačnost | Axe WCAG 2 A/AA i 2.1 AA: bez pronađenih kršenja na glavnom zaslonu, dijalogu uputa i uskom zaslonu od 320 px |
| Responzivnost | Pregledani screenshotovi za 1440 px i 390 px; nema horizontalnog prelijevanja dokumenta pri 320/390 px; velike ploče imaju vlastito pomicanje |
| Sigurnosna politika browsera | Nema console grešaka u standardnom toku; produkcijski CSS radi bez inline JavaScript handlera |
| `npm audit` | 0 prijavljenih ranjivosti u zaključanim ovisnostima |

Nakon pokretanja uz resursna ograničenja izmjeren je približan trenutni utrošak: API 34,6 MiB / 12 PID-ova, PostgreSQL 18,8 MiB / 7 PID-ova, web 2,6 MiB / 3 PID-a. Ovo je lokalni funkcionalni test, ne mjerenje kapaciteta pri velikom prometu. Compose ne deklarira limite jer ih postavlja platforma.

## Kako ponoviti

```sh
npm ci
npm test
npm run build
npm run check:contract
npm audit
POSTGRES_PASSWORD=local-verification-only docker compose -p arcade-check up -d --build --wait
node scripts/verify-deployment.mjs
npx playwright install chromium
TEST_BASE_URL=http://ADRESA-TESTNOG-WEB-KONTEJNERA npm run test:e2e
```

`verify-deployment.mjs` ispisuje stvarnu adresu testnog web kontejnera i sprema izvještaj u `.verification/deployment.json`. Testovi namjerno stvaraju partije i rezultate u privremenoj bazi `arcade-check`; ne smiju se usmjeriti prema produkciji. Drugi projekt se nakon testa zaustavlja, njegov volume ostaje očuvan. Screenshotovi su u `.verification/desktop.png`, `mobile.png` i `victory.png`; taj direktorij nije dio source controla.

## Što još zahtijeva ciljnu platformu

Nema poznatog blokera za lokalno provjerenu aplikaciju. Stvarni VPS Admin validator, javna domena, HTTPS i platformin backup/restore nisu dostupni u ovom direktoriju i nisu testirani. Safari/Firefox, ručni test čitačem zaslona i test velikog opterećenja nisu izvršeni. Automatizirana pristupačnost ne zamjenjuje potpunu ručnu provjeru.

U VPS Adminu ispuniti samo **`POSTGRES_PASSWORD`** jedinstvenom lozinkom, zadržati bazu i korisnika `app`, pokrenuti deklariranu migraciju i usmjeriti poddomenu na `web:80`. Cijeli postupak je u [README.md](README.md).
