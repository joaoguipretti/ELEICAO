import { useEffect, useState } from 'react';

// Abaixo de 768px (o "md" do Tailwind) o site troca o mapa por listas.
const CONSULTA = '(max-width: 767px)';

export function useCelular() {
  const [celular, setCelular] = useState(() => matchMedia(CONSULTA).matches);
  useEffect(() => {
    const m = matchMedia(CONSULTA);
    const mudar = () => setCelular(m.matches);
    m.addEventListener('change', mudar);
    return () => m.removeEventListener('change', mudar);
  }, []);
  return celular;
}
