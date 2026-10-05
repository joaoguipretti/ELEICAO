import { geoArea } from 'd3-geo';

// As malhas do IBGE vêm com os anéis dos polígonos no sentido inverso ao que o d3 espera
// (o d3 entenderia "o mundo inteiro menos o estado"). Corrige quando precisa.
export function corrigirSentido(f) {
  if (geoArea(f) <= 2 * Math.PI) return f;
  const inverte = (poligono) => poligono.map((anel) => [...anel].reverse());
  const g = f.geometry;
  const coordinates = g.type === 'Polygon' ? inverte(g.coordinates) : g.coordinates.map(inverte);
  return { ...f, geometry: { ...g, coordinates } };
}
