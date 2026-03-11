export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

export type Template = {
    id: string;
    name: string;
    tab: string;
    day_step: number;
    message: string;
    ppl: string | null;
    attachments: string[];
    created_at: string;
};