import { SectionLoading } from "@/components/ui";

/**
 * Načítání videa ze zápasu: stejný skákající míč s hláškami jako jinde ve hře, po 10 s „Trvá to déle než obvykle“
 * a „Zkusit znovu“. Zakrývá scénu, dokud se nekreslí plynule; hlášky jsou na tmavém pozadí světlé.
 */
export function VideoLoading() {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#141b26] select-none [&_.loading-quip]:text-white/80">
      <SectionLoading />
    </div>
  );
}
