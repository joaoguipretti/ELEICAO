import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { geoContains, geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import malhaEstados from '../assets/brasil-uf.json';
import Foto from './Foto.jsx';
import { IconeCentralizar, IconeGlobo, IconeMais, IconeMenos } from './Icones.jsx';
import { corPartido, corResolvida, opacidadePorVantagem, SEM_DADOS } from '../lib/cores.js';
import { nomeProprio, pct } from '../lib/formato.js';
import { UF_POR_CODIGO_IBGE, UFS } from '../lib/regioes.js';
import { corrigirSentido } from '../lib/geo.js';

// Estados pequenos demais para um rótulo dentro: ganham um quadro na lateral.
const LATERAIS = ['RN', 'PB', 'PE', 'AL', 'SE', 'ES', 'RJ'];
// Pequenos ajustes de posição dos rótulos (em px) para não se sobreporem.
const AJUSTES = { DF: [16, -4], GO: [-10, 10], MA: [4, 4], PI: [6, 10], CE: [2, 0], SC: [10, 2] };
const LARGURA_LATERAL = 110;
const COR_APURADO = '#8fa3bf';

const ESTADOS = feature(malhaEstados, malhaEstados.objects[Object.keys(malhaEstados.objects)[0]]).features.map(
  (f) => ({ ...corrigirSentido(f), uf: UF_POR_CODIGO_IBGE[f.properties.codarea] }),
);
const COLECAO = { type: 'FeatureCollection', features: ESTADOS };

// Muda quando o tema claro/escuro é trocado, para o canvas redesenhar com as cores certas.
function useTema() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme);
  useEffect(() => {
    const atualizar = () => setTema(document.documentElement.dataset.theme);
    window.addEventListener('tema', atualizar);
    return () => window.removeEventListener('tema', atualizar);
  }, []);
  return tema;
}

// Distribui os quadros laterais na vertical, sem encostar um no outro.
function espalhar(itens, espaco) {
  const ordenados = [...itens].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ordenados.length; i++) {
    ordenados[i].y = Math.max(ordenados[i].y, ordenados[i - 1].y + espaco);
  }
  return ordenados;
}

// Cor e intensidade de cada estado: quem lidera (pela vantagem) ou quanto já foi apurado.
function preenchimento(visao, { cargo, colorir }) {
  if (!visao?.comecou) return { cor: SEM_DADOS, opacidade: 1 };
  if (colorir === 'apurado') return { cor: COR_APURADO, opacidade: 0.12 + (0.88 * visao.apuradas) / 100 };
  const lider = visao.candidatos[0];
  if (cargo !== 'presidente') {
    const definido = lider.eleito || lider.situacao === '2º turno';
    return { cor: corPartido(lider.partido), opacidade: definido ? 1 : 0.55 };
  }
  return { cor: corPartido(lider.partido), opacidade: opacidadePorVantagem(visao.vantagem) };
}

function Rotulo({ uf, visao, cargo, colorir }) {
  const lider = visao?.comecou ? visao.candidatos[0] : null;
  if (cargo !== 'presidente' && colorir !== 'apurado') {
    const [a, b] = visao?.comecou ? visao.candidatos : [];
    const dois = a && b && a.situacao === '2º turno' && b.situacao === '2º turno';
    return (
      <div className="flex flex-col items-center gap-0.5">
        {a && (
          <div className="flex -space-x-2">
            <Foto candidato={a} tamanho={30} borda />
            {dois && <Foto candidato={b} tamanho={30} borda />}
          </div>
        )}
        <span className="text-[10px] font-bold leading-none text-white drop-shadow">{uf}</span>
        {a && !dois && (
          <span className="numeros text-[10px] font-semibold leading-none text-white drop-shadow">
            {pct(a.percentual, 0)}
          </span>
        )}
      </div>
    );
  }
  const valor = colorir === 'apurado' ? visao?.apuradas : lider?.percentual;
  const cor = colorir === 'apurado' ? COR_APURADO : lider ? corPartido(lider.partido) : null;
  return (
    <div className="flex flex-col items-center leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      <span className="text-[11px] font-bold text-white">{uf}</span>
      {valor != null && visao?.comecou && (
        <span className="numeros mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: cor }} />
          {pct(valor, 0)}
        </span>
      )}
    </div>
  );
}

