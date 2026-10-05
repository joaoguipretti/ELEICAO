import { useEffect, useMemo, useState } from 'react';
import BarraTopo from './componentes/BarraTopo.jsx';
import Busca from './componentes/Busca.jsx';
import GraficoApuracao from './componentes/GraficoApuracao.jsx';
import LinhaDoTempo from './componentes/LinhaDoTempo.jsx';
import Mapa from './componentes/Mapa.jsx';
import Placar from './componentes/Placar.jsx';
import { Participacao, UltimasAtualizacoes, Viradas } from './componentes/ColunaEsquerda.jsx';
import { ListaEstados, Regioes } from './componentes/ColunaDireita.jsx';
import { IconeSetaEsquerda } from './componentes/Icones.jsx';
import { useApuracao } from './useApuracao.js';
import { usePrimeiroTurno } from './usePrimeiroTurno.js';
import { carregarCidades, useCidade, useMunicipios } from './useMunicipios.js';
import { CARGOS_TSE, INICIO_APURACAO, TURNO } from './tse.js';
import { criarPonto } from './historico.js';
import { encontrarViradas, montarEventos, montarVisao, pontoEm, somarVisoes } from './lib/visao.js';
import { nomeAbrangencia, REGIOES, UFS } from './lib/regioes.js';
import { corPartido, FAIXAS_VANTAGEM, opacidadePorVantagem } from './lib/cores.js';
import { decimal, nomeProprio, numero, siglaPartido } from './lib/formato.js';

const ABAS = [
  { id: 'presidente', nome: 'Presidente' },
  { id: 'governador', nome: 'Governadores' },
].filter((a) => CARGOS_TSE[a.id]);

// Visão de cada abrangência no momento escolhido (null = ao vivo). Antes da apuração começar
// ainda não há pontos: usa o arquivo ao vivo (todos com zero votos).
function visoesDe({ aoVivo, pontos }, momento) {
  const resultado = {};
  for (const abr of new Set([...Object.keys(aoVivo), ...Object.keys(pontos)])) {
    const ponto = pontos[abr] ? pontoEm(pontos[abr], momento) : aoVivo[abr] ? criarPonto(aoVivo[abr]) : null;
    resultado[abr] = montarVisao(abr, ponto, aoVivo[abr], momento == null);
  }
  return resultado;
}

function useAgora() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

// Quem lidera onde, para a legenda: quantos lugares e quanto do eleitorado cada partido tem.
function liderancas({ porCidade, municipios, candidatos, visoes }) {
  const conta = new Map();
  let eleitoradoTotal = 0;
  const somar = (sigla, eleitorado) => {
    const atual = conta.get(sigla) ?? { lugares: 0, eleitorado: 0 };
    conta.set(sigla, { lugares: atual.lugares + 1, eleitorado: atual.eleitorado + eleitorado });
    eleitoradoTotal += eleitorado;
  };
  if (porCidade) {
    const partidoDe = Object.fromEntries(candidatos.map((c) => [c.numero, c.partido]));
    for (const r of Object.values(municipios.dados)) if (partidoDe[r[1]]) somar(partidoDe[r[1]], r[5] ?? 0);
  } else {
    for (const [abr, v] of Object.entries(visoes)) {
      if (abr === 'br' || abr === 'zz' || !v?.comecou) continue;
      somar(v.candidatos[0].partido, v.eleitorado ?? 0);
    }
  }
  const lista = [...conta.entries()].sort((a, b) => b[1].lugares - a[1].lugares);
  return { lista, eleitoradoTotal };
}

function Legenda({ cargo, colorir, porCidade, municipios, candidatos, visoes }) {
  if (colorir === 'apurado') {
    return (
      <div className="flex items-center gap-2 text-xs text-texto-2">
        <span className="h-2.5 w-24 rounded-sm bg-gradient-to-r from-[#8fa3bf1f] to-[#8fa3bf]" />
        seções apuradas: 0% → 100%
      </div>
    );
  }
  const { lista, eleitoradoTotal } = liderancas({ porCidade, municipios, candidatos, visoes });
  const principais = lista.slice(0, 2);
  const outros = lista.slice(2).reduce((s, [, v]) => s + v.lugares, 0);
  const unidade = porCidade ? 'municípios' : 'estados';
  return (
    <div className="space-y-1.5 text-xs text-texto-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {principais.map(([sigla, v]) => (
          <span key={sigla} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: corPartido(sigla) }} />
            <span className="font-semibold text-texto">{siglaPartido(sigla)}</span> lidera em{' '}
            <span className="numeros">{numero.format(v.lugares)}</span> {unidade}
            {eleitoradoTotal > 0 && (
              <span className="numeros"> · {decimal((v.eleitorado / eleitoradoTotal) * 100, 0)}% do eleitorado</span>
            )}
          </span>
        ))}
        {outros > 0 && <span>Outros lideram em {numero.format(outros)}</span>}
      </div>
      {cargo === 'presidente' ? (
        <div className="flex items-center gap-2">
          {principais.map(([sigla]) => (
            <span key={sigla} className="flex">
              {[0, ...FAIXAS_VANTAGEM].map((f) => (
                <span
                  key={f}
                  className="h-2.5 w-3 first:rounded-l-sm last:rounded-r-sm"
                  style={{ background: corPartido(sigla), opacity: opacidadePorVantagem(f + 0.1) }}
                />
              ))}
            </span>
          ))}
          vantagem: até {FAIXAS_VANTAGEM.join(' · ')} · mais pontos
        </div>
      ) : (
        <div>claro: apurando · forte: definido</div>
      )}
    </div>
  );
}

