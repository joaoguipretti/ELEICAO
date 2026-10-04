const TSE_BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const TEMPO_LIMITE_MS = 10_000;

// Códigos oficiais do 1º turno de 2026 (fonte: /oficial/comum/config/ele-c.json).
// Para o 2º turno (25/10), troque 6257 -> 6258 e 6259 -> 6260.
const CARGOS_TSE = {
  presidente: { eleicao: '6257', codigo: 1 },
  governador: { eleicao: '6259', codigo: 3 },
  senador: { eleicao: '6259', codigo: 5 },
};

const pad = (valor, tamanho) => String(valor).padStart(tamanho, '0');
const inteiro = (s) => Number(s || 0);
const percentual = (s) => Number(String(s || '0').replace(',', '.'));

// Busca o resultado direto do TSE. `uf` = null para cargos nacionais (presidente).
export async function buscarResultados(cargoId, uf, signal) {
  const cargo = CARGOS_TSE[cargoId];
  const abrangencia = uf ? uf.toLowerCase() : 'br';
  const arquivo = `${abrangencia}-c${pad(cargo.codigo, 4)}-e${pad(cargo.eleicao, 6)}-u.json`;
  // `nocache` faz o navegador não reaproveitar a cópia local (o app oficial do TSE faz igual).
  // A CDN do TSE ignora esse parâmetro, então não gera carga extra no servidor deles.
  const url = `${TSE_BASE}/${cargo.eleicao}/dados/${abrangencia}/${arquivo}?nocache=${Date.now()}`;

  // Junta o cancelamento de quem chamou (troca de cargo/UF) com um tempo limite,
  // para uma requisição pendurada nunca travar as atualizações.
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  signal.addEventListener('abort', cancelar);
  let expirou = false;
  const timer = setTimeout(() => {
    expirou = true;
    controle.abort();
  }, TEMPO_LIMITE_MS);

  let resposta, json;
  try {
    resposta = await fetch(url, { signal: controle.signal });
    if (resposta.ok) json = await resposta.json();
  } catch (erro) {
    if (signal.aborted) throw erro;
    throw new Error(
      expirou
        ? 'O TSE está demorando para responder. Tentando de novo em instantes…'
        : 'Sem conexão com o TSE. Tentando de novo em instantes…',
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancelar);
  }

  if (!resposta.ok) {
    throw new Error(
      resposta.status === 404
        ? 'O TSE ainda não publicou esse resultado.'
        : 'Não foi possível obter os dados do TSE agora.',
    );
  }
  return { id: `${cargoId}:${abrangencia}`, ...normalizar(json, cargo, abrangencia) };
}

// "04/10/2026" + "17:31:05" (horário de Brasília, UTC-3) -> timestamp em ms.
function dataHoraTSE(data, hora) {
  const [dia, mes, ano] = (data || '').split('/').map(Number);
  const [h, m, s] = (hora || '').split(':').map(Number);
  if (!dia || !mes || !ano || Number.isNaN(h)) return null;
  return Date.UTC(ano, mes - 1, dia, h + 3, m || 0, s || 0);
}

// Transforma o JSON (bem enxuto e cheio de siglas) do TSE em algo fácil de usar na tela.
function normalizar(json, cargo, abrangencia) {
  const carg = json.carg[0];

  const candidatos = carg.agr
    .flatMap((agremiacao) =>
      agremiacao.par.flatMap((partido) =>
        partido.cand.map((c) => ({
          numero: c.n,
          nome: c.nmu,
          nomeCompleto: c.nm,
          partido: partido.sg,
          coligacao: agremiacao.tp === 'c' ? agremiacao.nm : null,
          companheiros: (c.vs || []).map((v) => v.nmu),
          votos: inteiro(c.vap),
          percentual: percentual(c.pvap),
          // Mesma regra do app oficial: vale o texto de `st` ("Eleito", "Eleito por QP",
          // "2º turno", "Não eleito"...); `c.e` só quando `st` vem vazio, porque o TSE
          // marca e="s" também para quem vai ao 2º turno.
          eleito: c.st ? /^eleito/i.test(c.st) : c.e === 's',
          situacao: c.st || null,
          // Destinação do voto: "Válido" ou, p.ex., "Anulado" (candidatura indeferida).
          votosAnulados: c.dvt && !/^v[aá]lido/i.test(c.dvt) ? c.dvt : null,
          foto: `${TSE_BASE}/${cargo.eleicao}/fotos/${abrangencia}/${c.sqcand}.jpeg`,
        })),
      ),
    )
    .sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    cargo: carg.nmn,
    vagas: inteiro(carg.nv) || 1,
    atualizadoEm: json.dg && json.hg ? `${json.dg} ${json.hg}` : null,
    geradoEm: dataHoraTSE(json.dg, json.hg),
    secoes: {
      total: inteiro(json.s.ts),
      totalizadas: inteiro(json.s.st),
      percentual: percentual(json.s.pst),
    },
    eleitorado: {
      total: inteiro(json.e.te),
      comparecimento: inteiro(json.e.c),
      percentualComparecimento: percentual(json.e.pc),
      abstencao: inteiro(json.e.a),
      percentualAbstencao: percentual(json.e.pa),
    },
    votos: {
      // Como no app oficial: sem `vv`, usa os votos a votáveis concorrentes (`vvc`).
      validos: inteiro(json.v.vv ?? json.v.vvc),
      percentualValidos: percentual(json.v.pvv ?? json.v.pvvc),
      brancos: inteiro(json.v.vb),
      percentualBrancos: percentual(json.v.pvb),
      nulos: inteiro(json.v.tvn),
      percentualNulos: percentual(json.v.ptvn),
    },
    candidatos,
  };
}
