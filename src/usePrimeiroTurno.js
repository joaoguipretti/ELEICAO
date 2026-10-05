import { useEffect, useState } from 'react';
import { buscarResultados, TURNO } from './tse.js';
import { criarPonto } from './historico.js';
import { montarVisao } from './lib/visao.js';
import { ABRANGENCIAS } from './useApuracao.js';

// O 1º turno já terminou: busca uma vez por cargo e guarda aqui.
const cache = new Map();

// Resultado final do 1º turno de cada abrangência, para comparar durante o 2º turno.
// No 1º turno (ou sem cargo) devolve vazio e não busca nada.
export function usePrimeiroTurno(cargo) {
  const [visoes, setVisoes] = useState(() => cache.get(cargo) ?? {});

  useEffect(() => {
    if (TURNO !== 2 || !cargo) return;
    if (cache.has(cargo)) return setVisoes(cache.get(cargo));
    const controle = new AbortController();

    (async () => {
      const lista = ABRANGENCIAS[cargo];
      const resultados = await Promise.allSettled(
        lista.map((abr) => buscarResultados(cargo, abr === 'br' ? null : abr.toUpperCase(), controle.signal, 1)),
      );
      if (controle.signal.aborted) return;
      const encontradas = {};
      resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          encontradas[lista[i]] = montarVisao(lista[i], criarPonto(r.value), r.value, true);
        }
      });
      if (Object.keys(encontradas).length) cache.set(cargo, encontradas);
      setVisoes(encontradas);
    })();

    return () => controle.abort();
  }, [cargo]);

  return TURNO === 2 && cargo ? visoes : {};
}