function QuadroLateral({ uf, visao, cargo, selecionado, onClick }) {
  const lider = visao?.comecou ? visao.candidatos[0] : null;
  const [a, b] = visao?.comecou ? visao.candidatos : [];
  const dois = cargo !== 'presidente' && a && b && a.situacao === '2º turno' && b.situacao === '2º turno';
  return (
    <button
      onClick={onClick}
      className={`flex h-[22px] items-center gap-1.5 rounded px-1.5 text-[11px] font-bold text-white transition-[filter] hover:brightness-125 ${
        selecionado ? 'ring-2 ring-texto' : ''
      }`}
      style={{
        background: lider ? `color-mix(in srgb, ${corPartido(lider.partido)} 75%, var(--fundo))` : SEM_DADOS,
      }}
    >
      {cargo !== 'presidente' && a && (
        <span className="flex -space-x-1.5">
          <Foto candidato={a} tamanho={16} />
          {dois && <Foto candidato={b} tamanho={16} />}
        </span>
      )}
      <span>{uf}</span>
      {lider && !dois && <span className="numeros font-semibold">{pct(lider.percentual, 0)}</span>}
    </button>
  );
}

// As 5.570 cidades num canvas (em SVG seriam pesadas demais): preenchidas pela cor de quem
// lidera, ou como círculos do tamanho do eleitorado. Redesenha só quando muda tamanho, zoom,
// dados ou tema — nunca ao passar o mouse.
function CamadaCidades({ largura, altura, projecao, zoom, malha, corDe, bolhas, centros, eleitoradoDe, tema }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const dpr = window.devicePixelRatio || 1;
    const quadro = requestAnimationFrame(() => {
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(altura * dpr);
      const ctx = canvas.getContext('2d');
      const resolvidas = new Map();
      const resolver = (cor) => {
        if (!resolvidas.has(cor)) resolvidas.set(cor, corResolvida(cor));
        return resolvidas.get(cor);
      };
      ctx.setTransform(dpr * zoom.k, 0, 0, dpr * zoom.k, dpr * zoom.x, dpr * zoom.y);
      const caminho = geoPath(projecao, ctx);
      ctx.lineJoin = 'round';

      if (bolhas) {
        // Fundo: o território, na cor neutra; por cima, um círculo por cidade.
        ctx.fillStyle = resolver(SEM_DADOS);
        for (const f of ESTADOS) {
          ctx.beginPath();
          caminho(f);
          ctx.fill();
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const escala = Math.sqrt(zoom.k);
        const ordenadas = malha
          .map((f) => [f, eleitoradoDe(f.cdi)])
          .filter(([, e]) => e > 0)
          .sort((x, y) => y[1] - x[1]);
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = resolver('var(--fundo)');
        for (const [f, eleitorado] of ordenadas) {
          const centro = centros[f.cdi];
          if (!centro) continue;
          const { cor, opacidade } = corDe(f.cdi);
          ctx.globalAlpha = Math.max(0.35, opacidade);
          ctx.fillStyle = resolver(cor);
          ctx.beginPath();
          ctx.arc(centro[0] * zoom.k + zoom.x, centro[1] * zoom.k + zoom.y, Math.max(0.8, Math.sqrt(eleitorado) * 0.0095 * escala), 0, 2 * Math.PI);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = 0.5 / zoom.k;
        for (const f of malha) {
          const { cor, opacidade } = corDe(f.cdi);
          const c = resolver(cor);
          ctx.globalAlpha = opacidade;
          ctx.fillStyle = c;
          ctx.strokeStyle = c;
          ctx.beginPath();
          caminho(f);
          ctx.fill();
          ctx.stroke(); // fecha as frestas entre cidades vizinhas
        }
      }
      ctx.globalAlpha = 1;
    });
    return () => cancelAnimationFrame(quadro);
  }, [largura, altura, projecao, zoom, malha, corDe, bolhas, centros, eleitoradoDe, tema]);
  return (
    <canvas ref={ref} style={{ width: largura, height: altura }} className="pointer-events-none absolute inset-0" />
  );
}

