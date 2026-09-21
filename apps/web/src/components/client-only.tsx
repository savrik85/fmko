"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

/**
 * Načte komponentu až v prohlížeči. Náhrada za `next/dynamic` s `ssr: false`.
 *
 * `next/dynamic` s `ssr: false` na serveru nechá místo importu zástupce
 * `async()=>{}`. next-on-pages (build pro Cloudflare Pages) při balení textově
 * nahrazuje prázdné webpack moduly `()=>{}` a občas se trefí právě do něj.
 * Vznikne `async__chunk_XXXX is not defined` a celá stránka vrací 500.
 * Tenhle helper `next/dynamic` nepoužívá, takže zástupce vůbec nevznikne.
 * CI build navíc hlídá, že se `async__chunk_` ve výstupu neobjeví.
 */
export function clientOnly<P extends object>(
  load: () => Promise<ComponentType<P>>,
  placeholder: ReactNode = null,
): ComponentType<P> {
  function ClientOnly(props: P) {
    const [Component, setComponent] = useState<ComponentType<P> | null>(null);

    useEffect(() => {
      let active = true;
      load()
        .then((loaded) => {
          if (active) setComponent(() => loaded);
        })
        .catch((e) => console.error("clientOnly: komponentu se nepodařilo načíst:", e));
      return () => {
        active = false;
      };
    }, []);

    return Component ? <Component {...props} /> : <>{placeholder}</>;
  }
  return ClientOnly;
}
