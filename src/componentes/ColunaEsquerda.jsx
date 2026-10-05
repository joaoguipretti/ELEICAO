import { corPartido } from '../lib/cores.js';
import { horaH, nomeProprio, numero, pct } from '../lib/formato.js';
import { nomeAbrangencia } from '../lib/regioes.js';

function Dado({ rotulo, valor }) {
  return (
    <div>
      <div className="rotulo">{rotulo}</div>
      <div className="numeros mt-0.5 text-[15px] font-semibold">{valor}</div>
    </div>
  );
}

export function Participacao({ visao }) {
  if (!visao) return null;
  const comparecimento = visao.comparecimento;
  return (
    <section>
      <h2 className="secao-titulo">Participação</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Dado rotulo="Votos válidos" valor={numero.format(visao.validos)} />
        <Dado rotulo="Comparecimento" valor={comparecimento != null ? pct(comparecimento, 1) : '–'} />
        <Dado rotulo="Abstenção" valor={comparecimento != null ? pct(100 - comparecimento, 1) : '–'} />
        <Dado rotulo="Brancos e nulos" valor={visao.brancosNulos != null ? pct(visao.brancosNulos, 1) : '–'} />
        <div className="col-span-2">
          <Dado
            rotulo="Seções apuradas"
            valor={`${numero.format(visao.secoes ?? 0)} de ${numero.format(visao.secoesTotal ?? 0)}`}
          />
        </div>
      </div>
    </section>
  );
}

// Lugares em que a liderança trocou de mãos durante a apuração (Brasil e estados).
export function Viradas({ viradas }) {
  return (
    <section>
      <h2 className="secao-titulo">Viradas</h2>
      {!viradas.length ? (
        <p className="mt-2 text-xs text-texto-2">Nenhum estado mudou de lado até agora.</p>
      ) : (
        <ul className="mt-2 space-y-2.5 text-xs">
          {viradas.map((v) => (
            <li key={`${v.abr}-${v.t}`} className="grid grid-cols-[40px_1fr] items-center gap-2">
              <span className="numeros text-texto-2">{horaH(v.t)}</span>
              <span>
                <span className="font-semibold">{v.abr === 'br' ? 'Brasil' : nomeAbrangencia(v.abr)}</span> virou para{' '}
                <span className="mx-0.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: corPartido(v.novo.partido) }} />{' '}
                {nomeProprio(v.novo.nome)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UltimasAtualizacoes({ eventos }) {
  return (
    <section>
      <h2 className="secao-titulo">Últimas atualizações</h2>
      {!eventos.length ? (
        <p className="mt-2 text-xs text-texto-2">As atualizações do TSE aparecem aqui conforme a apuração avança.</p>
      ) : (
        <ol className="mt-2 divide-y divide-borda">
          {eventos.map((e) => (
            <li key={e.t} className="grid grid-cols-[40px_1fr_auto] items-start gap-2 py-2 text-xs">
              <span className="numeros pt-px text-texto-2">{horaH(e.t)}</span>
              <div className="min-w-0 overflow-hidden whitespace-nowrap">
                <span>
                  <span className="numeros font-semibold">+{numero.format(e.secoesNovas)}</span>{' '}
                  <span className="text-texto-2">{e.secoesNovas === 1 ? 'seção' : 'seções'}</span>
                </span>
                {e.ufs.slice(0, 3).map((uf) => (
                  <span key={uf} className="ml-1 rounded bg-painel-2 px-1 py-px text-[10px] font-semibold text-texto-2">
                    {uf}
                  </span>
                ))}
                {e.ufs.length > 3 && <span className="ml-1 text-[10px] text-texto-3">+{e.ufs.length - 3}</span>}
                {e.virada && (
                  <div className="mt-0.5 whitespace-normal font-semibold" style={{ color: corPartido(e.virada.novo.partido) }}>
                    Virada: {nomeProprio(e.virada.novo.nome)} passa à frente
                  </div>
                )}
              </div>
              <div className="numeros flex gap-2.5 whitespace-nowrap">
                {e.candidatos.map((c) => (
                  <span key={c.numero} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: corPartido(c.partido) }} />
                    {pct(c.percentual, 1)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