function DicaCidade({ cdi, municipios, candidatos }) {
  const info = municipios.nomes?.[cdi];
  const resumo = municipios.dados[cdi];
  const antes = municipios.primeiroTurno?.[cdi];
  const candidato = (numero) => candidatos.find((c) => c.numero === numero);
  const linhas = (r) =>
    r?.[1]
      ? [
          [r[1], r[2]],
          [r[3], r[4]],
        ].filter(([n]) => n && candidato(n))
      : [];

  return (
    <>
      <div className="flex items-center gap-2">
        {info && <span className="rounded bg-painel px-1.5 py-0.5 text-[10px] font-bold text-texto-2">{info.uf}</span>}
        <span className="text-sm font-semibold">{info ? nomeProprio(info.nm) : 'Cidade'}</span>
      </div>
      {resumo ? (
        <>
          <div className="mt-0.5 text-texto-2">{pct(resumo[0], 1)} das seções</div>
          {linhas(resumo).map(([n, p]) => (
            <div key={n} className="mt-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: corPartido(candidato(n).partido) }} />
              <span className="flex-1 truncate">{nomeProprio(candidato(n).nome)}</span>
              <span className="numeros font-semibold">{pct(p, 1)}</span>
            </div>
          ))}
          {linhas(antes).length > 0 && (
            <div className="mt-2 border-t border-borda pt-1.5 text-[11px] text-texto-3">
              1º turno: {linhas(antes).map(([n, p]) => `${nomeProprio(candidato(n).nome)} ${pct(p, 1)}`).join(' · ')}
            </div>
          )}
          <div className="mt-1.5 text-[10px] text-texto-3">Clique para ver o resultado completo</div>
        </>
      ) : (
        <div className="text-texto-2">Aguardando apuração</div>
      )}
    </>
  );
}

