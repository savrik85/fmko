interface Announcement {
    id: string;
    active: boolean;
    emoji: string;
    title: string;
    subtitle: string;
    paragraphs: string[];
    highlight?: {
        title: string;
        text: string;
    };
    bullets?: {
        title: string;
        items: string[];
    };
    aside?: string;
    footer?: string;
    buttonLabel: string;
}
export declare const ANNOUNCEMENT: Announcement;
export declare function AnnouncementDialog(): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=announcement-dialog.d.ts.map