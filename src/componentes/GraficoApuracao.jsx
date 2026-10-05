import { useLayoutEffect, useRef, useState } from 'react';
import { corPartido } from '../lib/cores.js';
import { hora, nomeProprio, pct } from '../lib/formato.js';

const ALTURA = 150;
const M = { topo: 8, direita: 46, base: 20, esquerda: 30 };

// Curva suave passando pelos pontos (Catmull-Rom convertida em Bézier).
function curva(pts) {
  if (pts.length < 3) return `M${pts.map((p) => p.join(',')).join('L')}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1},${c2},${p2}`;
  }
  return d;
}

// "Ao longo da apuração": percentual dos dois primeiros conforme as seções são apuradas.
export default function GraficoApuracao({ pontos, candidatos, momento, viradas = [] }) {
  const caixa = useRef(null);
  const [largura, setLargura] = useState(0);
  const [destaque, setDestaque] = useState(null);

  useLayoutEffect(() => {
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(caixa.current);
    return () => obs.disconnect();
  }, []);

  const series = candidatos.slice(0, 2);
  const visiveis = (pontos || []).filter((p) => momento == null || p.t <= momento);
  const valores = visiveis.flatMap((p) => series.map((c) => p.percentuais[c.numero]).filter((v) => v != null));
  const temGrafico = largura > 0 && visiveis.length >= 2 && series.length === 2;

  let conteudo = null;
  if (temGrafico) {
    const passo = 2;
    const yMin = Math.max(0, Math.floor((Math.min(...valores) - 2) / passo) * passo);
    const yMax = Math.min(100, Math.ceil((Math.max(...valores) + 2) / passo) * passo);
    const larguraUtil = largura - M.esquerda - M.direita;
    const x = (v) => M.esquerda + (v / 100) * larguraUtil;
    const y = (v) => M.topo + (1 - (v - yMin) / (yMax - yMin || 1)) * (ALTURA - M.topo - M.base);
    const ticksY = [];
    for (let v = yMin; v <= yMax; v += passo) ticksY.push(v);
    // Muitos ticks em pouco espaço: mostra um sim, um não.
    const ticksYVisiveis = ticksY.length > 8 ? ticksY.filter((_, i) => i % 2 === 0) : ticksY;

    function mover(e) {
      const r = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - r.left;
      let melhor = 0;
      visiveis.forEach((p, i) => {
        if (Math.abs(x(p.apuradas) - px) < Math.abs(x(visiveis[melhor].apuradas) - px)) melhor = i;
      });
      setDestaque(melhor);
    }

    const ponto = destaque != null ? visiveis[destaque] : null;
    const ultimo = visiveis[visiveis.length - 1];

    conteudo = (
      <>
        <svg
          width={largura}
          height={ALTURA}
          onPointerMove={mover}
          onPointerDown={mover}
          onPointerLeave={() => setDestaque(null)}
          style={{ touchAction: 'pan-y', display: 'block' }}
          role="img"
          aria-label={`Evolução de ${series.map((c) => nomeProprio(c.nome)).join(' e ')} conforme as seções são apuradas`}
        >
          {ticksYVisiveis.map((v) => (
            <g key={v}>
              <line x1={M.esquerda} x2={largura - M.direita} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--borda)' }} />
              <text x={M.esquerda - 6} y={y(v)} style={{ fill: 'var(--texto-3)' }} fontSize="10" textAnchor="end" dominantBaseline="middle">
                {v}%
              </text>
            </g>
          ))}
          {[0, 50, 100].map((v) => (
            <text
              key={v}
              x={x(v)}
              y={ALTURA - 5}
              style={{ fill: 'var(--texto-3)' }}
              fontSize="10"
              textAnchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}
            >
              {v === 0 ? '0% das seções' : `${v}%`}
            </text>
          ))}
          {series.map((c) => (
            <path
              key={c.numero}
              fill="none"
              stroke={corPartido(c.partido)}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              d={curva(
                visiveis
                  .filter((p) => p.percentuais[c.numero] != null)
                  .map((p) => [x(p.apuradas), y(p.percentuais[c.numero])]),
              )}
            />
          ))}
          {/* Percentual na ponta de cada linha (afastados se ficarem colados) */}
          {(() => {
            const rotulos = series
              .map((c) => ({ c, v: ultimo.percentuais[c.numero] }))
              .filter((r) => r.v != null)
              .map((r) => ({ ...r, py: y(r.v) }))
              .sort((a, b) => a.py - b.py);
            if (rotulos.length === 2 && rotulos[1].py - rotulos[0].py < 11) {
              const meio = (rotulos[0].py + rotulos[1].py) / 2;
              rotulos[0].py = meio - 5.5;
              rotulos[1].py = meio + 5.5;
            }
            return rotulos.map((r) => (
              <text
                key={r.c.numero}
                x={x(ultimo.apuradas) + 7}
                y={r.py}
                fontSize="10"
                fontWeight="600"
                dominantBaseline="middle"
                style={{ fill: 'var(--texto)' }}
              >
                {pct(r.v, 1)}
              </text>
            ));
          })()}
          {viradas
            .filter((v) => momento == null || v.t <= momento)
            .map((v) => (
              <g key={v.t}>
                <line
                  x1={x(v.apuradas)}
                  x2={x(v.apuradas)}
                  y1={M.topo}
                  y2={ALTURA - M.base}
                  stroke={corPartido(v.novo.partido)}
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <text x={x(v.apuradas) + 3} y={M.topo + 8} style={{ fill: 'var(--texto-2)' }} fontSize="9">
                  virada
                </text>
              </g>
            ))}
          {ponto && (
            <line x1={x(ponto.apuradas)} x2={x(ponto.apuradas)} y1={M.topo} y2={ALTURA - M.base} style={{ stroke: 'var(--texto-3)' }} />
          )}
          {series.map((c) => {
            const p = ponto || ultimo;
            const v = p.percentuais[c.numero];
            if (v == null) return null;
            return (
              <circle
                key={c.numero}
                cx={x(p.apuradas)}
                cy={y(v)}
                r="4"
                fill={corPartido(c.partido)}
                style={{ stroke: 'var(--fundo)' }}
                strokeWidth="2"
              />
            );
          })}
        </svg>
        {ponto && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-borda bg-painel-2 px-2.5 py-2 text-xs shadow-xl"
            style={x(ponto.apuradas) > largura / 2 ? { right: largura - x(ponto.apuradas) + 10 } : { left: x(ponto.apuradas) + 10 }}
          >
            <div className="font-medium">{hora(ponto.t)}</div>
            <div className="text-texto-2">{pct(ponto.apuradas, 1)} das seções</div>
            {series.map((c) => (
              <div key={c.numero} className="mt-1 flex items-center gap-2">
                <span className="h-0.5 w-3 rounded" style={{ background: corPartido(c.partido) }} />
                <span className="flex-1">{nomeProprio(c.nome)}</span>
                <span className="numeros font-semibold">{pct(ponto.percentuais[c.numero] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <section>
      <h2 className="secao-titulo">Ao longo da apuração</h2>
      {series.length === 2 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((c) => (
            <span key={c.numero} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ background: corPartido(c.partido) }} />
              {nomeProprio(c.nome)}
            </span>
          ))}
        </div>
      )}
      <div ref={caixa} className="relative mt-3 min-h-[130px] rounded-lg bg-painel">
        {!temGrafico && (
          <p className="flex h-[130px] items-center justify-center px-4 text-center text-xs text-texto-3">
            O gráfico aparece a partir da 2ª atualização do TSE.
          </p>
        )}
        {conteudo}
      </div>
    </section>
  );
}
