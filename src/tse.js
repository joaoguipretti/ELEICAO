const TSE_BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const TEMPO_LIMITE_MS = 10_000;

// Códigos oficiais de 2026 (fonte: /oficial/comum/config/ele-c.json). No 2º turno só há
// presidente e governador (nos estados onde ninguém passou de 50% no 1º).
const TURNOS = {
  1: {
    presidente: { eleicao: '6257', codigo: 1 },
    governador: { eleicao: '6259', codigo: 3 },
    senador: { eleicao: '6259', codigo: 5 },
  },
  2: {
    presidente: { eleicao: '6258', codigo: 1 },
    governador: { eleicao: '6260', codigo: 3 },
  },
};

// Dia de cada turno: a linha do tempo começa às 17h (fechamento das urnas) desse dia.
const DATAS = { 1: { dia: 4, mes: 10 }, 2: { dia: 25, mes: 10 } };

// Turno em andamento, pela variável de ambiente VITE_TURNO (padrão: 1). No dia 25/10, basta
// definir VITE_TURNO=2 no Vercel e publicar de novo. O site (Vite) lê de import.meta.env;
// a função do servidor (Node), de process.env.
const turnoConfigurado =
  import.meta.env?.VITE_TURNO ?? (typeof process !== 'undefined' ? process.env?.VITE_TURNO : undefined);
export const TURNO = Number(turnoConfigurado) === 2 ? 2 : 1;
export const CARGOS_TSE = TURNOS[TURNO];
export const INICIO_APURACAO = Date.UTC(2026, DATAS[TURNO].mes - 1, DATAS[TURNO].dia, 17 + 3);

const pad = (valor, tamanho) => String(valor).padStart(tamanho, '0');
const inteiro = (s) => Number(s || 0);
const percentual = (s) => Number(String(s || '0').replace(',', '.'));

// Busca o resultado direto do TSE. `uf` = null para cargos nacionais (presidente).
// `turno` permite buscar o 1º turno durante o 2º (para a comparação); `municipio` é o código
// TSE (5 dígitos) de uma cidade do estado `uf`.
export async function buscarResultados(cargoId, uf, signal, turno = TURNO, municipio = null) {
  const cargo = TURNOS[turno][cargoId];
  const abrangencia = uf ? uf.toLowerCase() : 'br';
  const prefixo = `${abrangencia}${municipio ?? ''}`;
  const arquivo = `${prefixo}-c${pad(cargo.codigo, 4)}-e${pad(cargo.eleicao, 6)}-u.json`;
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
    const erro = new Error(
      resposta.status === 404
        ? 'O TSE ainda não publicou esse resultado.'
        : resposta.status === 429
          ? 'O TSE está limitando o acesso agora. Tentando de novo em instantes…'
          : 'Não foi possível obter os dados do TSE agora.',
    );
    erro.status = resposta.status; // o servidor usa isso para pausar se o TSE pedir (429)
    throw erro;
  }
  return { id: `${cargoId}:${prefixo}`, ...normalizar(json, cargo, abrangencia) };
}

// Lista de cidades do TSE: { SP: [{ cd: '62910', cdi: '3509502', nm: 'CAMPINAS' }, ...], ... }.
// `cd` é o código do TSE (usado nos arquivos de resultado); `cdi`, o do IBGE (usado na malha).
export async function buscarListaDeCidades(signal, turno = TURNO) {
  const eleicao = TURNOS[turno].presidente.eleicao;
  const resposta = await fetch(`${TSE_BASE}/${eleicao}/config/mun-e${pad(eleicao, 6)}-cm.json`, { signal });
  if (!resposta.ok) {
    const erro = new Error(`Lista de cidades: o TSE respondeu ${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }
  const json = await resposta.json();
  return Object.fromEntries(
    json.abr.map((a) => [a.cd.toUpperCase(), a.mu.map(({ cd, cdi, nm }) => ({ cd, cdi, nm }))]),
  );
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
          // Fotos de cargo nacional (presidente) só existem na pasta br.
          foto: `${TSE_BASE}/${cargo.eleicao}/fotos/${cargo.codigo === 1 ? 'br' : abrangencia}/${c.sqcand}.jpeg`,
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
      faltam: inteiro(json.e.esnt), // eleitores das seções ainda não totalizadas
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
