import { buscarResultados } from './tse.js';
import { registrarNoHistorico } from './historico.js';

// Abrangências do arquivo de presidente por estado ("ZZ" = eleitores no exterior).
export const ESTADOS = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins', ZZ: 'Exterior',
};

// Busca o resultado de presidente em cada estado. Estados que falharem ficam de fora
// (a lista continua útil); só lança erro se a busca for cancelada.
export async function buscarEstados(signal) {
  const siglas = Object.keys(ESTADOS);
  const resultados = await Promise.allSettled(
    siglas.map((uf) => buscarResultados('presidente', uf, signal)),
  );
  if (signal.aborted) throw new DOMException('Busca cancelada', 'AbortError');

  return resultados
    .flatMap((r, i) => (r.status === 'fulfilled' ? [resumir(siglas[i], r.value)] : []))
    .sort((a, b) => b.eleitorado - a.eleitorado);
}

function resumir(uf, dados) {
  // O histórico por estado permite dizer quantos votos entraram na última atualização dele.
  const pontos = registrarNoHistorico(dados);
  const [antes, depois] = pontos.slice(-2);
  const novos = antes && depois ? depois.validos - antes.validos : null;

  return {
    uf,
    nome: ESTADOS[uf],
    eleitorado: dados.eleitorado.total,
    apuradas: dados.secoes.percentual,
    lider: dados.candidatos[0].votos > 0 ? dados.candidatos[0] : null,
    novos: novos > 0 ? novos : null,
  };
}