function DicaEstado({ uf, visao, primeiroTurno }) {
  return (
    <>
      <div className="text-sm font-semibold">{UFS[uf]}</div>
      {visao?.comecou ? (
        <>
          <div className="text-texto-2">{pct(visao.apuradas, 1)} das seções</div>
          {visao.candidatos.slice(0, 2).map((c) => (
            <div key={c.numero} className="mt-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: corPartido(c.partido) }} />
              <span className="flex-1 truncate">{nomeProprio(c.nome)}</span>
              <span className="numeros font-semibold">{pct(c.percentual)}</span>
            </div>
          ))}
          {primeiroTurno && (
            <div className="mt-2 border-t border-borda pt-1.5 text-[11px] text-texto-3">
              1º turno:{' '}
              {visao.candidatos
                .slice(0, 2)
                .map((c) => {
                  const antes = primeiroTurno.candidatos.find((x) => x.numero === c.numero);
                  return antes ? `${nomeProprio(c.nome)} ${pct(antes.percentual, 1)}` : null;
                })
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </>
      ) : (
        <div className="text-texto-2">Aguardando apuração</div>
      )}
    </>
  );
}

export default function Mapa({
  cargo,
  visoes,
  recorte = 'estados', // 'estados' | 'municipios' | 'eleitorado'
  colorir = 'lider', // 'lider' | 'apurado'
  selecionado,
  onSelecionar,
  onRecentrar,
  mostrarExterior,
  primeiroTurno = {},
  municipios = null,
  candidatos = [],
  cidadeSelecionada = null,
  onSelecionarCidade,
}) {
  const caixa = useRef(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const [dica, setDica] = useState(null);
  const arraste = useRef(null);
  const tema = useTema();

  useLayoutEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setTamanho({ largura: e.contentRect.width, altura: e.contentRect.height }),
    );
    obs.observe(caixa.current);
    return () => obs.disconnect();
  }, []);

  const { largura, altura } = tamanho;
  const geometria = useMemo(() => {
    if (!largura || !altura) return null;
    const projecao = geoMercator().fitExtent(
      [
        [12, 12],
        [Math.max(100, largura - LARGURA_LATERAL - 12), altura - 12],
      ],
      COLECAO,
    );
    const caminho = geoPath(projecao);
    return {
      projecao,
      caminho,
      estados: ESTADOS.map((f) => ({ uf: f.uf, d: caminho(f), centro: caminho.centroid(f), limites: caminho.bounds(f) })),
      limiteDireito: caminho.bounds(COLECAO)[1][0],
    };
  }, [largura, altura]);

  // Estado escolhido: o mapa dá zoom nele (para ver os municípios). Sem estado: Brasil inteiro.
  useEffect(() => {
    if (!geometria) return;
    const estado = selecionado && selecionado !== 'zz' && geometria.estados.find((g) => g.uf.toLowerCase() === selecionado);
    if (!estado) {
      setZoom({ k: 1, x: 0, y: 0 });
      return;
    }
    const [[x0, y0], [x1, y1]] = estado.limites;
    const k = Math.min(12, 0.85 * Math.min((largura - 40) / (x1 - x0 || 1), (altura - 40) / (y1 - y0 || 1)));
    setZoom({ k, x: largura / 2 - ((x0 + x1) / 2) * k, y: altura / 2 - ((y0 + y1) / 2) * k });
  }, [selecionado, geometria, largura, altura]);

  const porCidade =
    cargo === 'presidente' &&
    (recorte === 'municipios' || recorte === 'eleitorado') &&
    Boolean(municipios?.malha) &&
    Object.keys(municipios?.dados ?? {}).length > 0;
  const bolhas = porCidade && recorte === 'eleitorado';

  const corDaCidade = useMemo(() => {
    const partidoDe = Object.fromEntries(candidatos.map((c) => [c.numero, c.partido]));
    const dados = municipios?.dados ?? {};
    return (cdi) => {
      const r = dados[cdi];
      if (colorir === 'apurado') {
        return r ? { cor: COR_APURADO, opacidade: 0.12 + (0.88 * r[0]) / 100 } : { cor: SEM_DADOS, opacidade: 1 };
      }
      if (r?.[1] && partidoDe[r[1]]) {
        return { cor: corPartido(partidoDe[r[1]]), opacidade: opacidadePorVantagem(r[2] - (r[4] ?? 0)) };
      }
      // Cidade ainda sem dado do servidor: usa a cor do estado (os 2 primeiros dígitos do
      // código IBGE são o estado), para o mapa não ficar com buracos enquanto carrega.
      const uf = UF_POR_CODIGO_IBGE[String(cdi).slice(0, 2)];
      const visao = uf ? visoes[uf.toLowerCase()] : null;
      if (!visao?.comecou) return { cor: SEM_DADOS, opacidade: 1 };
      return { cor: corPartido(visao.candidatos[0].partido), opacidade: opacidadePorVantagem(visao.vantagem) * 0.7 };
    };
  }, [municipios?.dados, candidatos, visoes, colorir]);

  const eleitoradoDe = useMemo(() => {
    const dados = municipios?.dados ?? {};
    return (cdi) => dados[cdi]?.[5] ?? 0;
  }, [municipios?.dados]);

  const centros = useMemo(() => {
    if (!geometria || !municipios?.malha) return {};
    return Object.fromEntries(municipios.malha.map((f) => [f.cdi, geometria.caminho.centroid(f)]));
  }, [geometria, municipios?.malha]);

  const cidadePorCodigo = useMemo(
    () => Object.fromEntries((municipios?.malha ?? []).map((f) => [f.cdi, f])),
    [municipios?.malha],
  );

  // Qual cidade está sob o ponteiro: converte o pixel em latitude/longitude e testa só as
  // cidades cujo retângulo contém o ponto (rápido mesmo com 5.570).
  function cidadeEm(x, y) {
    if (!geometria || !municipios?.malha) return null;
    const ponto = geometria.projecao.invert([(x - zoom.x) / zoom.k, (y - zoom.y) / zoom.k]);
    if (!ponto) return null;
    const [lon, lat] = ponto;
    for (const f of municipios.malha) {
      const [[o, s], [l, n]] = f.limites;
      if (lon >= o && lon <= l && lat >= s && lat <= n && geoContains(f, ponto)) return f.cdi;
    }
    return null;
  }

  const transformar = ([x, y]) => [x * zoom.k + zoom.x, y * zoom.k + zoom.y];
  const ajustar = (uf, [x, y]) => {
    const [dx, dy] = AJUSTES[uf] || [0, 0];
    return [x + dx, y + dy];
  };

  // Com um estado aberto (zoom), os rótulos e quadros dos outros estados saem da frente.
  const visaoGeral = !selecionado || selecionado === 'zz';
  const xLateral = geometria ? Math.min(largura - 90, geometria.limiteDireito * zoom.k + zoom.x + 34) : 0;
  const laterais =
    geometria && visaoGeral
      ? espalhar(
          geometria.estados
            .filter((g) => LATERAIS.includes(g.uf))
            .map((g) => {
              const [cx, cy] = transformar(g.centro);
              return { uf: g.uf, cx, cy, y: cy - 11 };
            }),
          27,
        )
      : [];
  const yExterior = laterais.length ? laterais[laterais.length - 1].y + 40 : altura / 2;

  function mudarZoom(fator) {
    setZoom((z) => {
      const k = Math.min(16, Math.max(1, z.k * fator));
      if (k === 1) return { k: 1, x: 0, y: 0 };
      const cx = largura / 2;
      const cy = altura / 2;
      return { k, x: cx - ((cx - z.x) / z.k) * k, y: cy - ((cy - z.y) / z.k) * k };
    });
  }

  function iniciarArraste(e) {
    if (zoom.k === 1) return;
    arraste.current = { x: e.clientX, y: e.clientY, z: zoom, moveu: false };
  }
  function arrastar(e) {
    const a = arraste.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
    setZoom({ ...a.z, x: a.z.x + dx, y: a.z.y + dy });
  }
  function soltar() {
    setTimeout(() => (arraste.current = null), 0);
  }
  const clicouSemArrastar = () => !arraste.current?.moveu;

  function mostrarDicaEstado(e, uf) {
    const r = caixa.current.getBoundingClientRect();
    setDica({ uf, x: e.clientX - r.left, y: e.clientY - r.top });
  }

  const opcoes = { cargo, colorir };

  return (
    <div ref={caixa} className="relative h-full w-full select-none overflow-hidden">
      {geometria && porCidade && (
        <CamadaCidades
          largura={largura}
          altura={altura}
          projecao={geometria.projecao}
          zoom={zoom}
          malha={municipios.malha}
          corDe={corDaCidade}
          bolhas={bolhas}
          centros={centros}
          eleitoradoDe={eleitoradoDe}
          tema={tema}
        />
      )}
      {geometria && (
        <svg
          width={largura}
          height={altura}
          className={`relative ${zoom.k > 1 ? 'cursor-grab active:cursor-grabbing' : porCidade ? 'cursor-pointer' : ''}`}
          onPointerDown={iniciarArraste}
          onPointerMove={(e) => {
            arrastar(e);
            if (!porCidade || arraste.current?.moveu) return;
            const r = caixa.current.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            const cdi = cidadeEm(x, y);
            setDica(cdi ? { cidade: cdi, x, y } : null);
          }}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onPointerLeave={() => {
            soltar();
            if (porCidade) setDica(null);
          }}
          onClick={() => {
            if (!porCidade || !clicouSemArrastar()) return;
            const info = dica?.cidade ? municipios.nomes?.[dica.cidade] : null;
            if (!info) return;
            // No Brasil inteiro, o clique abre o estado (zoom); dentro do estado, abre a cidade.
            if (visaoGeral) onSelecionar(info.uf.toLowerCase());
            else onSelecionarCidade?.(info);
          }}
          role="img"
          aria-label={porCidade ? 'Mapa do Brasil por município' : 'Mapa do Brasil por estado'}
        >
          <g transform={`translate(${zoom.x},${zoom.y}) scale(${zoom.k})`}>
            {geometria.estados.map((g) => {
              // No mapa por município, os estados viram só o contorno por cima das cidades.
              if (porCidade) {
                return (
                  <path
                    key={g.uf}
                    d={g.d}
                    fill="none"
                    style={{ stroke: 'var(--fundo)' }}
                    strokeWidth={1.4 / zoom.k}
                    pointerEvents="none"
                  />
                );
              }
              const { cor, opacidade } = preenchimento(visoes[g.uf.toLowerCase()], opcoes);
              return (
                <path
                  key={g.uf}
                  d={g.d}
                  style={{ fill: cor, stroke: 'var(--fundo)' }}
                  fillOpacity={opacidade}
                  strokeWidth={0.9 / zoom.k}
                  className="cursor-pointer transition-[fill-opacity] duration-500 hover:brightness-125"
                  onPointerMove={(e) => mostrarDicaEstado(e, g.uf)}
                  onPointerLeave={() => setDica(null)}
                  onClick={() => clicouSemArrastar() && onSelecionar(g.uf.toLowerCase())}
                />
              );
            })}
            {selecionado &&
              geometria.estados
                .filter((g) => g.uf.toLowerCase() === selecionado)
                .map((g) => (
                  <path key="sel" d={g.d} fill="none" style={{ stroke: 'var(--texto)' }} strokeWidth={2 / zoom.k} pointerEvents="none" />
                ))}
            {porCidade &&
              [dica?.cidade, cidadeSelecionada]
                .filter((cdi, i, lista) => cdi && cidadePorCodigo[cdi] && lista.indexOf(cdi) === i)
                .map((cdi) => (
                  <path
                    key={`cidade-${cdi}`}
                    d={geometria.caminho(cidadePorCodigo[cdi])}
                    fill="none"
                    style={{ stroke: 'var(--texto)' }}
                    strokeWidth={(cdi === cidadeSelecionada ? 2 : 1.2) / zoom.k}
                    pointerEvents="none"
                  />
                ))}
          </g>
          {laterais.map((l) => (
            <path
              key={l.uf}
              d={`M${l.cx},${l.cy} L${xLateral - 16},${l.y + 11} L${xLateral},${l.y + 11}`}
              fill="none"
              style={{ stroke: 'var(--texto-3)' }}
              strokeWidth="0.8"
              pointerEvents="none"
            />
          ))}
        </svg>
      )}

      {/* Rótulos por cima do mapa (só na visão do Brasil inteiro) */}
      {geometria &&
        visaoGeral &&
        geometria.estados
          .filter((g) => !LATERAIS.includes(g.uf))
          .map((g) => {
            const [x, y] = ajustar(g.uf, transformar(g.centro));
            return (
              <div key={g.uf} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
                <Rotulo uf={g.uf} visao={visoes[g.uf.toLowerCase()]} {...opcoes} />
              </div>
            );
          })}

      {laterais.map((l) => (
        <div key={l.uf} className="absolute" style={{ left: xLateral, top: l.y }}>
          <QuadroLateral
            uf={l.uf}
            visao={visoes[l.uf.toLowerCase()]}
            cargo={cargo}
            selecionado={selecionado === l.uf.toLowerCase()}
            onClick={() => onSelecionar(l.uf.toLowerCase())}
          />
        </div>
      ))}

      {mostrarExterior && geometria && visaoGeral && (
        <div className="absolute" style={{ left: xLateral, top: yExterior }}>
          <button
            onClick={() => onSelecionar('zz')}
            className={`flex h-[22px] items-center gap-1.5 rounded px-1.5 text-[11px] font-bold text-white hover:brightness-125 ${
              selecionado === 'zz' ? 'ring-2 ring-texto' : ''
            }`}
            style={{
              background: visoes.zz?.comecou
                ? `color-mix(in srgb, ${corPartido(visoes.zz.candidatos[0].partido)} 75%, var(--fundo))`
                : SEM_DADOS,
            }}
            title="Eleitores no exterior"
          >
            <IconeGlobo width={12} height={12} />
            {visoes.zz?.comecou && <span className="numeros">{pct(visoes.zz.candidatos[0].percentual, 0)}</span>}
          </button>
        </div>
      )}

      {/* Zoom e centralizar */}
      <div className="absolute right-2 bottom-2 flex flex-col overflow-hidden rounded-lg border border-borda bg-painel">
        <button onClick={() => mudarZoom(1.5)} className="p-2 text-texto-2 hover:text-texto" aria-label="Aproximar">
          <IconeMais />
        </button>
        <button onClick={() => mudarZoom(1 / 1.5)} className="border-y border-borda p-2 text-texto-2 hover:text-texto" aria-label="Afastar">
          <IconeMenos />
        </button>
        <button
          onClick={() => (visaoGeral ? setZoom({ k: 1, x: 0, y: 0 }) : onRecentrar?.())}
          className="p-2 text-texto-2 hover:text-texto"
          aria-label="Voltar ao Brasil inteiro"
          title="Voltar ao Brasil inteiro"
        >
          <IconeCentralizar />
        </button>
      </div>

      {/* Dica ao passar o mouse */}
      {dica && (
        <div
          className="pointer-events-none absolute z-10 min-w-[190px] rounded-xl border border-borda bg-painel-2/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur"
          style={{
            left: dica.x > largura - 230 ? dica.x - 205 : dica.x + 14,
            top: Math.min(dica.y + 14, altura - 130),
          }}
        >
          {dica.cidade ? (
            <DicaCidade cdi={dica.cidade} municipios={municipios} candidatos={candidatos} />
          ) : (
            <DicaEstado uf={dica.uf} visao={visoes[dica.uf.toLowerCase()]} primeiroTurno={primeiroTurno[dica.uf.toLowerCase()]} />
          )}
        </div>
      )}
    </div>
  );
}
