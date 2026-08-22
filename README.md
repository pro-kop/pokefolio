# Pokéfolio

Osobní portfolio Pokémon TCG sbírky s denním sledováním tržních cen z Cardmarketu.
Statický web na GitHub Pages, žádný server, žádné API klíče, nulové provozní náklady.

**Web:** https://pro-kop.github.io/pokefolio/

---

## Jak to funguje

Cardmarket od června 2024 [zveřejňuje ceník a katalog ke stažení pro všechny](https://news.cardmarket.com/en/Pokemon/were-making-the-price-guide-and-product-catalogue-available-for-download).
Denně kolem 01:00 UTC vygeneruje nový `price_guide_6.json` — ceny v eurech pro karty
i nerozbalené produkty. GitHub Action si ho každé ráno stáhne, ořízne na sledovanou
množinu, připíše jeden řádek do historie a commitne. Web je pak jen statické soubory.

```
Cardmarket  →  GitHub Actions (06:15)  →  public/data/**  →  GitHub Pages  →  prohlížeč
                                                                                   ↓
                                                             sbírka v IndexedDB (šifrovaná)
```

**Historii nejde dohnat zpětně.** Cardmarket publikuje jen dnešek, žádný archiv.
Každý den, kdy dávka neproběhne, je díra, která tam zůstane. Proto stojí za to
mít dávku nasazenou co nejdřív, i kdyby se s aplikací nic dalšího nedělalo.

---

## První spuštění

### 1. Push a Pages

```bash
git remote add origin https://github.com/pro-kop/pokefolio.git
git push -u origin main
```

Pak v repozitáři **Settings → Pages → Source: GitHub Actions**.

### 2. Naplnit data

V záložce **Actions** spusť ručně (tlačítko *Run workflow*), v tomhle pořadí:

1. **Týdenní katalog** — stáhne ~130 tisíc produktů a postaví vyhledávací index
2. **Denní ceny** — stáhne ceník a zapíše první den historie

Od téhle chvíle běží obojí samo: ceny každý den v 6:15, katalog v pondělí.

### 3. Vytvořit účet

```bash
npm install
npm run adduser
```

Skript se zeptá na jméno a heslo, spočítá sůl a ověřovací otisk a zapíše je
do `public/users.json`. Heslo se nikam neukládá.

```bash
git add public/users.json
git commit -m "účet: cyrus94"
git push
```

---

## Přihlášení a šifrování

Přihlašovací formulář na statickém webu z veřejného repa by sám o sobě nikoho
nezastavil — kdokoli si otevře zdroják. Proto tu **heslo není brána, ale klíč.**

```
heslo  ──PBKDF2-SHA256, 600 000 iterací──►  hlavní klíč (32 B)
                                             ├─ SHA-256 ─► verifier  (veřejný, v users.json)
                                             └─ HKDF    ─► klíč AES-GCM (nikde se neukládá)
```

Sbírka je v IndexedDB uložená zašifrovaná. Špatné heslo neznamená „nepustí tě dál",
znamená „data nejdou dešifrovat" — obejít se nedá nic, protože obcházet není co.

Ve veřejném repu je jen `verifier`. Heslo z něj nejde spočítat zpět; dá se jen zkoušet
hrubou silou přes 600 tisíc iterací PBKDF2 na každý pokus. **Proto musí být heslo
silné** — skript kratší než 12 znaků odmítne. Ideálně vygenerované ze správce hesel.

**Heslo je zároveň dešifrovací klíč. Když ho ztratíš, ztratíš sbírku.**
Ulož si ho do správce hesel a občas si v Nastavení stáhni export.

### Další účet (třeba pro kamaráda)

```bash
npm run adduser        # zeptá se na jméno a heslo, dopíše řádek do public/users.json
git add public/users.json && git commit -m "účet: honza" && git push
```

Každý účet má vlastní sůl, vlastní odvozený klíč a vlastní záznam v IndexedDB
pod svým `id`. Účty se navzájem nevidí a **propojit je nejde ani omylem** —
i kdyby jeden získal zašifrovaný blok druhého, je zašifrovaný cizím klíčem.

Heslo si každý zvolí sám: nech ho spustit `npm run adduser` u sebe a poslat ti
výsledný řádek z `users.json`, nebo mu heslo vygeneruj a předej bezpečnou cestou.

### Odebrat účet

Smaž jeho objekt z `public/users.json` a commitni. Jeho data zůstanou v jeho
prohlížeči, ale bez záznamu v `users.json` se nepřihlásí.

---

## Záloha

Sbírka žije v prohlížeči. Aby přežila přeinstalaci nebo se dostala na mobil,
nabízí Nastavení dvě cesty:

- **Export do souboru** — obyčejný JSON, ukládáš si ho sám k sobě
- **Šifrovaná záloha do privátního Gistu** — nahraje se zašifrovaný blok,
  klíč zůstává v tvé hlavě. Potřebuje fine-grained PAT s jediným oprávněním
  **Gists → Read and write**. Token se ukládá dovnitř té zašifrované sbírky,
  ne vedle ní.

Na novém zařízení: přihlásit se stejným heslem → Nastavení → vložit token a id
Gistu → *Obnovit ze zálohy*.

---

## Sledovaná množina

Sledovat všech ~130 tisíc produktů nemá smysl — většina jsou karty za pár centů.
Co se zapisuje do historie, řídí [`config/tracking.json`](config/tracking.json):

| Klíč | Význam |
|---|---|
| `includeAllSealed` | všechny nerozbalené produkty (boostery, displaye, ETB, bundly) |
| `minSingleTrendEur` | karty s trendovou cenou aspoň tolik eur |
| `extraProductIds` | konkrétní Cardmarket `idProduct` navíc |
| `maxProducts` | pojistka proti přetečení; nad limit se ořezává podle ceny |

Produkt, který už v historii je, se sleduje dál i kdyby spadl pod práh — jinak
by se řady trhaly.

Soubor je ve veřejném repu, ale **neprozrazuje, co vlastníš ani za kolik** —
jen co se sleduje. Cenový práh většinu zajímavých karet zachytí sám, takže
`extraProductIds` můžeš nechat prázdné.

---

## Skóre radaru

Denní dávka počítá pro každý sledovaný produkt skóre 0–100:

| Složka | Body | Nasycení |
|---|---:|---|
| Sleva nejnižší nabídky vůči trendu | 36 | 22 % |
| Propad trendu za 30 dní | 26 | −18 % |
| Blízkost ročnímu minimu | 24 | — |
| Týdenní obrat vzhůru po propadu | 14 | +4 % |

Skóre **neříká „kup"**. Nejnižší nabídka bývá levná z důvodu — poškozený kus,
pomalý prodejce, jiná jazyková verze. Ceník ten kontext nemá. Skóre řadí,
pojmenované signály vysvětlují, odkaz vede na Cardmarket, kde to ověříš.

Prvních čtrnáct dní má radar málo historie, takže počítá jen slevu vůči trendu
a sám na to v aplikaci upozorní.

---

## Vývoj

```bash
npm install
npm run dev            # localhost:5173/pokefolio/
npm run build          # typecheck + produkční build
npm run fetch:catalog  # přestavět index katalogu
npm run fetch:prices   # stáhnout dnešní ceny (jednou denně, víc nemá smysl)
npm run radar          # přepočítat skóre
```

Bez `public/data/catalog.json` nemá `fetch:prices` co ořezávat, takže katalog
musí být první.

### Struktura

```
.github/workflows/   denní ceny, týdenní katalog, deploy
config/tracking.json co se sleduje
scripts/             ETL v čistém Node, bez build kroku
public/data/         výstup dávky (verzovaný)
src/auth/            odvození klíče, přihlášení
src/store/           šifrovaný trezor, záloha do Gistu
src/market/          načítání tržních dat
src/calc/            ocenění a výkonnost
src/charts/          SVG grafy, bez knihovny
src/views/           obrazovky
```

### Datové soubory

| Soubor | Obsah |
|---|---|
| `latest.json` | dnešní ceny sledovaných produktů, sloupcově |
| `history/YYYY-MM.json` | historie po měsících, `ids` + `days[datum]` |
| `tracked.json` | názvy sledovaných produktů |
| `catalog.json` | celý katalog pro vyhledávání |
| `radar.json` | předpočítané skóre, top 400 |
| `meta.json` | kdy, z čeho, kolik |
| `fx.json` | kurz EUR/CZK |

Historie je sloupcová (`ids` zvlášť, hodnoty jako pole) — u stovek produktů krát
stovky dní je to rozdíl mezi desítkami kilobajtů a jednotkami megabajtů.
Nové produkty se přidávají na konec `ids`, starší dny je prostě nemají.

---

## Když něco spadne

**Denní dávka selhala** → Action založí GitHub Issue se štítkem `etl` a odkazem
na log. Nejčastější příčina je změna formátu zdrojových souborů; zkontroluj
`scripts/lib/sources.mjs`. Skript raději spadne, než by commitnul podezřelá data.

**Web ukazuje stará data** → dávka neproběhla. Actions → *Denní ceny* → *Run workflow*.

**Actions se samy vypnuly** → GitHub uspává naplánované workflowy v repozitářích
bez aktivity 60 dní. Denní commit dat tomu brání, takže by k tomu dojít nemělo.

---

## Co ceník neumí

Cardmarket price guide **nerozlišuje stav karty ani grading** — cena platí pro
běžný oběhový kus. Stav si v aplikaci vedeš pro sebe, do ocenění nevstupuje.
U gradovaných kusů by bylo potřeba jiný zdroj (PriceCharting).

Data pocházejí z veřejných souborů Cardmarketu a používají se pro osobní evidenci.
Aplikace nic nescrapuje a neobchází žádné podmínky.
