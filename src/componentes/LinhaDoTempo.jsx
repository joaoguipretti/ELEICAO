import { useRef } from 'react';
import { relogio } from '../lib/formato.js';

const HORA = 3_600_000;

// Linha do tempo da apuração: arrastar volta o site inteiro para aquele momento.
export default function LinhaDoTempo({ inicio, momentos, momento, agora, onMudar, viradas = [] }) {
  const trilho = useRef(null);
  const ultimo = momentos.length ? momentos[momentos.length - 1] : null;
  const fim = Math.max(inicio + 6 * HORA, ultimo ?? 0);
  const fracao = (t) => Math.min(1, Math.max(0, (t - inicio) / (fim - inicio)));
  const posicao = momento ?? ultimo ?? inicio;
  const horas = [];
  for (let t = inicio; t <= fim + 1; t += 2 * HORA) horas.push(t);

  function escolher(e) {
    if (!momentos.length) return;
    const r = trilho.current.getBoundingClientRect();
    const t = inicio + ((e.clientX - r.left) / r.width) * (fim - inicio);
    if (t >= ultimo) return onMudar(null);
    // Encaixa na última geração do TSE até aquele instante.
    let escolhido = momentos[0];
    for (const m of momentos) if (m <= t) escolhido = m;
    onMudar(escolhido);
  }

  const aoVivo = momento == null;

  return (
    <div className="flex items-center gap-4">
      <div className="numeros w-[92px] shrink-0 text-xl font-medium">{relogio(aoVivo ? agora : momento)}</div>

      <div className="min-w-0 flex-1">
        <div
          ref={trilho}
          className="relative h-5 cursor-pointer touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            escolher(e);
          }}
          onPointerMove={(e) => e.buttons && escolher(e)}
          role="slider"
          aria-label="Momento da apuração"
          aria-valuemin={inicio}
          aria-valuemax={fim}
          aria-valuenow={posicao}
          aria-valuetext={relogio(posicao)}
          tabIndex={0}
          onKeyDown={(e) => {
            const i = momentos.indexOf(momento ?? ultimo);
            if (e.key === 'ArrowLeft' && i > 0) onMudar(momentos[i - 1]);
            if (e.key === 'ArrowRight') onMudar(i >= 0 && i < momentos.length - 2 ? momentos[i + 1] : null);
          }}
        >
          {/* Trecho já apurado (contínuo) e o que ainda vem (pontilhado) */}
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[radial-gradient(circle,#3a3a3a_1px,transparent_1.5px)] bg-[length:6px_3px]" />
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-texto-3"
            style={{ width: `${fracao(ultimo ?? inicio) * 100}%` }}
          />
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-texto-2"
            style={{ width: `${fracao(posicao) * 100}%` }}
          />
          {viradas.map((v) => (
            <div
              key={v.t}
              title={`Virada às ${relogio(v.t).slice(0, 5)}`}
              className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${fracao(v.t) * 100}%`, background: v.cor }}
            />
          ))}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fundo bg-texto shadow"
            style={{ left: `${fracao(posicao) * 100}%` }}
          />
        </div>
        <div className="relative mt-0.5 h-3.5 text-[10px] text-texto-3">
          {horas.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${fracao(t) * 100}%` }}>
              {relogio(t).slice(0, 2)}h
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() => onMudar(null)}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          aoVivo ? 'bg-texto text-fundo' : 'border border-borda text-texto-2 hover:text-texto'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${aoVivo ? 'animate-pulse bg-fundo' : 'bg-texto-3'}`} />
        {aoVivo ? 'Ao vivo' : 'Voltar ao vivo'}
      </button>
    </div>
  );
}
