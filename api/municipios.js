// Função serverless do Vercel: resultado de presidente em todas as cidades de um estado, para
// o mapa por município. O TSE publica um arquivo por cidade (são 5.570); buscar isso no
// navegador de cada pessoa seria pesado demais. Aqui o servidor busca devagar, guarda um
// resumo compacto no Redis e a CDN do Vercel entrega o mesmo resumo para todos.
//
// Cuidados para não sobrecarregar o TSE (que responde 429 a rajadas):
//  - uma coleta por vez no Brasil inteiro (trava global) e só 3 requisições simultâneas;
//  - cidades com 100% das seções apuradas não são buscadas de novo;
//  - se o TSE responder 429, para na hora e todas as coletas pausam por 5 minutos.
//
// GET /api/municipios?uf=SP           → turno atual
// GET /api/municipios?uf=SP&turno=1   → 1º turno (final), para comparar durante o 2º
// Resposta: { geradoEm, cidades: { <código IBGE>: [apuradas, nº 1º, % 1º, nº 2º, % 2º, eleitorado] } }

import { redis } from './_redis.js';
import { emPausa, pausar } from './_tse.js';
import { buscarListaDeCidades, buscarResultados, TURNO } from '../src/tse.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const VALIDADE_MS = 300_000; // cada estado é recoletado no máximo a cada 5 minutos
const TRAVA_SEGUNDOS = 120;
const CONCORRENCIA = 3;

// A lista de cidades não muda durante a noite: busca uma vez por turno.
const listas = {};
function listaDeCidades(turno) {
  listas[turno] ??= buscarListaDeCidades(new AbortController().signal, turno).catch((erro) => {
    delete listas[turno];
    throw erro;
  });
  return listas[turno];
}

const arredondar = (n) => Math.round(n * 100) / 100;

async function coletar(uf, turno, anteriores) {
  const cidades = (await listaDeCidades(turno))[uf] ?? [];
  const resumo = { ...anteriores };
  const fila = cidades.filter((c) => !(anteriores[c.cdi]?.[0] >= 100));
  let geradoEm = 0;
  let limitado = false;

  async function trabalhador() {
    while (fila.length && !limitado) {
      const cidade = fila.shift();
      try {
        const dados = await buscarResultados('presidente', uf, new AbortController().signal, turno, cidade.cd);
        const [a, b] = dados.candidatos;
        const comVotos = a && a.votos > 0;
        resumo[cidade.cdi] = [
          arredondar(dados.secoes.percentual),
          comVotos ? a.numero : null,
          comVotos ? arredondar(a.percentual) : 0,
          comVotos ? (b?.numero ?? null) : null,
          comVotos ? arredondar(b?.percentual ?? 0) : 0,
          dados.eleitorado.total,
        ];
        geradoEm = Math.max(geradoEm, dados.geradoEm ?? 0);
      } catch (erro) {
        if (erro.status === 429) limitado = true;
        // Outras falhas: a cidade fica com o dado anterior e entra na próxima rodada.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
  return { t: Date.now(), geradoEm, cidades: resumo, completo: !limitado && fila.length === 0, limitado };
}

export default async function handler(req, res) {
  const uf = String(req.query.uf || '').toUpperCase();
  if (!UFS.includes(uf)) return res.status(400).json({ erro: 'UF inválida' });
  const turno = req.query.turno === '1' ? 1 : TURNO;
  const turnoEncerrado = turno !== TURNO;
  if (!process.env.REDIS_URL) return res.status(503).json({ erro: 'Servidor não configurado' });

  let cliente;
  try {
    cliente = await redis();
  } catch (erro) {
    console.error('[municipios] conexão:', erro.message);
    return res.status(502).json({ erro: 'Indisponível agora' });
  }

  // v2: inclui o eleitorado de cada cidade.
  const chave = `municipios:v2:${turno}:${uf}`;
  try {
    let salvo = JSON.parse((await cliente.get(chave)) ?? 'null');
    const fresco = salvo && (turnoEncerrado ? salvo.completo : Date.now() - salvo.t < VALIDADE_MS);

    if (!fresco && !(await emPausa(cliente))) {
      const trava = await cliente.set('municipios:coletor', uf, { NX: true, EX: TRAVA_SEGUNDOS });
      if (trava === 'OK') {
        try {
          const novo = await coletar(uf, turno, salvo?.cidades ?? {});
          if (novo.limitado) await pausar(cliente);
          if (Object.keys(novo.cidades).length) {
            const { limitado, ...guardar } = novo;
            await cliente.set(chave, JSON.stringify(guardar));
            salvo = guardar;
          }
        } catch (erro) {
          if (erro.status === 429) await pausar(cliente);
          else throw erro;
        } finally {
          await cliente.del('municipios:coletor');
        }
      }
    }

    // Ainda sem nada: o site usa a cor do estado nas cidades e pergunta de novo em instantes.
    if (!salvo) return res.status(202).json({ geradoEm: null, cidades: {} });
    res.setHeader(
      'Cache-Control',
      turnoEncerrado && salvo.completo
        ? 'public, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, s-maxage=60, stale-while-revalidate=300',
    );
    res.status(200).json({ geradoEm: salvo.geradoEm, cidades: salvo.cidades });
  } catch (erro) {
    console.error('[municipios]', erro.message);
    res.status(502).json({ erro: 'Indisponível agora' });
  }
}
