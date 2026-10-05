// Cores por partido, no padrão usado na cobertura de eleições.
const PARTIDOS = {
  PT: '#e5383b',
  PL: '#3d5fdb',
  PSD: '#5fb86b',
  MDB: '#2e8b57',
  PP: '#5ec9f2',
  REPUBLICANOS: '#3f80b8',
  UNIÃO: '#22b3a6',
  UNIAO: '#22b3a6',
  PSB: '#e8b23a',
  PSDB: '#4a78c2',
  PSOL: '#a855c9',
  PDT: '#e2775a',
  NOVO: '#f08a2c',
  PODE: '#7d8fd1',
  SOLIDARIEDADE: '#ef8f6b',
  CIDADANIA: '#e45c95',
  REDE: '#2fa58f',
  'PC DO B': '#c0392b',
  PCDOB: '#c0392b',
  PV: '#4caf50',
  AVANTE: '#18b5c4',
  AGIR: '#9c7a6b',
  MOBILIZA: '#a0877c',
  PRD: '#6a73c8',
  DC: '#8a6bc9',
  MISSÃO: '#e9c23e',
  MISSAO: '#e9c23e',
  PCO: '#b4302f',
  PSTU: '#d24a43',
  UP: '#e0605a',
  PCB: '#c43d3d',
  DEMOCRATA: '#7f95a3',
  PMB: '#c96fa5',
  PRTB: '#58a05f',
};

const RESERVA = ['#8b9cb3', '#b39b8b', '#9bb38b', '#b38bab', '#8bb3ad', '#b3a98b'];

export function corPartido(sigla = '') {
  const chave = sigla.toUpperCase().trim();
  if (PARTIDOS[chave]) return PARTIDOS[chave];
  let h = 0;
  for (const ch of chave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RESERVA[h % RESERVA.length];
}

// Intensidade da cor no mapa pela vantagem do líder (em pontos percentuais).
export const FAIXAS_VANTAGEM = [10, 25, 45];
export function opacidadePorVantagem(vantagem) {
  if (vantagem < FAIXAS_VANTAGEM[0]) return 0.45;
  if (vantagem < FAIXAS_VANTAGEM[1]) return 0.65;
  if (vantagem < FAIXAS_VANTAGEM[2]) return 0.82;
  return 1;
}

// Cor neutra para estados sem votos ainda (segue o tema claro/escuro).
export const SEM_DADOS = 'var(--sem-dados)';

// O canvas não entende var(--x): resolve para a cor de verdade do tema atual.
export function corResolvida(cor) {
  const m = /^var\((--[\w-]+)\)$/.exec(cor);
  if (!m) return cor;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#888';
}
