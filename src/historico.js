// Guarda as últimas gerações do TSE vistas neste navegador, para calcular quantos votos
// entraram em cada atualização. O TSE só publica o resultado do momento.
// Fica no localStorage (por cargo/UF) para sobreviver a um recarregamento da página.

const LIMITE_PONTOS = 9; // 9 gerações = as 8 últimas atualizações
const memoria = new Map();

function ler(id) {
  if (memoria.has(id)) return memoria.get(id);
  let pontos = [];
  try {
    pontos = JSON.parse(localStorage.getItem(`historico:${id}`)) || [];
  } catch {
    // Sem localStorage ou dado corrompido: começa do zero.
  }
  memoria.set(id, pontos);
  return pontos;
}

function salvar(id, pontos) {
  memoria.set(id, pontos);
  try {
    localStorage.setItem(`historico:${id}`, JSON.stringify(pontos));
  } catch {
    // Sem localStorage (aba anônima, cota cheia): fica só na memória.
  }
}

// Registra o resultado recebido (se for uma geração nova do TSE) e devolve as últimas.
export function registrarNoHistorico(dados) {
  const pontos = ler(dados.id);
  const ultimo = pontos[pontos.length - 1];
  const novo = dados.secoes.totalizadas > 0 && dados.geradoEm && (!ultimo || dados.geradoEm > ultimo.t);
  if (!novo) return pontos;

  const atualizados = [
    ...pontos,
    {
      t: dados.geradoEm,
      apuradas: dados.secoes.percentual,
      validos: dados.votos.validos,
      votos: Object.fromEntries(dados.candidatos.map((c) => [c.numero, c.votos])),
    },
  ].slice(-LIMITE_PONTOS);
  salvar(dados.id, atualizados);
  return atualizados;
}
