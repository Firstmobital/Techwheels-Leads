export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

export type Template = {
    id: number;
    name: string;
    category: string;
    source?: string | null;
    model_name?: string | null;
    step?: string | null;
    delay_days?: number;
    step_number?: number;
    channel: string;
    language: string;
    template_text: string;
    is_active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};