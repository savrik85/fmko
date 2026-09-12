import { ImageResponse } from "next/og";
export declare const runtime = "edge";
export declare const alt = "Profil klubu. Prales";
export declare const size: {
    width: number;
    height: number;
};
export declare const contentType = "image/png";
export default function Image({ params }: {
    params: Promise<{
        teamId: string;
    }>;
}): Promise<ImageResponse>;
//# sourceMappingURL=opengraph-image.d.ts.map