// CSV (Excel em português: separador ";" e vírgula decimal) com o resultado de cada lugar.
function baixarCsv(cargo, visoes) {
  const linhas = [
    ['Lugar', 'Seções apuradas (%)', '1º colocado', 'Partido', 'Votos', '%', '2º colocado', 'Partido', 'Votos', '%'],
  ];
  const ordem = Object.values(visoes)
    .filter(Boolean)
    .sort((a, b) =>
      a.abr === 'br' ? -1 : b.abr === 'br' ? 1 : nomeAbrangencia(a.abr).localeCompare(nomeAbrangencia(b.abr), 'pt-BR'),
    );
  for (const v of ordem) {
    const [a, b] = v.candidatos;
    const c = (x) => (x ? [nomeProprio(x.nome), x.partido, x.votos, decimal(x.percentual)] : ['', '', '', '']);
    linhas.push([nomeAbrangencia(v.abr), decimal(v.apuradas), ...c(a), ...c(b)]);
  }
  const texto = '﻿' + linhas.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `apuracao-2026-${TURNO}turno-${cargo}.csv`,
  });
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  // A aba fica na URL (?cargo=governador): o link compartilhado abre na aba certa.
  const [cargo, setCargo] = useState(() => {
    const daUrl = new URLSearchParams(location.search).get('cargo');
    return ABAS.some((a) => a.id === daUrl) ? daUrl : 'presidente';
  });
  const [selecionado, setSelecionado] = useState(null); // estado ('sp') ou exterior ('zz')
  const [cidade, setCidade] = useState(null); // { uf, cd, cdi, nm }
  const [recorte, setRecorte] = useState('municipios');
  const [colorir, setColorir] = useState('lider');
  const [momento, setMomento] = useState(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [listaCidades, setListaCidades] = useState(null);
  const agora = useAgora();

  const presidente = useApuracao('presidente');
  const outro = useApuracao(cargo === 'presidente' ? null : cargo);
  const primeiroPresidente = usePrimeiroTurno('presidente');
  const primeiroOutro = usePrimeiroTurno(cargo === 'presidente' ? null : cargo);
  const primeiroTurno = cargo === 'presidente' ? primeiroPresidente : primeiroOutro;
  const municipios = useMunicipios(cargo === 'presidente' && recorte !== 'estados');
  const resultadoCidade = useCidade(cargo === 'presidente' ? cidade : null);

  const visoesPresidente = useMemo(() => visoesDe(presidente, momento), [presidente, momento]);
  const visoesOutro = useMemo(() => visoesDe(outro, momento), [outro, momento]);
  const visoes = cargo === 'presidente' ? visoesPresidente : visoesOutro;
  const nacional = visoesPresidente.br;
  const candidatosNacionais = nacional?.candidatos ?? [];

  // Governador sem estado escolhido: mostra o maior eleitorado com apuração (normalmente SP).
  const padraoGovernador = useMemo(() => {
    const comVotos = Object.values(visoesOutro).filter((v) => v?.comecou);
    return comVotos.sort((a, b) => (b.eleitorado ?? 0) - (a.eleitorado ?? 0))[0]?.abr ?? null;
  }, [visoesOutro]);

  // O que o placar mostra: cidade > estado escolhido > Brasil (ou o estado padrão, em governador).
  const abrPrincipal = cargo === 'presidente' ? selecionado ?? 'br' : selecionado ?? padraoGovernador;
  const mostrandoCidade = cargo === 'presidente' && cidade;
  const visaoPlacar = mostrandoCidade ? resultadoCidade.visao : abrPrincipal ? visoes[abrPrincipal] : null;
  const local = mostrandoCidade ? `${nomeProprio(cidade.nm)} (${cidade.uf})` : abrPrincipal ? nomeAbrangencia(abrPrincipal) : '';
  const primeiroPlacar = mostrandoCidade ? resultadoCidade.primeiroTurno : abrPrincipal ? primeiroTurno[abrPrincipal] : null;
  const fonteGrafico = cargo === 'presidente' ? presidente : outro;

  // Lados fixos das barrinhas (presidente): o líder nacional à esquerda, o 2º à direita.
  const par =
    cargo === 'presidente' && candidatosNacionais.length > 1 ? candidatosNacionais.slice(0, 2).map((c) => c.numero) : null;

  const regioes = REGIOES.map((r) => ({
    ...r,
    visao: somarVisoes(
      r.id,
      r.ufs.map((uf) => visoesPresidente[uf.toLowerCase()]),
    ),
  }));

  const eventos = useMemo(
    () => montarEventos(presidente.pontos.br, presidente.pontos, presidente.aoVivo.br, momento, 25),
    [presidente, momento],
  );

  const viradasGrafico = useMemo(
    () => (abrPrincipal ? encontrarViradas(fonteGrafico.pontos[abrPrincipal], fonteGrafico.aoVivo[abrPrincipal]) : []),
    [fonteGrafico, abrPrincipal],
  );
  const viradasNacionais = useMemo(
    () =>
      encontrarViradas(presidente.pontos.br, presidente.aoVivo.br).map((v) => ({ ...v, cor: corPartido(v.novo.partido) })),
    [presidente],
  );
  // Todas as viradas do cargo (Brasil e cada estado), as mais recentes primeiro.
  const todasViradas = useMemo(() => {
    const fonte = cargo === 'presidente' ? presidente : outro;
    return Object.entries(fonte.pontos)
      .flatMap(([abr, pontos]) => encontrarViradas(pontos, fonte.aoVivo[abr]).map((v) => ({ ...v, abr })))
      .filter((v) => momento == null || v.t <= momento)
      .sort((a, b) => b.t - a.t);
  }, [cargo, presidente, outro, momento]);

  const momentos = useMemo(() => {
    if (cargo === 'presidente') return (presidente.pontos.br ?? []).map((p) => p.t);
    const todos = new Set();
    for (const lista of Object.values(outro.pontos)) for (const p of lista) todos.add(p.t);
    return [...todos].sort((a, b) => a - b);
  }, [cargo, presidente, outro]);

  // Atalhos: "/" ou Ctrl+K abrem a busca.
  useEffect(() => {
    function atalho(e) {
      const digitando = /input|textarea|select/i.test(document.activeElement?.tagName ?? '');
      if ((e.key === '/' && !digitando) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setBuscaAberta(true);
      }
    }
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  useEffect(() => {
    if (buscaAberta && !listaCidades) carregarCidades().then(setListaCidades).catch(() => {});
  }, [buscaAberta, listaCidades]);

  function trocarCargo(id) {
    const url = new URL(location.href);
    if (id === 'presidente') url.searchParams.delete('cargo');
    else url.searchParams.set('cargo', id);
    history.replaceState(null, '', url);
    setCargo(id);
    setSelecionado(null);
    setCidade(null);
    setMomento(null);
  }

  function selecionarLugar(abr) {
    setCidade(null);
    setSelecionado(abr === selecionado ? null : abr);
  }

  function escolherCidade(info) {
    setCidade(info);
    setSelecionado(info.uf.toLowerCase());
  }

  function voltarAoBrasil() {
    setCidade(null);
    setSelecionado(null);
  }

  const itensBusca = useMemo(() => {
    const itens = Object.entries(UFS).map(([sigla, nome]) => ({
      chave: `uf-${sigla}`,
      sigla,
      titulo: nome,
      contexto: 'Estado',
      busca: `${nome} ${sigla}`,
      acao: { abr: sigla.toLowerCase() },
    }));
    for (const info of Object.values(listaCidades ?? {})) {
      itens.push({
        chave: `cid-${info.cdi}`,
        sigla: info.uf,
        titulo: nomeProprio(info.nm),
        contexto: `Cidade · ${info.uf}`,
        busca: `${info.nm} ${info.uf}`,
        acao: { cidade: info },
      });
    }
    return itens;
  }, [listaCidades]);

  function escolherNaBusca({ acao }) {
    setBuscaAberta(false);
    if (acao.cidade) {
      if (cargo !== 'presidente') trocarCargo('presidente');
      escolherCidade(acao.cidade);
    } else if (acao.abr) {
      setCidade(null);
      setSelecionado(acao.abr);
    }
  }

  const porCidade =
    cargo === 'presidente' && recorte !== 'estados' && Boolean(municipios.malha) && Object.keys(municipios.dados).length > 0;
  const erro = presidente.erro || outro.erro;
  const tituloMapa = selecionado ? nomeAbrangencia(selecionado) : 'Brasil';
  const dica = selecionado
    ? cargo === 'presidente' && recorte !== 'estados'
      ? 'Clique numa cidade para ver o resultado dela.'
      : 'Clique no estado de novo para voltar.'
    : cargo === 'presidente'
      ? 'Clique em um estado para ver os municípios.'
      : 'Clique em um estado para ver a disputa.';

  return (
    <div className="flex min-h-dvh flex-col xl:h-dvh">
      <BarraTopo
        selo={`${TURNO}º turno`}
        abas={ABAS}
        cargo={cargo}
        onCargo={trocarCargo}
        onBuscar={() => setBuscaAberta(true)}
        onBaixar={() => baixarCsv(cargo, visoes)}
      />

      <Placar
        visao={visaoPlacar}
        cargoNome={cargo === 'presidente' ? 'Presidente' : 'Governador'}
        local={local}
        primeiroTurno={primeiroPlacar}
      />

      {erro && (
        <div className="border-b border-borda bg-painel px-5 py-2 text-sm text-texto-2">
          ⚠ {erro} Os números na tela são os últimos recebidos.
        </div>
      )}

      <main className="grid flex-1 xl:min-h-0 xl:grid-cols-[350px_minmax(0,1fr)_390px]">
        {/* Esquerda */}
        <aside className="rolagem order-2 space-y-7 border-t border-borda px-5 py-5 xl:order-none xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-r">
          <GraficoApuracao
            pontos={abrPrincipal ? fonteGrafico.pontos[abrPrincipal] : []}
            candidatos={(abrPrincipal && visoes[abrPrincipal]?.candidatos) || []}
            momento={momento}
            viradas={viradasGrafico}
          />
          <Participacao visao={visaoPlacar} />
          <Viradas viradas={todasViradas} />
          <UltimasAtualizacoes eventos={eventos} />
        </aside>

        {/* Centro: mapa */}
        <section className="order-1 flex flex-col gap-3 px-5 py-4 xl:order-none xl:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {selecionado && (
                <button onClick={voltarAoBrasil} className="flex items-center gap-1 self-center text-xs text-texto-2 hover:text-texto">
                  <IconeSetaEsquerda width={14} height={14} /> Brasil
                </button>
              )}
              <h2 className="text-lg font-semibold">{tituloMapa}</h2>
              <span className="text-xs text-texto-3">{dica}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cargo === 'presidente' && (
                <div className="segmentado">
                  {[
                    ['estados', 'Estados'],
                    ['municipios', 'Municípios'],
                    ['eleitorado', 'Eleitorado'],
                  ].map(([id, nome]) => (
                    <button key={id} aria-pressed={recorte === id} onClick={() => setRecorte(id)}>
                      {nome}
                    </button>
                  ))}
                </div>
              )}
              <div className="segmentado">
                <button aria-pressed={colorir === 'lider'} onClick={() => setColorir('lider')}>
                  Quem lidera
                </button>
                <button aria-pressed={colorir === 'apurado'} onClick={() => setColorir('apurado')}>
                  Apurado
                </button>
              </div>
            </div>
          </div>

          <div className="relative aspect-square max-h-[80vh] w-full xl:aspect-auto xl:h-auto xl:max-h-none xl:min-h-0 xl:flex-1">
            <Mapa
              cargo={cargo}
              visoes={visoes}
              recorte={cargo === 'presidente' ? recorte : 'estados'}
              colorir={colorir}
              selecionado={selecionado}
              onSelecionar={selecionarLugar}
              onRecentrar={voltarAoBrasil}
              mostrarExterior={cargo === 'presidente'}
              primeiroTurno={primeiroTurno}
              municipios={cargo === 'presidente' ? municipios : null}
              candidatos={candidatosNacionais}
              cidadeSelecionada={cidade?.cdi ?? null}
              onSelecionarCidade={escolherCidade}
            />
          </div>

          <Legenda
            cargo={cargo}
            colorir={colorir}
            porCidade={porCidade}
            municipios={municipios}
            candidatos={candidatosNacionais}
            visoes={visoes}
          />

          <LinhaDoTempo
            inicio={INICIO_APURACAO}
            momentos={momentos}
            momento={momento}
            agora={agora}
            onMudar={setMomento}
            viradas={cargo === 'presidente' ? viradasNacionais : []}
          />
        </section>

        {/* Direita */}
        <aside className="rolagem order-3 space-y-7 border-t border-borda px-5 py-5 xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l">
          {cargo === 'presidente' && <Regioes regioes={regioes} par={par} />}
          <ListaEstados visoes={visoes} par={par} selecionado={selecionado} onSelecionar={selecionarLugar} />
          <p className="text-[11px] text-texto-3">
            Dados oficiais do{' '}
            <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer" className="underline">
              TSE
            </a>
            . Site independente, sem vínculo com o TSE.
          </p>
        </aside>
      </main>

      {buscaAberta && <Busca itens={itensBusca} onEscolher={escolherNaBusca} onFechar={() => setBuscaAberta(false)} />}
    </div>
  );
}
