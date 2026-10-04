# Apuração 2026

Site simples para acompanhar a apuração das Eleições Gerais de 2026 (1º turno, 04/10) com dados oficiais do TSE.

É só front-end (React + Vite): o navegador busca os JSONs públicos do TSE direto, sem backend, e atualiza a tela a cada 30s.

## Rodando

```bash
npm install
npm run dev
```

Abra http://localhost:5173.

## Publicando

```bash
npm run build   # gera a pasta dist/ (site estático)
```

A pasta `dist/` pode ir para qualquer hospedagem estática (Vercel, Netlify, Cloudflare Pages, GitHub Pages).
No Vercel, por exemplo: `npx vercel` na raiz do projeto.

## Fonte dos dados

Arquivos públicos do TSE em `https://resultados.tse.jus.br/oficial/ele2026/` (a lógica fica em `src/tse.js`):

| Cargo | Eleição | Arquivo |
|---|---|---|
| Presidente | 6257 | `6257/dados/br/br-c0001-e006257-u.json` |
| Governador | 6259 | `6259/dados/{uf}/{uf}-c0003-e006259-u.json` |
| Senador | 6259 | `6259/dados/{uf}/{uf}-c0005-e006259-u.json` |

Os códigos vêm de `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`.
No 2º turno (25/10) os códigos passam a ser 6258 (federal) e 6260 (estadual). Basta trocar em `src/tse.js`.
