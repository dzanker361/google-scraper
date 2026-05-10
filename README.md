# SERP Scraper

Jednoduchá webová aplikace pro stažení organických výsledků z první stránky Google a jejich export do JSON nebo CSV.

## Spuštění

### Lokálně (Node.js)

```bash
npm install
npm start          # http://localhost:3000
npm test           # jednotkové testy
```

### Docker Compose

```bash
docker compose up --build
# aplikace běží na http://localhost:3000
```

## API

| Endpoint | Parametry | Popis |
|---|---|---|
| `GET /api/search` | `q`, `format=json\|csv`, `hl`, `gl` | Vrátí organické výsledky |
| `GET /api/health` | — | Healthcheck |

### Příklad

```bash
curl "http://localhost:3000/api/search?q=coffee+shop+Praha&format=json"
```

## Výstupní formáty

**JSON** – pole objektů se strukturou:
```json
{
  "query": "coffee shop Praha",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "results": [
    {
      "position": 1,
      "title": "Název stránky",
      "url": "https://example.com",
      "displayUrl": "example.com",
      "description": "Popis výsledku..."
    }
  ]
}
```

**CSV** – řádkový formát s hlavičkou `position,title,url,displayUrl,description`.

## Unit testy

Testy jsou v `tests/scraper.test.js` a pokrývají:

- `parseGoogleHtml()` – parsing HTML, filtrace reklam a nested prvků, edge cases
- `validateResult()` – validace schématu výstupu
- `toJson()` / `toCsv()` – serializace a správnost formátu
- `fetchOrganicResults()` – integrační test s mock fetch, error handling
