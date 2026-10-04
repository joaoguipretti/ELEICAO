import { useEffect, useState } from 'react';
import { buscarResultados } from './tse.js';
import { registrarNoHistorico } from './historico.js';
import { buscarEstados } from './estados.js';
import './App.css';

const CARGOS = [
  { id: 'presidente', nome: 'Presidente', porUf: false, maioria: true, companheiros: 'Vice' },
  { id: 'governador', nome: 'Governador', porUf: true, maioria: true, companheiros: 'Vice' },
  { id: 'senador', nome: 'Senador', porUf: true, maioria: false, companheiros: 'Suplentes' },
];

const UFS = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const INTERVALO_SEGUNDOS = 30;

const numero = new Intl.NumberFormat('pt-BR');
const hora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

// Votos que entraram em cada atualização do TSE (cada "leva"), da mais recente para a mais antiga.
function calcularLevas(pontos) {
  const comVotos = pontos.filter((p) => p.votos);
  const levas = [];
  for (let i = comVotos.length - 1; i > 0; i--) {
    const antes = comVotos[i - 1];
    const depois = comVotos[i];
    const total = depois.validos - antes.validos;
    if (!(total > 0)) continue;
    const porCandidato = Object.fromEntries(
      Object.keys(depois.votos).map((n) => [n, depois.votos[n] - (antes.votos[n] ?? 0)]),
    );
    levas.push({ antes, depois, total, porCandidato });
  }
  return levas;
}
const pct = (valor) =>
  `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function App() {
  const [cargoId, setCargoId] = useState('presidente');
  const [uf, setUf] = useState('SP');
  const [dados, setDados] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [erro, setErro] = useState(null);
  const [estados, setEstados] = useState(null);

  const cargo = CARGOS.find((c) => c.id === cargoId);

  // Busca os resultados e repete a cada 30s enquanto o cargo/UF não mudar.
  // Com a aba em segundo plano para de buscar; ao voltar, atualiza na hora.
  useEffect(() => {
    const controle = new AbortController();
    const { porUf } = CARGOS.find((c) => c.id === cargoId);
    let timer;
    let buscando = false;

    async function carregar() {
      clearTimeout(timer);
      buscando = true;
      try {
        const novos = await buscarResultados(cargoId, porUf ? uf : null, controle.signal);
        setDados(novos);
        setHistorico(registrarNoHistorico(novos));
        setErro(null);
      } catch (e) {
        if (e.name !== 'AbortError') setErro(e.message);
      } finally {
        buscando = false;
        if (!controle.signal.aborted && !document.hidden) {
          timer = setTimeout(carregar, INTERVALO_SEGUNDOS * 1000);
        }
      }
    }

    function aoMudarVisibilidade() {
      if (document.hidden) clearTimeout(timer);
      else if (!buscando) carregar();
    }

    setDados(null);
    setHistorico([]);
    setErro(null);
    carregar();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      controle.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [cargoId, uf]);

  const apuracaoComecou = dados && dados.secoes.totalizadas > 0;
  const levas = apuracaoComecou ? calcularLevas(historico) : [];
  const leva = levas[0];

  // Presidente por estado: busca os 28 arquivos só quando o TSE gera um resultado
  // nacional novo (a cada poucos minutos), não a cada 30s.
  const geracaoNacional = cargoId === 'presidente' && apuracaoComecou ? dados.geradoEm : null;
  useEffect(() => {
    if (!geracaoNacional) return;
    const controle = new AbortController();
    buscarEstados(controle.signal)
      .then(setEstados)
      .catch(() => {});
    return () => controle.abort();
  }, [geracaoNacional]);
  const mostrarEstados = cargoId === 'presidente' && apuracaoComecou;

  return (
    <div className="pagina">
      <header className="topo">
        <div>
          <h1>Apuração 2026</h1>
          <p className="subtitulo">Eleições Gerais · 1º turno · 4 de outubro</p>
        </div>
        <div className="topo-acoes">
          <span className="ao-vivo">
            <span className="ponto" aria-hidden="true" /> Atualiza a cada {INTERVALO_SEGUNDOS}s
          </span>
          <BotaoTema />
        </div>
      </header>

      <nav className="filtros" aria-label="Filtros">
        <div className="abas" role="tablist">
          {CARGOS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === cargoId}
              className={c.id === cargoId ? 'aba ativa' : 'aba'}
              onClick={() => setCargoId(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </div>
        {cargo.porUf && (
          <select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado">
            {Object.entries(UFS).map(([sigla, nome]) => (
              <option key={sigla} value={sigla}>
                {nome}
              </option>
            ))}
          </select>
        )}
      </nav>

      {erro && <div className="aviso erro">⚠ {erro}</div>}
      {!dados && !erro && <div className="aviso">Carregando dados do TSE…</div>}

      {dados && (
        <>
          <section className="progresso">
            <div className="progresso-numero">{pct(dados.secoes.percentual)}</div>
            <div className="progresso-texto">
              <span>das seções totalizadas</span>
              <span className="mudo">
                {numero.format(dados.secoes.totalizadas)} de {numero.format(dados.secoes.total)}
                {dados.atualizadoEm && ` · TSE ${dados.atualizadoEm}`}
              </span>
            </div>
            <div
              className="medidor"
              role="progressbar"
              aria-valuenow={dados.secoes.percentual}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${dados.secoes.percentual}%` }} />
            </div>
          </section>

          {!apuracaoComecou && (
            <div className="aviso">
              A apuração começa depois que as urnas fecham, às 17h (horário de Brasília). Até lá os
              candidatos aparecem em ordem alfabética.
            </div>
          )}

          <section>
            <div className="lista-cabecalho">
              <h2>
                {dados.cargo}
                {cargo.porUf && ` · ${UFS[uf]}`}
              </h2>
              <span className="mudo">
                {cargo.maioria
                  ? 'A linha marca 50% dos válidos: acima disso, vence no 1º turno'
                  : `${dados.vagas} ${dados.vagas > 1 ? 'vagas' : 'vaga'} em disputa · os mais votados são eleitos`}
              </span>
            </div>
            {apuracaoComecou && <Disputa candidatos={dados.candidatos} vagas={dados.vagas} />}
            {leva && (
              <UltimaLeva
                levas={levas}
                candidatos={dados.candidatos}
                vagas={dados.vagas}
                estados={mostrarEstados ? estados : null}
              />
            )}
            <ol className="candidatos">
              {dados.candidatos.map((c, i) => (
                <Candidato
                  key={c.numero}
                  candidato={c}
                  posicao={apuracaoComecou ? i + 1 : null}
                  lider={apuracaoComecou && i === 0}
                  cargo={cargo}
                  novos={leva ? leva.porCandidato[c.numero] : null}
                />
              ))}
            </ol>
          </section>

          {mostrarEstados && <ApuracaoPorEstado estados={estados} />}

          <section className="estatisticas">
            <Estatistica titulo="Comparecimento" valor={dados.eleitorado.comparecimento} percentual={dados.eleitorado.percentualComparecimento} />
            <Estatistica titulo="Abstenção" valor={dados.eleitorado.abstencao} percentual={dados.eleitorado.percentualAbstencao} />
            <Estatistica titulo="Votos válidos" valor={dados.votos.validos} percentual={dados.votos.percentualValidos} />
            <Estatistica titulo="Brancos" valor={dados.votos.brancos} percentual={dados.votos.percentualBrancos} />
            <Estatistica titulo="Nulos" valor={dados.votos.nulos} percentual={dados.votos.percentualNulos} />
            <Estatistica titulo="Eleitorado" valor={dados.eleitorado.total} />
          </section>
        </>
      )}

      <footer className="rodape mudo">
        Fonte: Tribunal Superior Eleitoral —{' '}
        <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer">
          resultados.tse.jus.br
        </a>
        . Percentuais calculados sobre os votos válidos.
      </footer>
    </div>
  );
}

