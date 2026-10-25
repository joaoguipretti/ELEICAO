import { useState } from 'react';
import { BarraDividida } from './ColunaDireita.jsx';
import { IconeSetaEsquerda } from './Icones.jsx';
import { corPartido, SEM_DADOS } from '../lib/cores.js';
import { hora, nomeProprio, numero, pct, quantidade, semAcento } from '../lib/formato.js';
import { nomeAbrangencia } from '../lib/regioes.js';

// Celular: onde estamos (Brasil / estado / cidade) e se é ao vivo ou um momento do passado.
export function Trilha({ estado, cidade, rotuloInicial, momento, onBrasil, onEstado, onAoVivo }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-2 text-xs">
      <nav className="flex min-w-0 items-center gap-1.5 text-texto-2" aria-label="Lugar">
        {estado ? (
          <>
            <button onClick={onBrasil} className="flex shrink-0 items-center gap-1 py-1 hover:text-texto">
              <IconeSetaEsquerda width={14} height={14} /> Brasil
            </button>
            <span className="text-texto-3">/</span>
            {cidade ? (
              <>
                <button onClick={onEstado} className="shrink-0 py-1 hover:text-texto">
                  {estado.toUpperCase()}
                </button>
                <span className="text-texto-3">/</span>
                <span className="truncate font-semibold text-texto">{nomeProprio(cidade.nm)}</span>
              </>
            ) : (
              <span className="truncate font-semibold text-texto">{nomeAbrangencia(estado)}</span>
            )}
          </>
        ) : (
          <span className="truncate py-1">{rotuloInicial}</span>
        )}
      </nav>
      {momento == null ? (
        <span className="flex shrink-0 items-center gap-1.5 font-semibold">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Ao vivo
        </span>
      ) : (
        <button
          onClick={onAoVivo}
          className="shrink-0 rounded-md border border-borda px-2 py-1 font-semibold text-texto-2"
        >
          <span className="numeros">{hora(momento)}</span> · Voltar ao vivo
        </button>
      )}
    </div>
  );
}

// Celular: abas fixas no topo ao rolar, no lugar das três colunas.
export function AbasCelular({ abas }) {
  const [ativa, setAtiva] = useState(abas[0].id);
  const atual = abas.find((a) => a.id === ativa) ?? abas[0];
  return (
    <main className="flex-1">
      <div className="sticky top-0 z-20 border-b border-borda bg-fundo/90 px-4 py-2 backdrop-blur">
        <div className="segmentado grid auto-cols-fr grid-flow-col text-[13px]">
          {abas.map((a) => (
            <button key={a.id} aria-pressed={atual.id === a.id} onClick={() => setAtiva(a.id)} className="py-1.5">
              {a.nome}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-7 px-4 py-5">{atual.conteudo}</div>
    </main>
  );
}

const POR_PAGINA = 30;

// Celular: as cidades do estado escolhido (faz o papel do mapa por município).
export function ListaCidades({ uf, municipios, par, candidatos, cidadeSelecionada, onEscolher, onVoltar }) {
  const [ordem, setOrdem] = useState('maiores');
  const [filtro, setFiltro] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);

  const sigla = uf.toUpperCase();
  const dados = municipios.dados;
  const t = semAcento(filtro.trim());
  const lista = Object.values(municipios.nomes ?? {}).filter(
    (c) => c.uf === sigla && (!t || semAcento(c.nm).includes(t)),
  );
  lista.sort((x, y) =>
    ordem === 'maiores' ? (dados[y.cdi]?.[5] ?? 0) - (dados[x.cdi]?.[5] ?? 0) : x.nm.localeCompare(y.nm, 'pt-BR'),
  );

  // O servidor manda os números como texto ("22"); o placar, às vezes como número.
  const mesmo = (x, y) => String(x) === String(y);
  const candidato = (n) => candidatos.find((c) => mesmo(c.numero, n));
  // Percentual de cada candidato na linha da cidade: [apuradas, nº 1º, % 1º, nº 2º, % 2º, eleitorado].
  function parDaCidade(r) {
    if (!r?.[1]) return [];
    const numeros = par ?? [r[1], r[3]];
    return numeros.map((n) => {
      const c = candidato(n);
      const percentual = mesmo(r[1], n) ? r[2] : mesmo(r[3], n) ? r[4] : null;
      return c && percentual != null ? { partido: c.partido, percentual } : null;
    });
  }

  const carregando = !municipios.nomes;

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <button
            onClick={onVoltar}
            className="flex items-center self-center text-texto-2"
            aria-label="Voltar aos estados"
          >
            <IconeSetaEsquerda width={16} height={16} />
          </button>
          <h2 className="secao-titulo">Cidades de {nomeAbrangencia(uf)}</h2>
        </div>
        <div className="segmentado">
          <button aria-pressed={ordem === 'maiores'} onClick={() => setOrdem('maiores')}>
            Maiores
          </button>
          <button aria-pressed={ordem === 'az'} onClick={() => setOrdem('az')}>
            A–Z
          </button>
        </div>
      </div>

      <input
        value={filtro}
        onChange={(e) => {
          setFiltro(e.target.value);
          setLimite(POR_PAGINA);
        }}
        placeholder="Filtrar cidades"
        aria-label="Filtrar cidades"
        className="mt-3 h-10 w-full rounded-lg border border-borda bg-painel px-3 text-base outline-none placeholder:text-texto-3"
      />

      {carregando ? (
        <p className="mt-4 text-xs text-texto-2">Carregando as cidades…</p>
      ) : !lista.length ? (
        <p className="mt-4 text-xs text-texto-2">Nenhuma cidade encontrada.</p>
      ) : (
        <ul className="mt-2">
          {lista.slice(0, limite).map((c) => {
            const r = dados[c.cdi];
            const lider = r?.[1] ? candidato(r[1]) : null;
            const [a, b] = parDaCidade(r);
            return (
              <li key={c.cdi}>
                <button
                  onClick={() => onEscolher(c)}
                  className={`flex w-full items-center gap-3 rounded-lg px-1.5 py-2.5 text-left transition-colors active:bg-painel-2 ${
                    cidadeSelecionada === c.cdi ? 'bg-painel-2' : ''
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: lider ? corPartido(lider.partido) : SEM_DADOS }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{nomeProprio(c.nm)}</span>
                    <span className="numeros block truncate text-[11px] text-texto-3">
                      {r ? `${pct(r[0], 0)} apurado · ${quantidade(r[5] ?? 0)} eleitores` : 'Aguardando apuração'}
                    </span>
                  </span>
                  <BarraDividida a={a} b={b} />
                  <span
                    className="numeros w-14 text-right text-sm font-semibold"
                    style={{ color: lider ? corPartido(lider.partido) : undefined }}
                  >
                    {lider ? pct(r[2], 1) : '–'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!carregando && lista.length > limite && (
        <button
          onClick={() => setLimite((l) => l + POR_PAGINA * 2)}
          className="mt-2 w-full rounded-lg border border-borda py-2.5 text-sm text-texto-2"
        >
          Mostrar mais ({numero.format(lista.length - limite)} restantes)
        </button>
      )}
    </section>
  );
}
