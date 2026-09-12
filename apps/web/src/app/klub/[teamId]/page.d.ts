import type { Metadata } from "next";
export declare const runtime = "edge";
export declare function generateMetadata({ params }: {
    params: Promise<{
        teamId: string;
    }>;
}): Promise<Metadata>;
export default function KlubPublicPage({ params }: {
    params: Promise<{
        teamId: string;
    }>;
}): Promise<import("react").JSX.Element>;
//# sourceMappingURL=page.d.ts.map