// Quantos votos entraram na última atualização do TSE, para quem foram e as anteriores.
function UltimaLeva({ levas, candidatos, vagas, estados }) {
  const { antes, depois, total, porCandidato } = levas[0];
  const destaques = candidatos.slice(0, 4).filter((c) => porCandidato[c.numero] !== undefined);

  const avanco = depois.apuradas - antes.apuradas;

  return (
    <section className="leva" aria-label="Última atualização do TSE">
      <div className="leva-topo">
        <span>Última atualização do TSE</span>
        <span className="mudo">
          {hora.format(antes.t)} → {hora.format(depois.t)}
        </span>
      </div>

      <div className="leva-resumo">
        <strong className="leva-total">+{numero.format(total)}</strong>
        <span className="mudo">
          votos válidos novos · seções apuradas {pct(antes.apuradas)} → {pct(depois.apuradas)} (+
          {avanco.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {avanco < 2 ? 'ponto' : 'pontos'})
        </span>
      </div>

      <OrigemDosVotos estados={estados} />

      <div className="leva-destino">
        <div className="leva-linha leva-cabecalho mudo">
          <span>Para onde foram os votos novos</span>
          <span className="leva-pct">nesta atualização</span>
          <span className="leva-comparacao">no total</span>
        </div>
        {destaques.map((c) => {
          const naLeva = (porCandidato[c.numero] / total) * 100;
          const diferenca = naLeva - c.percentual;
          const seta = Math.abs(diferenca) < 0.05 ? '=' : diferenca > 0 ? '▲' : '▼';
          return (
            <div
              key={c.numero}
              className="leva-linha"
              title={`${c.nome}: +${numero.format(porCandidato[c.numero])} votos nesta atualização`}
            >
              <span className="leva-nome">{c.nome}</span>
              <span className="leva-barra" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, naLeva))}%` }} />
              </span>
              <strong className="leva-pct">{pct(naLeva)}</strong>
              <span
                className="leva-comparacao mudo"
                aria-label={`${seta === '▲' ? 'acima' : seta === '▼' ? 'abaixo' : 'igual'} do total de ${pct(c.percentual)}`}
              >
                {seta} {pct(c.percentual)}
              </span>
            </div>
          );
        })}
      </div>

      {levas.length > 1 ? (
        <HistoricoLevas levas={levas} candidatos={candidatos.slice(0, vagas + 1)} />
      ) : (
        <p className="leva-aguardando mudo">
          As próximas atualizações do TSE vão aparecer aqui, para comparar com esta.
        </p>
      )}
    </section>
  );
}

// Os 3 estados que mais mandaram votos na última atualização de cada um.
function OrigemDosVotos({ estados }) {
  const top = (estados || [])
    .filter((e) => e.novos)
    .sort((a, b) => b.novos - a.novos)
    .slice(0, 3);
  if (!top.length) return null;

  return (
    <div className="leva-origem">
      <span className="mudo">Mais votos novos vieram de:</span>
      {top.map((e) => (
        <span key={e.uf}>
          {e.nome} <strong>+{numero.format(e.novos)}</strong>
        </span>
      ))}
    </div>
  );
}

// Presidente em cada estado: quanto já foi apurado, quem lidera e quantos votos novos entraram.
function ApuracaoPorEstado({ estados }) {
  return (
    <section className="estados">
      <h2>Apuração por estado</h2>
      <p className="mudo">
        Maiores eleitorados primeiro. "Votos novos" é o que entrou na última atualização de cada estado.
      </p>
      {!estados ? (
        <p className="mudo">Carregando os estados…</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela-estados">
            <thead>
              <tr>
                <th scope="col">Estado</th>
                <th scope="col">Seções apuradas</th>
                <th scope="col">Lidera</th>
                <th scope="col" className="num">
                  Votos novos
                </th>
              </tr>
            </thead>
            <tbody>
              {estados.map((e) => (
                <tr key={e.uf}>
                  <td>
                    <span className="so-desktop">{e.nome}</span>
                    <span className="so-celular">{e.uf === 'ZZ' ? 'Exterior' : e.uf}</span>
                  </td>
                  <td>
                    <div className="estado-apuradas">
                      <span className="estado-barra" aria-hidden="true">
                        <span style={{ width: `${e.apuradas}%` }} />
                      </span>
                      <span className="num">{pct(e.apuradas)}</span>
                    </div>
                  </td>
                  <td className="estado-lider" title={e.lider ? e.lider.nome : undefined}>
                    {e.lider ? (
                      <>
                        {e.lider.nome} <strong>{pct(e.lider.percentual)}</strong>
                      </>
                    ) : (
                      <span className="mudo">–</span>
                    )}
                  </td>
                  <td className="num">{e.novos ? `+${numero.format(e.novos)}` : <span className="mudo">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Tabela com as atualizações vistas desde que o site foi aberto (a atual em destaque).
function HistoricoLevas({ levas, candidatos }) {
  const maior = Math.max(...levas.map((l) => l.total));

  return (
    <div className="leva-historico">
      <div className="mudo leva-historico-titulo">
        Atualizações anteriores · quanto cada um levou dos votos novos
      </div>
      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th scope="col">Horário</th>
              <th scope="col">Votos novos</th>
              <th scope="col" className="num col-secoes">
                Seções
              </th>
              {candidatos.map((c) => (
                <th key={c.numero} scope="col" className="num col-candidato" title={c.nome}>
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levas.map((l, i) => (
              <tr key={l.depois.t} className={i === 0 ? 'atual' : undefined}>
                <td>
                  {hora.format(l.depois.t)}
                  {i === 0 && <span className="mudo"> · atual</span>}
                </td>
                <td>
                  +{numero.format(l.total)}
                  <span className="mini-barra" aria-hidden="true">
                    <span style={{ width: `${(l.total / maior) * 100}%` }} />
                  </span>
                </td>
                <td className="num col-secoes">{pct(l.depois.apuradas)}</td>
                {candidatos.map((c) => (
                  <td key={c.numero} className="num">
                    {l.porCandidato[c.numero] !== undefined
                      ? pct((l.porCandidato[c.numero] / l.total) * 100)
                      : '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Diferença na posição que decide a eleição: 1º x 2º quando há uma vaga;
// com 2 vagas (Senado), quem ocupa a última vaga x o primeiro de fora.
function Disputa({ candidatos, vagas }) {
  const dentro = candidatos[vagas - 1];
  const fora = candidatos[vagas];
  if (!dentro || !fora) return null;

  const votos = dentro.votos - fora.votos;
  if (votos === 0) {
    return (
      <p className="disputa">
        <strong>{dentro.nome}</strong> e <strong>{fora.nome}</strong> estão empatados.
      </p>
    );
  }

  const pontos = dentro.percentual - fora.percentual;
  const vantagem = (
    <>
      <strong>{numero.format(votos)} votos</strong> (
      {pontos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
      {Math.abs(pontos) < 2 ? 'ponto percentual' : 'pontos percentuais'})
    </>
  );

  return (
    <p className="disputa">
      {vagas === 1 ? (
        <>
          <strong>{dentro.nome}</strong> lidera com {vantagem} de vantagem sobre {fora.nome}.
        </>
      ) : (
        <>
          Disputa pela {vagas}ª vaga: <strong>{dentro.nome}</strong> tem {vantagem} a mais que {fora.nome}.
        </>
      )}
    </p>
  );
}

function BotaoTema() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme || 'light');
  const proximo = tema === 'dark' ? 'light' : 'dark';
  const rotulo = proximo === 'dark' ? 'Mudar para tema escuro' : 'Mudar para tema claro';

  function alternar() {
    document.documentElement.dataset.theme = proximo;
    setTema(proximo);
    try {
      localStorage.setItem('tema', proximo);
    } catch {
      // Sem localStorage (aba anônima, etc.): o tema só não fica salvo.
    }
  }

  return (
    <button className="botao-tema" onClick={alternar} aria-label={rotulo} title={rotulo}>
      {tema === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function Candidato({ candidato: c, posicao, lider, cargo, novos }) {
  return (
    <li className={lider ? 'candidato lider' : 'candidato'}>
      <span className="posicao">{posicao && `${posicao}º`}</span>
      <img
        className="foto"
        src={c.foto}
        alt=""
        loading="lazy"
        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
      />
      <div className="info">
        <div className="nome">
          <strong>{c.nome}</strong>
          <span className="mudo">
            {c.partido} · {c.numero}
          </span>
          {c.eleito && <span className="selo eleito">✓ Eleito</span>}
          {!c.eleito && c.situacao && <span className="selo">{c.situacao}</span>}
          {lider && !c.situacao && <span className="selo">Lidera</span>}
          {c.votosAnulados && (
            <span className="selo alerta">⚠ {c.votosAnulados.replace(/^anulado/i, 'Votos anulados')}</span>
          )}
        </div>
        {c.companheiros.length > 0 && (
          <div className="companheiros mudo">
            {cargo.companheiros}: {c.companheiros.join(', ')}
          </div>
        )}
        <div className="barra" title={`${c.nome}: ${numero.format(c.votos)} votos (${pct(c.percentual)})`}>
          <div className="preenchimento" style={{ width: `${c.percentual}%` }} />
          {cargo.maioria && <div className="marca-maioria" />}
        </div>
      </div>
      <div className="numeros">
        <strong>{pct(c.percentual)}</strong>
        <span className="mudo">{numero.format(c.votos)} votos</span>
        {novos > 0 && (
          <span className="novos" title="Votos que entraram na última atualização do TSE">
            +{numero.format(novos)} novos
          </span>
        )}
      </div>
    </li>
  );
}

function Estatistica({ titulo, valor, percentual }) {
  return (
    <div className="estatistica">
      <span className="mudo">{titulo}</span>
      <strong>{numero.format(valor)}</strong>
      {percentual !== undefined && <span className="mudo">{pct(percentual)}</span>}
    </div>
  );
}
