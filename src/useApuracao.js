import { useEffect, useMemo, useRef, useState } from 'react';
import { buscarResultados } from './tse.js';
import { criarPonto } from './historico.js';
import { mesclarPontos } from './lib/visao.js';
import { UFS } from './lib/regioes.js';

const SIGLAS = Object.keys(UFS).map((uf) => uf.toLowerCase());
export const ABRANGENCIAS = {
  presidente: ['br', ...SIGLAS, 'zz'],
  governador: SIGLAS,
  senador: SIGLAS,
};

const INTERVALO_NACIONAL_MS = 30_000; // arquivo do Brasil (leve): a cada 30s
const INTERVALO_ESTADOS_MS = 60_000; // governador/senador: os 27 estados a cada 1 min
const INTERVALO_HISTORICO_MS = 60_000; // histórico do servidor (cacheado na CDN)

async function buscarHistoricoServidor(cargo, signal) {
  try {
    const resposta = await fetch(`/api/historico?cargo=${cargo}&todas=1`, { signal });
    if (!resposta.ok) return null;
    return (await resposta.json()).abrangencias ?? null;
  } catch {
    return null;
  }
}

// Dados de um cargo: o arquivo ao vivo de cada abrangência (nomes, fotos, situação) e os
// pontos de histórico (servidor + o que este navegador viu), que alimentam mapa, gráfico,
// regiões, "últimas atualizações" e a linha do tempo. `cargo` null = não busca nada.
export function useApuracao(cargo) {
  const [aoVivo, setAoVivo] = useState({}); // abr → dados normalizados do TSE
  const [vistos, setVistos] = useState({}); // abr → pontos vistos por este navegador
  const [servidor, setServidor] = useState({}); // abr → pontos do histórico do servidor
  const [erro, setErro] = useState(null);
  const geracaoNacional = useRef(null);

  useEffect(() => {
    if (!cargo) return;
    const controle = new AbortController();
    const abrangencias = ABRANGENCIAS[cargo];
    const timers = [];
    let parado = false;

    setAoVivo({});
    setVistos({});
    setServidor({});
    setErro(null);
    geracaoNacional.current = null;

    function registrar(resultados) {
      const novos = {};
      for (const [abr, dados] of resultados) novos[abr] = dados;
      setAoVivo((atual) => ({ ...atual, ...novos }));
      setVistos((atual) => {
        const proximo = { ...atual };
        for (const [abr, dados] of resultados) {
          if (dados.secoes.totalizadas > 0 && dados.geradoEm) {
            proximo[abr] = mesclarPontos(atual[abr], [criarPonto(dados)]);
          }
        }
        return proximo;
      });
    }

    async function buscar(lista) {
      const resultados = await Promise.allSettled(
        lista.map((abr) =>
          buscarResultados(cargo, abr === 'br' ? null : abr.toUpperCase(), controle.signal),
        ),
      );
      if (controle.signal.aborted) return { ok: [], falhas: [] };
      const ok = [];
      resultados.forEach((r, i) => r.status === 'fulfilled' && ok.push([lista[i], r.value]));
      return { ok, falhas: resultados.filter((r) => r.status === 'rejected') };
    }

    function agendar(fn, ms) {
      if (parado) return;
      timers.push(setTimeout(fn, ms));
    }

    // Presidente: o arquivo do Brasil a cada 30s; os estados só quando o TSE gera um
    // resultado nacional novo. Governador/senador: os estados a cada 1 minuto.
    async function cicloAoVivo() {
      if (document.hidden) return agendar(cicloAoVivo, 5_000);
      if (cargo === 'presidente') {
        const { ok, falhas } = await buscar(['br']);
        if (controle.signal.aborted) return;
        if (ok.length) {
          setErro(null);
          const geracao = ok[0][1].geradoEm;
          if (geracao !== geracaoNacional.current) {
            const estados = await buscar(abrangencias.filter((a) => a !== 'br'));
            if (controle.signal.aborted) return;
            geracaoNacional.current = geracao;
            registrar([...ok, ...estados.ok]);
          } else {
            registrar(ok);
          }
        } else if (falhas.length) {
          setErro(falhas[0].reason?.message ?? 'Não foi possível obter os dados do TSE agora.');
        }
        agendar(cicloAoVivo, INTERVALO_NACIONAL_MS);
      } else {
        const { ok, falhas } = await buscar(abrangencias);
        if (controle.signal.aborted) return;
        if (ok.length) {
          setErro(null);
          registrar(ok);
        } else if (falhas.length) {
          setErro(falhas[0].reason?.message ?? 'Não foi possível obter os dados do TSE agora.');
        }
        agendar(cicloAoVivo, INTERVALO_ESTADOS_MS);
      }
    }

    async function cicloHistorico() {
      if (!document.hidden) {
        const abrs = await buscarHistoricoServidor(cargo, controle.signal);
        if (controle.signal.aborted) return;
        if (abrs) setServidor(abrs);
      }
      agendar(cicloHistorico, INTERVALO_HISTORICO_MS);
    }

    cicloAoVivo();
    cicloHistorico();
    return () => {
      parado = true;
      controle.abort();
      timers.forEach(clearTimeout);
    };
  }, [cargo]);

  const pontos = useMemo(() => {
    const resultado = {};
    for (const abr of ABRANGENCIAS[cargo] ?? []) {
      const lista = mesclarPontos(servidor[abr], vistos[abr]);
      if (lista.length) resultado[abr] = lista;
    }
    return resultado;
  }, [cargo, servidor, vistos]);

  return { aoVivo, pontos, erro };
}
