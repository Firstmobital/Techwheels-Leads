export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

export type Template = {
    id: number;
    name: string;
    category: string;
    channel: string;
    language: string;
    template_text: string;
    is_active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};