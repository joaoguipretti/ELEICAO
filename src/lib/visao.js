// Monta o que a tela mostra a partir dos pontos do histórico. O mesmo código serve para o
// "ao vivo" (último ponto) e para a linha do tempo (último ponto até o momento escolhido).

// Último ponto com t <= momento (momento null = o mais recente).
export function pontoEm(pontos, momento) {
  if (!pontos?.length) return null;
  if (momento == null) return pontos[pontos.length - 1];
  let escolhido = null;
  for (const p of pontos) {
    if (p.t <= momento) escolhido = p;
    else break;
  }
  return escolhido;
}

// Junta listas de pontos sem repetir a mesma geração do TSE, em ordem de tempo.
export function mesclarPontos(...listas) {
  const porGeracao = new Map();
  for (const lista of listas) for (const p of lista || []) porGeracao.set(p.t, p);
  return [...porGeracao.values()].sort((a, b) => a.t - b.t);
}

// ponto (números) + meta (nomes, partidos e fotos que vêm do arquivo ao vivo) → visão.
// `aoVivo` indica se a situação ("Eleito", "2º turno") vale para este momento.
export function montarVisao(abr, ponto, meta, aoVivo) {
  if (!ponto || !meta) return null;
  const candidatos = meta.candidatos
    .map((c) => ({
      ...c,
      votos: ponto.votos[c.numero] ?? 0,
      percentual: ponto.percentuais[c.numero] ?? 0,
      situacao: aoVivo ? c.situacao : null,
      eleito: aoVivo ? c.eleito : false,
    }))
    .sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    abr,
    t: ponto.t,
    apuradas: ponto.apuradas,
    secoes: ponto.secoes,
    secoesTotal: ponto.secoesTotal,
    faltam: ponto.faltam,
    eleitorado: ponto.eleitorado,
    comparecimento: ponto.comparecimento,
    brancosNulos: ponto.brancosNulos,
    validos: ponto.validos,
    candidatos,
    vantagem: candidatos.length > 1 ? candidatos[0].percentual - candidatos[1].percentual : 0,
    comecou: ponto.secoes > 0,
  };
}

// Soma várias visões (ex.: os estados de uma região) numa só.
export function somarVisoes(id, visoes) {
  const validas = visoes.filter(Boolean);
  if (!validas.length) return null;
  const votos = new Map();
  for (const v of validas) {
    for (const c of v.candidatos) {
      const atual = votos.get(c.numero);
      votos.set(c.numero, { ...c, votos: (atual?.votos ?? 0) + c.votos });
    }
  }
  const validos = validas.reduce((s, v) => s + v.validos, 0);
  const secoes = validas.reduce((s, v) => s + v.secoes, 0);
  const secoesTotal = validas.reduce((s, v) => s + v.secoesTotal, 0);
  const candidatos = [...votos.values()]
    .map((c) => ({ ...c, percentual: validos ? (c.votos / validos) * 100 : 0 }))
    .sort((a, b) => b.votos - a.votos);

  return {
    abr: id,
    validos,
    secoes,
    secoesTotal,
    apuradas: secoesTotal ? (secoes / secoesTotal) * 100 : 0,
    faltam: validas.reduce((s, v) => s + (v.faltam ?? 0), 0),
    eleitorado: validas.reduce((s, v) => s + (v.eleitorado ?? 0), 0),
    candidatos,
    vantagem: candidatos.length > 1 ? candidatos[0].percentual - candidatos[1].percentual : 0,
    comecou: secoes > 0,
  };
}

// "Últimas atualizações": cada geração nacional do TSE comparada com a anterior —
// quantas seções entraram, de quais estados (os que mais mandaram primeiro) e o placar.
export function montarEventos(pontosNacionais, pontosPorAbrangencia, meta, momento, limite = 15) {
  const lista = (pontosNacionais || []).filter((p) => momento == null || p.t <= momento);
  const viradas = new Map(encontrarViradas(lista, meta).map((v) => [v.t, v]));
  const eventos = [];
  for (let i = lista.length - 1; i > 0 && eventos.length < limite; i--) {
    const atual = lista[i];
    const anterior = lista[i - 1];
    const ufs = [];
    for (const [abr, pontos] of Object.entries(pontosPorAbrangencia)) {
      if (abr === 'br') continue;
      const antes = pontoEm(pontos, anterior.t);
      const depois = pontoEm(pontos, atual.t);
      const novas = (depois?.secoes ?? 0) - (antes?.secoes ?? 0);
      if (novas > 0) ufs.push({ uf: abr.toUpperCase(), novas });
    }
    ufs.sort((a, b) => b.novas - a.novas);
    const visao = montarVisao('br', atual, meta, false);
    eventos.push({
      t: atual.t,
      secoesNovas: atual.secoes - anterior.secoes,
      apuradas: atual.apuradas,
      ufs: ufs.map((u) => u.uf),
      candidatos: visao ? visao.candidatos.slice(0, 2) : [],
      virada: viradas.get(atual.t) ?? null,
    });
  }
  return eventos;
}

// Momentos em que a liderança trocou de mãos. Ignora o comecinho da apuração (menos de 1%
// das seções), quando poucas urnas fazem o placar oscilar sem significado.
export function encontrarViradas(pontos, meta, minimoApuradas = 1) {
  const viradas = [];
  let liderAnterior = null;
  for (const p of pontos || []) {
    const lider = Object.entries(p.votos).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!lider || p.secoes === 0 || p.apuradas < minimoApuradas) continue;
    if (liderAnterior && lider !== liderAnterior) {
      const candidato = (numero) => meta?.candidatos.find((c) => c.numero === numero);
      viradas.push({ t: p.t, apuradas: p.apuradas, novo: candidato(lider), anterior: candidato(liderAnterior) });
    }
    liderAnterior = lider;
  }
  return viradas.filter((v) => v.novo && v.anterior);
}

// Estimativa simples de quanto o 2º colocado precisaria dos votos que faltam para virar.
// Supõe que os votos que faltam têm o mesmo tamanho proporcional dos já apurados e que os
// demais candidatos mantêm sua fatia. Devolve null quando não faz sentido calcular.
export function estimarVirada(visao) {
  if (!visao?.comecou || visao.apuradas <= 0 || visao.apuradas >= 100) return null;
  const [primeiro, segundo] = visao.candidatos;
  if (!primeiro || !segundo || primeiro.eleito) return null;
  const restantes = visao.validos * ((100 - visao.apuradas) / visao.apuradas);
  if (restantes < 1) return null;
  const diferenca = primeiro.votos - segundo.votos;
  const fatiaDosDois = (primeiro.percentual + segundo.percentual) / 100;
  // segundo + x > primeiro + (restantes * fatiaDosDois - x)  →  x > (diferenca + restantes * fatiaDosDois) / 2
  const precisa = (diferenca + restantes * fatiaDosDois) / 2;
  return { candidato: segundo, restantes, fatia: (precisa / restantes) * 100 };
}
