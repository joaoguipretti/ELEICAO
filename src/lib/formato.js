const TZ = 'America/Sao_Paulo';

export const numero = new Intl.NumberFormat('pt-BR');

export const decimal = (valor, casas = 2) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const pct = (valor, casas = 2) => `${decimal(valor, casas)}%`;

const formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const formatoRelogio = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: TZ,
});

export const hora = (t) => formatoHora.format(t); // 20:44
export const horaH = (t) => hora(t).replace(':', 'h'); // 20h44
export const relogio = (t) => formatoRelogio.format(t); // 20:45:53

// 4.012.345 → "4 milhões"; 1.234.567 → "1,2 milhão"; 805.123 → "805 mil"
export function quantidade(n) {
  if (n >= 1e6) {
    const m = n / 1e6;
    const texto = m >= 10 ? numero.format(Math.round(m)) : decimal(m, 1).replace(/,0$/, '');
    return `${texto} ${m < 2 ? 'milhão' : 'milhões'}`;
  }
  if (n >= 1e3) return `${numero.format(Math.round(n / 1e3))} mil`;
  return numero.format(n);
}

// "4 milhões de votos", "805 mil votos", "312 votos"
export function votosPorExtenso(n) {
  const texto = quantidade(n);
  return /milh/.test(texto) ? `${texto} de votos` : `${texto} ${n === 1 ? 'voto' : 'votos'}`;
}

// O TSE manda nomes em caixa alta ("FLAVIO BOLSONARO"); exibimos "Flavio Bolsonaro".
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
export function nomeProprio(nome) {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

// Siglas curtas ficam em maiúsculas (PT, PSD); nomes longos viram "Avante", "Missão".
export const siglaPartido = (sigla = '') => (sigla.length <= 4 ? sigla : nomeProprio(sigla));

// Forma curta: 2.612.345 → "2,6 mi"; 294.120 → "294 mil"; 812 → "812".
export function abreviado(n) {
  if (n >= 1e6) return `${decimal(n / 1e6, 1)} mi`;
  if (n >= 1e3) return `${numero.format(Math.round(n / 1e3))} mil`;
  return numero.format(Math.round(n));
}
