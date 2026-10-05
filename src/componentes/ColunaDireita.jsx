import { useState } from 'react';
import { corPartido, SEM_DADOS } from '../lib/cores.js';
import { decimal, pct, quantidade } from '../lib/formato.js';
import { nomeAbrangencia } from '../lib/regioes.js';

// Os dois candidatos da barra: o par fixo do Brasil (presidente) ou os dois primeiros do lugar.
function parDe(visao, par) {
  if (!visao?.comecou) return [];
  if (!par) return visao.candidatos.slice(0, 2);
  return par.map((n) => visao.candidatos.find((c) => c.numero === n)).filter(Boolean);
}

function BarraDividida({ a, b }) {
  return (
    <div className="relative h-1 w-16 shrink-0 rounded-full bg-trilho">
      {a && (
        <div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{ width: `${a.percentual}%`, background: corPartido(a.partido) }}
        />
      )}
      {b && (
        <div
          className="absolute inset-y-0 right-0 rounded-r-full"
          style={{ width: `${b.percentual}%`, background: corPartido(b.partido) }}
        />
      )}
    </div>
  );
}

function PercentualLider({ visao }) {
  const lider = visao?.comecou ? visao.candidatos[0] : null;
  return (
    <span className="numeros w-14 text-right text-sm font-semibold" style={{ color: lider ? corPartido(lider.partido) : undefined }}>
      {lider ? pct(lider.percentual, 1) : '–'}
    </span>
  );
}

export function Regioes({ regioes, par }) {
  return (
    <section>
      <h2 className="secao-titulo">Regiões</h2>
      <ul className="mt-2">
        {regioes.map((r) => {
          const lider = r.visao?.comecou ? r.visao.candidatos[0] : null;
          const [a, b] = parDe(r.visao, par);
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: lider ? corPartido(lider.partido) : SEM_DADOS }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{r.nome}</div>
                <div className="numeros truncate text-[11px] text-texto-3">
                  {r.visao ? `${pct(r.visao.apuradas, 1)} · faltam ${quantidade(r.visao.faltam ?? 0)}` : '–'}
                </div>
              </div>
              <BarraDividida a={a} b={b} />
              <PercentualLider visao={r.visao} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ListaEstados({ visoes, par, selecionado, onSelecionar }) {
  const [ordem, setOrdem] = useState('az');
  const lista = Object.values(visoes).filter((v) => v && v.abr !== 'br');
  lista.sort((x, y) => {
    if (ordem === 'apertados') {
      const vx = x.comecou ? x.vantagem : Infinity;
      const vy = y.comecou ? y.vantagem : Infinity;
      return vx - vy;
    }
    // A–Z, com o exterior no fim
    if (x.abr === 'zz') return 1;
    if (y.abr === 'zz') return -1;
    return nomeAbrangencia(x.abr).localeCompare(nomeAbrangencia(y.abr), 'pt-BR');
  });

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="secao-titulo">Estados</h2>
        <div className="segmentado">
          <button aria-pressed={ordem === 'az'} onClick={() => setOrdem('az')}>
            A–Z
          </button>
          <button aria-pressed={ordem === 'apertados'} onClick={() => setOrdem('apertados')}>
            Mais apertados
          </button>
        </div>
      </div>
      <ul className="mt-2">
        {lista.map((v) => {
          const lider = v.comecou ? v.candidatos[0] : null;
          const [a, b] = parDe(v, par);
          const ativo = selecionado === v.abr;
          return (
            <li key={v.abr}>
              <button
                onClick={() => onSelecionar(v.abr)}
                className={`flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-painel-2 ${
                  ativo ? 'bg-painel-2' : ''
                }`}
              >
                <span
                  className="flex h-6 w-8 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{
                    background: lider
                      ? `color-mix(in srgb, ${corPartido(lider.partido)} 75%, var(--fundo))`
                      : SEM_DADOS,
                  }}
                >
                  {v.abr.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {nomeAbrangencia(v.abr)}
                  {ordem === 'apertados' && v.comecou && (
                    <span className="numeros ml-1.5 text-[11px] text-texto-3">{decimal(v.vantagem, 1)} pts</span>
                  )}
                </span>
                <BarraDividida a={a} b={b} />
                <PercentualLider visao={v} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
