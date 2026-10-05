import { useEffect, useState } from 'react';
import { geoBounds } from 'd3-geo';
import { feature } from 'topojson-client';
import { buscarListaDeCidades, buscarResultados, TURNO } from './tse.js';
import { criarPonto } from './historico.js';
import { montarVisao } from './lib/visao.js';
import { corrigirSentido } from './lib/geo.js';
import { UFS } from './lib/regioes.js';

const SIGLAS = Object.keys(UFS);
const INTERVALO_MS = 120_000; // o servidor atualiza as cidades a cada 2 min
const INTERVALO_INCOMPLETO_MS = 15_000; // na 1ª coleta do servidor, tenta de novo logo

// Malha das 5.570 cidades (IBGE), carregada só quando o mapa por município é aberto.
let malhaPromessa;
function carregarMalha() {
  malhaPromessa ??= fetch('/malhas/municipios.json')
    .then((r) => r.json())
    .then((topo) =>
      feature(topo, topo.objects[Object.keys(topo.objects)[0]]).features.map((f) => {
        const corrigida = corrigirSentido(f);
        return { ...corrigida, cdi: f.properties.codarea, limites: geoBounds(corrigida) };
      }),
    )
    .catch((erro) => {
      malhaPromessa = null;
      throw erro;
    });
  return malhaPromessa;
}

// Nome, estado e código TSE de cada cidade, indexados pelo código IBGE.
let cidadesPromessa;
export function carregarCidades() {
  cidadesPromessa ??= buscarListaDeCidades(new AbortController().signal)
    .then((lista) => {
      const porIbge = {};
      for (const [uf, cidades] of Object.entries(lista)) {
        if (uf === 'ZZ') continue; // cidades no exterior não estão no mapa
        for (const c of cidades) porIbge[c.cdi] = { ...c, uf };
      }
      return porIbge;
    })
    .catch((erro) => {
      cidadesPromessa = null;
      throw erro;
    });
  return cidadesPromessa;
}

async function buscarTodosOsEstados(signal, turno) {
  const resultados = await Promise.allSettled(
    SIGLAS.map((uf) =>
      fetch(`/api/municipios?uf=${uf}${turno ? `&turno=${turno}` : ''}`, { signal }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ),
  );
  const cidades = {};
  let completos = 0;
  for (const r of resultados) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    if (Object.keys(r.value.cidades).length) completos++;
    Object.assign(cidades, r.value.cidades);
  }
  return { cidades, completo: completos === SIGLAS.length };
}

// Mapa por município: malha, nomes e o resumo de cada cidade (vem do servidor, que lê o TSE).
export function useMunicipios(ativo) {
  const [malha, setMalha] = useState(null);
  const [nomes, setNomes] = useState(null);
  const [dados, setDados] = useState({});
  const [primeiroTurno, setPrimeiroTurno] = useState({});

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    carregarMalha()
      .then((m) => vivo && setMalha(m))
      .catch(() => {});
    carregarCidades()
      .then((n) => vivo && setNomes(n))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ativo]);

  useEffect(() => {
    if (!ativo) return;
    const controle = new AbortController();
    let timer;

    async function ciclo() {
      let proximo = INTERVALO_MS;
      if (!document.hidden) {
        const { cidades, completo } = await buscarTodosOsEstados(controle.signal);
        if (controle.signal.aborted) return;
        if (Object.keys(cidades).length) setDados(cidades);
        if (!completo) proximo = INTERVALO_INCOMPLETO_MS;
      }
      timer = setTimeout(ciclo, proximo);
    }
    ciclo();
    if (TURNO === 2) {
      buscarTodosOsEstados(controle.signal, 1)
        .then(({ cidades }) => !controle.signal.aborted && setPrimeiroTurno(cidades))
        .catch(() => {});
    }

    return () => {
      controle.abort();
      clearTimeout(timer);
    };
  }, [ativo]);

  return { malha, nomes, dados, primeiroTurno };
}

// Resultado completo de uma cidade escolhida (direto do TSE, um arquivo só, a cada 30s).
export function useCidade(cidade) {
  const [visao, setVisao] = useState(null);
  const [primeiroTurno, setPrimeiroTurno] = useState(null);

  useEffect(() => {
    setVisao(null);
    setPrimeiroTurno(null);
    if (!cidade) return;
    const controle = new AbortController();
    let timer;

    async function ciclo() {
      try {
        const dados = await buscarResultados('presidente', cidade.uf, controle.signal, TURNO, cidade.cd);
        setVisao(montarVisao(dados.id, criarPonto(dados), dados, true));
      } catch {
        // Mantém o último resultado; tenta de novo no próximo ciclo.
      }
      if (!controle.signal.aborted) timer = setTimeout(ciclo, 30_000);
    }
    ciclo();
    if (TURNO === 2) {
      buscarResultados('presidente', cidade.uf, controle.signal, 1, cidade.cd)
        .then((dados) => setPrimeiroTurno(montarVisao(dados.id, criarPonto(dados), dados, true)))
        .catch(() => {});
    }

    return () => {
      controle.abort();
      clearTimeout(timer);
    };
  }, [cidade]);

  return { visao, primeiroTurno };
}
