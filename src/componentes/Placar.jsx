import Foto from './Foto.jsx';
import { corPartido } from '../lib/cores.js';
import { abreviado, decimal, nomeProprio, numero, pct, siglaPartido, votosPorExtenso } from '../lib/formato.js';
import { estimarVirada } from '../lib/visao.js';
import { TURNO } from '../tse.js';

function Lado({ candidato, frente, direita }) {
  const cor = corPartido(candidato.partido);
  return (
    <div className={`flex min-w-0 items-center gap-3 ${direita ? 'flex-row-reverse text-right' : ''}`}>
      <Foto candidato={candidato} tamanho={56} borda />
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold leading-tight">{nomeProprio(candidato.nome)}</div>
        <div className={`mt-1 flex items-center gap-2 text-xs ${direita ? 'justify-end' : ''}`}>
          <span className="font-semibold" style={{ color: cor }}>
            {siglaPartido(candidato.partido)} {candidato.numero}
          </span>
          {frente && <span className="rounded bg-painel-2 px-1.5 py-0.5 text-texto-2">na frente</span>}
        </div>
      </div>
    </div>
  );
}

function Numero({ candidato, primeiroTurno }) {
  const antes = primeiroTurno?.candidatos.find((c) => c.numero === candidato.numero);
  const diferenca = antes ? candidato.percentual - antes.percentual : null;
  return (
    <div className="text-center">
      <div className="numeros text-[40px] font-semibold leading-none tracking-tight sm:text-[46px]">
        {decimal(candidato.percentual, 1)}%
      </div>
      <div className="numeros mt-1.5 text-xs text-texto-2">{numero.format(candidato.votos)} votos</div>
      {antes && (
        <div className="numeros mt-0.5 text-[11px] text-texto-3">
          1º turno {pct(antes.percentual, 1)}
          {Math.abs(diferenca) >= 0.05 && ` (${diferenca > 0 ? '+' : '−'}${decimal(Math.abs(diferenca), 1)})`}
        </div>
      )}
    </div>
  );
}

// A frase do meio: quem já não pode ser alcançado, quanto o 2º precisa, ou o placar.
function Situacao({ visao }) {
  const [a, b] = visao.candidatos;
  const nome = (c) => nomeProprio(c.nome);
  if (!visao.comecou || !a) return <span className="text-texto-2">Aguardando o início da apuração.</span>;
  if (a.eleito) return <span className="font-semibold">{nome(a)} venceu.</span>;
  if (b && a.situacao === '2º turno' && b.situacao === '2º turno') {
    return (
      <span className="font-semibold">
        {nome(a)} e {nome(b)} vão ao 2º turno.
      </span>
    );
  }
  const estimativa = estimarVirada(visao);
  // No 1º turno, o que importa é se alguém ainda pode passar de 50% (e evitar o 2º turno).
  const restantes = estimativa?.restantes ?? 0;
  const maximoDoLider = (a.votos + restantes) / (visao.validos + restantes || 1);
  const minimoDoLider = a.votos / (visao.validos + restantes || 1);
  const segundoTurno =
    TURNO === 1 && maximoDoLider < 0.5 ? (
      <span className="font-semibold"> Ninguém chega a 50%: haverá 2º turno.</span>
    ) : TURNO === 1 && minimoDoLider > 0.5 ? (
      <span className="font-semibold"> {nome(a)} passa de 50% e vence no 1º turno.</span>
    ) : null;
  if (estimativa) {
    const diferenca = abreviado(a.votos - b.votos);
    const faltam = abreviado(estimativa.restantes);
    return estimativa.fatia >= 100 ? (
      <>
        <span className="font-semibold">{nome(a)} não pode mais ser alcançado.</span>{' '}
        <span className="text-texto-2">
          Faltam cerca de {faltam} votos, menos que a diferença de {diferenca}.
        </span>
        {segundoTurno}
      </>
    ) : (
      <>
        <span className="font-semibold">Ainda pode virar.</span>{' '}
        <span className="text-texto-2">
          Faltam cerca de {faltam} votos, mais que a diferença de {diferenca}.
        </span>
        {segundoTurno}
      </>
    );
  }
  return b ? (
    <span className="text-texto-2">
      {nome(a)} lidera por {votosPorExtenso(a.votos - b.votos)}.
    </span>
  ) : null;
}

// Placar de largura total: os dois primeiros nas pontas, os percentuais no meio e a barra.
export default function Placar({ visao, cargoNome, local, primeiroTurno }) {
  if (!visao) {
    return <section className="border-b border-borda px-5 py-8 text-sm text-texto-2">Carregando os dados do TSE…</section>;
  }
  const [a, b] = visao.candidatos;
  const corA = a ? corPartido(a.partido) : 'var(--trilho)';
  const corB = b ? corPartido(b.partido) : 'var(--trilho)';

  return (
    <section className="border-b border-borda px-5 pt-4 pb-3">
      {a && b && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Lado candidato={a} frente={visao.comecou} />
          <div className="flex items-start gap-6 sm:gap-10">
            <Numero candidato={a} primeiroTurno={primeiroTurno} />
            <Numero candidato={b} primeiroTurno={primeiroTurno} />
          </div>
          <Lado candidato={b} direita />
        </div>
      )}

      <div className="relative mt-3 h-1.5 rounded-full bg-trilho">
        {a && (
          <div
            className="absolute inset-y-0 left-0 rounded-l-full transition-[width] duration-700"
            style={{ width: `${a.percentual}%`, background: corA }}
          />
        )}
        {b && (
          <div
            className="absolute inset-y-0 right-0 rounded-r-full transition-[width] duration-700"
            style={{ width: `${b.percentual}%`, background: corB }}
          />
        )}
        <div className="absolute -top-1.5 -bottom-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded bg-texto" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
        <span>
          <span className="font-semibold">{cargoNome}</span> <span className="text-texto-2">em {local}</span>
        </span>
        <span className="text-center">
          <Situacao visao={visao} />
        </span>
        <span className="numeros text-texto-2">
          Diferença de {decimal(visao.vantagem, 1)} pts <span className="mx-1">•</span> {pct(visao.apuradas, 1)} das seções
        </span>
      </div>
    </section>
  );
}
