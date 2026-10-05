// Função serverless do Vercel: guarda o histórico da apuração no Redis e o devolve para o site.
// O TSE só publica o resultado do momento; aqui, enquanto houver alguém no site, no máximo a
// cada 30s gravamos a geração atual de cada arquivo (presidente no Brasil, em cada estado e no
// exterior; governador e senador em cada estado). Uma trava no Redis garante que só uma
// execução por vez faça a coleta.

import { redis } from './_redis.js';
import { emPausa, pausar } from './_tse.js';
import { buscarResultados, CARGOS_TSE } from '../src/tse.js';
import { criarPonto } from '../src/historico.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const ABRANGENCIAS = {
  presidente: [null, ...UFS, 'ZZ'],
  governador: UFS,
  senador: UFS,
};
// Só os cargos que existem no turno atual (no 2º turno não há senador).
const CONSULTAS = Object.keys(CARGOS_TSE).flatMap((cargo) =>
  ABRANGENCIAS[cargo].map((uf) => [cargo, uf]),
);
const TRAVA_SEGUNDOS = 30;
const CONCORRENCIA = 6; // gentil com o TSE: nada de rajadas

// Executa as tarefas com no máximo `limite` ao mesmo tempo; devolve como Promise.allSettled.
async function emFila(tarefas, limite) {
  const resultados = new Array(tarefas.length);
  let proxima = 0;
  async function trabalhador() {
    while (proxima < tarefas.length) {
      const i = proxima++;
      try {
        resultados[i] = { status: 'fulfilled', value: await tarefas[i]() };
      } catch (reason) {
        resultados[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: limite }, trabalhador));
  return resultados;
}

// A chave inclui o código da eleição: 1º e 2º turno nunca se misturam.
const chave = (cargo, uf) =>
  `historico:${CARGOS_TSE[cargo].eleicao}:${cargo}:${uf ? uf.toLowerCase() : 'br'}`;

async function coletarSeForMinhaVez(cliente) {
  if (await emPausa(cliente)) return;
  const trava = await cliente.set('historico:trava', '1', { NX: true, EX: TRAVA_SEGUNDOS });
  if (trava !== 'OK') return;

  // Arquivos que não existem (ex.: estado sem 2º turno para governador) só ficam de fora.
  const resultados = await emFila(
    CONSULTAS.map(([cargo, uf]) => () => buscarResultados(cargo, uf, new AbortController().signal)),
    CONCORRENCIA,
  );
  if (resultados.some((r) => r.status === 'rejected' && r.reason?.status === 429)) await pausar(cliente);
  const atuais = resultados
    .map((r, i) => (r.status === 'fulfilled' ? { consulta: CONSULTAS[i], dados: r.value } : null))
    .filter((r) => r && r.dados.secoes.totalizadas > 0 && r.dados.geradoEm);
  if (!atuais.length) return;

  const ultimos = await Promise.all(
    atuais.map(({ consulta }) => cliente.lIndex(chave(...consulta), -1)),
  );
  const novos = atuais.filter(({ dados }, i) => !ultimos[i] || dados.geradoEm > JSON.parse(ultimos[i]).t);
  if (!novos.length) return;

  const gravacao = cliente.multi();
  for (const { consulta, dados } of novos) {
    gravacao.rPush(chave(...consulta), JSON.stringify(criarPonto(dados)));
  }
  await gravacao.exec();
}

// ?cargo=presidente&uf=SP → { pontos } de uma abrangência;
// ?cargo=presidente&todas=1 → { abrangencias: { br: [...], sp: [...], ... } } do cargo inteiro.
export default async function handler(req, res) {
  const cargo = String(req.query.cargo || '');
  const uf = String(req.query.uf || '').toUpperCase();
  const todas = req.query.todas === '1';
  const consultas = todas
    ? CONSULTAS.filter(([c]) => c === cargo)
    : CONSULTAS.filter(([c, u]) => c === cargo && (u === null ? !uf || uf === 'BR' : u === uf));
  if (!consultas.length) return res.status(400).json({ erro: 'Cargo ou UF inválido' });
  if (!process.env.REDIS_URL) return res.status(503).json({ erro: 'Histórico não configurado' });

  let cliente;
  try {
    cliente = await redis();
  } catch (erro) {
    console.error('[historico] conexão:', erro.message);
    return res.status(502).json({ erro: 'Histórico indisponível agora' });
  }

  try {
    await coletarSeForMinhaVez(cliente);
  } catch (erro) {
    // Falha na coleta não impede de devolver o que já está gravado.
    console.error('[historico] coleta:', erro.message);
  }

  try {
    const listas = await Promise.all(consultas.map((c) => cliente.lRange(chave(...c), 0, -1)));
    const pontosDe = (i) => listas[i].map((p) => JSON.parse(p));
    // A CDN do Vercel guarda a resposta por 30s: muitos visitantes, pouca execução.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30');
    if (!todas) return res.status(200).json({ pontos: pontosDe(0) });
    res.status(200).json({
      abrangencias: Object.fromEntries(
        consultas.map(([, u], i) => [u ? u.toLowerCase() : 'br', pontosDe(i)]),
      ),
    });
  } catch (erro) {
    console.error('[historico] leitura:', erro.message);
    res.status(502).json({ erro: 'Histórico indisponível agora' });
  }
}
